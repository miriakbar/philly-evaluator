# 🚀 Philly Area Evaluator - Production Deployment Guide

## Quick Start (5 minutes)

### Option 1: Local Testing
```bash
# 1. Install Node.js (if you haven't)
# Download from: https://nodejs.org/

# 2. Navigate to backend directory
cd backend

# 3. Install dependencies
npm install

# 4. Start the server
npm start

# 5. Open browser
# Go to: http://localhost:3000
```

### Option 2: Deploy to Cloud (Recommended for sharing with friends)

Choose one of these platforms:

---

## 🌐 Deploy to Render (Easiest - Free Tier)

**Why Render:** Free tier, zero config, just works!

### Step 1: Prepare Your Code
```bash
# 1. Create a GitHub account if you don't have one
# 2. Create a new repository called "philly-evaluator"
# 3. Upload your project files

# Or use git:
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/philly-evaluator.git
git push -u origin main
```

### Step 2: Deploy on Render
1. Go to https://render.com and sign up (free)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name:** philly-evaluator
   - **Environment:** Node
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `cd backend && npm start`
   - **Plan:** Free
5. Click **"Create Web Service"**
6. Wait 2-3 minutes for deployment
7. Share the URL with your friend! (e.g., `https://philly-evaluator.onrender.com`)

**✅ Done! Your app is live and free!**

---

## 🔵 Deploy to Railway (Also Easy & Free)

### Step 1: Sign Up
1. Go to https://railway.app
2. Sign up with GitHub (free)

### Step 2: Deploy
1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose your philly-evaluator repository
4. Railway will auto-detect Node.js
5. Set environment:
   - **Root Directory:** `backend`
   - **Start Command:** `npm start`
6. Deploy!

**Your URL:** `https://philly-evaluator-production.up.railway.app`

---

## 🟢 Deploy to Vercel (Fast & Free)

### Step 1: Install Vercel CLI
```bash
npm install -g vercel
```

### Step 2: Deploy
```bash
cd philly-evaluator-app
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? Your account
# - Link to existing project? No
# - Project name? philly-evaluator
# - Directory? ./
```

### Step 3: Configure
Create `vercel.json` in root:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "backend/server.js",
      "use": "@vercel/node"
    },
    {
      "src": "frontend/**",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "backend/server.js"
    },
    {
      "src": "/(.*)",
      "dest": "frontend/$1"
    }
  ]
}
```

Then redeploy:
```bash
vercel --prod
```

---

## 🌟 Deploy to Heroku (Classic Choice)

### Step 1: Install Heroku CLI
```bash
# Mac
brew tap heroku/brew && brew install heroku

# Windows
# Download from: https://devcenter.heroku.com/articles/heroku-cli
```

### Step 2: Create Heroku App
```bash
cd philly-evaluator-app

# Login to Heroku
heroku login

# Create app
heroku create philly-evaluator-YOUR-NAME

# Deploy
git push heroku main
```

### Step 3: Open Your App
```bash
heroku open
```

---

## 💻 Deploy to Your Own VPS (DigitalOcean, AWS, etc.)

### Requirements:
- Ubuntu 22.04 server
- Domain name (optional)

### Step 1: SSH into Server
```bash
ssh root@your-server-ip
```

### Step 2: Install Node.js
```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Verify
node --version
npm --version
```

### Step 3: Install and Configure
```bash
# Clone your repo or upload files
git clone https://github.com/YOUR_USERNAME/philly-evaluator.git
cd philly-evaluator/backend

# Install dependencies
npm install

# Install PM2 (process manager)
npm install -g pm2

# Start app
pm2 start server.js --name philly-evaluator

# Make it run on reboot
pm2 startup
pm2 save
```

### Step 4: Setup Nginx (Optional but recommended)
```bash
# Install Nginx
apt install -y nginx

# Create config
nano /etc/nginx/sites-available/philly-evaluator
```

Paste this config:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and restart:
```bash
ln -s /etc/nginx/sites-available/philly-evaluator /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### Step 5: Add SSL (Free with Let's Encrypt)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

---

## 🔧 Environment Variables

Create `.env` file in backend directory:

```env
PORT=3000
NODE_ENV=production
CACHE_TTL=3600
```

---

## 📊 Monitoring Your App

### Check if it's running (Local):
```bash
curl http://localhost:3000/api/health
```

### Check if it's running (Production):
```bash
curl https://your-app-url.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-01T18:30:00.000Z",
  "cache_stats": {...}
}
```

---

## 🐛 Troubleshooting

### Problem: "Cannot find module 'express'"
**Solution:**
```bash
cd backend
npm install
```

### Problem: "Port 3000 already in use"
**Solution:**
```bash
# Find and kill the process
lsof -ti:3000 | xargs kill -9

# Or use a different port
PORT=3001 npm start
```

### Problem: "CORS error"
**Solution:** Make sure frontend is served from same domain as backend, or update CORS settings in `server.js`

### Problem: APIs returning empty data
**Solution:** Philadelphia's APIs may have rate limits. Wait a few minutes and try again.

---

## 📈 Usage Limits (Free Tiers)

| Platform | Hours/Month | Bandwidth | Sleep After |
|----------|-------------|-----------|-------------|
| Render | 750 | 100GB | 15min idle |
| Railway | 500 | Unlimited | Never |
| Vercel | Unlimited | 100GB | Never |
| Heroku | 550 | 2TB | 30min idle |

**Recommendation for personal use:** Render or Railway

---

## 🔐 Security Checklist

- [ ] Don't commit `.env` files
- [ ] Use environment variables for sensitive data
- [ ] Enable HTTPS in production
- [ ] Add rate limiting if expecting high traffic
- [ ] Monitor API usage
- [ ] Regular updates: `npm update`

---

## 🎯 Next Steps After Deployment

1. **Test thoroughly**
   - Search for 5-10 different addresses
   - Check if markers appear on map
   - Verify data accuracy

2. **Share with friend**
   - Send them the URL
   - Create a simple guide:
     ```
     1. Go to https://your-app-url.com
     2. Enter any Philadelphia address
     3. Click "Search & Add to Map"
     4. View the results!
     ```

3. **Collect feedback**
   - What features do they want?
   - Any bugs?
   - Performance issues?

4. **Monitor usage**
   - Check server logs
   - Watch for errors
   - Track popular searches

---

## 💡 Pro Tips

1. **Custom Domain:**
   - Buy domain from Namecheap ($10/year)
   - Point to your deployment
   - Much more professional!

2. **Analytics:**
   Add Google Analytics to track usage:
   ```html
   <!-- Add to frontend/index.html <head> -->
   <script async src="https://www.googletagmanager.com/gtag/js?id=GA_TRACKING_ID"></script>
   ```

3. **Mobile App:**
   - Use same backend
   - Create React Native app
   - Reuse all the logic!

---

## 🆘 Need Help?

- Check server logs: `heroku logs --tail` (Heroku)
- Check server logs: `pm2 logs philly-evaluator` (VPS)
- Test API directly: Use Postman or curl
- GitHub Issues: Create an issue in your repo

---

## 📞 Share Your App

Once deployed, share like this:

**To friend:**
> Hey! Check out this Philadelphia neighborhood evaluator I built:
> https://your-app-name.onrender.com
> 
> Just enter any Philly address and it shows crime stats, 311 complaints, 
> and gives an overall safety score. Pretty cool for apartment hunting!

**Example Addresses to Try:**
- 1500 Market St, Philadelphia (City Center)
- 2400 Chestnut St, Philadelphia (Rittenhouse)
- 1234 South St, Philadelphia (South Street)

---

**You're all set! 🎉**

Choose a deployment method above and you'll have your app live in 10 minutes!
