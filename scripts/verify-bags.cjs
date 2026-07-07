// Bag back-panel net (H5): for every 痛包, the no-board state must show that bag's
// own back panel filling the editing window.
//
// The real bug shows on the Dimina renderer, where percentage left/top/width/height
// on a nested <image> does not resolve → the back-fill collapses to an empty window.
// H5 can't reproduce that (a mis-positioned uniform panel still covers the window),
// so this guard asserts BOTH:
//   1) the .bag-back-fill inline geometry is px-based (not %) — the Dimina-safe form,
//   2) the window centre is an opaque light panel on H5 (catches gross breakage).
// Usage: node scripts/verify-bags.cjs (needs build:h5)
const http = require('http')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
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

// Minimal PNG centre-pixel reader (RGBA, no deps beyond zlib).
function centrePixel(buf) {
  // IHDR
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const bitDepth = buf[24]
  const colorType = buf[25]
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) throw new Error(`unexpected PNG fmt depth=${bitDepth} color=${colorType}`)
  const channels = colorType === 6 ? 4 : 3
  // collect IDAT
  let idat = []
  let off = 8
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    if (type === 'IDAT') idat.push(buf.slice(off + 8, off + 8 + len))
    off += 12 + len
    if (type === 'IEND') break
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels + 1
  const recon = Buffer.alloc(width * height * channels)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * stride]
    for (let x = 0; x < width * channels; x++) {
      const rawIdx = y * stride + 1 + x
      const a = x >= channels ? recon[y * width * channels + x - channels] : 0
      const b = y > 0 ? recon[(y - 1) * width * channels + x] : 0
      const c = (x >= channels && y > 0) ? recon[(y - 1) * width * channels + x - channels] : 0
      let v = raw[rawIdx]
      if (filter === 1) v = (v + a) & 255
      else if (filter === 2) v = (v + b) & 255
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255 }
      recon[y * width * channels + x] = v
    }
  }
  const cx = Math.floor(width / 2), cy = Math.floor(height / 2)
  const i = (cy * width + cx) * channels
  return { r: recon[i], g: recon[i + 1], b: recon[i + 2], a: channels === 4 ? recon[i + 3] : 255 }
}

;(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/ missing — run npm run build:h5')
  const puppeteer = loadPuppeteer()
  const server = await serve(DIST)
  const port = server.address().port
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
  await page.goto(`http://127.0.0.1:${port}/index.html#/pages/index/index`, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction(() => !!window.__gooda, { timeout: 20000 })

  // no-board state + 痛包 category so the shelf lists bags
  await page.evaluate(() => { window.__gooda.category.value = '痛包' })
  await sleep(300)

  // Bag cards are thumbnail-only (no label text); order matches the `bags` catalog.
  // They bind @mousedown/@touchstart (tap-vs-drag), NOT @tap — so a plain .click()
  // is a no-op; drive a real mouse down+up at the card centre to select the bag.
  const bags = ['丹宁包', '蝴蝶结包', '白手提箱']
  const results = []
  for (let idx = 0; idx < bags.length; idx++) {
    const label = bags[idx]
    const cardBox = await page.evaluate((i) => {
      const cards = [...document.querySelectorAll('.cell-card')]
      if (!cards[i]) return null
      const r = cards[i].getBoundingClientRect()
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
    }, idx)
    let clicked = false
    if (cardBox) {
      await page.mouse.move(cardBox.cx, cardBox.cy)
      await page.mouse.down()
      await page.mouse.up()
      clicked = true
    }
    await sleep(350)
    const probe = await page.evaluate(() => {
      const win = document.querySelector('.window')
      const bf = document.querySelector('.bag-back-fill')
      if (!win || !bf) return null
      const r = win.getBoundingClientRect()
      return { box: { x: r.left, y: r.top, width: r.width, height: r.height }, style: bf.getAttribute('style') || '' }
    })
    if (!clicked || !probe) { results.push({ label, ok: false, reason: clicked ? 'no .window/.bag-back-fill' : 'card not found' }); continue }
    // Dimina-safe geometry must be px, never %.
    const pxOk = /\bwidth:\s*[\d.]+px/.test(probe.style) && !probe.style.includes('%')
    const shot = await page.screenshot({ clip: probe.box, omitBackground: false })
    const px = centrePixel(shot)
    // Back panel is a light cream/white fabric → all channels high & opaque.
    // A broken (empty) window shows the page water background (bluish) or transparent.
    const light = px.a > 200 && px.r > 200 && px.g > 200 && px.b > 195
    results.push({ label, ok: pxOk && light, px, pxOk })
  }

  let pass = true
  for (const r of results) {
    if (!r.ok) pass = false
    const detail = r.px ? `px:${r.pxOk ? '✓' : '✗'} rgba(${r.px.r},${r.px.g},${r.px.b},${r.px.a})` : r.reason
    console.log(`${r.ok ? '✓' : '✗'} ${r.label}: ${detail} ${r.ok ? '背板铺满窗口(px)' : '背板异常'}`)
  }
  console.log(pass ? '\nPASS: 所有痛包无底板状态背板正常' : '\nFAIL: 有痛包背板为空')
  await browser.close(); server.close(); process.exit(pass ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(1) })
