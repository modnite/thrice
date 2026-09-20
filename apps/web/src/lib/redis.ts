import Redis from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redis =
  global.__redis ??
  new Redis(REDIS_URL, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
  });

if (process.env.NODE_ENV !== "production") {
  global.__redis = redis;
}

redis.on("error", (err) => {
  console.error("[redis] connection error", err.message);
});
