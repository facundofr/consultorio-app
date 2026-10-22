import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is almost entirely request-time data (agenda, availability,
  // admin). Cache Components is left off on purpose — see DECISIONS.md.
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
