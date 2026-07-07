import Taro from '@tarojs/taro'
import { EXPORT_SIZE, boards, bags, roundRectPath, drawRoundedImage, drawCroppedRoundedImage, loadImg, srcKind } from './editor-core'
import type { Layer, ExportHistoryRecord, StoredExportHistoryRecord } from './editor-core'

type ExportEditorImageOptions = {
  canvasId: string
  cw: number
  ch: number
  win: { x: number; y: number; w: number; h: number }
  curBoard: number
  curBag: number
  boardLayer?: Layer
  layers: Layer[]
}

// 导出结果：成功带 src；失败带可读的 stage + detail，供上层弹窗展示 / 用户截图。
export type ExportResult =
  | { ok: true; src: string }
  | { ok: false; stage: string; detail: string }

function getCanvasNode(canvasId: string, selectorResult: any) {
  let node = selectorResult && selectorResult[0] && selectorResult[0].node
  if ((!node || !node.getContext) && typeof document !== 'undefined') {
    const el: any = document.querySelector(`#${canvasId}`)
    node = el && (el.tagName === 'CANVAS' ? el : el.querySelector && el.querySelector('canvas'))
  }
  return node
}

// 新版 2d node 画布的绘制指令在 Dimina 里是"入队 + 微任务批量 flush"到渲染层的，
// 而 canvasToTempFilePath 是另一条同步消息。若不等一拍，截图消息可能先于最后一批
// 绘制到达渲染层 → 导出图缺最后绘制的图层。让出一个宏任务，保证 flush 消息先送达。
function flushCanvas(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 32))
}

function selectCanvasNode(canvasId: string): Promise<any> {
  return new Promise((resolve) => {
    try {
      Taro.createSelectorQuery()
        .select(`#${canvasId}`)
        .fields({ node: true })
        .exec((res) => resolve(getCanvasNode(canvasId, res)))
    } catch (_) {
      resolve(getCanvasNode(canvasId, null))
    }
  })
}

// 关键修复：不要给 canvasToTempFilePath 传 `canvas: node`。
// Dimina 的 canvasToTempFilePath 用 canvas-id 定位 DOM canvas（忽略 canvas 参数），
// 而 CanvasNode 内含 CanvasRenderingContext2DProxy（Map + Proxy），跨 worker
// postMessage 结构化克隆时会抛 DataCloneError，直接导致导出失败。
type SnapshotOptions = { width: number; height: number; fileType?: 'png' | 'jpg'; quality?: number }
function canvasToTempFilePath(canvasId: string, opts: SnapshotOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    Taro.canvasToTempFilePath({
      canvasId,
      x: 0,
      y: 0,
      width: opts.width,
      height: opts.height,
      destWidth: opts.width,
      destHeight: opts.height,
      fileType: opts.fileType || 'png',
      quality: opts.quality,
      // Dimina 的 render 层通过 triggerCallback 以 args 数组回传结果，成功回调拿到的是
      // [result]（而 WeChat/H5 是 result 对象）。两种形态都兼容，避免 tempFilePath 取空。
      success: (r: any) => {
        const res = Array.isArray(r) ? r[0] : r
        resolve(res && res.tempFilePath)
      },
      fail: (err: any) => reject(Array.isArray(err) ? err[0] : err),
    })
  })
}

// 智能识别的上传预压缩：把图片经导出画布重绘到 maxSide 内，转 JPEG data URL
// （铺白底避免透明像素在 JPEG 里变黑）。任一环节失败返回 ''，调用方回退原图直传。
export async function downscaleImageToDataUrl(
  canvasId: string, src: string, srcW: number, srcH: number, maxSide: number,
): Promise<string> {
  try {
    const node = await selectCanvasNode(canvasId)
    if (!node || typeof node.getContext !== 'function') return ''
    const scale = Math.min(1, maxSide / Math.max(srcW, srcH))
    const w = Math.max(1, Math.round(srcW * scale))
    const h = Math.max(1, Math.round(srcH * scale))
    node.width = w
    node.height = h
    const ctx = node.getContext('2d')
    if (!ctx) return ''
    const img = await loadImg(node, src)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    if (process.env.TARO_ENV === 'h5' && typeof node.toDataURL === 'function') {
      return node.toDataURL('image/jpeg', 0.85)
    }
    await flushCanvas()
    return await canvasToTempFilePath(canvasId, { width: w, height: h, fileType: 'jpg', quality: 0.85 })
  } catch (err) {
    console.warn('[gooda-cutout] downscale failed, fall back to original', err)
    return ''
  }
}

export async function exportEditorImage(options: ExportEditorImageOptions): Promise<ExportResult> {
  const { canvasId, cw, ch, win, curBoard, curBag, boardLayer, layers } = options

  const node = await selectCanvasNode(canvasId)
  if (!node) {
    return { ok: false, stage: 'canvas-node-missing', detail: `未找到画布节点 #${canvasId}（fields({node:true}) 返回空）` }
  }
  if (typeof node.getContext !== 'function') {
    return { ok: false, stage: 'get-context-missing', detail: '画布节点缺少 getContext（运行时不支持 2d node canvas）' }
  }

  const scale = EXPORT_SIZE / cw
  node.width = EXPORT_SIZE
  node.height = EXPORT_SIZE
  const ctx = node.getContext('2d')
  if (!ctx) {
    return { ok: false, stage: 'get-context-missing', detail: "node.getContext('2d') 返回空" }
  }

  // 分阶段捕获图片加载失败：把"哪张图 / 哪种来源"暴露出来。
  const load = async (src: string, role: string) => {
    try {
      return await loadImg(node, src)
    } catch (err: any) {
      throw new ExportStageError('image-load-failed', `${role} 图片加载失败 [${srcKind(src)}]：${(err && err.message) || err}`)
    }
  }

  try {
    ctx.clearRect(0, 0, EXPORT_SIZE, EXPORT_SIZE)
    ctx.save()
    ctx.scale(scale, scale)

    ctx.save()
    ctx.beginPath()
    ctx.rect(win.x, win.y, win.w, win.h)
    ctx.clip()
    if (bags[curBag].back) {
      const back = await load(bags[curBag].back, '痛包内衬')
      const crop = bags[curBag].backCrop
      if (crop) {
        ctx.drawImage(back, crop.x, crop.y, crop.w, crop.h, win.x, win.y, win.w, win.h)
      } else {
        ctx.drawImage(back, win.x, win.y, win.w, win.h)
      }
    }
    if (curBoard >= 0 && boardLayer) {
      const b = boards[curBoard]
      ctx.save()
      ctx.translate(win.x + boardLayer.x, win.y + boardLayer.y)
      ctx.rotate((boardLayer.rotation * Math.PI) / 180)
      ctx.scale(boardLayer.flipX ? -boardLayer.scale : boardLayer.scale, boardLayer.scale)
      ctx.globalAlpha = boardLayer.opacity
      if (b.src) {
        const base = await load(b.src, '底板')
        ctx.drawImage(base, -boardLayer.w / 2, -boardLayer.h / 2, boardLayer.w, boardLayer.h)
      } else if (b.color) {
        ctx.fillStyle = b.color
        ctx.fillRect(-boardLayer.w / 2, -boardLayer.h / 2, boardLayer.w, boardLayer.h)
      }
      ctx.restore()
    }
    for (const ly of layers) {
      ctx.save()
      ctx.translate(win.x + ly.x, win.y + ly.y)
      ctx.rotate((ly.rotation * Math.PI) / 180)
      ctx.scale(ly.flipX ? -ly.scale : ly.scale, ly.scale)
      ctx.globalAlpha = ly.opacity
      const radius = ly.shape === 'circle' ? Math.min(ly.w, ly.h) / 2 : ly.shape === 'round' ? Math.min(16, ly.w / 4, ly.h / 4) : 8
      if (ly.src) {
        const img = await load(ly.src, `素材「${ly.label || ''}」`)
        if (ly.crop) {
          drawCroppedRoundedImage(ctx, img, -ly.w / 2, -ly.h / 2, ly.w, ly.h, radius, ly.crop)
        } else {
          drawRoundedImage(ctx, img, -ly.w / 2, -ly.h / 2, ly.w, ly.h, radius)
        }
      } else {
        ctx.fillStyle = ly.color
        roundRectPath(ctx, -ly.w / 2, -ly.h / 2, ly.w, ly.h, radius)
        ctx.fill()
        ctx.fillStyle = '#333'
        ctx.font = '13px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(ly.label, 0, 0)
      }
      ctx.restore()
    }
    ctx.restore()
    const front = await load(bags[curBag].front, '痛包外壳')
    ctx.drawImage(front, 0, 0, cw, ch)
    ctx.restore()
  } catch (err: any) {
    try { ctx.restore() } catch (_) {}
    if (err instanceof ExportStageError) {
      return { ok: false, stage: err.stage, detail: err.detail }
    }
    return { ok: false, stage: 'compose-failed', detail: `绘制阶段异常：${(err && err.message) || err}` }
  }

  // H5：canvas 就是真实 DOM canvas，直接 toDataURL，最稳。
  if (process.env.TARO_ENV === 'h5' && typeof node.toDataURL === 'function') {
    try {
      return { ok: true, src: node.toDataURL('image/png') }
    } catch (err: any) {
      return { ok: false, stage: 'to-data-url-failed', detail: `toDataURL 失败：${(err && err.message) || err}` }
    }
  }

  // 原生（Dimina）：先让绘制指令 flush 到渲染层，再截图，避免时序竞态。
  await flushCanvas()
  try {
    const tempFilePath = await canvasToTempFilePath(canvasId, { width: EXPORT_SIZE, height: EXPORT_SIZE, fileType: 'png' })
    if (!tempFilePath) {
      return { ok: false, stage: 'temp-file-empty', detail: 'canvasToTempFilePath 成功但未返回 tempFilePath' }
    }
    return { ok: true, src: tempFilePath }
  } catch (err: any) {
    const raw = err && (err.errMsg || err.message) ? (err.errMsg || err.message) : JSON.stringify(err)
    console.warn('[gooda-export] canvasToTempFilePath failed', err)
    return { ok: false, stage: 'to-temp-file-failed', detail: `canvasToTempFilePath 失败：${raw}` }
  }
}

// 导出图默认文件名（H5 分享 / 下载用）。
export const EXPORT_FILE_NAME = 'gooda-export.png'

// 导出历史时间戳 → "MM-DD HH:mm" 展示串。
export function formatExportHistoryTime(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 落盘记录 → 运行时记录；缺 src / createdAt 视为无效丢弃。src 单独从 kv-store 注入。
export function normalizeExportRecord(r: Partial<StoredExportHistoryRecord>, i: number, src = r.src): ExportHistoryRecord | undefined {
  if (!r || !src || !r.createdAt) return undefined
  return {
    id: r.id || `${r.createdAt}-${i}`,
    src,
    createdAt: r.createdAt,
    name: r.name || '导出图',
    timeText: formatExportHistoryTime(r.createdAt),
  }
}

// data URL → File（H5 分享 / 下载用）；缺 atob/File 的端返回 undefined。
export function dataUrlToFile(dataUrl: string, fileName = EXPORT_FILE_NAME) {
  if (typeof atob === 'undefined' || typeof File === 'undefined') return undefined
  const parts = dataUrl.split(',')
  if (parts.length < 2) return undefined
  const mime = parts[0].match(/data:([^;]+);base64/)?.[1] || 'image/png'
  const binary = atob(parts[1])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], fileName, { type: mime })
}

// Dimina 回调以 [result] 数组形态回传，取首元素拿真实 errMsg。
export function errMsgOf(err: any): string {
  const e = Array.isArray(err) ? err[0] : err
  return (e && (e.errMsg || e.message)) || ''
}

class ExportStageError extends Error {
  stage: string
  detail: string
  constructor(stage: string, detail: string) {
    super(detail)
    this.stage = stage
    this.detail = detail
  }
}
