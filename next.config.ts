import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local dev badge: bottom-right, so it doesn't cover the sidebar's account button.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
