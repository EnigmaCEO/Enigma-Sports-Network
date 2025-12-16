import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  images: {
    // allow simple domain-based remote images
    domains: [
      // ...existing domains...
      "d2zq9pbfla02w4.cloudfront.net",
    ],

    // allow remote patterns (optional but fine to keep)
    remotePatterns: [
      // ...existing patterns...
      {
        protocol: "https",
        hostname: "d2zq9pbfla02w4.cloudfront.net",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
