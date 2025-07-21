import { PrismaClient } from "@prisma/client";
import { env } from "./env";

// Debug check voor DATABASE_URL
if (!env.DATABASE_URL) {
  throw new Error("❌ DATABASE_URL ontbreekt! Zet deze in Netlify > Environment Variables.");
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
