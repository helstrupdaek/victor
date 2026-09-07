import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { BodyTooLarge, clientIp, readRawBody, uploaderHash } from './upload.ts'

const stream = (chunks: string[]) => Readable.from(chunks.map((c) => Buffer.from(c)))

test('reads a streamed body (local dev plugin)', async () => {
  const body = await readRawBody(stream(['ab', 'cd']) as never, 100)
  assert.equal(body.toString(), 'abcd')
})

test('uses a pre-parsed Buffer body (Vercel)', async () => {
  const req = { body: Buffer.from('xyz') }
  const body = await readRawBody(req as never, 100)
  assert.equal(body.toString(), 'xyz')
})

test('rejects a streamed body over the cap without reading it all', async () => {
  // A generator that would run forever, counting how many chunks were pulled.
  // The cap is crossed on the second chunk; a reader that drains the stream
  // and checks afterwards would never return, and one that checks per chunk
  // pulls exactly two. The count is the proof, not just the rejection.
  let pulled = 0
  async function* endless() {
    for (;;) {
      yield Buffer.from('a'.repeat(60))
      pulled++
    }
  }
  await assert.rejects(readRawBody(Readable.from(endless()) as never, 100), BodyTooLarge)
  assert.equal(pulled, 2)
})

test('rejects a pre-parsed body over the cap', async () => {
  await assert.rejects(readRawBody({ body: Buffer.alloc(101) } as never, 100), BodyTooLarge)
})

test('client ip is the first x-forwarded-for entry, else the socket', () => {
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, socket: {} } as never), '1.2.3.4')
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '::1' } } as never), '::1')
})

test('uploader hash is stable, secret-dependent, 32 hex chars', () => {
  const a = uploaderHash('1.2.3.4', 'secret')
  assert.match(a, /^[0-9a-f]{32}$/)
  assert.equal(a, uploaderHash('1.2.3.4', 'secret'))
  assert.notEqual(a, uploaderHash('1.2.3.4', 'other'))
  assert.notEqual(a, uploaderHash('1.2.3.5', 'secret'))
})
