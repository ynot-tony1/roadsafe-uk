import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@roadsafe-uk/shared", "@roadsafe-uk/database"],
  // Prisma's query engine binaries live outside apps/web (custom `output`
  // path in schema.prisma), so Next.js's output file tracing misses them
  // when packaging serverless functions on Vercel, even though a local
  // `next build` (unrestricted filesystem access) never surfaces this.
  outputFileTracingIncludes: {
    "/**/*": ["../../packages/database/generated/client/**/*"],
  },
};

export default nextConfig;
