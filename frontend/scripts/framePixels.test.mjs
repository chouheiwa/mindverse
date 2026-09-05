// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { deflateSync } from 'node:zlib'
import { decodePng } from './framePixels.mjs'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, payload) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(payload.length)
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), payload])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

function ihdr({ width, height, bitDepth = 8, colorType = 6, interlace = 0 }) {
  const payload = Buffer.alloc(13)
  payload.writeUInt32BE(width, 0)
  payload.writeUInt32BE(height, 4)
  payload.writeUInt8(bitDepth, 8)
  payload.writeUInt8(colorType, 9)
  payload.writeUInt8(0, 10)
  payload.writeUInt8(0, 11)
  payload.writeUInt8(interlace, 12)
  return chunk('IHDR', payload)
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft
  const distanceLeft = Math.abs(estimate - left)
  const distanceUp = Math.abs(estimate - up)
  const distanceUpLeft = Math.abs(estimate - upLeft)
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left
  return distanceUp <= distanceUpLeft ? up : upLeft
}

/** Encodes raw samples with an explicit per-row filter so every filter path is exercised. */
function encodePng({ width, height, channels = 4, samples, filters }) {
  const stride = width * channels
  const rows = []
  for (let y = 0; y < height; y += 1) {
    const filter = filters[y % filters.length]
    const raw = samples.subarray(y * stride, (y + 1) * stride)
    const previous = y === 0 ? new Uint8Array(stride) : samples.subarray((y - 1) * stride, y * stride)
    const encoded = Buffer.alloc(stride + 1)
    encoded.writeUInt8(filter, 0)
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? raw[index - channels] : 0
      const up = previous[index]
      const upLeft = index >= channels ? previous[index - channels] : 0
      const value = raw[index]
      const predicted = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : paeth(left, up, upLeft)
      encoded.writeUInt8((value - predicted) & 0xff, index + 1)
    }
    rows.push(encoded)
  }
  return Buffer.concat([
    SIGNATURE,
    ihdr({ width, height, colorType: channels === 4 ? 6 : 2 }),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function gradientSamples(width, height, channels) {
  const samples = new Uint8Array(width * height * channels)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels
      samples[offset] = (x * 7 + y * 13) & 0xff
      samples[offset + 1] = (x * 31 + y * 3) & 0xff
      samples[offset + 2] = (x * 5 + y * 61) & 0xff
      if (channels === 4) samples[offset + 3] = 255
    }
  }
  return samples
}

describe('decodePng', () => {
  test('round-trips an RGBA image through every scanline filter', () => {
    const width = 9
    const height = 10
    const samples = gradientSamples(width, height, 4)
    const png = encodePng({ width, height, channels: 4, samples, filters: [0, 1, 2, 3, 4] })

    const decoded = decodePng(png)

    expect(decoded.width).toBe(width)
    expect(decoded.height).toBe(height)
    expect(decoded.data.length).toBe(width * height * 4)
    expect([...decoded.data]).toEqual([...samples])
  })

  test('expands an RGB image to opaque RGBA', () => {
    const width = 4
    const height = 4
    const samples = gradientSamples(width, height, 3)
    const png = encodePng({ width, height, channels: 3, samples, filters: [0, 4] })

    const decoded = decodePng(png)

    expect(decoded.data.length).toBe(width * height * 4)
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      expect(decoded.data[pixel * 4]).toBe(samples[pixel * 3])
      expect(decoded.data[pixel * 4 + 1]).toBe(samples[pixel * 3 + 1])
      expect(decoded.data[pixel * 4 + 2]).toBe(samples[pixel * 3 + 2])
      expect(decoded.data[pixel * 4 + 3]).toBe(255)
    }
  })

  test('rejects buffers that are not PNG', () => {
    expect(() => decodePng(Buffer.from('not a png at all, really'))).toThrow(/png signature/i)
  })

  test('rejects interlaced and unsupported sample formats', () => {
    const samples = gradientSamples(2, 2, 4)
    const interlaced = Buffer.concat([
      SIGNATURE,
      ihdr({ width: 2, height: 2, interlace: 1 }),
      chunk('IDAT', deflateSync(Buffer.alloc(2 * (2 * 4 + 1)))),
      chunk('IEND', Buffer.alloc(0)),
    ])
    const paletted = Buffer.concat([
      SIGNATURE,
      ihdr({ width: 2, height: 2, colorType: 3 }),
      chunk('IDAT', deflateSync(Buffer.alloc(2 * (2 + 1)))),
      chunk('IEND', Buffer.alloc(0)),
    ])
    const sixteenBit = Buffer.concat([
      SIGNATURE,
      ihdr({ width: 2, height: 2, bitDepth: 16 }),
      chunk('IDAT', deflateSync(Buffer.alloc(2 * (2 * 8 + 1)))),
      chunk('IEND', Buffer.alloc(0)),
    ])

    expect(samples.length).toBe(16)
    expect(() => decodePng(interlaced)).toThrow(/interlac/i)
    expect(() => decodePng(paletted)).toThrow(/colour type|color type/i)
    expect(() => decodePng(sixteenBit)).toThrow(/bit depth/i)
  })

  test('rejects a truncated pixel stream instead of returning partial rows', () => {
    const width = 4
    const height = 4
    const truncated = Buffer.concat([
      SIGNATURE,
      ihdr({ width, height }),
      chunk('IDAT', deflateSync(Buffer.alloc(width * 4 + 1))),
      chunk('IEND', Buffer.alloc(0)),
    ])

    expect(() => decodePng(truncated)).toThrow(/pixel data/i)
  })

  test('concatenates split IDAT chunks', () => {
    const width = 6
    const height = 4
    const samples = gradientSamples(width, height, 4)
    const whole = encodePng({ width, height, channels: 4, samples, filters: [0] })
    const compressed = deflateSync(Buffer.concat(
      Array.from({ length: height }, (_unused, y) => Buffer.concat([
        Buffer.from([0]),
        Buffer.from(samples.subarray(y * width * 4, (y + 1) * width * 4)),
      ])),
    ))
    const split = Buffer.concat([
      SIGNATURE,
      ihdr({ width, height }),
      chunk('IDAT', compressed.subarray(0, 5)),
      chunk('IDAT', compressed.subarray(5)),
      chunk('IEND', Buffer.alloc(0)),
    ])

    expect([...decodePng(split).data]).toEqual([...decodePng(whole).data])
  })
})
