import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Reference imagery is served from the Framer CDN. Swap these entries for your
    // own host (or drop files into /public/images) once real assets are available.
    remotePatterns: [
      { protocol: 'https', hostname: 'framerusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
