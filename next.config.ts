import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Every image ships from /public/images, so no remote hosts are allowed.
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
