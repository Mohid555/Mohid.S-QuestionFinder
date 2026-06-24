# MongoDB Atlas Setup Checklist ✅

Use this checklist to quickly set up MongoDB Atlas for the Question Finder app.

## Phase 1: Create MongoDB Atlas Account & Cluster

- [ ] Go to https://www.mongodb.com/cloud/atlas
- [ ] Click **Sign Up** and create account
- [ ] Verify email
- [ ] Create a new **Project** named "QuestionFinder"
- [ ] Click **Create a Deployment**
- [ ] Select **M0 (Free)** tier
- [ ] Choose region (e.g., AWS us-east-1)
- [ ] Wait ~2 minutes for cluster to initialize ⏳

## Phase 2: Create Database User

- [ ] Go to **Security → Database Access**
- [ ] Click **Add Database User**
- [ ] Enter username: `mohid`
- [ ] Enter password: `mohid123` (or your own)
- [ ] Click **Add User**
- [ ] Save credentials somewhere safe 🔐

## Phase 3: Network Access

- [ ] Go to **Security → Network Access**
- [ ] Click **Add IP Address**
- [ ] Click **Allow access from anywhere** (for dev)
- [ ] Click **Confirm**

## Phase 4: Get Connection String

- [ ] Go to **Deployment → Database**
- [ ] Click **Connect** on your cluster
- [ ] Select **Drivers**
- [ ] Copy the connection string (looks like `mongodb+srv://...`)

## Phase 5: Update Project `.env` File

- [ ] Open `.env` in your project root
- [ ] Replace `<username>` with `mohid`
- [ ] Replace `<password>` with `mohid123`
- [ ] Replace `<cluster-name>` with your cluster name (from connection string)
- [ ] Save the file

### Example .env:

```env
MONGODB_URI=mongodb+srv://mohid:mohid123@questionfinder.r6hp7fi.mongodb.net/questionfinder?retryWrites=true&w=majority&appName=QuestionFinder
MONGODB_DB=questionfinder
MONGODB_COLLECTIONS=submissions,questions
PORT=5000
```

## Phase 6: Install Dependencies

```bash
# Terminal
npm install
```

- [ ] npm install completes successfully

## Phase 7: Test Connection

### Start Backend Server

```bash
npm run server
```

- [ ] Backend starts on port 5000
- [ ] You see: ✅ **"MongoDB connection successful (MongoDB Atlas)"**
- [ ] You see: **"Total visible submissions in database: 0"**

### In another terminal, test the API

```bash
curl http://localhost:5000/api/health
```

- [ ] Returns: `{"status":"ok","service":"Question Finder API"}`

## Phase 8: Seed Questions (Optional)

Install Python dependencies:

```bash
pip install sentence-transformers datasets scikit-learn numpy pymongo python-dotenv
```

- [ ] Python dependencies installed

Run seeding script:

```bash
python modal.py
```

- [ ] Script runs successfully
- [ ] You see: ✅ **"Saved X questions to MongoDB Atlas"**
- [ ] Check MongoDB Atlas Dashboard → collections

## Phase 9: Start Frontend

In a new terminal:

```bash
npm run dev
```

- [ ] Frontend starts on http://localhost:5173
- [ ] Backend and database both running

## Phase 10: Test End-to-End

- [ ] Open http://localhost:5173 in browser
- [ ] Select a topic from the filter
- [ ] Type a question in the search box (min 8 characters)
- [ ] See similar questions appear
- [ ] Verify in MongoDB Atlas that new submission was saved

## ✨ Success!

All systems operational:

- ✅ Frontend running on port 5173
- ✅ Backend running on port 5000
- ✅ MongoDB Atlas connected and synced
- ✅ Questions saved and searchable

## 🐛 Troubleshooting

### Backend won't connect to MongoDB

- [ ] Check `.env` file has correct credentials (no `<>` brackets)
- [ ] Verify network access allows your IP in MongoDB Atlas
- [ ] Try restarting backend server
- [ ] Check internet connectivity

### Python script fails

- [ ] Install dependencies: `pip install -r requirements.txt`
- [ ] Check `.env` exists in project root
- [ ] Verify MONGODB_URI is valid

### Frontend can't reach backend

- [ ] Check backend is running on port 5000
- [ ] Try accessing http://localhost:5000/api/health
- [ ] Check browser console for CORS errors

## 📞 Getting Help

- MongoDB Atlas Docs: https://docs.mongodb.com/atlas/
- MongoDB Community: https://www.mongodb.com/community/forums/
- Project GitHub Issues: (link to your repo)

---

**Congratulations! 🎉 Your Question Finder is now connected to MongoDB Atlas!**
