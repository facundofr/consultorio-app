import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is almost entirely request-time data (agenda, availability,
  // admin). Cache Components is left off on purpose — see DECISIONS.md.
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2"],
  async headers() {
    return [
      {
        // Links with a cancel token must never leak through the Referer header.
        source: "/turno/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
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
