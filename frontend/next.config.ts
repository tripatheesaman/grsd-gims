import path from "path";
import type { NextConfig } from "next";

const normalizeBasePath = (value?: string) => {
  if (!value || value === "/") {
    return "";
  }
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.replace(/\/+$/, "");
};

const BASE_PATH = normalizeBasePath(
  process.env.NEXT_PUBLIC_BASE_PATH || "/inventory"
);

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: BASE_PATH,
  assetPrefix: BASE_PATH || undefined,

  webpack: (config, { isServer }) => {
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
