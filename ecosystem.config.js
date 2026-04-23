// PM2 ecosystem config — Windows'ta 'pm2 start npm' syntax hatası verdiği için
// Next.js'i doğrudan node binary'siyle çalıştırıyoruz.
module.exports = {
  apps: [
    {
      name: 'bkds-takip',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: __dirname,
      interpreter: 'node',
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
    },
  ],
};
