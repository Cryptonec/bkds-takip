/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['playwright', '@prisma/client'],
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
