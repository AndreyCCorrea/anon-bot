# Anonymous Media Exchange Bot

This bot allows users to exchange media (photos, videos, documents) anonymously. It was built using Node.js, TypeScript, grammY, and Prisma (SQLite).

## Features
- **Anonymous Exchange**: Users get a `#RandomName` and swap media securely.
- **Access Control**: Users require an invite link with a valid access key. Keys have a max limit of 500 uses.
- **Requirement**: Users must send 10 media files before they begin receiving. Inactivity for >12 hours resets this requirement.
- **Admin Management**: Admins can use commands (`/ban`, `/unban`, `/newkey`, `/closegroup`) to manage the system in a designated admin group.

## Step-by-Step Deployment Guide for EasyPanel

EasyPanel is an excellent tool for deploying Docker applications. Follow these steps to host your bot.

### Step 1: Create a GitHub Repository
1. Initialize a Git repository for this project locally.
2. Push all the files to a new GitHub repository (you can keep it private).

### Step 2: Set up an App in EasyPanel
1. Open your EasyPanel dashboard.
2. Navigate to your **Project** and click **Create App**.
3. Choose **App** from the list (which allows linking a GitHub repo or Docker image).

### Step 3: Link your Source Code
1. In the **Source** tab of your new App, select **GitHub** (or the provider you used).
2. Connect your repository and select the branch (e.g., `main`).
3. Set the **Build Method** to **Dockerfile**. EasyPanel will automatically detect the `Dockerfile` in the root of the repository.

### Step 4: Configure Environment Variables
1. Go to the **Environment** tab in your EasyPanel App.
2. Add the following variables:
   - `BOT_TOKEN`: The token you received from BotFather.
   - `ADMIN_GROUP_ID`: The Telegram ID of your admin group (usually starts with `-100`).
   - `DATABASE_URL`: `file:/data/db.sqlite` (We use a specific path so we can mount a volume).

### Step 5: Setup Persistent Volume
Since we are using SQLite, we need to ensure the database file is not lost when the container restarts.
1. Go to the **Mounts** tab in your EasyPanel App.
2. Add a new **Volume Mount**:
   - **Type**: Volume
   - **Name**: `anonbot-data` (or any name you prefer)
   - **Mount Path**: `/data`
3. Save the changes.

### Step 6: Deploy
1. Click the **Deploy** button in EasyPanel.
2. Check the **Logs** tab to see the build progress. 
3. Once deployed, the `start.sh` script will automatically push the Prisma schema to the database (`npx prisma db push`) and start the bot.

## Usage after Deployment
1. Add the bot to your Admin Group.
2. In the Admin Group, type `/newkey` to generate the first access key.
3. The bot will reply with a link (e.g., `https://t.me/YourBot?start=randomkey`).
4. Share this link. Users can click it to join the anonymous exchange!
