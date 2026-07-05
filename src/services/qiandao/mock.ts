import type { QiandaoSpuClient } from './client'
import { QiandaoSpuServiceError } from './client'
import type { QiandaoSpuSearchParams, QiandaoSpuSearchResult, QiandaoSpuSummary } from './types'

// H5 开发用 mock：让「搜索 → 选择 → 导入 → 上画布」链路在没有后端代理时也能手工验证。
// 只会被 resolveQiandaoSpuService 在 H5 dev（或 TARO_APP_SPU_MOCK=1）下选中，
// 不进原生/生产路径。图片用内联 SVG data URL（H5 可渲染、可量尺寸、无需网络）。

function svgDataUrl(label: string, bg: string, w: number, h: number, transparentBg = false) {
  const rect = transparentBg ? '' : `<rect width="${w}" height="${h}" rx="${Math.min(w, h) * 0.1}" fill="${bg}"/>`
  const circle = transparentBg ? `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2 - 2}" fill="${bg}"/>` : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${rect}${circle}<text x="50%" y="54%" font-size="${Math.min(w, h) / 6}" text-anchor="middle" fill="#1b5fae" font-family="sans-serif">${label}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const MOCK_SPUS: QiandaoSpuSummary[] = [
  {
    id: 'mock_spu_badge_01',
    title: '星野 应援吧唧 56mm',
    typeName: '徽章',
    // 透明图 → 走整图直接入池路径
    transparentImage: svgDataUrl('吧唧', '#f2d5d5', 240, 240, true),
    image: svgDataUrl('吧唧主图', '#f2d5d5', 240, 240),
    priceText: '¥18',
  },
  {
    id: 'mock_spu_stand_01',
    title: '星野 亚克力立牌',
    typeName: '立牌',
    // 只有主图 → 走 ImportCropEditor 手动确认裁剪路径
    image: svgDataUrl('立牌', '#c5ddd5', 240, 340),
    priceText: '¥45',
  },
  {
    id: 'mock_spu_card_01',
    title: '心海 收藏小卡',
    typeName: '小卡',
    image: svgDataUrl('小卡', '#ead9be', 240, 330),
    priceText: '¥12',
  },
  {
    id: 'mock_spu_paper_01',
    title: '心海 印刷色纸',
    typeName: '色纸',
    transparentImage: svgDataUrl('色纸', '#c7dce8', 240, 240),
    image: svgDataUrl('色纸主图', '#c7dce8', 240, 240),
  },
  {
    id: 'mock_spu_doll_01',
    title: '星野 玩偶娃娃 10cm',
    typeName: '玩偶',
    image: svgDataUrl('娃娃', '#ddd5ee', 240, 260),
    priceText: '¥68',
  },
]

const MOCK_DELAY_MS = 350

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export function createMockQiandaoSpuClient(): QiandaoSpuClient {
  return {
    async searchSpu(params: QiandaoSpuSearchParams): Promise<QiandaoSpuSearchResult> {
      await sleep(MOCK_DELAY_MS)
      // 关键词「错误」→ 模拟服务失败，用来手工验证失败态 UI
      if (params.keyword.includes('错误')) throw new QiandaoSpuServiceError('资料库服务返回错误（mock）', 'server')
      const keyword = params.keyword.trim()
      const items = keyword
        ? MOCK_SPUS.filter((spu) => `${spu.title} ${spu.typeName || ''}`.includes(keyword))
        : MOCK_SPUS
      return { items, page: params.page || 1, pageSize: params.pageSize || 20, total: items.length }
    },
    async getSpuDetail(id: string): Promise<QiandaoSpuSummary | undefined> {
      await sleep(MOCK_DELAY_MS)
      return MOCK_SPUS.find((spu) => spu.id === id)
    },
  }
}
