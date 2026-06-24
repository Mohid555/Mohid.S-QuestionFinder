# MongoDB Atlas Setup Guide

This project is now configured to use **MongoDB Atlas** for storing and retrieving study questions. This guide explains how to set up MongoDB Atlas and connect your application.

## What is MongoDB Atlas?

MongoDB Atlas is a fully managed cloud database service by MongoDB. It provides:

- **Free tier**: Up to 512MB storage for development
- **Automatic scaling**: Grows with your data
- **Global availability**: Deploy in multiple regions
- **Built-in security**: Network access controls, encryption

## Step 1: Create MongoDB Atlas Account

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Click **Sign Up** and create a free account
3. Verify your email address

## Step 2: Create a Project & Cluster

1. After logging in, click **Create a Project**
2. Name it `QuestionFinder` (or any name you prefer)
3. Click **Create Project**
4. Click **Create a Deployment**
5. Select **M0 (Free)** tier
6. Choose your **Cloud Provider & Region** (e.g., AWS, us-east-1)
7. Click **Create Deployment** and wait ~2 minutes for the cluster to initialize

## Step 3: Create Database User

1. In your cluster, go to **Security → Database Access**
2. Click **Add Database User**
3. Set a username (e.g., `mohid`)
4. Set a strong password (e.g., `mohid123`)
5. Click **Add User**

⚠️ **Important**: Save these credentials securely!

## Step 4: Configure Network Access

1. Go to **Security → Network Access**
2. Click **Add IP Address**
3. Click **Allow access from anywhere** (for development only)
   - In production, restrict to specific IP addresses
4. Click **Confirm**

## Step 5: Get Your Connection String

1. Go to **Deployment → Database**
2. Click **Connect** on your cluster
3. Select **Drivers**
4. Copy the **Connection String** (it looks like):
   ```
   mongodb+srv://<username>:<password>@<cluster-name>.mongodb.net/?retryWrites=true&w=majority
   ```

## Step 6: Update `.env` File

Replace placeholders in your `.env` file:

```env
# Copy the connection string from MongoDB Atlas and replace <username> and <password>
MONGODB_URI=mongodb+srv://mohid:mohid123@questionfinder.r6hp7fi.mongodb.net/questionfinder?retryWrites=true&w=majority&appName=QuestionFinder
MONGODB_DB=questionfinder
MONGODB_COLLECTIONS=submissions,questions
PORT=5000
```

## Step 7: Install Dependencies

```bash
# Backend dependencies (already in package.json)
npm install

# Python dependencies (for data seeding)
pip install sentence-transformers datasets scikit-learn numpy pymongo python-dotenv
```

## Step 8: Test the Connection

### Backend Server

```bash
npm run server
```

Look for output like:

```
Connected to MongoDB Atlas.
Database verified.
✅ MongoDB connection successful (MongoDB Atlas).
```

### Frontend & Data Seeding

```bash
# Terminal 1: Start backend
npm run server

# Terminal 2: Run Python data seeding script
python modal.py
```

The Python script will:

1. Load 10,000 study questions
2. Generate embeddings
3. Save to MongoDB Atlas automatically
4. Print: `✅ Saved X questions to MongoDB Atlas`

## Project Structure with MongoDB

### Database: `questionfinder`

#### Collections:

**1. `questions` (Seed data)**

- Stores 10,000+ pre-loaded study questions
- Fields: `id`, `text`, `tag`, `createdAt`, `searchText`, `similarQuestions`
- Source: `"seed-data"` (Python script)

**2. `submissions` (User submissions)**

- Stores questions submitted by users through the UI
- Same fields as `questions`
- Source: `"user-submission"` (Frontend)

Both collections are queried together by the backend to provide comprehensive search results.

## API Endpoints

### GET `/api/health`

Test if the backend is running

```bash
curl http://localhost:5000/api/health
```

### GET `/api/topics`

Get all available question categories

```bash
curl http://localhost:5000/api/topics
```

### POST `/api/questions/search`

Search for similar questions

```bash
curl -X POST http://localhost:5000/api/questions/search \
  -H "Content-Type: application/json" \
  -d '{"question": "What is photosynthesis?", "userName": "Student"}'
```

### GET `/api/submissions`

Get all user submissions

```bash
curl http://localhost:5000/api/submissions?tag=Biology
```

### GET `/api/stats`

Get statistics about questions

```bash
curl http://localhost:5000/api/stats
```

## Troubleshooting

### Connection Failed

**Error**: `Failed to connect to MongoDB Atlas: getaddrinfo ENOTFOUND`

**Solution**:

1. Check internet connectivity
2. Verify `MONGODB_URI` in `.env` file
3. Ensure credentials are correct (no special characters that need escaping)
4. Check MongoDB Atlas **Network Access** allows your IP

### Authentication Failed

**Error**: `authentication failed` or `Unauthorized`

**Solution**:

1. Verify username and password in `MONGODB_URI`
2. Re-create the database user with simpler credentials
3. Make sure password doesn't have special characters that need URL encoding

### Placeholder Credentials Error

**Error**: `MongoDB NOT configured — set MONGODB_URI in your .env file`

**Solution**:

1. Replace `<username>` and `<password>` in `.env`
2. Replace `<cluster-name>` with your actual cluster name
3. Don't use angle brackets `<>`

## Monitoring Your Database

### In MongoDB Atlas Dashboard:

1. **Metrics** tab: View CPU, memory, storage usage
2. **Logs** tab: View connection logs and errors
3. **Collections** tab: Browse documents directly
4. **Connect** → **MongoDB Compass**: GUI client for database exploration

### Using MongoDB Compass (GUI Client)

1. Download [MongoDB Compass](https://www.mongodb.com/products/compass)
2. Open it
3. Paste your connection string
4. Click **Connect**
5. Browse your `questionfinder` database

## Scaling & Production

### Free Tier Limits:

- 512 MB storage
- Up to 100 concurrent connections
- No backup (data retained for 7 days)

### Upgrade When:

- Approaching 512 MB storage
- Need high availability
- Want automated backups

### To Upgrade:

1. Go to **Deployment → Overview**
2. Click **Upgrade Tier** and select **M2** ($9/month)

## Next Steps

1. **Run the frontend**: `npm run dev` (http://localhost:5173)
2. **Seed data**: `python modal.py` (uploads 10,000 questions)
3. **Test search**: Use the UI to search for questions
4. **Monitor**: Check MongoDB Atlas dashboard for stored data

## Support

- [MongoDB Atlas Docs](https://docs.mongodb.com/atlas/)
- [PyMongo Docs](https://pymongo.readthedocs.io/)
- [MongoDB Forums](https://www.mongodb.com/community/forums/)

---

**Happy learning! 🚀**
