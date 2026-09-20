import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client"],
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb", // CSV imports can be a few MB
    },
  },
  webpack: (config) => {
    // Workspace packages (@thrice/*) are consumed as TS source and use
    // NodeNext-style relative imports ("./foo.js" resolving to foo.ts) so the
    // same source also runs unmodified under tsx (worker/seed/CLI). Teach
    // webpack the same extension mapping.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
