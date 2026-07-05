import Taro from '@tarojs/taro'
import { normalizeQiandaoSpu, normalizeQiandaoSpuList } from './types'
import type { QiandaoSpuSearchParams, QiandaoSpuSearchResult, QiandaoSpuSummary } from './types'

// 前端只与 Gooda 后端代理通信；代理在服务端持有 appSecret / access-token，并转发到
// 开放平台【对外 OpenAPI】（GET /spu/v1/search、GET /spu/v1/detail，openapi.qiandao.com）。
// 千岛内部（非开放平台）接口一律不接；appSecret / token 交换绝不进前端。

export type QiandaoSpuServiceMode = 'proxy' | 'mock' | 'unconfigured'
export type QiandaoSpuErrorReason = 'not-configured' | 'network' | 'server'

export class QiandaoSpuServiceError extends Error {
  readonly reason: QiandaoSpuErrorReason
  constructor(message: string, reason: QiandaoSpuErrorReason) {
    super(message)
    this.reason = reason
  }
}

export interface QiandaoSpuClient {
  searchSpu(params: QiandaoSpuSearchParams): Promise<QiandaoSpuSearchResult>
  getSpuDetail(id: string): Promise<QiandaoSpuSummary | undefined>
}

async function requestJson(url: string): Promise<any> {
  let res: any
  try {
    res = await Taro.request({ url, method: 'GET', header: { accept: 'application/json' } })
  } catch (_) {
    throw new QiandaoSpuServiceError('资料库请求失败，请检查网络后重试', 'network')
  }
  const status = res?.statusCode || 0
  if (status < 200 || status >= 300) {
    throw new QiandaoSpuServiceError(`资料库服务异常（HTTP ${status || '无响应'}）`, 'server')
  }
  const body = res.data
  if (body && typeof body === 'object' && 'code' in body && String(body.code) !== '0') {
    throw new QiandaoSpuServiceError(body.message || '资料库服务返回错误', 'server')
  }
  return body && typeof body === 'object' && 'data' in body ? body.data : body
}

// 契约与 OpenAPI 对齐（offset/limit 分页；data.items/totalCount），代理端做纯转发即可。
export class HttpQiandaoSpuClient implements QiandaoSpuClient {
  constructor(private readonly baseUrl: string) {}

  // CDN 图片有防盗链且缺 CORS 头：预览 <image> 和 fetch 下载都可能被拦。统一改写成
  // 走后端的 /spu/v1/image 代理（同源、可缓存），data URL / 非 http 源保持原样。
  private proxyImageUrl(raw?: string): string | undefined {
    if (!raw || !/^https?:\/\//i.test(raw)) return raw
    return `${this.baseUrl}/spu/v1/image?url=${encodeURIComponent(raw)}`
  }

  private withProxiedImages(spu: QiandaoSpuSummary): QiandaoSpuSummary {
    return {
      ...spu,
      image: this.proxyImageUrl(spu.image),
      transparentImage: this.proxyImageUrl(spu.transparentImage),
    }
  }

  async searchSpu(params: QiandaoSpuSearchParams): Promise<QiandaoSpuSearchResult> {
    const page = Math.max(1, params.page || 1)
    const pageSize = Math.max(1, params.pageSize || 20)
    const offset = (page - 1) * pageSize
    const query = `keyword=${encodeURIComponent(params.keyword)}&offset=${offset}&limit=${pageSize}`
    const data = await requestJson(`${this.baseUrl}/spu/v1/search?${query}`)
    const total = typeof data?.totalCount === 'number' ? data.totalCount : typeof data?.total === 'number' ? data.total : undefined
    return { items: normalizeQiandaoSpuList(data).map((item) => this.withProxiedImages(item)), page, pageSize, total }
  }

  async getSpuDetail(id: string): Promise<QiandaoSpuSummary | undefined> {
    const data = await requestJson(`${this.baseUrl}/spu/v1/detail?id=${encodeURIComponent(id)}`)
    const spu = normalizeQiandaoSpu(data)
    return spu ? this.withProxiedImages(spu) : undefined
  }
}

const NOT_CONFIGURED_MESSAGE = 'SPU 资料库服务未配置：需要 Gooda 后端代理（.env 里设置 TARO_APP_SPU_PROXY_BASE）'

class UnconfiguredQiandaoSpuClient implements QiandaoSpuClient {
  async searchSpu(): Promise<QiandaoSpuSearchResult> {
    throw new QiandaoSpuServiceError(NOT_CONFIGURED_MESSAGE, 'not-configured')
  }

  async getSpuDetail(): Promise<QiandaoSpuSummary | undefined> {
    throw new QiandaoSpuServiceError(NOT_CONFIGURED_MESSAGE, 'not-configured')
  }
}

class LazyMockQiandaoSpuClient implements QiandaoSpuClient {
  private clientPromise?: Promise<QiandaoSpuClient>

  private loadClient() {
    if (!this.clientPromise) {
      this.clientPromise = import('./mock').then((module) => module.createMockQiandaoSpuClient())
    }
    return this.clientPromise
  }

  async searchSpu(params: QiandaoSpuSearchParams): Promise<QiandaoSpuSearchResult> {
    return (await this.loadClient()).searchSpu(params)
  }

  async getSpuDetail(id: string): Promise<QiandaoSpuSummary | undefined> {
    return (await this.loadClient()).getSpuDetail(id)
  }
}

export interface QiandaoSpuService {
  mode: QiandaoSpuServiceMode
  client: QiandaoSpuClient
}

// TARO_APP_* 只在 .env 里声明过才会被构建替换；没声明时表达式原样保留，而 H5 运行时
// 未必有 process 全局 → 必须 try/catch 兜底成未配置，而不是白屏。
function readBuildEnv(read: () => string | undefined): string {
  try {
    return (read() || '').trim()
  } catch (_) {
    return ''
  }
}

export function resolveQiandaoSpuService(): QiandaoSpuService {
  const baseUrl = readBuildEnv(() => process.env.TARO_APP_SPU_PROXY_BASE).replace(/\/+$/, '')
  if (baseUrl) return { mode: 'proxy', client: new HttpQiandaoSpuClient(baseUrl) }
  // mock 仅限 H5 开发验证（pnpm dev，或显式 TARO_APP_SPU_MOCK=1 的 H5 构建）。
  // 原生 / 生产 H5 构建走 unconfigured：UI 明确提示未配置，而不是假装功能可用。
  const mockAllowed = process.env.TARO_ENV === 'h5'
    && (process.env.NODE_ENV === 'development' || readBuildEnv(() => process.env.TARO_APP_SPU_MOCK) === '1')
  if (mockAllowed) return { mode: 'mock', client: new LazyMockQiandaoSpuClient() }
  return { mode: 'unconfigured', client: new UnconfiguredQiandaoSpuClient() }
}
