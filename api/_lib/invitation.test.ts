import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizePhone, renderMessage } from './invitation.ts'

test('normalizePhone', () => {
  assert.equal(normalizePhone('12 34 56 78'), '+4512345678')
  assert.equal(normalizePhone('+45 12-34-56-78'), '+4512345678')
  assert.equal(normalizePhone('004612345678'), '+4612345678')
  assert.equal(normalizePhone('1234'), null)
  assert.equal(normalizePhone('abc'), null)
})

test('renderMessage fills every placeholder', () => {
  assert.equal(renderMessage('Hej {navn}, {link} ({navn})', 'Bo', 'x'), 'Hej Bo, x (Bo)')
})
