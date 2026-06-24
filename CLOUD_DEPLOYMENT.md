# Cloud Deployment Guide

Your Question Finder app is ready to deploy to the cloud!

## Why Deploy to Cloud?

✅ Fixes DNS resolution issues  
✅ MongoDB Atlas works perfectly from cloud servers  
✅ Access your app from anywhere  
✅ Share with others via URL  
✅ No local machine needed

---

## Option 1: Railway (Recommended - Easiest)

### Steps:

1. **Install Railway CLI**

   ```bash
   npm install -g @railway/cli
   ```

2. **Login**

   ```bash
   railway login
   ```

3. **Initialize**

   ```bash
   cd d:\similar-study-question-finder
   railway init
   ```

   - Choose: "Create new project"
   - Name: "question-finder"

4. **Add MongoDB Plugin**

   ```bash
   railway add
   ```

   - Select: MongoDB
   - It auto-generates MONGODB_URI

5. **Deploy**

   ```bash
   railway up
   ```

6. **Get your URL**
   ```bash
   railway open
   ```

---

## Option 2: Render (Also Easy)

### Steps:

1. **Push to GitHub**

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/question-finder
   git push -u origin main
   ```

2. **Go to https://render.com**

3. **Click "New +" → "Web Service"**

4. **Connect your GitHub repo**

5. **Configure**
   - Name: `question-finder`
   - Root Directory: `.`
   - Build Command: `npm install`
   - Start Command: `npm run server`

6. **Add Environment Variables**
   - Key: `MONGODB_URI`
   - Value: Your MongoDB connection string
   - Key: `MONGODB_DB`
   - Value: `questionfinder`
   - Key: `MONGODB_COLLECTIONS`
   - Value: `submissions,questions`

7. **Deploy** (Auto-deploys when you push to main)

---

## Option 3: Vercel (Frontend + Backend)

### Steps:

1. **Install Vercel CLI**

   ```bash
   npm install -g vercel
   ```

2. **Deploy**

   ```bash
   vercel
   ```

3. **Answer prompts**
   - Project name: `question-finder`
   - Link to existing project? No
   - Deploy? Yes

4. **Add Environment Variables** in Vercel dashboard

---

## Option 4: Quick Test on Replit

1. Go to https://replit.com
2. Click **Create** → **Import from GitHub**
3. Paste your repo URL
4. Click **Import**
5. Click **Run**
6. Add `.env` with your MongoDB URI
7. Open the preview URL

---

## After Deployment

### Your app will be at:

**Railway**: `your-project.up.railway.app`  
**Render**: `question-finder.onrender.com`  
**Vercel**: `question-finder.vercel.app`

### Access it from:

- Browser: `https://your-domain.com`
- Share link with anyone
- Use from mobile
- No local setup needed

---

## Environment Variables (All Platforms)

Add these to your cloud platform's dashboard:

```env
MONGODB_URI=mongodb+srv://mohid:mohid123@questionfinder.r6hp7fi.mongodb.net/questionfinder?retryWrites=true&w=majority&appName=QuestionFinder
MONGODB_DB=questionfinder
MONGODB_COLLECTIONS=submissions,questions
PORT=5000
```

---

## Frontend Deployment (Optional)

If you want the frontend on a separate domain:

### Deploy Frontend to Vercel

```bash
npm run build
vercel --prod
```

Your frontend will be at: `question-finder.vercel.app`

### Update Frontend API Endpoint

Edit `src/main.tsx`:

```typescript
const API_URL = "https://your-backend-domain.com";
```

---

## Full Stack Deployment Summary

| Layer    | Platform       | URL                           |
| -------- | -------------- | ----------------------------- |
| Frontend | Vercel         | `question-finder.vercel.app`  |
| Backend  | Railway/Render | `question-finder.railway.app` |
| Database | MongoDB Atlas  | Cloud (no URL needed)         |

---

## Recommended Setup

**Easiest**:

- Backend: **Railway** (auto-configures MongoDB)
- Frontend: Served from same Railway instance
- Total time: ~5 minutes

**Production-Ready**:

- Frontend: **Vercel**
- Backend: **Railway** or **Render**
- Database: **MongoDB Atlas**

---

## Next Steps

1. Choose a platform (Railway recommended)
2. Install CLI tool
3. Run deployment commands
4. Add environment variables
5. Your app is live! 🚀

---

## Questions?

- **Railway Docs**: https://docs.railway.app
- **Render Docs**: https://render.com/docs
- **Vercel Docs**: https://vercel.com/docs

---

**Which platform would you like to use? I'll guide you through it step-by-step!**
