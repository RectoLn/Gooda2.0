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

function callOnce<T>(run: (finish: (v: T) => void) => void, timeoutVal: T, ms = 4000): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false
    const finish = (v: T) => { if (!done) { done = true; resolve(v) } }
    const timer = setTimeout(() => finish(timeoutVal), ms)
    run((v: T) => { clearTimeout(timer); finish(v) })
  })
}
function shortJson(v: any, n = 140): string {
  try { return JSON.stringify(v)?.slice(0, n) ?? String(v) } catch (_) { return String(v) }
}

// DEBUG 版：把 data URL 写成 difile 文件，并把每一步（写入/stat/回读）的原始结果
// 收集到 report 里，供上层弹窗展示，用来定位真机上到底哪一步出问题。
// 返回 { path, ok, report }。path 为空表示确认失败。
export async function writeTempImageWithReport(dataUrl: string): Promise<{ path: string; ok: boolean; report: string }> {
  const lines: string[] = []
  if (!dataUrl.startsWith('data:')) return { path: dataUrl, ok: true, report: `src=非data(${dataUrl.slice(0, 12)})` }
  const fs = (Taro as any).getFileSystemManager?.()
  const base = (Taro as any).env?.USER_DATA_PATH || 'difile://usr'
  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : ''
  lines.push(`b64len=${base64.length} base=${base}`)
  if (!fs?.writeFile || !base64) return { path: '', ok: false, report: `${lines.join('\n')}\nwriteFile不可用(fs=${!!fs?.writeFile})` }
  const filePath = `${base}/gooda-export-${Date.now()}.png`

  // 1) 写入（标准 base64 字符串 + encoding:base64）
  const write = await callOnce<{ ok: boolean; raw: string }>((finish) => {
    fs.writeFile({
      filePath, data: base64, encoding: 'base64',
      success: (r: any) => finish({ ok: true, raw: shortJson(r) }),
      fail: (e: any) => finish({ ok: false, raw: shortJson(e) }),
    })
  }, { ok: false, raw: 'timeout' })
  lines.push(`write.ok=${write.ok} raw=${write.raw}`)
  if (!write.ok) return { path: '', ok: false, report: lines.join('\n') }

  // 2) stat 文件大小
  const stat = await callOnce<string>((finish) => {
    if (!fs.stat) { finish('no-stat'); return }
    fs.stat({ path: filePath, success: (r: any) => finish(shortJson(r)), fail: (e: any) => finish('fail:' + shortJson(e)) })
  }, 'timeout', 3000)
  lines.push(`stat=${stat}`)

  // 3) 整文件回读（不带 position/length），看长度与 PNG 头
  const read = await callOnce<string>((finish) => {
    if (!fs.readFile) { finish('no-readFile'); return }
    fs.readFile({
      filePath, encoding: 'base64',
      success: (r: any) => {
        const res = Array.isArray(r) ? r[0] : r
        const d = (res && res.data) != null ? res.data : (typeof res === 'string' ? res : '')
        finish(`type=${typeof r} dlen=${String(d).length} head=${String(d).slice(0, 12)}`)
      },
      fail: (e: any) => finish('fail:' + shortJson(e)),
    })
  }, 'timeout', 4000)
  lines.push(`read=${read}`)

  const ok = read.includes('head=iVBORw0KGgo')
  return { path: filePath, ok, report: lines.join('\n') }
}

// Native: persist a data URL to a REAL file under USER_DATA_PATH and return its
// difile:// path. saveImageToPhotosAlbum needs a real file path — Android's
// isLegalPath() requires a `difile://` prefix and silently ignores a data URL
// (no callback fired → "保存没反应"); iOS's UIImage(contentsOfFile:) needs a
// decodable image file. Returns { path, diag }: path='' on failure.
export async function dataUrlToTempFileNative(dataUrl: string): Promise<{ path: string; diag: string }> {
  if (!dataUrl.startsWith('data:')) return { path: dataUrl, diag: 'passthrough' }
  const fs = (Taro as any).getFileSystemManager?.()
  const base = (Taro as any).env?.USER_DATA_PATH || 'difile://usr'
  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : ''
  if (!fs?.writeFile || !base64) return { path: '', diag: `writeFile 不可用(fs=${!!fs?.writeFile}, b64=${base64.length})` }
  const filePath = `${base}/gooda-export-${Date.now()}.png`
  const wrote = await callOnce<string>((finish) => {
    fs.writeFile({
      filePath, data: base64, encoding: 'base64',
      success: () => finish(''),
      fail: (err: any) => { console.warn('[gooda-export] writeFile failed', err); finish(errText(err) || '写入失败') },
    })
  }, '写入超时', 4000)
  if (wrote) return { path: '', diag: `写文件失败：${wrote}` }
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
