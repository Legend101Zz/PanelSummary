import type { NextConfig } from "next";

// NEXT_PUBLIC_API_URL (default http://127.0.0.1:8000, see lib/api.ts) is inlined at build time.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The reader must stay free of chrome that is not ours, even in dev.
  devIndicators: { buildActivity: false, appIsrStatus: false },
};

export default nextConfig;
