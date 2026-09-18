import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeRateLimit } from '../src/rate-limit.js';
import { closeRedis } from '../src/redis.js';

test('Redis limiter blocks after configured allowance', async () => {
  try {
    const subject = `ci-${randomUUID()}`;
    const first = await consumeRateLimit('ci-probe', subject, 2, 60);
    const second = await consumeRateLimit('ci-probe', subject, 2, 60);
    const third = await consumeRateLimit('ci-probe', subject, 2, 60);

    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
    assert.equal(third.allowed, false);
    assert.equal(third.remaining, 0);
    assert.ok(third.retryAfterSeconds > 0);
  } finally {
    await closeRedis();
  }
});
