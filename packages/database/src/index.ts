import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __roadsafePrisma: PrismaClient | undefined;
}

/**
 * Singleton Prisma client. Next.js dev mode hot-reloads modules, which would
 * otherwise open a new CockroachDB connection pool on every edit.
 */
export const prisma = globalThis.__roadsafePrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__roadsafePrisma = prisma;
}

export * from '@prisma/client';
