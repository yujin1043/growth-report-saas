import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Supabase Storage 이미지 허용
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
};

export default nextConfig;
