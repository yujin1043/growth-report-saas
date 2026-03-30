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
    // ✅ 추가: WebP/AVIF 자동 변환 → 이미지 용량 50~70% 절감
    formats: ['image/avif', 'image/webp'],
  },

  // ✅ 추가: gzip/brotli 압축 활성화
  compress: true,

  // ✅ 추가: 정적 자산 캐싱 → 재방문 시 즉시 로딩
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // ✅ 추가: Supabase 패키지 트리 쉐이킹 → 번들 크기 감소
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js'],
  },
};

export default nextConfig;