module.exports = {
  apps: [
    {
      name: 'mgpt-bot',
      script: 'src/index.js',
      args: 'run',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
      time: true,
      restart_delay: 30_000,
      min_uptime: 10_000,
      max_restarts: 50,
    },
  ],
};
