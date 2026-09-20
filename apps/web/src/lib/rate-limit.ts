import { redis } from "./redis";
import { logger } from "./logger";

/**
 * Fixed-window rate limiter. Fails open (allows the request) if Redis is
 * unreachable, logging a warning, rather than taking the whole app down.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const redisKey = `ratelimit:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }
    return count <= limit;
  } catch (err) {
    logger.warn({ err }, "rate-limit: redis unavailable, failing open");
    return true;
  }
}
