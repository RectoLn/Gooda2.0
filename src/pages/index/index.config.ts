export default definePageConfig({
  navigationBarTitleText: '谷搭 · 排版画板',
  // 自定义导航：编辑器自带顶栏（已为原生胶囊预留空间），去掉原生标题栏可消除
  // 顶部多余留白，并让全屏高度与 H5 一致。
  navigationStyle: 'custom',
  // 编辑器是固定全屏布局，禁止原生页面滚动，否则拖拽素材时整页会跟着上移、
  // 导致 stage 屏幕坐标失效、落点错位。
  disableScroll: true
})
