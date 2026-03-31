/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['playwright', '@prisma/client'],
  },
};

module.exports = nextConfig;
