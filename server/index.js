import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { auth, db } from "./firebaseAdmin.js";
import admin from "firebase-admin";
import fs from "fs";
import { randomUUID } from "crypto";
import { initRedis, getRedisClient, closeRedis } from "./redisConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ["GET", "POST"] },
});

const requestBuckets = new Map();
const messageBuckets = new Map();

function allowRequest(bucketMap, key, limit, windowMs) {
  const now = Date.now();
  const bucket = bucketMap.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    bucketMap.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, bucket] of requestBuckets) {
    if (bucket.startedAt < cutoff) requestBuckets.delete(key);
  }
  for (const [key, bucket] of messageBuckets) {
    if (bucket.startedAt < cutoff) messageBuckets.delete(key);
  }
}, 60_000).unref();

// ---------- helpers ----------

function chatIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

async function verifyToken(idToken) {
  if (!idToken) return null;
  try {
    return await auth.verifyIdToken(idToken);
  } catch {
    return null;
  }
}

// Express middleware: requires Authorization: Bearer <idToken>
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const decoded = await verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Unauthorized" });
  req.uid = decoded.uid;
  if (!allowRequest(requestBuckets, req.uid, 120, 60_000)) {
    return res.status(429).json({ error: "Too many requests" });
  }
  next();
}

// ---------- REST API ----------

// Create/update the user's public profile doc (call right after register/login)
app.post("/api/users/sync", requireAuth, async (req, res) => {
  const { displayName, photoColor } = req.body;
  const ref = db.collection("users").doc(req.uid);
  const snap = await ref.get();
  const base = {
    uid: req.uid,
    displayName: displayName || req.uid.slice(0, 6),
    photoColor: photoColor || randomColor(),
    lastSeen: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!snap.exists) {
    base.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await ref.set(base, { merge: true });
  const updated = await ref.get();
  res.json(updated.data());
});

// List all other users (simple directory)
app.get("/api/users", requireAuth, async (req, res) => {
  const snap = await db.collection("users").get();
  const users = snap.docs
    .map((d) => d.data())
    .filter((u) => u.uid !== req.uid);
  res.json(users);
});

// List chats for current user, each with peer profile + last message
app.get("/api/chats", requireAuth, async (req, res) => {
  const snap = await db
    .collection("chats")
    .where("members", "array-contains", req.uid)
    .get();

  const chats = await Promise.all(
    snap.docs.map(async (doc) => {
      const data = doc.data();
      if (data.type === "group") {
        const memberSnap = await db.collection("users").where("uid", "in", data.members.slice(0, 10)).get();
        return {
          chatId: doc.id,
          peer: {
            uid: null,
            displayName: data.name || "Группа",
            photoColor: "#00B894",
            type: "group",
            members: memberSnap.docs.map((member) => member.data()),
          },
          lastMessage: data.lastMessage || null,
          updatedAt: data.updatedAt || null,
        };
      }
      const peerId = data.members.find((m) => m !== req.uid);
      const peerSnap = await db.collection("users").doc(peerId).get();
      return {
        chatId: doc.id,
        peer: peerSnap.exists ? peerSnap.data() : { uid: peerId, displayName: "Пользователь" },
        lastMessage: data.lastMessage || null,
        updatedAt: data.updatedAt || null,
      };
    })
  );

  chats.sort((a, b) => (b.updatedAt?._seconds || 0) - (a.updatedAt?._seconds || 0));
  res.json(chats);
});

// Get or create a 1:1 chat with a peer
app.post("/api/chats", requireAuth, async (req, res) => {
  const { peerId } = req.body;
  if (!peerId) return res.status(400).json({ error: "peerId required" });
  const chatId = chatIdFor(req.uid, peerId);
  const ref = db.collection("chats").doc(chatId);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      members: [req.uid, peerId],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessage: null,
    });
  }
  res.json({ chatId });
});

// Create a group chat with the current user and selected members.
app.post("/api/groups", requireAuth, async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 80);
  const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds : [];
  const members = [...new Set([req.uid, ...memberIds.filter((id) => typeof id === "string")])];
  if (!name) return res.status(400).json({ error: "Название группы обязательно" });
  if (members.length < 2) return res.status(400).json({ error: "Выберите хотя бы одного участника" });

  const chatId = `group_${randomUUID()}`;
  await db.collection("chats").doc(chatId).set({
    type: "group",
    name,
    members,
    createdBy: req.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessage: null,
  });
  res.json({ chatId, name, members });
});

// Message history for a chat
app.get("/api/chats/:chatId/messages", requireAuth, async (req, res) => {
  const { chatId } = req.params;
  const chatSnap = await db.collection("chats").doc(chatId).get();
  if (!chatSnap.exists || !chatSnap.data().members.includes(req.uid)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const msgsSnap = await db
    .collection("chats")
    .doc(chatId)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .limit(200)
    .get();
  const memberSnap = await db
    .collection("users")
    .where("uid", "in", chatSnap.data().members.slice(0, 10))
    .get();
  const memberNames = new Map(memberSnap.docs.map((doc) => [doc.id, doc.data().displayName]));
  res.json(msgsSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    senderName: memberNames.get(d.data().senderId) || "Пользователь",
  })));
});

function randomColor() {
  const palette = ["#6C5CE7", "#00B894", "#0984E3", "#E17055", "#E84393", "#00CEC9", "#FDCB6E"];
  return palette[Math.floor(Math.random() * palette.length)];
}

// ---------- Socket.io realtime ----------

const onlineUsers = new Map(); // uid -> Set(socketId)

io.use(async (socket, next) => {
  const decoded = await verifyToken(socket.handshake.auth?.token);
  if (!decoded) return next(new Error("unauthorized"));
  socket.uid = decoded.uid;
  next();
});

io.on("connection", (socket) => {
  const { uid } = socket;
  if (!onlineUsers.has(uid)) onlineUsers.set(uid, new Set());
  onlineUsers.get(uid).add(socket.id);
  socket.join(`user:${uid}`);
  io.emit("presence:update", { uid, online: true });

  socket.on("chat:join", async (chatId, ack) => {
    if (!chatId) return;
    const chatSnap = await db.collection("chats").doc(chatId).get();
    if (!chatSnap.exists || !chatSnap.data().members.includes(uid)) {
      if (ack) ack({ ok: false, error: "Forbidden" });
      return;
    }
    socket.join(`chat:${chatId}`);
    if (ack) ack({ ok: true });
  });

  socket.on("chat:leave", (chatId) => {
    socket.leave(`chat:${chatId}`);
  });

  socket.on("message:send", async ({ chatId, text }, ack) => {
    const trimmed = (text || "").trim();
    if (!trimmed || !chatId) return;
    if (!allowRequest(messageBuckets, uid, 30, 10_000)) {
      if (ack) ack({ ok: false, error: "Too many messages" });
      return;
    }
    const chatRef = db.collection("chats").doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists || !chatSnap.data().members.includes(uid)) return;

    const message = {
      senderId: uid,
      text: trimmed.slice(0, 4000),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const msgRef = await chatRef.collection("messages").add(message);
    await chatRef.set(
      {
        lastMessage: { text: message.text, senderId: uid },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const payload = {
      id: msgRef.id,
      chatId,
      senderId: uid,
      senderName: (await db.collection("users").doc(uid).get()).data()?.displayName || "Пользователь",
      text: message.text,
      createdAt: { _seconds: Math.floor(Date.now() / 1000) },
    };
    io.to(`chat:${chatId}`).emit("message:new", payload);
    // notify peer's chat list even if they're not in the chat room
    for (const memberId of chatSnap.data().members) {
      if (memberId !== uid) {
        io.to(`user:${memberId}`).emit("chat:updated", { chatId, lastMessage: message.text, senderId: uid });
      }
    }
    if (ack) ack({ ok: true, id: msgRef.id });
  });

  socket.on("typing", ({ chatId, isTyping }) => {
    socket.to(`chat:${chatId}`).emit("typing", { chatId, uid, isTyping });
  });

  socket.on("disconnect", async () => {
    const set = onlineUsers.get(uid);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        onlineUsers.delete(uid);
        io.emit("presence:update", { uid, online: false });
        await db
          .collection("users")
          .doc(uid)
          .set({ lastSeen: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
          .catch(() => {});
      }
    }
  });
});

// ---------- serve built client (production) ----------

const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"), (err) => {
      if (err) next();
    });
  });
  console.log(`Serving static files from ${clientDist}`);
} else {
  console.warn(`⚠️  Client dist folder not found at ${clientDist}`);
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.status(404).json({ error: "Frontend not built yet" });
  });
}

// ---------- Initialize server with Redis adapter ----------

async function startServer() {
  try {
    const redisClient = await initRedis();
    
    if (redisClient) {
      // Setup Redis adapter for Socket.io
      const pubClient = redisClient.duplicate();
      const subClient = redisClient.duplicate();

      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log("✅ Socket.io Redis adapter configured");
    } else {
      console.warn("⚠️  Socket.io running in memory mode without Redis");
    }

    server.listen(PORT, () => {
      console.log(`Nexa server running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on("SIGTERM", async () => {
      console.log("SIGTERM signal received: closing HTTP server");
      server.close(async () => {
        await closeRedis();
        process.exit(0);
      });
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
