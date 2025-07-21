import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { authRateLimiter, apiRateLimiter, adminRateLimiter } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security-monitoring";

// Security headers configuration
const securityHeaders = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-XSS-Protection": "1; mode=block",
  "X-DNS-Prefetch-Control": "off",
  "X-Download-Options": "noopen",
  "X-Permitted-Cross-Domain-Policies": "none",
  "X-Robots-Tag": "noindex, nofollow",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';",
};

// Define route patterns that require authentication
const protectedRoutes = ["/admin", "/dashboard", "/api/admin"];

// Define admin-only routes
const adminOnlyRoutes = ["/admin", "/api/admin"];

// Define buyer-only routes
const buyerOnlyRoutes = ["/dashboard"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static files and API routes that don't need auth
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/public")
  ) {
    const response = NextResponse.next();

    // Add security headers even for static files
    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  }

  // Apply rate limiting based on route type
  let rateLimitResult;

  if (pathname.startsWith("/api/auth")) {
    rateLimitResult = await authRateLimiter.isAllowed(request);
  } else if (pathname.startsWith("/api/admin")) {
    rateLimitResult = await adminRateLimiter.isAllowed(request);
  } else if (pathname.startsWith("/api")) {
    rateLimitResult = await apiRateLimiter.isAllowed(request);
  }

  if (rateLimitResult && !rateLimitResult.allowed) {
    // Log rate limit violation
    logSecurityEvent(
      "rate_limit",
      request,
      {
        path: pathname,
        retryAfter: rateLimitResult.retryAfter,
      },
      "medium",
    );

    const response = new NextResponse(
      JSON.stringify({
        error: "Too many requests",
        retryAfter: rateLimitResult.retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": rateLimitResult.retryAfter.toString(),
          "X-RateLimit-Limit": "100",
          "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
          "X-RateLimit-Reset": rateLimitResult.resetTime.toString(),
        },
      },
    );

    // Add security headers
    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  }

  // Check if the route requires authentication
  const requiresAuth = protectedRoutes.some((route) => pathname.startsWith(route));

  if (!requiresAuth) {
    const response = NextResponse.next();

    // Add security headers even for public routes
    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  }

  try {
    // Get session from request
    const session = await auth();

    // If no session, redirect to login
    if (!session?.user) {
      // Log authentication failure
      logSecurityEvent(
        "auth_failure",
        request,
        {
          path: pathname,
          reason: "no_session",
        },
        "medium",
      );

      // Determine which login page to redirect to based on the route
      let loginUrl = "/login";

      if (adminOnlyRoutes.some((route) => pathname.startsWith(route))) {
        loginUrl = "/login/admin";
      } else if (buyerOnlyRoutes.some((route) => pathname.startsWith(route))) {
        loginUrl = "/login/buyer";
      }

      const url = new URL(loginUrl, request.url);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }

    const userRole = (session.user as { role?: string })?.role;

    // Check admin-only routes
    if (adminOnlyRoutes.some((route) => pathname.startsWith(route))) {
      if (userRole !== "ADMIN") {
        // Log unauthorized access attempt
        logSecurityEvent(
          "auth_failure",
          request,
          {
            path: pathname,
            reason: "insufficient_permissions",
            requiredRole: "ADMIN",
            userRole,
          },
          "high",
        );

        // Redirect non-admin users to appropriate page
        const url = new URL("/login/admin", request.url);
        url.searchParams.set("error", "admin_required");
        return NextResponse.redirect(url);
      }
    }

    // Check buyer-only routes
    if (buyerOnlyRoutes.some((route) => pathname.startsWith(route))) {
      if (userRole !== "BUYER") {
        // Log unauthorized access attempt
        logSecurityEvent(
          "auth_failure",
          request,
          {
            path: pathname,
            reason: "insufficient_permissions",
            requiredRole: "BUYER",
            userRole,
          },
          "high",
        );

        // Redirect non-buyer users to appropriate page
        const url = new URL("/login/buyer", request.url);
        url.searchParams.set("error", "buyer_required");
        return NextResponse.redirect(url);
      }
    }

    // Add user role to headers for server components
    const response = NextResponse.next();
    response.headers.set("x-user-role", userRole || "");
    response.headers.set("x-user-id", (session.user as { id?: string })?.id || "");

    // Add security headers
    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    console.error("Middleware error:", error);

    // On error, redirect to login
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "auth_error");
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (auth API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|public).*)",
  ],
};
