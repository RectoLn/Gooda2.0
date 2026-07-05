import Taro from '@tarojs/taro'
import { imageSizeFromBytes, base64ToBytes } from '../pages/index/image-measure'

// Cross-end image IO wrappers (Taro filesystem / fetch / canvas). No reactive or
// page state — just source-string in, result out. Extracted from index.vue.

// Read a local (non-data:) file's pixel size via the Taro filesystem manager,
// parsing the header bytes. Returns undefined when unavailable / unreadable.
export async function imageSizeFromLocalFile(src: string) {
  if (!src || src.startsWith('data:')) return undefined
  const fs = (Taro as any).getFileSystemManager?.()
  if (!fs?.readFile) return undefined
  const tryRead = (encoding?: string) => new Promise<{ width: number; height: number } | undefined>((resolve) => {
    const options: any = {
      filePath: src,
      success: (res: any) => {
        const data = res?.data
        if (data instanceof ArrayBuffer) { resolve(imageSizeFromBytes(new Uint8Array(data))); return }
        if (typeof data === 'string') { resolve(imageSizeFromBytes(base64ToBytes(data))); return }
        resolve(undefined)
      },
      fail: () => resolve(undefined),
    }
    if (encoding) options.encoding = encoding
    fs.readFile(options)
  })
  return await tryRead() || await tryRead('base64')
}

// Infer the image MIME from a base64 payload's leading bytes (base64 prefix is a
// stable signature per format). Guessing jpeg for everything loses PNG transparency
// and can make Dimina's <image> mis-decode.
function mimeFromBase64(b64: string): string {
  if (b64.startsWith('iVBOR')) return 'image/png'      // PNG  (89 50 4E 47)
  if (b64.startsWith('/9j/')) return 'image/jpeg'      // JPEG (FF D8 FF)
  if (b64.startsWith('R0lGOD')) return 'image/gif'     // GIF
  if (b64.startsWith('UklGR')) return 'image/webp'     // RIFF/WebP
  return 'image/jpeg'
}
// Native (weapp/Dimina) path: read a temp/local file and base64-encode it as a data URL.
export async function imageSourceToDataUrlNative(src: string) {
  if (src.startsWith('data:')) return src
  const fs = (Taro as any).getFileSystemManager?.()
  if (!fs?.readFile) return src
  return await new Promise<string>((resolve) => {
    fs.readFile({
      filePath: src,
      encoding: 'base64',
      success: (res: any) => {
        const data = typeof res?.data === 'string' ? res.data : ''
        resolve(data ? `data:${mimeFromBase64(data)};base64,${data}` : src)
      },
      fail: () => resolve(src),
    })
  })
}

function firstResult(r: any) {
  return Array.isArray(r) ? r[0] : r
}
function errText(err: any): string {
  const e = firstResult(err)
  return (e && (e.errMsg || e.message)) || ''
}

// Read back the first bytes and check the PNG magic (base64 "iVBORw0KGgo"),
// so we can tell a valid image file from a runtime that wrote garbage (e.g. a
// strict base64 decoder that fell back to writing the base64 TEXT).
function verifyPngFile(fs: any, filePath: string): Promise<string> {
  if (!fs?.readFile) return Promise.resolve('ok') // can't verify → assume ok
  return new Promise((resolve) => {
    let done = false
    const finish = (v: string) => { if (!done) { done = true; resolve(v) } }
    const timer = setTimeout(() => finish('ok'), 3000) // don't block save on a slow read
    fs.readFile({
      filePath,
      encoding: 'base64',
      position: 0,
      length: 32,
      success: (res: any) => {
        clearTimeout(timer)
        const data = (firstResult(res)?.data) || ''
        finish(typeof data === 'string' && data.startsWith('iVBORw0KGgo') ? 'ok' : `badsig:${String(data).slice(0, 10)}`)
      },
      fail: () => { clearTimeout(timer); finish('ok') },
    })
  })
}

// Native: persist a data URL to a REAL file under USER_DATA_PATH and return its
// difile:// path. saveImageToPhotosAlbum needs a real file path — Android's
// isLegalPath() requires a `difile://` prefix and silently ignores a data URL
// (no callback fired → "保存没反应"); iOS's UIImage(contentsOfFile:) needs a
// decodable image file. Returns { path, diag }: path='' on failure, diag carries
// a human-readable reason for the caller to surface. A ~4s timeout guards against
// a runtime whose writeFile callback never fires (avoids a stuck spinner).
export async function dataUrlToTempFileNative(dataUrl: string): Promise<{ path: string; diag: string }> {
  if (!dataUrl.startsWith('data:')) return { path: dataUrl, diag: 'passthrough' }
  const fs = (Taro as any).getFileSystemManager?.()
  const base = (Taro as any).env?.USER_DATA_PATH || 'difile://usr'
  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : ''
  if (!fs?.writeFile || !base64) return { path: '', diag: `writeFile 不可用(fs=${!!fs?.writeFile}, b64=${base64.length})` }
  const filePath = `${base}/gooda-export-${Date.now()}.png`
  // Prefer writing an ArrayBuffer: it goes through Dimina's tested arraybuffer→
  // base64 native decode path and sidesteps strict base64-string decoders that
  // silently write the raw base64 text instead of the decoded bytes → black image.
  let data: any = base64
  let encoding: string | undefined = 'base64'
  try {
    const bytes = base64ToBytes(base64)
    if (bytes && bytes.length > 8) {
      data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      encoding = undefined
    }
  } catch (_) { /* fall back to base64 string */ }
  const wrote = await new Promise<string>((resolve) => {
    let done = false
    const finish = (v: string) => { if (!done) { done = true; resolve(v) } }
    const timer = setTimeout(() => finish('写入超时'), 4000)
    const opts: any = {
      filePath,
      data,
      success: () => { clearTimeout(timer); finish('') },
      fail: (err: any) => {
        clearTimeout(timer)
        console.warn('[gooda-export] writeFile failed', err)
        finish(errText(err) || '写入失败')
      },
    }
    if (encoding) opts.encoding = encoding
    fs.writeFile(opts)
  })
  if (wrote) return { path: '', diag: `写文件失败：${wrote}` }
  const sig = await verifyPngFile(fs, filePath)
  if (sig !== 'ok') return { path: '', diag: `文件校验失败(${sig})：图片未正确编码` }
  return { path: filePath, diag: 'ok' }
}

// Convert any image source to a data URL. H5 uses fetch+FileReader (falls back to a
// canvas re-encode); native falls back to the filesystem reader. Storing a data URL
// (not a temp path, which expires) is required for persisted user assets.
export async function imageSourceToDataUrl(src: string) {
  if (src.startsWith('data:')) return src
  if (typeof fetch === 'undefined' || typeof FileReader === 'undefined') return await imageSourceToDataUrlNative(src)
  try {
    const res = await fetch(src)
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || src))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (_) {
    if (typeof document === 'undefined') return await imageSourceToDataUrlNative(src)
    return await new Promise<string>((resolve) => {
      const img = new Image()
      // remote images need CORS approval to leave the canvas un-tainted; for
      // same-origin/data sources the attribute is a no-op.
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth || img.width
          canvas.height = img.naturalHeight || img.height
          const ctx = canvas.getContext('2d')
          if (!ctx) { resolve(src); return }
          ctx.drawImage(img, 0, 0)
          resolve(canvas.toDataURL('image/png'))
        } catch (_) {
          resolve(src)
        }
      }
      img.onerror = () => resolve(src)
      img.src = src
    })
  }
}

// Fetch a REMOTE (http/https) image into a data URL. On native runtimes fetch /
// FileReader are unavailable and the filesystem reader cannot open URLs, so download
// to a temp file first (downloadFile is in Dimina's adapted API list). Returns the
// original URL unchanged when everything fails — the caller decides if that's fatal
// (e.g. anti-hotlink CDNs / missing CORS headers on H5).
export async function remoteImageToDataUrl(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return imageSourceToDataUrl(url)
  if (typeof fetch !== 'undefined' && typeof FileReader !== 'undefined') return imageSourceToDataUrl(url)
  const temp = await new Promise<string>((resolve) => {
    try {
      Taro.downloadFile({
        url,
        success: (res: any) => resolve((res?.statusCode === 200 && res.tempFilePath) || ''),
        fail: () => resolve(''),
      })
    } catch (_) {
      resolve('')
    }
  })
  if (!temp) return url
  return imageSourceToDataUrlNative(temp)
}
