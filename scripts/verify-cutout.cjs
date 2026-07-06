// H5 验证「智能识别」链路：起 dist 静态站 → 打开导入编辑器（真实吧唧照片）→
// 点智能识别 → 断言：src 变为透明 PNG、选区盖满全图、高置信度圆形建议生效、
// 「还原原图」精确回到识别前状态。需要本地 backend 已在 :8080 运行（含模型）。
// 用法：TARO_APP_SPU_PROXY_BASE=http://localhost:8080 npm run build:h5 && node scripts/verify-cutout.cjs <照片路径>
const http = require('http'); const fs = require('fs'); const path = require('path')
const puppeteer = require('./_puppeteer.cjs')()
const DIST = path.join(__dirname, '..', 'dist')
const PHOTO = process.argv[2]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  fs.readFile(path.join(DIST, p), (e, d) => {
    if (e) { res.writeHead(404); res.end() } else { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(d) }
  })
})
;(async () => {
  if (!PHOTO || !fs.existsSync(PHOTO)) { console.error('need photo path arg'); process.exit(1) }
  await new Promise((r) => server.listen(10141, r))
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 200)))
  await page.goto('http://localhost:10141/index.html', { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction(() => !!window.__gooda, { timeout: 30000 })

  const dataUrl = 'data:image/jpeg;base64,' + fs.readFileSync(PHOTO).toString('base64')
  await page.evaluate((u) => window.__gooda.openImportEditor(u), dataUrl)
  await page.waitForSelector('.import-editor-crop-stage', { visible: true, timeout: 15000 })
  await sleep(800)

  const before = await page.evaluate(() => {
    const g = window.__gooda
    return { shape: g.importDraft.shape, sub: g.importDraft.sub, srcHead: g.importDraft.src.slice(0, 22),
      crop: { x: Math.round(g.importCrop.x), y: Math.round(g.importCrop.y), w: Math.round(g.importCrop.w), h: Math.round(g.importCrop.h) } }
  })
  console.log('before:', JSON.stringify(before))
  await page.screenshot({ path: '/tmp/cutout-before.png' })

  // 点按钮（真实 UI 路径）
  await page.tap('.import-ai-btn')
  await page.waitForFunction(() => {
    const b = document.querySelector('.import-ai-btn')
    return b && /还原原图/.test(b.textContent || '')
  }, { timeout: 40000 })
  await sleep(800)

  const after = await page.evaluate(() => {
    const g = window.__gooda
    const frame = g.importCropImageFrame()
    return { shape: g.importDraft.shape, sub: g.importDraft.sub, srcHead: g.importDraft.src.slice(0, 22),
      sourceW: g.importDraft.sourceW, sourceH: g.importDraft.sourceH,
      crop: { x: Math.round(g.importCrop.x), y: Math.round(g.importCrop.y), w: Math.round(g.importCrop.w), h: Math.round(g.importCrop.h) },
      frame: { x: Math.round(frame.x), y: Math.round(frame.y), w: Math.round(frame.w), h: Math.round(frame.h) },
      btn: (document.querySelector('.import-ai-btn') || {}).textContent }
  })
  console.log('after:', JSON.stringify(after))
  await page.screenshot({ path: '/tmp/cutout-after.png' })

  const assert = (name, ok) => { console.log((ok ? 'PASS' : 'FAIL') + ' ' + name); if (!ok) process.exitCode = 1 }
  assert('src became PNG data URL', after.srcHead.startsWith('data:image/png'))
  assert('selection covers full frame (rect) or inscribed (circle)',
    after.shape === 'circle'
      ? Math.abs(after.crop.w - Math.min(after.frame.w, after.frame.h)) <= 2
      : Math.abs(after.crop.w - after.frame.w) <= 2 && Math.abs(after.crop.h - after.frame.h) <= 2)
  assert('button shows 还原原图', /还原原图/.test(after.btn || ''))

  // 还原
  await page.tap('.import-ai-btn')
  await sleep(1200)
  const restored = await page.evaluate(() => {
    const g = window.__gooda
    return { shape: g.importDraft.shape, sub: g.importDraft.sub, srcHead: g.importDraft.src.slice(0, 22),
      crop: { x: Math.round(g.importCrop.x), y: Math.round(g.importCrop.y), w: Math.round(g.importCrop.w), h: Math.round(g.importCrop.h) },
      btn: (document.querySelector('.import-ai-btn') || {}).textContent }
  })
  console.log('restored:', JSON.stringify(restored))
  await page.screenshot({ path: '/tmp/cutout-restored.png' })
  assert('restore: src back to original', restored.srcHead === before.srcHead)
  assert('restore: shape/sub back', restored.shape === before.shape && restored.sub === before.sub)
  assert('restore: crop back', Math.abs(restored.crop.x - before.crop.x) <= 2 && Math.abs(restored.crop.w - before.crop.w) <= 2)
  assert('restore: button back to 智能识别', /智能识别/.test(restored.btn || ''))

  await browser.close(); server.close()
})().catch((e) => { console.error(e); process.exit(1) })
