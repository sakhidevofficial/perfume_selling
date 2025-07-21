"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/middleware-utils";
import { logProductAction } from "@/lib/audit";

export async function deleteProduct(productId: string, request: Request) {
  try {
    // Check authentication and admin role
    await requireAdmin();

    // Verify CSRF token
    const formData = await request.formData();
    const csrfToken = formData.get("csrf_token") as string;
    if (!csrfToken) {
      throw new Error("CSRF token missing");
    }

    // TODO: Replace with actual database call
    console.log("Deleting product:", productId);

    // Simulate database operation
    const deletedProduct = {
      id: productId,
      name: "Demo Product", // In real app, fetch from DB
      brand: "Demo Brand",
      ean: "1234567890123",
    };

    // Log the product deletion
    await logProductAction("DELETE", productId, {
      productName: deletedProduct.name,
      brand: deletedProduct.brand,
      ean: deletedProduct.ean,
    });

    // Revalidate cache before redirect
    revalidatePath("/admin/products");

    // Redirect after successful deletion - this will throw NEXT_REDIRECT exception
    // which is expected behavior and should not be logged as an error
    redirect("/admin/products");
  } catch (error) {
    // Filter out NEXT_REDIRECT exceptions - these are expected and should not be logged as errors
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      // This is a successful redirect, not an error - re-throw to allow Next.js to handle it
      throw error;
    }

    // Log only real errors, not redirects
    console.error("Error deleting product:", error);
    throw error;
  }
}

export async function confirmProductDeletion(productId: string, request: Request) {
  try {
    // Check authentication and admin role
    await requireAdmin();

    // Verify CSRF token
    const formData = await request.formData();
    const csrfToken = formData.get("csrf_token") as string;
    if (!csrfToken) {
      throw new Error("CSRF token missing");
    }

    // TODO: Replace with actual database call to get product details
    console.log("Confirming deletion for product:", productId);

    // Simulate database operation
    const product = {
      id: productId,
      name: "Demo Product",
      brand: "Demo Brand",
      ean: "1234567890123",
      purchasePrice: "10.00",
      retailPrice: "15.00",
      stock: "100",
    };

    return { success: true, product };
  } catch (error) {
    console.error("Error confirming product deletion:", error);
    throw error;
  }
}
