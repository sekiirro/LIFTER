import type { NextConfig } from 'next';
import packageJson from './package.json';

const nextConfig: NextConfig = {
  // The upload action accepts an 8 MiB banner plus multipart overhead; role limits stay server enforced.
  experimental: { serverActions: { bodySizeLimit: '9mb' } },
  env: {
    APP_VERSION: packageJson.version,
  },
  async headers() {
    const headers = [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Cache-Control', value: 'no-store' },
    ];
    return [
      { source: '/register/:token', headers },
      { source: '/register/:token/:path*', headers },
    ];
  },
};

export default nextConfig;
