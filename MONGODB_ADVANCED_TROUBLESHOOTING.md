# Advanced MongoDB SSL Troubleshooting

Your SSL connection is failing at the TLS handshake level. This guide helps diagnose the root cause.

## 🚨 CRITICAL: Verify MongoDB Atlas Network Access

This is the #1 cause of SSL errors. **You MUST do this**:

### In MongoDB Atlas Dashboard:

1. Open https://cloud.mongodb.com/v2
2. Click your project → **Deployments**
3. Click **QuestionFinder** cluster
4. Go to **Security** tab → **Network Access**
5. Look at the IP address list
6. **CRITICAL**: You should see an entry for **`0.0.0.0/0`** or your specific IP
7. **If NOT there**:
   - Click **+ Add IP Address** (blue button)
   - Click **Allow access from anywhere** (shows `0.0.0.0/0`)
   - Click **Confirm**
   - **WAIT 2-3 MINUTES** for changes to take effect

---

## 🔍 Run the Diagnostic Test Script

This script will tell you exactly what's wrong:

```bash
node test-mongo-connection.mjs
```

This will:

- ✅ Test 1: Validate your connection string
- ✅ Test 2: Check network connectivity
- ✅ Test 3: Try connecting with strict SSL (realistic)
- ✅ Test 4: Try connecting with permissive SSL (diagnostic)

### Reading the Results:

**Result: Test 3 PASSES ✅**

- Your setup is correct!
- Run `npm run server` again
- Everything should work

**Result: Test 4 PASSES but Test 3 FAILS ❌**

- Network can reach MongoDB
- But SSL is being intercepted
- **Causes**: Windows Firewall, Antivirus, VPN, Corporate Proxy
- **Solutions**: See section below

**Result: Test 4 FAILS ❌**

- Network Access not properly configured
- Go back to "Verify Network Access" section above
- Add `0.0.0.0/0` to whitelist

---

## 🛡️ SSL Interception Issues (Most Likely)

If Test 4 passes but Test 3 fails, something is intercepting your SSL:

### Fix #1: Disable Windows Defender Firewall

⚠️ **Temporary for testing only** - Re-enable after testing!

**Steps**:

1. Type "Windows Defender Firewall" in Start menu
2. Click "Windows Defender Firewall with Advanced Security"
3. Click "Windows Defender Firewall Properties" (left panel)
4. For each tab (Domain, Private, Public):
   - Set "Firewall state" to **OFF**
   - Click **Apply**
5. Try connecting: `npm run server`
6. If it works → firewall was blocking it
7. **Re-enable firewall** and whitelist MongoDB:
   - In Windows Defender → "Allow an app through firewall"
   - Add `node.exe` to allowed apps

### Fix #2: Disable Antivirus Temporarily

**Common antivirus software**:

- Windows Defender (built-in) - see Fix #1
- Norton - Disable temporarily
- McAfee - Disable temporarily
- Bitdefender - Disable temporarily
- Kaspersky - Disable temporarily

**Steps** (varies by software):

1. Find the antivirus in system tray (bottom right)
2. Right-click → Settings
3. Look for "Real-time Protection" or "Active Protection"
4. Disable temporarily
5. Try connecting: `npm run server`
6. If it works → antivirus was blocking it
7. Whitelist MongoDB in antivirus settings

### Fix #3: Disconnect from VPN

If using VPN:

1. Disconnect from VPN
2. Try connecting: `npm run server`
3. If it works → VPN was intercepting SSL
4. Check VPN settings for "SSL inspection" and disable it

### Fix #4: Bypass Corporate Proxy

If on corporate network:

1. Try from personal WiFi (mobile hotspot) to test
2. If it works → corporate proxy was the issue
3. Ask your IT department to whitelist `mongodb.net` and `mongodb.com`

---

## 🌐 Network Check

Verify you can reach MongoDB servers:

**Method 1: PowerShell**

```powershell
Test-NetConnection -ComputerName questionfinder.r6hp7fi.mongodb.net -Port 27017 -InformationLevel Detailed
```

Expected output:

```
ComputerName     : questionfinder.r6hp7fi.mongodb.net
RemoteAddress    : xxx.xxx.xxx.xxx
RemotePort       : 27017
TcpTestSucceeded : True
```

**Method 2: DNS Resolution**

```powershell
Resolve-DnsName questionfinder.r6hp7fi.mongodb.net
```

Should return an IP address (like `34.212.x.x`)

---

## 🔐 Verify Connection String

Make sure your `.env` is **exactly** correct:

```env
MONGODB_URI=mongodb+srv://mohid:mohid123@questionfinder.r6hp7fi.mongodb.net/questionfinder?retryWrites=true&w=majority&appName=QuestionFinder
```

✅ Correct format:

- Protocol: `mongodb+srv://` (NOT `mongodb://`)
- Username: `mohid` (after `://`)
- Password: `mohid123` (after first `:`)
- Host: `questionfinder.r6hp7fi.mongodb.net`
- Database: `questionfinder` (after `.net/`)
- Parameters: `?retryWrites=true&w=majority&appName=QuestionFinder`

❌ Common mistakes:

```env
# WRONG - using http instead of mongodb
MONGODB_URI=http://mohid:mohid123@...

# WRONG - angle brackets still in URI
MONGODB_URI=mongodb+srv://<username>:<password>@...

# WRONG - missing database name
MONGODB_URI=mongodb+srv://mohid:mohid123@questionfinder.r6hp7fi.mongodb.net/

# WRONG - special characters not URL-encoded (if in password)
# Password: my@pass#123 should be: my%40pass%23123
MONGODB_URI=mongodb+srv://mohid:my@pass#123@...
```

---

## 🔄 Check MongoDB Cluster Status

Make sure your cluster is running:

1. Go to MongoDB Atlas → Deployments
2. Click **QuestionFinder**
3. Look at the status badge:
   - ✅ Green "Active" = Running
   - ⏸️ Gray "Paused" = Click resume
   - ⚠️ Red status = Contact MongoDB support

If paused, click the **Resume** button

---

## 🔑 Verify Database User

Make sure your database user exists:

1. Go to MongoDB Atlas → Security → **Database Access**
2. Look for username **`mohid`** in the list
3. Status should show ✅
4. If missing or status is ❌:
   - Click **+ Add Database User**
   - Username: `mohid`
   - Password: `mohid123`
   - Click **Add User**

---

## 📋 Complete Diagnostic Checklist

- [ ] Network Access whitelist includes `0.0.0.0/0` (or your IP)
- [ ] Cluster status is "Active" (not Paused)
- [ ] Database user `mohid` exists
- [ ] Password is set to `mohid123`
- [ ] `.env` file has correct MONGODB_URI
- [ ] No special characters in password (or URL-encoded)
- [ ] Windows Defender Firewall not blocking connection
- [ ] Antivirus not blocking connection
- [ ] Not connected to VPN (or VPN allows MongoDB)
- [ ] DNS can resolve `questionfinder.r6hp7fi.mongodb.net`
- [ ] Run test script: `node test-mongo-connection.mjs`

---

## 🎯 Step-by-Step Resolution

### Option A: Firewall Issue (Most Common)

1. Open test script output: `node test-mongo-connection.mjs`
2. If Test 4 passes but Test 3 fails:
   - Windows Defender or antivirus is blocking SSL
3. Temporarily disable firewall/antivirus
4. Run `npm run server` again
5. If it works:
   - Problem identified: Firewall/antivirus
   - Re-enable with MongoDB whitelisted

### Option B: Network Access Not Configured

1. Open test script output: `node test-mongo-connection.mjs`
2. If Test 4 fails:
   - Network Access not properly configured
3. Go to MongoDB Atlas → Security → Network Access
4. Make sure `0.0.0.0/0` is in the list
5. Wait 2-3 minutes
6. Run `npm run server` again

### Option C: Still Stuck

1. Check MongoDB Atlas **Logs** for connection attempts
2. Try from different network (mobile hotspot)
3. Contact MongoDB Support with:
   - Your connection string (hide password)
   - Full error message
   - Output of `node test-mongo-connection.mjs`

---

## ✅ Success Indicators

After fixing the issue, you should see:

```
Attempting to connect to MongoDB Atlas...
  URI: mongodb+srv://***@questionfinder.r6hp7fi.mongodb.net/...
✅ Connected to MongoDB Atlas.
✅ Database verified (ping successful).
```

And from test script:

```
✅ Strict SSL connection successful!
```

---

## 🚀 Next Steps Once Fixed

1. Run the diagnostic test: `node test-mongo-connection.mjs`
2. If successful, run backend: `npm run server`
3. In another terminal: `npm run dev` (frontend)
4. Open http://localhost:5173
5. Test search feature

---

## 📞 Still Need Help?

1. **Run diagnostic**:
   ```bash
   node test-mongo-connection.mjs
   ```
2. **Share the complete output** with:
   - MongoDB Atlas support: https://support.mongodb.com
   - Or your project maintainer

3. **Provide context**:
   - Operating System (Windows, Mac, Linux)
   - Node.js version: `node --version`
   - Antivirus software (if any)
   - VPN status
   - Network type (home, corporate, etc)

---

**Start with the diagnostic test script - it will pinpoint the exact issue!** 🔍
