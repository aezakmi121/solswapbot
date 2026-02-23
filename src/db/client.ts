import { PrismaClient } from "@prisma/client";

/** Singleton Prisma client — reuse across the app */
const prisma = new PrismaClient();

export { prisma };
