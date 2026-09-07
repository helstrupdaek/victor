import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitWithin } from './imageFit.ts'

test('a landscape photo is scaled so the long side is the max', () => {
  assert.deepEqual(fitWithin(4000, 3000, 2000), { width: 2000, height: 1500 })
})

test('a portrait photo is scaled so the long side is the max', () => {
  assert.deepEqual(fitWithin(3000, 4000, 2000), { width: 1500, height: 2000 })
})

test('a photo already within the max is untouched', () => {
  assert.deepEqual(fitWithin(1200, 800, 2000), { width: 1200, height: 800 })
})

test('dimensions are whole pixels', () => {
  const r = fitWithin(4001, 3000, 2000)
  assert.equal(r.width, 2000)
  assert.equal(Number.isInteger(r.height), true)
})
