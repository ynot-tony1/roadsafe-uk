import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@roadsafe-uk/shared", "@roadsafe-uk/database"],
};

export default nextConfig;
