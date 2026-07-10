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

// 查表 + 预分配的 base64 解码。曾经是逐字符 indexOf + number[] push——一张相册照片
// 的 4MB base64 要循环 400 万次、装箱 400 万个 Number（内存瞬时膨胀数十 MB），在安卓
// 真机上同步卡死 JS 线程数秒、内存紧张时直接闪退。maxBytes 用于"只要文件头"的场景
// （解析图片尺寸只需要前几十 KB，见 imageSizeFromDataUrl）。
const base64Lut = (() => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const lut = new Int8Array(256).fill(-1)
  for (let i = 0; i < chars.length; i += 1) lut[chars.charCodeAt(i)] = i
  return lut
})()
export function base64ToBytes(base64: string, maxBytes?: number) {
  const cap = maxBytes && maxBytes > 0 ? maxBytes : Infinity
  // 预分配上限：min(理论输出, cap)。含空白/填充时实际输出更小，最后 subarray 截齐。
  const alloc = Math.min(Math.floor((base64.length * 3) / 4) + 3, cap === Infinity ? Infinity : cap)
  const bytes = new Uint8Array(alloc === Infinity ? Math.floor((base64.length * 3) / 4) + 3 : alloc)
  let n = 0
  let buffer = 0
  let bits = 0
  for (let i = 0; i < base64.length; i += 1) {
    const val = base64Lut[base64.charCodeAt(i)]
    if (val < 0) continue // 跳过空白/=/非法字符
    buffer = (buffer << 6) | val
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[n++] = (buffer >> bits) & 0xff
      if (n >= cap) break
    }
  }
  return n === bytes.length ? bytes : bytes.subarray(0, n)
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
// 尺寸解析只需要文件头：PNG IHDR 在前 24 字节；JPEG 的 SOF 通常在 EXIF（含缩略图，
// 可达 64-128KB）之后不远。先解 256KB，罕见的"SOF 极靠后"再全量兜底——避免为读个
// 宽高把整张照片的 base64 解一遍（安卓真机卡顿/闪退的元凶之一）。
const HEADER_BYTES = 256 * 1024
export function imageSizeFromDataUrl(src: string) {
  const comma = src.indexOf(',')
  if (comma < 0 || !src.slice(0, comma).includes('base64')) return undefined
  const b64 = src.slice(comma + 1)
  const head = imageSizeFromBytes(base64ToBytes(b64, HEADER_BYTES))
  if (head) return head
  if (b64.length <= (HEADER_BYTES * 4) / 3) return undefined // 已经是全量了
  return imageSizeFromBytes(base64ToBytes(b64))
}
