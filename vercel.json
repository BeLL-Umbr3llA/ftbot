{
  "version": 2,
  "name": "football-noti-bot",
  "builds": [
    {
      "src": "api/**/*.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/index",
      "dest": "api/index.js"
    },
    {
      "src": "/api/cron",
      "dest": "api/cron.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
