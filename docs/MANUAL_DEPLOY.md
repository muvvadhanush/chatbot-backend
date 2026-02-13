# 🚨 Manual Deployment Steps (If CI/CD Fails)

## On EC2 Server

```bash
# 1. Navigate to project directory
cd ~/chatbot-backend

# 2. Pull latest code
git pull origin main

# 3. Rebuild and restart Docker containers
docker compose down
docker compose up -d --build

# 4. Check logs
docker compose logs -f backend
```

## Verify .env File

Make sure `/home/ubuntu/chatbot-backend/.env` contains:

```
# Database Config
DB_HOST=aws-1-ap-southeast-2.pooler.supabase.com
DB_PORT=6543
DB_USER=postgres.qsrmlwyjvynkqqhyfeyk
DB_PASSWORD=<your-actual-password>
DB_NAME=postgres

# AI Config
OPENAI_API_KEY=<your-actual-key>

# Server
PORT=5000
NODE_ENV=production
```

**CRITICAL**: The `.env` file must have the REAL Supabase credentials, not placeholders.

## Health Check

```bash
curl http://localhost:5000/health
```

Should return: `{"status":"ok"}`
