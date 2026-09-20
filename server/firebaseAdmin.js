import admin from "firebase-admin";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;

  if (keyPath) {
    return JSON.parse(fs.readFileSync(keyPath, "utf8"));
  }

  if (!b64) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_BASE64 не задан. Для локального запуска укажите " +
        "FIREBASE_SERVICE_ACCOUNT_KEY_PATH, а в Render добавьте Base64-ключ в " +
        "Dashboard -> nexa-chat -> Environment."
    );
  }
  const json = Buffer.from(b64, "base64").toString("utf8");
  return JSON.parse(json);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount()),
  });
}

export const auth = admin.auth();
export const db = admin.firestore();
export default admin;
