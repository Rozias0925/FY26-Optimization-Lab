import type { NextConfig } from 'next';

const githubPagesBasePath =
  process.env.GITHUB_PAGES === 'true'
    ? '/FY26-Optimization-Lab'
    : '';

const nextConfig: NextConfig = {
  output: 'export',
  assetPrefix: githubPagesBasePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
