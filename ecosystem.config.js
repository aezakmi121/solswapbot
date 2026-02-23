module.exports = {
  apps: [
    {
      name: "solswap-bot",
      script: "dist/app.js",
      instances: 1, // Single instance — SQLite doesn't support concurrent writes
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
      },
      // Logging
      error_file: "./logs/error.log",
      out_file: "./logs/output.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      // Restart policy
      exp_backoff_restart_delay: 1000, // Exponential backoff on crashes
      max_restarts: 50,
      min_uptime: "10s", // Consider "started" after 10s uptime
    },
  ],
};
