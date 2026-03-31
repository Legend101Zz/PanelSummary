import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow images from our backend
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/images/**",
      },
    ],
  },

  // Experimental features for Next.js 15
  experimental: {
    // Better server component performance
    ppr: false,
  },

  // Environment variables available on both client and server
  // NEXT_PUBLIC_ prefix = exposed to browser
  // Others = server-only (safer for secrets)
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  },
};

export default nextConfig;
