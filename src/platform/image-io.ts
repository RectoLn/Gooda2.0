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

// Write the base64 of a data URL to `${base}/name` and return the path (''=fail).
async function writeImageToBase(fs: any, base64: string, base: string, name: string): Promise<string> {
  const filePath = `${base}/${name}`
  const wrote = await callOnce<string>((finish) => {
    fs.writeFile({
      filePath, data: base64, encoding: 'base64',
      success: () => finish(''),
      fail: (err: any) => { console.warn('[gooda-export] writeFile failed', base, err); finish(errText(err) || 'fail') },
    })
  }, 'timeout', 4000)
  return wrote ? '' : filePath
}

// Ground truth from device (千岛 iOS): a difile://usr file is valid on disk
// (stat ok, PNG header ok) but saveImageToPhotosAlbum / previewImage report
// "image not found" — the native image VCs don't resolve the USER data dir.
// The WeChat convention feeds those APIs a TEMP-dir path (what canvasToTempFilePath
// returns). So try candidate save targets in order and use the first that works:
//   1) difile://tmp file  2) difile://usr file  3) the data URL itself.
// Returns { ok, path, report }: path is the source that succeeded (or best-effort
// last candidate for the long-press preview fallback); report lists each attempt.
export async function saveImageNativeSmart(dataUrl: string): Promise<{ ok: boolean; path: string; report: string }> {
  const lines: string[] = []
  const fs = (Taro as any).getFileSystemManager?.()
  const usr = (Taro as any).env?.USER_DATA_PATH || 'difile://usr'
  const isData = dataUrl.startsWith('data:')
  const comma = dataUrl.indexOf(',')
  const base64 = isData && comma >= 0 ? dataUrl.slice(comma + 1) : ''

  const candidates: { label: string; path: string }[] = []
  if (isData && fs?.writeFile && base64) {
    const name = `gooda-export-${Date.now()}.png`
    for (const [label, base] of [['tmp', 'difile://tmp'], ['usr', usr]] as const) {
      const p = await writeImageToBase(fs, base64, base, name)
      lines.push(`write.${label}=${p ? 'ok' : 'fail'}`)
      if (p) candidates.push({ label, path: p })
    }
    candidates.push({ label: 'dataurl', path: dataUrl })
  } else {
    // resultSrc is already a path (rare on native) — save it directly.
    candidates.push({ label: 'src', path: dataUrl })
  }

  let last = ''
  for (const c of candidates) {
    last = c.path
    const r = await callOnce<string>((finish) => {
      Taro.saveImageToPhotosAlbum({
        filePath: c.path,
        success: () => finish('ok'),
        fail: (err: any) => finish('fail:' + (errText(err) || shortJson(err, 60))),
      })
    }, 'timeout', 8000)
    lines.push(`save[${c.label}]=${r}`)
    if (r === 'ok') return { ok: true, path: c.path, report: lines.join('\n') }
  }
  return { ok: false, path: last, report: lines.join('\n') }
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

// Our own backend image proxy can return the bytes as a data URL in JSON (?b64=1).
// On 安卓/鸿蒙 Dimina the downloadFile bridge is unreliable (callback never returns /
// fails), while the request bridge is proven good (SPU search uses it). So for proxy
// URLs on native runtimes, fetch the image over request first. ''=fail (caller falls
// through to the downloadFile path).
async function proxyImageToDataUrlViaRequest(url: string): Promise<string> {
  if (!/\/spu\/v1\/image\?/.test(url)) return ''
  return await new Promise<string>((resolve) => {
    try {
      Taro.request({
        url: `${url}&b64=1`,
        method: 'GET',
        timeout: 20000,
        success: (res: any) => {
          const dataUrl = res?.statusCode === 200 && res?.data && typeof res.data === 'object'
            ? String(res.data?.data?.dataUrl || '')
            : ''
          resolve(dataUrl.startsWith('data:') ? dataUrl : '')
        },
        fail: () => resolve(''),
      })
    } catch (_) {
      resolve('')
    }
  })
}

// Fetch a REMOTE (http/https) image into a data URL. On native runtimes fetch /
// FileReader are unavailable and the filesystem reader cannot open URLs — prefer the
// backend's b64 JSON mode over the request bridge, then fall back to downloading to
// a temp file (downloadFile is in Dimina's adapted API list but broken on 安卓/鸿蒙).
// Returns the original URL unchanged when everything fails — the caller decides if
// that's fatal (e.g. anti-hotlink CDNs / missing CORS headers on H5).
export async function remoteImageToDataUrl(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return imageSourceToDataUrl(url)
  if (typeof fetch !== 'undefined' && typeof FileReader !== 'undefined') return imageSourceToDataUrl(url)
  const viaRequest = await proxyImageToDataUrlViaRequest(url)
  if (viaRequest) return viaRequest
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
