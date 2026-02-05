import path from "path";
import type { NextConfig } from "next";
import type { Configuration } from "webpack";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  assetPrefix: BASE_PATH ? `${BASE_PATH}/` : undefined,

  webpack: (config: Configuration, { isServer }) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    (config.resolve.alias as Record<string, string>)["@"] = path.resolve(__dirname, "src");

    if (isServer) {
      config.externals = config.externals || [];
      (config.externals as any[]).push("canvas", "chartjs-node-canvas");
    }

    return config;
  },

  serverExternalPackages: ["canvas", "chartjs-node-canvas"],
  outputFileTracingRoot: path.join(__dirname, "../"),
};

export default nextConfig;
