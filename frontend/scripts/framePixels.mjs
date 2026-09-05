import { inflateSync } from 'node:zlib'

// Minimal PNG reader for the render-parity gate.
//
// The gate has to open the committed baseline PNGs, not just the JSON beside
// them — a metrics file can stay green while the picture it claims to describe
// rots. Playwright always writes 8-bit non-interlaced truecolour PNGs, so this
// deliberately supports exactly that and refuses everything else loudly rather
// than guessing and reporting plausible-looking garbage.

const SIGNATURE = Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const COLOUR_TYPE_RGB = 2
const COLOUR_TYPE_RGBA = 6

function toBytes(source) {
  if (source instanceof Uint8Array) return source
  if (ArrayBuffer.isView(source)) return new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
  if (source instanceof ArrayBuffer) return new Uint8Array(source)
  throw new TypeError('decodePng expects a Uint8Array, Buffer or ArrayBuffer')
}

function readUInt32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft
  const distanceLeft = Math.abs(estimate - left)
  const distanceUp = Math.abs(estimate - up)
  const distanceUpLeft = Math.abs(estimate - upLeft)
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left
  return distanceUp <= distanceUpLeft ? up : upLeft
}

function readHeader(bytes) {
  for (let index = 0; index < SIGNATURE.length; index += 1) {
    if (bytes[index] !== SIGNATURE[index]) throw new Error('decodePng: missing PNG signature')
  }
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') {
    throw new Error('decodePng: first chunk must be IHDR')
  }
  const header = {
    width: readUInt32(bytes, 16),
    height: readUInt32(bytes, 20),
    bitDepth: bytes[24],
    colourType: bytes[25],
    compression: bytes[26],
    filter: bytes[27],
    interlace: bytes[28],
  }
  if (header.width <= 0 || header.height <= 0) throw new Error('decodePng: invalid image dimensions')
  if (header.bitDepth !== 8) throw new Error(`decodePng: unsupported bit depth ${header.bitDepth}, expected 8`)
  if (header.colourType !== COLOUR_TYPE_RGB && header.colourType !== COLOUR_TYPE_RGBA) {
    throw new Error(`decodePng: unsupported colour type ${header.colourType}, expected 2 or 6`)
  }
  if (header.compression !== 0) throw new Error('decodePng: unsupported compression method')
  if (header.filter !== 0) throw new Error('decodePng: unsupported filter method')
  if (header.interlace !== 0) throw new Error('decodePng: interlaced images are not supported')
  return header
}

function collectPixelData(bytes) {
  const parts = []
  let offset = 8
  while (offset + 8 <= bytes.length) {
    const length = readUInt32(bytes, offset)
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
    const start = offset + 8
    if (type === 'IDAT') parts.push(bytes.subarray(start, start + length))
    if (type === 'IEND') break
    offset = start + length + 4
  }
  if (parts.length === 0) throw new Error('decodePng: no pixel data (IDAT) chunks')
  return inflateSync(Buffer.concat(parts.map((part) => Buffer.from(part.buffer, part.byteOffset, part.byteLength))))
}

/**
 * Decodes an 8-bit non-interlaced PNG into tightly packed RGBA bytes.
 *
 * @param {Uint8Array | ArrayBuffer} source
 * @returns {{ width: number, height: number, data: Uint8Array }}
 */
export function decodePng(source) {
  const bytes = toBytes(source)
  if (bytes.length < 8 + 25) throw new Error('decodePng: missing PNG signature')
  const header = readHeader(bytes)
  const channels = header.colourType === COLOUR_TYPE_RGBA ? 4 : 3
  const stride = header.width * channels
  const raw = collectPixelData(bytes)
  if (raw.length < (stride + 1) * header.height) {
    throw new Error(`decodePng: truncated pixel data, expected ${(stride + 1) * header.height} bytes, got ${raw.length}`)
  }

  const data = new Uint8Array(header.width * header.height * 4)
  const current = new Uint8Array(stride)
  const previous = new Uint8Array(stride)
  for (let row = 0; row < header.height; row += 1) {
    const base = row * (stride + 1)
    const filter = raw[base]
    if (filter > 4) throw new Error(`decodePng: unknown scanline filter ${filter}`)
    for (let index = 0; index < stride; index += 1) {
      const value = raw[base + 1 + index]
      const left = index >= channels ? current[index - channels] : 0
      const up = previous[index]
      const upLeft = index >= channels ? previous[index - channels] : 0
      const predicted = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? ((left + up) >> 1)
              : paethPredictor(left, up, upLeft)
      current[index] = (value + predicted) & 0xff
    }
    const target = row * header.width * 4
    for (let column = 0; column < header.width; column += 1) {
      const from = column * channels
      const to = target + column * 4
      data[to] = current[from]
      data[to + 1] = current[from + 1]
      data[to + 2] = current[from + 2]
      data[to + 3] = channels === 4 ? current[from + 3] : 255
    }
    previous.set(current)
  }
  return { width: header.width, height: header.height, data }
}
