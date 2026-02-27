module.exports = {
    apps: [{
        name: "chatbot-backend",
        script: "./app.js",
        instances: 1, // Or "max" for cluster mode (be careful with state/sockets)
        exec_mode: "fork",
        env: {
            NODE_ENV: "development",
        },
        env_production: {
            NODE_ENV: "production",
            PORT: 5001
        },
        log_date_format: "YYYY-MM-DD HH:mm:ss",
        error_file: "logs/pm2-error.log",
        out_file: "logs/pm2-out.log",
        merge_logs: true,
        max_memory_restart: "1G"
    }]
};
