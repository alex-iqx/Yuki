# Yuki Bot

Discord bot built with discord.js v14.

## Setup on VPS

```bash
# Clone the repo
git clone https://github.com/alex-iqx/Yuki.git
cd Yuki

# Install dependencies
npm install

# Create .env from example and fill in your values
cp .env.example .env
nano .env
```

## Environment Variables

| Variable | Description |
|---|---|
| `PREFIX` | Command prefix (default: `-`) |
| `ALLOWED_ROLE_ID` | Discord role ID allowed to use restricted commands |
| `BOT_TOKEN` | Discord bot token |
| `APPLICATION_ID` | Discord application ID |

## Run

```bash
# Start directly
node index.js

# Or use pm2 for persistence
npm install -g pm2
pm2 start index.js --name yuki
pm2 save
pm2 startup
```
