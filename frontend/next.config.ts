const path = require("path");

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import("next").NextConfig} */
const nextConfig = {
  basePath: BASE_PATH,
  assetPrefix: BASE_PATH ? `${BASE_PATH}/` : undefined,

  webpack: (config, { isServer }) => {
    config.resolve.alias["@"] = path.resolve(__dirname, "src");

    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push("canvas", "chartjs-node-canvas");
    }

    return config;
  },

  serverExternalPackages: ["canvas", "chartjs-node-canvas"],
  outputFileTracingRoot: path.join(__dirname, "../"),
};

module.exports = nextConfig;
