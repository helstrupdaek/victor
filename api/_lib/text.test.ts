import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeText } from './text.ts'

test('trims, collapses whitespace, strips control characters', () => {
  assert.equal(sanitizeText('  Say  hi the\twind \n', 120), 'Say hi the wind')
})

test('truncates to max', () => {
  assert.equal(sanitizeText('abcdefghij', 4), 'abcd')
})

test('empty, whitespace-only and non-strings become null', () => {
  assert.equal(sanitizeText('', 120), null)
  assert.equal(sanitizeText('   ', 120), null)
  assert.equal(sanitizeText(undefined, 120), null)
  assert.equal(sanitizeText(42, 120), null)
  assert.equal(sanitizeText({ x: 1 }, 120), null)
})

test('keeps Danish letters and emoji', () => {
  assert.equal(sanitizeText('Skål for Victor 🎉', 120), 'Skål for Victor 🎉')
})

test('strips real control characters, not just whitespace ones', () => {
  assert.equal(sanitizeText('A\u0000B\u001bC\u007fD', 120), 'ABCD')
})
