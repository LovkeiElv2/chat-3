import admin from "firebase-admin";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
  let serviceAccount;

  if (b64) {
    serviceAccount = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } else if (keyPath) {
    serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    serviceAccount = {
      type: process.env.FIREBASE_TYPE || "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI,
      token_uri: process.env.FIREBASE_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
      universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
    };
  } else {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_BASE64 не задан. Для локального запуска укажите " +
        "FIREBASE_SERVICE_ACCOUNT_KEY_PATH, а в Render добавьте Base64-ключ в " +
        "Dashboard -> nexa-chat -> Environment."
    );
  }

  serviceAccount.private_key = serviceAccount.private_key
    .replace(/\\n/g, "\n")
    .replace(/^\uFEFF/, "")
    .trim();
  return serviceAccount;
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount()),
  });
}

export const auth = admin.auth();
export const db = admin.firestore();
export default admin;
