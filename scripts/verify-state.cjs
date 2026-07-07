// State safety net (H5): undo/redo snapshot round-trip + user-asset persistence
// hydration. These two paths carry real data-loss risk (history stack corruption,
// assets vanishing on reload) yet had NO automated coverage. Persistence also
// re-exercises the P1-extracted guessAssetShape/defaultAssetSize used during load.
//
// Usage: node scripts/verify-state.cjs   (needs a fresh `npm run build:h5`)
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
// 1x1 red PNG — a valid data URL so persist/kv-store treat it like a real asset.
const RED_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

;(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/ missing — run npm run build:h5')
  const puppeteer = loadPuppeteer()
  const server = await serve(DIST)
  const port = server.address().port
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  await page.goto(`http://127.0.0.1:${port}/index.html#/pages/index/index`, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction(() => !!window.__gooda, { timeout: 20000 })

  // ---------- 1) undo / redo snapshot round-trip ----------
  const hist = await page.evaluate(async () => {
    const g = window.__gooda
    const mat = () => ({ type: '谷子', label: 'h', color: '#7799ff', w: 40, h: 40, shape: 'rect' })
    const len = () => g.doc.layers.length
    const lastId = () => (g.doc.layers.slice(-1)[0] || {}).id
    const n0 = len()
    g.addLayer(mat()); const idA = lastId()
    g.addLayer(mat()); const idB = lastId()
    const afterAdd = len()
    g.undo(); const undo1 = { len: len(), last: lastId() }   // B removed → A on top
    g.undo(); const undo2 = { len: len() }                   // back to baseline
    g.redo(); const redo1 = { len: len(), last: lastId() }   // A back
    g.redo(); const redo2 = { len: len(), last: lastId() }   // B back
    // redo stack must clear after a fresh mutation
    g.undo()                                                  // drop B → len n0+1
    g.addLayer(mat()); const idC = lastId()                  // new branch, redo cleared
    const afterBranch = len()
    g.redo(); const redoAfterBranch = len()                  // no-op (stack empty)
    return { n0, afterAdd, idA, idB, undo1, undo2, redo1, redo2, idC, afterBranch, redoAfterBranch }
  })
  const historyOk =
    hist.afterAdd === hist.n0 + 2 &&
    hist.undo1.len === hist.n0 + 1 && hist.undo1.last === hist.idA &&
    hist.undo2.len === hist.n0 &&
    hist.redo1.len === hist.n0 + 1 && hist.redo1.last === hist.idA &&
    hist.redo2.len === hist.n0 + 2 && hist.redo2.last === hist.idB &&
    hist.afterBranch === hist.n0 + 2 && hist.idC && hist.idC !== hist.idB &&
    hist.redoAfterBranch === hist.afterBranch // redo cleared by the branch commit
  console.log('undo/redo:', JSON.stringify(hist), historyOk ? 'ROUND-TRIP + redo-clear ✓' : 'BROKEN ✗')

  // ---------- 2) user-asset persistence hydration ----------
  const persist = await page.evaluate(async (src) => {
    const g = window.__gooda
    const id = 'TEST-PERSIST-1'
    const asset = {
      id, type: '谷子', sub: '吧唧', label: '持久化测试', color: '#abcdef',
      w: 80, h: 80, shape: 'circle', src, crop: { nx: 0.1, ny: 0.2, nw: 0.5, nh: 0.6 },
      source: 'import', createdAt: Date.now(), updatedAt: Date.now(),
    }
    g.userAssets.value.push(asset)
    await g.persistUserAssets()
    // wipe in-memory, then reload purely from storage + kv-store (the real cold path)
    g.userAssets.value.splice(0, g.userAssets.value.length)
    const clearedLen = g.userAssets.value.length
    await g.loadUserAssets()
    const back = g.userAssets.value.find((a) => a.id === id)
    return {
      clearedLen,
      found: !!back,
      srcOk: !!back && back.src === src,          // re-injected from kv-store
      shape: back && back.shape,
      sub: back && back.sub,
      w: back && back.w,
      cropOk: !!back && JSON.stringify(back.crop) === JSON.stringify({ nx: 0.1, ny: 0.2, nw: 0.5, nh: 0.6 }),
    }
  }, RED_PNG)
  const persistOk = persist.clearedLen === 0 && persist.found && persist.srcOk &&
    persist.shape === 'circle' && persist.sub === '吧唧' && persist.w === 80 && persist.cropOk
  console.log('persistence:', JSON.stringify(persist), persistOk ? 'SAVE→LOAD hydrated ✓' : 'BROKEN ✗')

  if (errors.length) { console.log('PAGE ERRORS:'); errors.slice(0, 6).forEach((e) => console.log('  ' + e)) }
  const pass = historyOk && persistOk
  console.log(pass ? '\nPASS: undo/redo round-trip + asset persistence hydration' : '\nFAIL: state regression')
  await browser.close(); server.close(); process.exit(pass ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(1) })
