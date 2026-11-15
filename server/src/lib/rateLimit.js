// A small in-memory limiter: at most `max` hits per `windowMs` for each key.
// It lives in this process only, which is fine for slowing down abuse of public endpoints.
function createLimiter({ windowMs, max }) {
  const hits = new Map();

  // Drop expired entries now and then so the map can't grow forever
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, 60_000);
  sweep.unref?.();

  return function take(key) {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

module.exports = { createLimiter };
