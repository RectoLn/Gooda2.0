// 图片尺寸测量：纯字节解析（PNG IHDR / JPEG SOF + EXIF 方向），无副作用、无 DOM/Taro 依赖。
// 从 index.vue 抽出，便于单测与复用。测量「编排」（widthFix 探针、getImageInfo、
// 文件系统读取）仍留在页面/平台层，因为它们绑定 DOM/Taro 时序。

export function normalizeImageSize(width: any, height: any) {
  const w = Number(width) || 0
  const h = Number(height) || 0
  // Dimina may report 1x1 for image sources it cannot inspect. That is worse
  // than unknown here because it forces the crop stage into a square.
  if (w > 1 && h > 1) return { width: Math.round(w), height: Math.round(h) }
  return undefined
}

export function imageSizeFromFile(file: any) {
  if (!file) return undefined
  return normalizeImageSize(
    file.width ?? file.imgWidth ?? file.imageWidth ?? file.originalWidth,
    file.height ?? file.imgHeight ?? file.imageHeight ?? file.originalHeight,
  )
}

const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export function base64ToBytes(base64: string) {
  const clean = base64.replace(/[\r\n\s=]/g, '')
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (let i = 0; i < clean.length; i += 1) {
    const val = base64Chars.indexOf(clean[i])
    if (val < 0) continue
    buffer = (buffer << 6) | val
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return new Uint8Array(bytes)
}
function readU32BE(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}
function readU16BE(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1]
}
// Read the JPEG EXIF orientation tag (0x0112). Values 5-8 mean the photo is stored
// rotated 90°/270°, so its DISPLAYED width/height are swapped vs the SOF dimensions.
// Device camera/album photos are the common case; getting this wrong stretches the
// crop frame (the whole "胡乱拉伸" bug on real devices).
function jpegExifOrientation(bytes: Uint8Array): number {
  let offset = 2
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue }
    const marker = bytes[offset + 1]
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue }
    if (marker === 0xda) break // start of scan — no more headers
    const length = readU16BE(bytes, offset + 2)
    if (!length || offset + length + 2 > bytes.length) break
    if (marker === 0xe1) {
      const s = offset + 4
      // "Exif\0\0"
      if (bytes[s] === 0x45 && bytes[s + 1] === 0x78 && bytes[s + 2] === 0x69 && bytes[s + 3] === 0x66) {
        const tiff = s + 6
        const le = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49 // 'II' little-endian
        const u16 = (o: number) => (le ? (bytes[o] | (bytes[o + 1] << 8)) : ((bytes[o] << 8) | bytes[o + 1]))
        const u32 = (o: number) => (le
          ? ((bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0)
          : readU32BE(bytes, o))
        const ifd0 = tiff + u32(tiff + 4)
        if (ifd0 + 2 <= bytes.length) {
          const count = u16(ifd0)
          for (let i = 0; i < count; i += 1) {
            const entry = ifd0 + 2 + i * 12
            if (entry + 12 > bytes.length) break
            if (u16(entry) === 0x0112) return u16(entry + 8) || 1
          }
        }
      }
      return 1
    }
    offset += length + 2
  }
  return 1
}
export function imageSizeFromBytes(bytes: Uint8Array) {
  if (bytes.length >= 24
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return normalizeImageSize(readU32BE(bytes, 16), readU32BE(bytes, 20))
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue }
      const marker = bytes[offset + 1]
      const length = readU16BE(bytes, offset + 2)
      if (!length || offset + length + 2 > bytes.length) break
      const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
      if (isSof) {
        let w = readU16BE(bytes, offset + 7)
        let h = readU16BE(bytes, offset + 5)
        const ori = jpegExifOrientation(bytes)
        if (ori >= 5 && ori <= 8) { const t = w; w = h; h = t } // 90°/270° → swap to displayed dims
        return normalizeImageSize(w, h)
      }
      offset += length + 2
    }
  }
  return undefined
}
export function imageSizeFromDataUrl(src: string) {
  const comma = src.indexOf(',')
  if (comma < 0 || !src.slice(0, comma).includes('base64')) return undefined
  return imageSizeFromBytes(base64ToBytes(src.slice(comma + 1)))
}
