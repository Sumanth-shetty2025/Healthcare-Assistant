const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const DEFAULT_ADMIN_EMAIL = "adminsumanth123@gmail.com";
const DEFAULT_SERVICE_ACCOUNT_PATH = path.resolve(__dirname, "serviceAccountKey.json");
const DEFAULT_DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL ||
  "https://healthcare-assistant-app-3c14a-default-rtdb.firebaseio.com/";

const parseArgs = (argv) => {
  const options = {
    email: DEFAULT_ADMIN_EMAIL,
    password: null,
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || DEFAULT_SERVICE_ACCOUNT_PATH,
    databaseURL: DEFAULT_DATABASE_URL,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--email" || token === "-e") {
      options.email = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--password" || token === "-p") {
      options.password = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (token === "--service-account" || token === "-k") {
      options.serviceAccountPath = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--db-url" || token === "-d") {
      options.databaseURL = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log("Usage:");
      console.log("  node backend/setup_admin.js --email <admin_email>");
      console.log("  node backend/setup_admin.js --email <admin_email> --password <new_password>");
      console.log("");
      console.log("Optional:");
      console.log("  --service-account <path_to_service_account_json>");
      console.log("  --db-url <firebase_database_url>");
      process.exit(0);
    }
  }

  return options;
};

const loadServiceAccount = (serviceAccountPath) => {
  const resolvedPath = path.resolve(serviceAccountPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Service account file not found: ${resolvedPath}`);
  }

  const json = fs.readFileSync(resolvedPath, "utf8");
  return JSON.parse(json);
};

const getOrCreateUser = async (auth, email, password) => {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== "auth/user-not-found") {
      throw error;
    }

    if (!password) {
      throw new Error(
        `User ${email} does not exist in Firebase Authentication. Either create that user first or run with --password to create it.`
      );
    }

    return auth.createUser({
      email,
      password,
      emailVerified: true,
    });
  }
};

const setupAdmin = async () => {
  try {
    const { email, password, serviceAccountPath, databaseURL } = parseArgs(process.argv.slice(2));
    if (!email) {
      throw new Error("Admin email is required. Use --email <admin_email>.");
    }

    const serviceAccount = loadServiceAccount(serviceAccountPath);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL,
    });

    const auth = admin.auth();
    const db = admin.database();
    const now = new Date().toISOString();

    const userRecord = await getOrCreateUser(auth, email, password);
    const uid = userRecord.uid;

    const userRef = db.ref(`users/${uid}`);
    const existingUserSnapshot = await userRef.once("value");
    const existingUser = existingUserSnapshot.val() || {};

    await db.ref(`admins/${uid}`).update({
      email,
      role: "admin",
      createdAt: existingUser.createdAt || now,
      updatedAt: now,
    });

    await userRef.update({
      email,
      role: "admin",
      createdAt: existingUser.createdAt || now,
      updatedAt: now,
    });

    const latestUserRecord = await auth.getUser(uid);
    const existingClaims = latestUserRecord.customClaims || {};
    await auth.setCustomUserClaims(uid, {
      ...existingClaims,
      role: "admin",
      admin: true,
    });

    console.log(`Admin role configured successfully for ${email}`);
    console.log(`UID: ${uid}`);
    console.log(`Database URL: ${databaseURL}`);
    console.log("Updated: admins/{uid}, users/{uid}, and custom claims { role: 'admin', admin: true }");
    process.exit(0);
  } catch (error) {
    console.error("Error setting up admin:", error.message || error);
    process.exit(1);
  }
};

setupAdmin();
