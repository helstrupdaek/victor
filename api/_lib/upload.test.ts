import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { BodyTooLarge, clientIp, looksLikeImage, readRawBody, uploaderHash } from './upload.ts'

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

test('client ip prefers x-vercel-forwarded-for over x-forwarded-for', () => {
  assert.equal(
    clientIp({
      headers: { 'x-vercel-forwarded-for': '9.9.9.9', 'x-forwarded-for': '1.2.3.4' },
      socket: {},
    } as never),
    '9.9.9.9',
  )
})

test('uploader hash is stable, secret-dependent, 32 hex chars', () => {
  const a = uploaderHash('1.2.3.4', 'secret')
  assert.match(a, /^[0-9a-f]{32}$/)
  assert.equal(a, uploaderHash('1.2.3.4', 'secret'))
  assert.notEqual(a, uploaderHash('1.2.3.4', 'other'))
  assert.notEqual(a, uploaderHash('1.2.3.5', 'secret'))
})

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const WEBP_HEADER = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
])

test('looksLikeImage accepts a minimal JPEG/PNG/WebP header for its own type', () => {
  assert.equal(looksLikeImage(JPEG_HEADER, 'image/jpeg'), true)
  assert.equal(looksLikeImage(PNG_HEADER, 'image/png'), true)
  assert.equal(looksLikeImage(WEBP_HEADER, 'image/webp'), true)
})

test('looksLikeImage rejects plain text', () => {
  assert.equal(looksLikeImage(Buffer.from('hello world, not an image'), 'image/jpeg'), false)
})

test('looksLikeImage rejects a JPEG header labelled png', () => {
  assert.equal(looksLikeImage(JPEG_HEADER, 'image/png'), false)
})

test('looksLikeImage rejects a body shorter than 12 bytes', () => {
  assert.equal(looksLikeImage(Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg'), false)
})
