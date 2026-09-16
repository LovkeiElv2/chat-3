import { createClient } from "redis";

let redisClient = null;

export async function initRedis() {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn("REDIS_URL is not set; running without Redis");
    return null;
  }

  try {
    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries >= 5) {
            return new Error("Redis connection retry limit reached");
          }
          return Math.min(retries * 50, 500);
        },
      },
    });

    redisClient.on("error", (err) => {
      console.error("Redis error:", err);
    });

    redisClient.on("connect", () => {
      console.log("✅ Redis connected");
    });

    redisClient.on("disconnect", () => {
      console.log("⚠️  Redis disconnected");
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    redisClient?.destroy();
    redisClient = null;
    console.error("Failed to connect to Redis:", error.message);
    console.warn("⚠️  Running without Redis - some features may be limited");
    return null;
  }
}

export function getRedisClient() {
  return redisClient;
}

export async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
