import { MongoClient } from "mongodb";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Load .env
const envFile = readFileSync(join(__dirname, ".env"), "utf8");
const env = {};
for (const line of envFile.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const [key, value] = trimmed.split("=");
  if (key) env[key] = value;
}

const MONGODB_URI = env.MONGODB_URI;
const MONGODB_DB = env.MONGODB_DB || "questionfinder";

console.log("\n" + "=".repeat(70));
console.log("  MONGODB ATLAS CONNECTION DIAGNOSTIC");
console.log("=".repeat(70));

console.log("\n📋 Configuration:");
console.log(`  Database: ${MONGODB_DB}`);
console.log(`  URI: ${MONGODB_URI?.replace(/:[^:]*@/, ':***@') || 'NOT SET'}`);

if (!MONGODB_URI) {
  console.error("\n❌ ERROR: MONGODB_URI not found in .env file");
  process.exit(1);
}

// Test 1: Parse connection string
console.log("\n" + "-".repeat(70));
console.log("TEST 1: Parse Connection String");
console.log("-".repeat(70));

try {
  const url = new URL(MONGODB_URI);
  console.log(`✅ Connection string is valid`);
  console.log(`  Protocol: ${url.protocol}`);
  console.log(`  Username: ${url.username}`);
  console.log(`  Host: ${url.hostname}`);
  console.log(`  Database: ${url.pathname}`);
  console.log(`  Params: ${url.search}`);
} catch (e) {
  console.error(`❌ Invalid connection string: ${e.message}`);
  process.exit(1);
}

// Test 2: Network connectivity
console.log("\n" + "-".repeat(70));
console.log("TEST 2: Network Connectivity");
console.log("-".repeat(70));

import dns from "dns";
import { promisify } from "util";

const lookup = promisify(dns.lookup);

try {
  console.log("  Testing DNS resolution of cluster...");
  const hostname = new URL(MONGODB_URI).hostname;
  const result = await lookup(hostname);
  console.log(`✅ DNS resolved: ${hostname} → ${result.address}`);
} catch (e) {
  console.error(`❌ DNS resolution failed: ${e.message}`);
  console.error(`  This means your network can't reach the MongoDB servers`);
  process.exit(1);
}

// Test 3: Connection with strict SSL
console.log("\n" + "-".repeat(70));
console.log("TEST 3: Connect with Strict SSL (tlsAllowInvalidCertificates=false)");
console.log("-".repeat(70));

const optionsStrict = {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  tlsAllowInvalidCertificates: false,
  tlsAllowInvalidHostnames: false,
};

try {
  console.log("  Attempting connection...");
  const client = new MongoClient(MONGODB_URI, optionsStrict);
  await client.connect();
  
  await client.db("admin").command({ ping: 1 });
  console.log("✅ Strict SSL connection successful!");
  console.log("   Your MongoDB Atlas is properly configured.");
  
  // List collections
  const db = client.db(MONGODB_DB);
  const collections = await db.listCollections().toArray();
  console.log(`\n✅ Database collections:`);
  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments();
    console.log(`   - ${col.name}: ${count} documents`);
  }
  
  await client.close();
  process.exit(0);
  
} catch (e) {
  console.error(`❌ Strict SSL connection failed: ${e.message}`);
  console.log("\n   This could be:");
  console.log("   • Network Access not whitelisted in MongoDB Atlas");
  console.log("   • Firewall or antivirus blocking connection");
  console.log("   • VPN interfering with SSL");
  console.log("   • Corporate proxy intercepting SSL");
}

// Test 4: Connection with permissive SSL (diagnostic only)
console.log("\n" + "-".repeat(70));
console.log("TEST 4: Connect with Permissive SSL (tlsAllowInvalidCertificates=true)");
console.log("        ⚠️  This is DIAGNOSTIC ONLY - NOT for production!");
console.log("-".repeat(70));

const optionsPermissive = {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  tlsAllowInvalidCertificates: true,
  tlsAllowInvalidHostnames: true,
};

try {
  console.log("  Attempting connection with permissive SSL...");
  const client = new MongoClient(MONGODB_URI, optionsPermissive);
  await client.connect();
  
  await client.db("admin").command({ ping: 1 });
  console.log("✅ Permissive SSL connection successful!");
  console.log("\n   ⚠️  DIAGNOSIS:");
  console.log("   Your network CAN reach MongoDB when SSL verification is disabled.");
  console.log("   This suggests:");
  console.log("   1. Network Access IS properly configured in MongoDB Atlas");
  console.log("   2. The problem is SSL/TLS verification on YOUR MACHINE");
  console.log("   3. Possible causes:");
  console.log("      • Windows Defender Firewall intercepting SSL");
  console.log("      • Antivirus software (Norton, McAfee, etc) intercepting SSL");
  console.log("      • Corporate proxy/firewall");
  console.log("      • VPN with SSL inspection");
  console.log("\n   NEXT STEPS:");
  console.log("      a) Temporarily disable Windows Defender: Settings → Firewall");
  console.log("      b) Temporarily disable antivirus");
  console.log("      c) Disconnect from VPN");
  console.log("      d) Disable corporate proxy if applicable");
  console.log("      e) Try from a different network (mobile hotspot)");
  
  // List collections
  const db = client.db(MONGODB_DB);
  const collections = await db.listCollections().toArray();
  console.log(`\n✅ Database collections:`);
  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments();
    console.log(`   - ${col.name}: ${count} documents`);
  }
  
  await client.close();
  
} catch (e) {
  console.error(`❌ Permissive SSL connection also failed: ${e.message}`);
  console.log("\n   ⚠️  DIAGNOSIS:");
  console.log("   Even with permissive SSL settings, connection failed.");
  console.log("   This suggests:");
  console.log("   1. Network Access NOT whitelisted in MongoDB Atlas");
  console.log("   2. Connection string is invalid");
  console.log("   3. Credentials are wrong");
  console.log("\n   NEXT STEPS:");
  console.log("      1. Go to MongoDB Atlas → Security → Network Access");
  console.log("      2. Look for '0.0.0.0/0' entry");
  console.log("      3. If missing:");
  console.log("         - Click 'Add IP Address'");
  console.log("         - Click 'Allow access from anywhere'");
  console.log("         - Click 'Confirm'");
  console.log("      4. Wait 1-2 minutes for changes to take effect");
  console.log("      5. Try again");
}

console.log("\n" + "=".repeat(70) + "\n");
