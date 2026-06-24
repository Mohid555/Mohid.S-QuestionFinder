# MongoDB Atlas SSL Connection Error - Troubleshooting Guide

## Error Message
```
SSL alert number 80: tlsv1 alert internal error
```

This indicates MongoDB Atlas couldn't establish a secure TLS connection with your application.

## Quick Fixes (Try in Order)

### ✅ Fix #1: Verify Your IP is Whitelisted (Most Common)

MongoDB Atlas requires your IP address to be in the Network Access whitelist.

**Steps**:
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Log in to your account
3. Click your **Cluster** (QuestionFinder)
4. Go to **Security** → **Network Access**
5. Look for your IP in the list
6. If not there, click **Add IP Address**
7. Select **Allow access from anywhere** (0.0.0.0/0) for development
   - ⚠️ **For production**: Only allow your specific IP
8. Click **Confirm**
9. **Restart your backend**: `npm run server`

---

### ✅ Fix #2: Check Credentials Format

Password with special characters needs URL encoding.

**Examples of special characters**:
- `@` → `%40`
- `#` → `%23`
- `!` → `%21`
- `:` → `%3A`

**Check your `.env` file**:
```env
# If password is: my@password#123
# URL encode it as: my%40password%23123
MONGODB_URI=mongodb+srv://mohid:my%40password%23123@questionfinder.r6hp7fi.mongodb.net/...
```

**Verify**:
- Username: `mohid` (✅ looks good)
- Password: `mohid123` (✅ no special characters)

---

### ✅ Fix #3: Verify Connection String Format

Get the **exact** connection string from MongoDB Atlas:

**Steps**:
1. Go to your Cluster **Overview**
2. Click **Connect** button
3. Select **Drivers**
4. Copy the connection string (should start with `mongodb+srv://`)
5. Replace `<username>` and `<password>` with your actual values
6. Replace in `.env`:
```env
MONGODB_URI=mongodb+srv://username:password@cluster-name.mongodb.net/questionfinder?retryWrites=true&w=majority&appName=QuestionFinder
```

**Common mistakes**:
- ❌ `mongodb://` (should be `mongodb+srv://`)
- ❌ Missing database name `/questionfinder`
- ❌ Missing connection parameters
- ❌ Placeholder values like `<username>`

---

### ✅ Fix #4: Check Network/Firewall

1. **Test your internet connection**:
   ```bash
   ping google.com
   ```

2. **Check if you can reach MongoDB**:
   ```bash
   node -e "require('dns').lookup('questionfinder.r6hp7fi.mongodb.net', (err, addr) => console.log(err || addr))"
   ```

3. **Disable VPN/Proxy** temporarily if using one

4. **Check firewall settings**:
   - Windows Defender Firewall
   - Corporate proxy/firewall
   - ISP restrictions

---

### ✅ Fix #5: Verify Cluster Status

Make sure your MongoDB cluster is running:

**Steps**:
1. Go to [MongoDB Atlas Deployments](https://cloud.mongodb.com/v2)
2. Click your cluster **QuestionFinder**
3. Look for status (should say "Active")
4. If it says "Paused", click **Resume**

---

## Advanced Debugging

### Enable Verbose Logging

Add this to your `server.js` before the MongoClient import:

```javascript
import { Logger, setLevel } from "mongodb";
setLevel("debug");
const logger = new Logger("mongodb");
logger.debug("MongoDB debug logging enabled");
```

Then restart and look for detailed connection logs.

### Test Connection Manually

Create a file `test-mongo.js`:

```javascript
import { MongoClient } from "mongodb";
import { config } from "dotenv";

config();

const uri = process.env.MONGODB_URI;
console.log(`Testing connection to: ${uri.replace(/:[^:]*@/, ':***@')}`);

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 5000,
});

(async () => {
  try {
    await client.connect();
    console.log("✅ Connected!");
    
    const admin = client.db("admin");
    const result = await admin.command({ ping: 1 });
    console.log("✅ Ping successful:", result);
    
    const collections = await client.db("questionfinder").listCollections().toArray();
    console.log("✅ Collections:", collections);
    
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await client.close();
  }
})();
```

Run it:
```bash
node test-mongo.js
```

---

## MongoDB Atlas Dashboard Checks

### 1. **Verify Cluster Exists**
- Deployments → Your cluster should be listed and **Active**

### 2. **Verify Database User Exists**
- Security → Database Access
- Username `mohid` should be listed
- Status should be ✅

### 3. **Verify Network Access**
- Security → Network Access
- Your IP (or 0.0.0.0/0) should be in the list

### 4. **Check Connection Logs**
- Support → Logs
- Look for errors related to your connection

---

## Full Checklist

- [ ] Cluster is **Active** (not Paused)
- [ ] Database user `mohid` exists and password is correct
- [ ] Your IP is in Network Access whitelist
- [ ] Connection string copied correctly from MongoDB Atlas
- [ ] `.env` file has correct MONGODB_URI
- [ ] No special characters in password (or properly URL-encoded)
- [ ] Internet connection is working
- [ ] No VPN/Proxy interference
- [ ] Node.js server restarted after changes

---

## Still Having Issues?

### Check These Logs

**In MongoDB Atlas Dashboard**:
1. Go to your Cluster
2. Click **Logs**
3. Look for connection attempts with errors

**In Your Terminal**:
```bash
npm run server
# Look for error messages with:
# - "SSL"
# - "certificate"
# - "authentication"
# - "ECONNREFUSED"
# - "ENOTFOUND"
```

### Try Minimal Connection

Test without `?appName=QuestionFinder` parameter:

```env
MONGODB_URI=mongodb+srv://mohid:mohid123@questionfinder.r6hp7fi.mongodb.net/questionfinder?retryWrites=true&w=majority
```

### Use MongoDB Compass for Testing

Download [MongoDB Compass](https://www.mongodb.com/products/compass):
1. Open Compass
2. Click **New Connection**
3. Paste your MONGODB_URI
4. Click **Connect**
5. If it works in Compass, issue is with Node.js driver config
6. If it fails, issue is with credentials/network

---

## Common Error Messages & Fixes

| Error | Likely Cause | Fix |
|-------|--------------|-----|
| `SSL alert internal error` | IP not whitelisted | Add IP to Network Access |
| `authentication failed` | Wrong credentials | Verify username/password |
| `ENOTFOUND` | Wrong cluster name | Get correct name from MongoDB Atlas |
| `ECONNREFUSED` | Network blocked | Check firewall/VPN |
| `certificate verify failed` | SSL certificate issue | Usually network related |
| `timed out` | Connection too slow | Check network speed |

---

## Contact MongoDB Support

If you've tried all fixes:

1. Go to [MongoDB Support](https://support.mongodb.com)
2. Create a ticket with:
   - Connection string (hide password): `mongodb+srv://***:***@questionfinder.r6hp7fi.mongodb.net/...`
   - Full error message
   - Your OS and Node.js version
   - Steps you've already tried

---

## Success Signs

After fixing the issue, you should see:

```
Attempting to connect to MongoDB Atlas...
  URI: mongodb+srv://***@questionfinder.r6hp7fi.mongodb.net/...
✅ Connected to MongoDB Atlas.
✅ Database verified (ping successful).
Connected to MongoDB Atlas.
Database verified.
✅ MongoDB connection successful (MongoDB Atlas).
   Total visible submissions in database: 0
```

---

**Try Fix #1 (Network Access) first — that's the most common cause!**
