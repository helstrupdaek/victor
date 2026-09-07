import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapWithConcurrency, retryAfterMs } from './pool.ts'

test('runs at most `limit` tasks at once and keeps result order', async () => {
  let running = 0
  let peak = 0
  const items = [1, 2, 3, 4, 5, 6, 7, 8]
  const out = await mapWithConcurrency(items, 2, async (n) => {
    running++
    peak = Math.max(peak, running)
    await new Promise((r) => setTimeout(r, 5))
    running--
    return n * 10
  })
  assert.deepEqual(out, [10, 20, 30, 40, 50, 60, 70, 80])
  assert.equal(peak, 2)
})

test('a limit above the item count runs everything at once', async () => {
  let peak = 0
  let running = 0
  await mapWithConcurrency([1, 2, 3], 10, async () => {
    running++
    peak = Math.max(peak, running)
    await new Promise((r) => setTimeout(r, 5))
    running--
  })
  assert.equal(peak, 3)
})

test('retryAfterMs honours a Retry-After header in seconds and falls back otherwise', () => {
  assert.equal(retryAfterMs('2', 800), 2000)
  assert.equal(retryAfterMs(null, 800), 800)
  assert.equal(retryAfterMs('garbage', 800), 800)
  assert.equal(retryAfterMs('120', 800), 10_000) // capped
})
