import type { NextConfig } from 'next';

const githubPagesBasePath =
  process.env.GITHUB_PAGES === 'true'
    ? '/FY26-Optimization-Visual-Lab'
    : '';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: githubPagesBasePath,
  assetPrefix: githubPagesBasePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
