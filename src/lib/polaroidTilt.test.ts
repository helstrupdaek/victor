import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tiltFor } from './polaroidTilt.ts'

test('the same id always gets the same tilt', () => {
  assert.deepEqual(tiltFor('e598352b-5b9d-4fbf-b316-cd792b1b8f7c'), tiltFor('e598352b-5b9d-4fbf-b316-cd792b1b8f7c'))
})

test('different ids get different tilts', () => {
  assert.notDeepEqual(tiltFor('a'), tiltFor('b'))
})

test('rotation is within ±4 degrees and offsets within ±6 px, for many ids', () => {
  for (let i = 0; i < 500; i++) {
    const t = tiltFor(`id-${i}`)
    assert.ok(Math.abs(t.rotate) <= 4, `rotate ${t.rotate}`)
    assert.ok(Math.abs(t.dx) <= 6, `dx ${t.dx}`)
    assert.ok(Math.abs(t.dy) <= 6, `dy ${t.dy}`)
  }
})

test('tilts actually use both signs', () => {
  const signs = new Set(Array.from({ length: 50 }, (_, i) => Math.sign(tiltFor(`id-${i}`).rotate)))
  assert.ok(signs.has(1) && signs.has(-1))
})
