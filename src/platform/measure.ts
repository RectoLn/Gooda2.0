import Taro from '@tarojs/taro'

export type MeasuredRect = { left: number; top: number; width: number; height: number }

// Measure one element's screen rect via Taro's cross-end selector query. Works on
// H5 AND weapp/Dimina, unlike document.querySelector().getBoundingClientRect(),
// which is unavailable in the native runtime. Resolves null when the node is not
// found / has no width, and never throws.
export function measureRect(selector: string): Promise<MeasuredRect | null> {
  return new Promise((resolve) => {
    try {
      Taro.createSelectorQuery()
        .select(selector)
        .boundingClientRect((rect: any) => resolve(rect && rect.width ? rect : null))
        .exec()
    } catch (_) {
      resolve(null)
    }
  })
}
