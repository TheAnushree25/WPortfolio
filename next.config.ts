import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The hosted admin (backend/) answers /admin when ADMIN_BACKEND_URL is set; the pages then load
  // its visit counter and send it enquiries. Decided when the site is built.
  env: {
    NEXT_PUBLIC_ADMIN_CONNECTED: process.env.ADMIN_BACKEND_URL?.trim() ? '1' : '',
  },
  images: {
    // Every image ships from /public/images, so no remote hosts are allowed.
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
