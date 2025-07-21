import * as Sentry from "@sentry/nextjs";

export interface LogLevel {
  DEBUG: "debug";
  INFO: "info";
  WARN: "warn";
  ERROR: "error";
  FATAL: "fatal";
}

export interface LogContext {
  userId?: string;
  action?: string;
  entity?: string;
  entityId?: string;
  requestId?: string;
  [key: string]: unknown;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === "development";
  private isProduction = process.env.NODE_ENV === "production";

  constructor() {
    // Initialize Sentry in production
    if (this.isProduction && process.env.SENTRY_DSN) {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV,
        tracesSampleRate: 0.1,
        integrations: [new Sentry.BrowserTracing(), new Sentry.Replay()],
      });
    }
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` | ${JSON.stringify(context)}` : "";
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
  }

  private logToSentry(level: string, message: string, context?: LogContext) {
    if (!this.isProduction || !process.env.SENTRY_DSN) return;

    const sentryLevel = level as Sentry.SeverityLevel;

    Sentry.withScope((scope) => {
      if (context) {
        Object.entries(context).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
      }
      scope.setLevel(sentryLevel);
      Sentry.captureMessage(message, sentryLevel);
    });
  }

  debug(message: string, context?: LogContext) {
    const formattedMessage = this.formatMessage("debug", message, context);
    console.debug(formattedMessage);
    this.logToSentry("debug", message, context);
  }

  info(message: string, context?: LogContext) {
    const formattedMessage = this.formatMessage("info", message, context);
    console.info(formattedMessage);
    this.logToSentry("info", message, context);
  }

  warn(message: string, context?: LogContext) {
    const formattedMessage = this.formatMessage("warn", message, context);
    console.warn(formattedMessage);
    this.logToSentry("warn", message, context);
  }

  error(message: string, error?: Error, context?: LogContext) {
    const formattedMessage = this.formatMessage("error", message, context);
    console.error(formattedMessage, error);

    if (this.isProduction && process.env.SENTRY_DSN) {
      Sentry.withScope((scope) => {
        if (context) {
          Object.entries(context).forEach(([key, value]) => {
            scope.setExtra(key, value);
          });
        }
        if (error) {
          scope.setExtra("error", error);
        }
        Sentry.captureException(error || new Error(message));
      });
    }
  }

  fatal(message: string, error?: Error, context?: LogContext) {
    const formattedMessage = this.formatMessage("fatal", message, context);
    console.error(formattedMessage, error);

    if (this.isProduction && process.env.SENTRY_DSN) {
      Sentry.withScope((scope) => {
        if (context) {
          Object.entries(context).forEach(([key, value]) => {
            scope.setExtra(key, value);
          });
        }
        if (error) {
          scope.setExtra("error", error);
        }
        scope.setLevel("fatal");
        Sentry.captureException(error || new Error(message));
      });
    }
  }

  // Specialized logging methods
  logUserAction(
    userId: string,
    action: string,
    entity?: string,
    entityId?: string,
    details?: Record<string, unknown>,
  ) {
    this.info(`User action: ${action}`, {
      userId,
      action,
      entity,
      entityId,
      details,
    });
  }

  logOrderEvent(
    orderId: string,
    event: string,
    userId?: string,
    details?: Record<string, unknown>,
  ) {
    this.info(`Order event: ${event}`, {
      orderId,
      event,
      userId,
      details,
    });
  }

  logPricingCalculation(customerId: string, productId: string, result: Record<string, unknown>) {
    this.debug("Pricing calculation", {
      customerId,
      productId,
      result,
    });
  }

  logSecurityEvent(
    event: string,
    request: Request,
    details?: Record<string, unknown>,
    severity: "low" | "medium" | "high" = "medium",
  ) {
    const level = severity === "high" ? "error" : severity === "medium" ? "warn" : "info";
    this[level](`Security event: ${event}`, {
      event,
      url: request.url,
      method: request.method,
      userAgent: request.headers.get("user-agent"),
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
      details,
    });
  }

  logDatabaseQuery(query: string, duration: number, success: boolean) {
    if (duration > 1000) {
      this.warn("Slow database query", {
        query,
        duration,
        success,
      });
    } else {
      this.debug("Database query", {
        query,
        duration,
        success,
      });
    }
  }

  // Performance monitoring
  logPerformance(operation: string, duration: number, context?: LogContext) {
    if (duration > 5000) {
      this.error(`Slow operation: ${operation} took ${duration}ms`, undefined, context);
    } else if (duration > 1000) {
      this.warn(`Slow operation: ${operation} took ${duration}ms`, undefined, context);
    } else {
      this.debug(`Operation: ${operation} took ${duration}ms`, context);
    }
  }
}

export const logger = new Logger();

// Export for convenience
export default logger;
