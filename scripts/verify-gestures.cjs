// Gesture smoke net (H5, real mouse events). The layer drag / rotate MOUSE paths
// share the exact position/rotation math with the TOUCH paths, so exercising mouse
// here guards a gesture refactor (touch precision itself is a manual device check).
// Usage: node scripts/verify-gestures.cjs   (needs a fresh `npm run build:h5`)
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

;(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/ missing — run npm run build:h5')
  const puppeteer = loadPuppeteer()
  const server = await serve(DIST)
  const port = server.address().port
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: false, hasTouch: false })
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  await page.goto(`http://127.0.0.1:${port}/index.html#/pages/index/index`, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction(() => !!window.__gooda, { timeout: 20000 })

  // place a layer at the window centre
  await page.evaluate(() => {
    const g = window.__gooda
    g.addLayer({ type: '谷子', label: 'g', color: '#7799ff', w: 64, h: 64, shape: 'rect' })
  })
  await sleep(300)

  const before = await page.evaluate(() => { const l = window.__gooda.doc.layers.slice(-1)[0]; return { x: l.x, y: l.y, rot: l.rotation } })

  // --- drag the layer via mouse ---
  const layerBox = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.layer')].filter((e) => !e.className.includes('board'))
    const el = els.slice(-1)[0]; if (!el) return null
    const r = el.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
  })
  if (!layerBox) throw new Error('.layer not found')
  await page.mouse.move(layerBox.cx, layerBox.cy)
  await page.mouse.down()
  await page.mouse.move(layerBox.cx + 40, layerBox.cy + 30, { steps: 6 })
  await page.mouse.up()
  await sleep(200)
  const afterDrag = await page.evaluate(() => { const l = window.__gooda.doc.layers.slice(-1)[0]; return { x: l.x, y: l.y } })
  const dragOk = Math.abs(afterDrag.x - before.x) > 10 && Math.abs(afterDrag.y - before.y) > 5

  // --- rotate via the rotate handle (move TANGENTIALLY around the layer centre) ---
  const rotGeo = await page.evaluate(() => {
    const h = document.querySelector('.handle-rotate')
    const sel = document.querySelector('.selection-overlay')
    if (!h || !sel) return null
    const hr = h.getBoundingClientRect(); const sr = sel.getBoundingClientRect()
    return { hx: hr.left + hr.width / 2, hy: hr.top + hr.height / 2, cx: sr.left + sr.width / 2, cy: sr.top + sr.height / 2 }
  })
  let rotateOk = false
  if (rotGeo) {
    const vx = rotGeo.hx - rotGeo.cx, vy = rotGeo.hy - rotGeo.cy
    const len = Math.hypot(vx, vy) || 1
    const tx = -vy / len, ty = vx / len // unit tangent (perpendicular)
    await page.mouse.move(rotGeo.hx, rotGeo.hy)
    await page.mouse.down()
    await page.mouse.move(rotGeo.hx + tx * 60, rotGeo.hy + ty * 60, { steps: 8 })
    await page.mouse.up()
    await sleep(200)
    const afterRot = await page.evaluate(() => window.__gooda.doc.layers.slice(-1)[0].rotation)
    rotateOk = Math.abs(afterRot - before.rot) > 1
  }

  // --- swipe outside the canvas (stage-wrap top band) to toggle the drawer ---
  const collapsedClass = () => page.evaluate(() => document.querySelector('.page').className.includes('pure-view'))
  const wrap = await page.evaluate(() => { const el = document.querySelector('.stage-wrap'); if (!el) return null; const r = el.getBoundingClientRect(); return { cx: r.left + r.width / 2, top: r.top } })
  let swipeOk = false
  if (wrap) {
    const px = wrap.cx, py = wrap.top + 14
    const wasCollapsed = await collapsedClass()
    // swipe down → collapse
    await page.mouse.move(px, py); await page.mouse.down(); await page.mouse.move(px, py + 80, { steps: 8 }); await page.mouse.up(); await sleep(250)
    const afterDown = await collapsedClass()
    // swipe up → expand
    await page.mouse.move(px, py + 80); await page.mouse.down(); await page.mouse.move(px, py, { steps: 8 }); await page.mouse.up(); await sleep(250)
    const afterUp = await collapsedClass()
    swipeOk = afterDown === true && afterUp === false
    console.log('drawer swipe:', JSON.stringify({ wasCollapsed, afterDown, afterUp }), swipeOk ? 'DOWN→close, UP→open ✓' : 'BROKEN ✗')
  }

  await page.screenshot({ path: '/tmp/verify-gestures.png' })
  console.log('layer drag:', JSON.stringify({ before, afterDrag }), dragOk ? 'MOVED ✓' : 'STUCK ✗')
  console.log('layer rotate:', rotGeo ? (rotateOk ? 'ROTATED ✓' : 'STUCK ✗') : 'handle not found ✗')
  if (errors.length) { console.log('PAGE ERRORS:'); errors.slice(0, 6).forEach((e) => console.log('  ' + e)) }
  const pass = dragOk && rotateOk && swipeOk
  console.log(pass ? '\nPASS: layer drag + rotate + drawer swipe work' : '\nFAIL: gesture regression')
  await browser.close(); server.close(); process.exit(pass ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(1) })
