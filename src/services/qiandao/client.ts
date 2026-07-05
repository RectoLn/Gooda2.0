import type { QiandaoSpuSearchParams, QiandaoSpuSearchResult } from './types'

export interface QiandaoClientOptions {
  baseUrl?: string
  fetcher?: typeof fetch
}

export class QiandaoClient {
  private readonly baseUrl: string
  private readonly fetcher?: typeof fetch

  constructor(options: QiandaoClientOptions = {}) {
    this.baseUrl = options.baseUrl || ''
    this.fetcher = options.fetcher
  }

  async searchSpu(_params: QiandaoSpuSearchParams): Promise<QiandaoSpuSearchResult> {
    throw new Error('Qiandao SPU search is not connected yet. Add a backend proxy before enabling it.')
  }
}

export function createQiandaoClient(options?: QiandaoClientOptions) {
  return new QiandaoClient(options)
}
