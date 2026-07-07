// 纯素材 helper：由 index.vue 抽离，无响应式状态依赖，可独立阅读 / 复用 / 测试。
// 覆盖 UserAsset→Mat 映射、形状 / 尺寸 / 占位色推断、素材架占位卡与 SPU 标签。
import type { Mat, Shape, RowItem, UserAsset } from './editor-core'
import type { QiandaoSpuSummary } from '../../services/qiandao/types'

export function assetToMat(asset: UserAsset): Mat {
  return {
    type: asset.type,
    label: asset.label,
    color: asset.color,
    w: asset.w,
    h: asset.h,
    shape: asset.shape,
    src: asset.src,
    crop: asset.crop,
    assetId: asset.id,
    sub: asset.sub,
    spuId: asset.spuId,
  }
}

export function guessAssetShape(type: UserAsset['type'], sub: string): Shape {
  return type === '谷子' && sub === '吧唧' ? 'circle' : 'rect'
}

export function defaultAssetSize(sub: string, shape: Shape) {
  if (shape === 'circle') return { w: 56, h: 56 }
  if (sub === '立牌') return { w: 48, h: 70 }
  if (sub === '小卡') return { w: 48, h: 66 }
  if (sub === '色纸') return { w: 60, h: 60 }
  return { w: 60, h: 60 }
}

export function placeholderColor(type: UserAsset['type'], sub: string) {
  const guziColors: Record<string, string> = {
    吧唧: '#E9C7CF',
    立牌: '#BCDAD1',
    小卡: '#E8D2B2',
    色纸: '#C7DCE8',
    其他: '#D8CFEA',
  }
  const decorColors: Record<string, string> = {
    蝴蝶结: '#EBC4CC',
    吧唧托: '#D7CEE9',
    花边: '#EFE0BC',
    丝带: '#C7DAE8',
    其他: '#CFE0D7',
  }
  return type === '谷子' ? guziColors[sub] || '#E7D4DA' : decorColors[sub] || '#E3D9EC'
}

export function categoryPlaceholder(type: UserAsset['type'], sub: string): RowItem | undefined {
  if (sub === '全部') return undefined
  const shape = guessAssetShape(type, sub)
  const size = defaultAssetSize(sub, shape)
  const mat: Mat = {
    type,
    label: sub,
    color: placeholderColor(type, sub),
    w: size.w,
    h: size.h,
    shape,
    sub,
  }
  return { kind: 'mat', label: sub, color: mat.color, shape: mat.shape, mat }
}

export function importedAssetBox(shape: Shape, aspect: number): { w: number; h: number } {
  if (shape === 'circle') return { w: 60, h: 60 }
  const a = aspect > 0 && isFinite(aspect) ? aspect : 1
  const max = 70
  if (a >= 1) return { w: max, h: Math.max(20, Math.round(max / a)) }
  return { w: Math.max(20, Math.round(max * a)), h: max }
}

export function spuAssetLabel(spu: QiandaoSpuSummary, sub: string) {
  return (spu.title || sub).slice(0, 12) // 与导入编辑器名称输入框 maxlength 一致
}
