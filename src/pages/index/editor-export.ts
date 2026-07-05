import Taro from '@tarojs/taro'
import { EXPORT_SIZE, boards, bags, roundRectPath, drawRoundedImage, drawCroppedRoundedImage, loadImg } from './editor-core'
import type { Layer } from './editor-core'

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

function getCanvasNode(canvasId: string, selectorResult: any) {
  let node = selectorResult && selectorResult[0] && selectorResult[0].node
  if ((!node || !node.getContext) && typeof document !== 'undefined') {
    const el: any = document.querySelector(`#${canvasId}`)
    node = el && (el.tagName === 'CANVAS' ? el : el.querySelector && el.querySelector('canvas'))
  }
  return node
}

export function exportEditorImage(options: ExportEditorImageOptions): Promise<string | undefined> {
  const { canvasId, cw, ch, win, curBoard, curBag, boardLayer, layers } = options
  return new Promise((resolve) => {
    const q = Taro.createSelectorQuery()
    q.select(`#${canvasId}`).fields({ node: true }).exec(async (res) => {
      const node = getCanvasNode(canvasId, res)
      if (!node || !node.getContext) {
        Taro.showToast({ title: '画布未就绪', icon: 'none' })
        resolve(undefined)
        return
      }
      const scale = EXPORT_SIZE / cw
      node.width = EXPORT_SIZE
      node.height = EXPORT_SIZE
      const ctx = node.getContext('2d')
      ctx.clearRect(0, 0, EXPORT_SIZE, EXPORT_SIZE)
      ctx.save()
      ctx.scale(scale, scale)
      try {
        ctx.save()
        ctx.beginPath()
        ctx.rect(win.x, win.y, win.w, win.h)
        ctx.clip()
        if (bags[curBag].back) {
          const back = await loadImg(node, bags[curBag].back)
          const crop = bags[curBag].backCrop
          if (crop) {
            ctx.drawImage(
              back,
              crop.x,
              crop.y,
              crop.w,
              crop.h,
              win.x,
              win.y,
              win.w,
              win.h,
            )
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
            const base = await loadImg(node, b.src)
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
            const img = await loadImg(node, ly.src)
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
        const front = await loadImg(node, bags[curBag].front)
        ctx.drawImage(front, 0, 0, cw, ch)
      } catch (_) {
        Taro.showToast({ title: '合成失败', icon: 'none' })
        ctx.restore()
        resolve(undefined)
        return
      }
      ctx.restore()
      if (process.env.TARO_ENV === 'h5' && typeof node.toDataURL === 'function') {
        try {
          const src = node.toDataURL('image/png')
          Taro.showToast({ title: '已导出', icon: 'none' })
          resolve(src)
          return
        } catch (_) {}
      }
      Taro.canvasToTempFilePath({
        canvasId,
        canvas: node,
        x: 0,
        y: 0,
        width: EXPORT_SIZE,
        height: EXPORT_SIZE,
        destWidth: EXPORT_SIZE,
        destHeight: EXPORT_SIZE,
        success: (r) => {
          Taro.showToast({ title: '已导出', icon: 'none' })
          resolve(r.tempFilePath)
        },
        fail: (err) => {
          console.warn('[gooda-export] canvasToTempFilePath failed', err)
          try {
            resolve((node as any).toDataURL('image/png'))
          } catch (_) {
            resolve(undefined)
          }
        },
      })
    })
  })
}
