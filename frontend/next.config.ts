import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.resolve(__dirname, "src"),
    };

    if (isServer) {
      config.externals = config.externals || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config.externals as any[]).push("canvas", "chartjs-node-canvas");
    }

    return config;
  },
  serverExternalPackages: ["canvas", "chartjs-node-canvas"],
  experimental: {},
  outputFileTracingRoot: path.join(__dirname, "../"),
};

export default nextConfig;
