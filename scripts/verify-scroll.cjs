// Material-shelf scroll net (H5): a flick must keep gliding after release (momentum)
// and the thin scrollbar must appear while scrolling. Guards the regression where an
// undefined constant threw in endGesture before startMomentum ever ran (momentum
// silently dead). Usage: node scripts/verify-scroll.cjs (needs a fresh build:h5)
const http = require('http')
const fs = require('fs')
const path = require('path')
const loadPuppeteer = require('./_puppeteer.cjs')

const DIST = path.join(__dirname, '..', 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' }
function serve(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]); if (p === '/') p = '/index.html'
      const file = path.join(dir, p)
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end('nf'); return }
      res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream')
      fs.createReadStream(file).pipe(res)
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const RED = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

;(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/ missing — run npm run build:h5')
  const puppeteer = loadPuppeteer()
  const server = await serve(DIST)
  const port = server.address().port
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, hasTouch: true })
  await page.goto(`http://127.0.0.1:${port}/index.html#/pages/index/index`, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction(() => !!window.__gooda, { timeout: 20000 })

  // Inject enough material to make the grid long/scrollable.
  await page.evaluate((src) => {
    const g = window.__gooda
    const now = Date.now()
    for (let i = 0; i < 40; i++) g.userAssets.value.push({ id: 'F' + i, type: '谷子', sub: '吧唧', label: 'x' + i, color: '#ccddee', w: 56, h: 56, shape: 'circle', src, source: 'import', createdAt: now - i, updatedAt: now - i })
    g.category.value = '谷子'
  }, RED)
  await sleep(600)

  const res = await page.evaluate(async () => {
    const grid = document.querySelector('.grid')
    const r = grid.getBoundingClientRect()
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.6
    const ty = () => { const m = document.querySelector('.grid-inner').style.transform; const mm = /-?\d+(\.\d+)?/.exec(m); return mm ? parseFloat(mm[0]) : 0 }
    const T = (type, y, list) => { const t = new Touch({ identifier: 1, target: grid, clientX: cx, clientY: y }); return new TouchEvent(type, { touches: list ? [t] : [], changedTouches: [t], bubbles: true, cancelable: true }) }
    grid.dispatchEvent(T('touchstart', cy, true))
    let y = cy
    for (let i = 0; i < 6; i++) { y -= 30; grid.dispatchEvent(T('touchmove', y, true)); await new Promise((r) => setTimeout(r, 8)) }
    // scrollbar should be visible mid-scroll
    const bar = document.querySelector('.grid-scrollbar')
    const barShown = !!bar && bar.className.includes('on') && parseFloat(getComputedStyle(bar).opacity) > 0.1
    grid.dispatchEvent(T('touchend', y, false))
    const release = ty()
    await new Promise((r) => setTimeout(r, 150)); const mid = ty()
    await new Promise((r) => setTimeout(r, 300)); const settle = ty()
    return { barShown, release, mid, settle }
  })

  const glided = res.settle < res.release - 20
  const glidePx = Math.round(res.release - res.settle)
  console.log('scrollbar mid-scroll:', res.barShown ? 'VISIBLE ✓' : 'MISSING ✗')
  console.log('momentum:', JSON.stringify(res), glided ? `GLIDES ✓ (+${glidePx}px after release)` : 'NO GLIDE ✗')
  const pass = res.barShown && glided
  console.log(pass ? '\nPASS: shelf momentum + scrollbar' : '\nFAIL: scroll UX regression')
  await browser.close(); server.close(); process.exit(pass ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(1) })
