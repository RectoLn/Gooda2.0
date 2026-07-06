import Taro from '@tarojs/taro'

// 智能识别（抠图）客户端：与 SPU 代理同一个 Gooda 后端（TARO_APP_SPU_PROXY_BASE），
// POST /cutout/v1/remove 上传 base64 图片，拿回透明底 PNG。推理是自托管开源模型
// （见 backend/models-onnx/README.md），照片只进自有后端、不外传第三方。

export type CutoutErrorReason =
  | 'not-configured' | 'network' | 'busy' | 'timeout' | 'no-subject' | 'bad-input' | 'server'

export class CutoutServiceError extends Error {
  readonly reason: CutoutErrorReason
  constructor(message: string, reason: CutoutErrorReason) {
    super(message)
    this.reason = reason
  }
}

export type CutoutResult = {
  image: string // 纯 base64 的透明 PNG（已按主体 bbox + 4% 留白裁切）
  mime: string
  width: number
  height: number
  metrics: { fillRatio: number; aspect: number; circleIoU: number }
  model: string
  durationMs: number
}

// 与 qiandao client 相同的读取姿势：TARO_APP_* 未在 .env 声明时表达式原样保留，
// H5 运行时可能没有 process 全局 → try/catch 兜底成未配置。
function readBuildEnv(read: () => string | undefined): string {
  try {
    return (read() || '').trim()
  } catch (_) {
    return ''
  }
}

export function cutoutServiceBase(): string {
  return readBuildEnv(() => process.env.TARO_APP_SPU_PROXY_BASE).replace(/\/+$/, '')
}

const REASON_BY_CODE: Record<string, CutoutErrorReason> = {
  BUSY: 'busy',
  TIMEOUT: 'timeout',
  NO_SUBJECT: 'no-subject',
  BAD_INPUT: 'bad-input',
  UNAVAILABLE: 'server',
  INTERNAL: 'server',
}

// 面向用户的分级文案（可截图反馈）；服务端 message 更具体时优先用服务端的。
export const CUTOUT_REASON_TEXT: Record<CutoutErrorReason, string> = {
  'not-configured': '智能识别服务未配置',
  network: '网络异常，识别请求未送达，请检查网络后重试',
  busy: '识别服务繁忙，请稍后重试',
  timeout: '识别超时，请稍后重试',
  'no-subject': '未能识别出主体，请手动框选',
  'bad-input': '图片数据异常，请重新导入后再试',
  server: '识别服务暂不可用，请稍后重试',
}

export async function removeImageBackground(imageDataUrl: string): Promise<CutoutResult> {
  const base = cutoutServiceBase()
  if (!base) throw new CutoutServiceError(CUTOUT_REASON_TEXT['not-configured'], 'not-configured')

  let res: any
  try {
    res = await Taro.request({
      url: `${base}/cutout/v1/remove`,
      method: 'POST',
      timeout: 30000,
      header: { 'content-type': 'application/json' },
      data: { image: imageDataUrl },
    })
  } catch (_) {
    throw new CutoutServiceError(CUTOUT_REASON_TEXT.network, 'network')
  }

  const body = res?.data
  const code = body && typeof body === 'object' ? String(body.code ?? '') : ''
  if (code === '0' && body?.data?.image) return body.data as CutoutResult

  const reason = REASON_BY_CODE[code]
    || (res?.statusCode === 503 ? 'busy' : res?.statusCode === 504 ? 'timeout' : 'server')
  // no-subject 直接用统一文案（服务端 message 偏技术向）；其余优先透传服务端信息
  const message = reason === 'no-subject'
    ? CUTOUT_REASON_TEXT['no-subject']
    : (body && typeof body === 'object' && body.message) || CUTOUT_REASON_TEXT[reason]
  throw new CutoutServiceError(message, reason)
}
