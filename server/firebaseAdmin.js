import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_BASE64 не задан. Добавьте его в Render: " +
        "Dashboard -> nexa-chat -> Environment. Значение должно быть Base64 " +
        "от JSON Firebase service account."
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
