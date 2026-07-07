export type QiandaoSpuId = string

// 编辑器实际消费的 SPU 字段。字段名以【开放平台对外 OpenAPI】文档为准：
//   GET /spu/v1/detail → data.spu: { id, name, image, whiteBgPng, typeId, typeName, ... }
//   GET /spu/v1/search → data: { items, totalCount }（offset/limit 分页）
// 后端代理转发的是同一批对外接口，但字段命名可能有出入，统一走 normalizeQiandaoSpu 容错。
export interface QiandaoSpuSummary {
  id: QiandaoSpuId
  title: string
  /** 主图 / 封面图 */
  image?: string
  /** 透明底 / 抠图（OpenAPI 的 whiteBgPng）。有它可整图直接入池，免手动裁剪 */
  transparentImage?: string
  sourceUrl?: string
  typeId?: string
  typeName?: string
  priceText?: string
}

export interface QiandaoSpuSearchParams {
  keyword: string
  page?: number
  pageSize?: number
}

export interface QiandaoSpuSearchResult {
  items: QiandaoSpuSummary[]
  page: number
  pageSize: number
  total?: number
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

// Detail occasionally returns OSS-style references while search returns CDN URLs for
// the same image. Normalize the known treasure bucket shape before proxying/downloading.
export function normalizeQiandaoImageUrl(url?: string): string | undefined {
  if (!url) return undefined
  const trimmed = url.trim()
  const prefix = 'echotechoss://user-treasure-v2.image/'
  if (trimmed.startsWith(prefix)) {
    return `https://treasure.qiandaocdn.com/treasure/images/${trimmed.slice(prefix.length)}`
  }
  return trimmed
}

// 容错映射：id/spuId、name/title、image/mainImage/cover、whiteBgPng/transparentImage……
// 单条记录可能是 spu 对象本身，也可能包在 { spu } / { librarySpu } 里（详情接口两种都见过）。
export function normalizeQiandaoSpu(raw: any): QiandaoSpuSummary | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const source = raw.spu || raw.librarySpu || raw
  const id = source.id ?? source.spuId
  if (id === undefined || id === null || `${id}` === '') return undefined
  const images = Array.isArray(source.images) ? source.images : []
  const price = source.priceText ?? source.price ?? source.minPrice ?? source.marketPrice
  return {
    id: `${id}`,
    title: firstString(source.name, source.title, source.spuName) || `SPU ${id}`,
    image: normalizeQiandaoImageUrl(firstString(source.image, source.mainImage, source.cover, source.coverImage, images[0])),
    transparentImage: normalizeQiandaoImageUrl(firstString(source.whiteBgPng, source.transparentImage, source.whiteImage, source.cutoutImage)),
    sourceUrl: firstString(source.sourceUrl, source.url, source.link),
    typeId: source.typeId !== undefined && source.typeId !== null ? `${source.typeId}` : undefined,
    typeName: firstString(source.typeName, source.categoryName),
    priceText: typeof price === 'number' ? `¥${price}` : firstString(price),
  }
}

export function normalizeQiandaoSpuList(raw: any): QiandaoSpuSummary[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.list) ? raw.list : []
  return list
    .map((item: any) => normalizeQiandaoSpu(item))
    .filter((item: QiandaoSpuSummary | undefined): item is QiandaoSpuSummary => !!item)
}

// 图片优先级：透明图/抠图 > 主图（封面图已在 normalize 阶段并入 image 候选）。
export function bestSpuImage(spu: Pick<QiandaoSpuSummary, 'image' | 'transparentImage'>): string {
  return spu.transparentImage || spu.image || ''
}

// 整盒/系列 SPU 判定：编辑器要的是「系列里的具体单品」（单个吧唧/立牌/卡…），
// 不是整盒盲盒封面。实测 typeName 不可靠（整盒与单品大多同为「玩具/typeId 15」），
// 名字含「系列/整盒/整箱/端盒」才是可靠的整盒标记。注意【不能】过滤「盲盒」——
// 单品可能叫「XX盲盒徽章」（就是单个吧唧）。
const SERIES_SPU_NAME_RE = /系列|整盒|整箱|端盒|一番赏/
export function isSeriesSpu(spu: Pick<QiandaoSpuSummary, 'title'>): boolean {
  return SERIES_SPU_NAME_RE.test(spu.title || '')
}

// SPU 类目名/标题 → 谷子二级分类（editor-core SUBCATS['谷子'] 的子集）。
// 顺序即优先级：泛词「卡」放最后，避免「立卡/卡套」抢先命中。
const SPU_SUB_RULES: Array<[string, RegExp]> = [
  ['吧唧', /吧唧|徽章|胸章|别针|badge/i],
  ['立牌', /立牌|亚克力|acrylic|stand/i],
  ['色纸', /色纸|shikishi/i],
  ['小卡', /小卡|拍立得|卡牌|收藏卡|镭射票|card|卡/i],
]
export function inferGuziSubFromSpu(spu: Pick<QiandaoSpuSummary, 'typeName' | 'title'>): string {
  const text = `${spu.typeName || ''} ${spu.title || ''}`
  for (const [sub, re] of SPU_SUB_RULES) {
    if (re.test(text)) return sub
  }
  return '其他'
}

// 搜索结果的粗品类分桶，用于结果加权重排：谷子/周边（主力）> 卡 > 玩具。
// 卡：小卡/卡牌/收藏卡等；玩具：typeId 15（实测的玩具类目）或标题含玩具词；其余归谷子/周边。
export type SpuResultBucket = '谷子/周边' | '卡' | '玩具'
const SPU_CARD_RE = /小卡|卡牌|收藏卡|卡片|镭射票|拍立得|card/i
const SPU_TOY_RE = /玩偶|娃娃|公仔|手办|摆件|盲盒玩具|玩具|figure|doll|toy/i
export function spuResultBucket(spu: Pick<QiandaoSpuSummary, 'typeName' | 'title' | 'typeId'>): SpuResultBucket {
  const text = `${spu.typeName || ''} ${spu.title || ''}`
  if (SPU_CARD_RE.test(text)) return '卡'
  if (spu.typeId === '15' || SPU_TOY_RE.test(text)) return '玩具'
  return '谷子/周边'
}

// 各桶权重（谷子/周边 : 卡 : 玩具 = 6 : 3 : 1）。权重越高越倾向排前。
export const SPU_BUCKET_WEIGHT: Record<SpuResultBucket, number> = {
  '谷子/周边': 6,
  卡: 3,
  玩具: 1,
}

// 加权随机重排（Efraimidis–Spirakis 加权抽样）：每项 key = random^(1/weight)，按 key
// 降序。权重高的更可能靠前，但仍是随机「打乱」而非硬分组 → 越往前谷子/周边越密集，
// 玩具稀疏落尾。纯重排不删任何项，所以各桶只要原本有就不会为零。rng 可注入以便测试。
export function weightedShuffleSpus<T extends Pick<QiandaoSpuSummary, 'typeName' | 'title' | 'typeId'>>(
  items: T[],
  rng: () => number = Math.random,
): T[] {
  return items
    .map((item) => {
      const weight = SPU_BUCKET_WEIGHT[spuResultBucket(item)] || 1
      const r = rng()
      return { item, key: Math.pow(r > 0 ? r : Number.EPSILON, 1 / weight) }
    })
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.item)
}
