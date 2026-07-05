export type QiandaoSpuId = string

export interface QiandaoSpuSummary {
  id: QiandaoSpuId
  title: string
  image?: string
  sourceUrl?: string
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
