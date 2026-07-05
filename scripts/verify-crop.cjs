// WYSIWYG crop regression: import a red|blue split image, crop the RIGHT half, and
// assert BOTH the shelf card preview and the stage layer render blue at their center
// (i.e. the shelf card shows the actual cropped region, matching the stage).
//
// Note: this runs on the H5 build. The percentage-branch bug it guards against only
// *mis-renders* on the Dimina mini-program runtime; on H5 both branches look right.
// So this test proves the shelf card is geometrically correct + does not regress H5;
// the Dimina fix rests on the card now using the same px technique the stage uses.
//
// Usage: node scripts/verify-crop.cjs   (requires a built dist/, run `npm run build:h5` first)
const http = require('http')
const fs = require('fs')
const path = require('path')

const loadPuppeteer = require('./_puppeteer.cjs')

const DIST = path.join(__dirname, '..', 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }

function serve(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0].split('#')[0])
      if (p === '/') p = '/index.html'
      const file = path.join(dir, p)
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.statusCode = 404; res.end('nf'); return
      }
      res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream')
      fs.createReadStream(file).pipe(res)
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function centerColorOf(browser, buf) {
  const p = await browser.newPage()
  const rgb = await p.evaluate(async (dataUrl) => {
    const img = new Image(); img.src = dataUrl; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data
    return [d[0], d[1], d[2]]
  }, 'data:image/png;base64,' + buf.toString('base64'))
  await p.close()
  return rgb
}
const isBlue = ([r, g, b]) => b > 140 && r < 110 && g < 110
const isRed = ([r, g, b]) => r > 140 && g < 110 && b < 110

;(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/ missing — run npm run build:h5')
  const puppeteer = loadPuppeteer()
  const server = await serve(DIST)
  const port = server.address().port
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  await page.goto(`http://127.0.0.1:${port}/index.html#/pages/index/index`, { waitUntil: 'networkidle2', timeout: 60000 })

  // wait for the test hook
  await page.waitForFunction(() => !!window.__gooda, { timeout: 20000 })

  // Inject a red|blue split asset cropped to the RIGHT (blue) half, and place it on stage.
  await page.evaluate(async () => {
    const g = window.__gooda
    const c = document.createElement('canvas'); c.width = 200; c.height = 100
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 100, 100)
    ctx.fillStyle = '#0000ff'; ctx.fillRect(100, 0, 100, 100)
    const src = c.toDataURL('image/png')
    const crop = { nx: 0.5, ny: 0, nw: 0.5, nh: 1 } // right half → blue, aspect 1:1
    const now = Date.now()
    const asset = {
      id: 'test_blue', type: '谷子', sub: '其他', label: '测试', color: '#fff',
      w: 64, h: 64, shape: 'rect', src, crop, source: 'import', createdAt: now, updatedAt: now,
    }
    g.userAssets.value.unshift(asset)
    g.category.value = '谷子'
    g.subCat.value = '全部'
    g.addLayer({ type: '谷子', label: '测试', color: '#fff', w: 64, h: 64, shape: 'rect', src, crop, assetId: 'test_blue', sub: '其他' })
  })
  await sleep(900)

  const shelfEl = await page.$('.cell-crop')
  const stageEl = await page.$('.layer .layer-img')
  if (!shelfEl) throw new Error('shelf .cell-crop not found (asset did not render as crop card)')
  if (!stageEl) throw new Error('stage .layer-img not found (layer not placed)')

  const shelfColor = await centerColorOf(browser, await shelfEl.screenshot())
  const stageColor = await centerColorOf(browser, await stageEl.screenshot())

  await page.screenshot({ path: '/tmp/verify-crop.png' })

  console.log('shelf card center RGB:', shelfColor, isBlue(shelfColor) ? 'BLUE ✓' : isRed(shelfColor) ? 'RED ✗ (showing wrong half)' : 'other ✗')
  console.log('stage layer center RGB:', stageColor, isBlue(stageColor) ? 'BLUE ✓' : isRed(stageColor) ? 'RED ✗' : 'other ✗')
  if (errors.length) { console.log('PAGE ERRORS:'); errors.slice(0, 8).forEach((e) => console.log('  ' + e)) }

  // Focus A round-trip: open the editor from the stored asset and save immediately.
  // The stored crop must survive (not be reset to the default/whole image).
  const cropAfter = await page.evaluate(async () => {
    const g = window.__gooda
    const before = g.userAssets.value.find((a) => a.id === 'test_blue').crop
    const p = g.openImportEditorFromAsset(g.userAssets.value.find((a) => a.id === 'test_blue'))
    if (p && p.then) await p                 // now awaited end-to-end (Focus A fix)
    await g.confirmImportEditor()            // immediate save
    const after = g.userAssets.value.find((a) => a.id === 'test_blue').crop
    return { before: before ? { ...before } : before, after: after ? { ...after } : after }
  })
  console.log('crop before edit:', JSON.stringify(cropAfter.before))
  const rt = cropAfter.after || {}
  const roundTripOk = Math.abs(rt.nx - 0.5) < 0.05 && Math.abs(rt.nw - 0.5) < 0.06 && Math.abs(rt.nh - 1) < 0.06
  console.log('crop round-trip after edit+save:', JSON.stringify(rt), roundTripOk ? 'PRESERVED ✓' : 'OVERWRITTEN ✗')
  if (errors.length) { console.log('PAGE ERRORS:'); errors.slice(0, 8).forEach((e) => console.log('  ' + e)) }

  // Import-editor DOM render: re-open the editor and confirm its key nodes actually
  // render with non-zero size. Guards the import-editor template wiring (e.g. after
  // extracting it into a component) — a broken binding would drop these nodes.
  const editorDom = await page.evaluate(async () => {
    const g = window.__gooda
    const p = g.openImportEditorFromAsset(g.userAssets.value.find((a) => a.id === 'test_blue'))
    if (p && p.then) await p
    await new Promise((r) => setTimeout(r, 400))
    const rectOf = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } }
    return {
      stage: rectOf('.import-editor-crop-stage'),
      outline: rectOf('.import-crop-outline'),
      brightImg: rectOf('.import-editor-crop-img.bright'),
      resizeHandle: rectOf('.import-crop-resize'),
    }
  })
  const domOk = !!(editorDom.stage && editorDom.stage.w > 20 && editorDom.outline && editorDom.outline.w > 5
    && editorDom.brightImg && editorDom.brightImg.w > 5 && editorDom.resizeHandle)
  console.log('import editor DOM:', JSON.stringify(editorDom), domOk ? 'RENDERED ✓' : 'MISSING ✗')

  // Event wiring: drive the editor's controls via the DOM and confirm the emitted
  // events reach the page handlers (guards the ImportCropEditor component extraction).
  const wiring = await page.evaluate(async () => {
    const g = window.__gooda
    const fire = (el, type, init) => el && el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }))
    // shape tab → set-shape
    const circleTab = document.querySelector('.import-editor-shape.circle')
    if (circleTab) fire(circleTab, 'click') || circleTab.click()
    await new Promise((r) => setTimeout(r, 60))
    const shapeOk = g.importDraft.shape === 'circle'
    // label input → label-input
    const input = document.querySelector('.import-editor-input')
    if (input) { input.value = '测试名'; input.dispatchEvent(new Event('input', { bubbles: true })) }
    await new Promise((r) => setTimeout(r, 60))
    const labelOk = g.importDraft.label === '测试名'
    // resize handle drag → handle-mouse-down + bindWindowMouseDrag → importCrop changes
    const handle = document.querySelector('.import-crop-resize')
    const w0 = g.importCrop.w
    if (handle) {
      const r = handle.getBoundingClientRect()
      fire(handle, 'mousedown', { clientX: r.left + 2, clientY: r.top + 2 })
      fire(window, 'mousemove', { clientX: r.left + 40, clientY: r.top + 40 })
      fire(window, 'mouseup', { clientX: r.left + 40, clientY: r.top + 40 })
    }
    await new Promise((r) => setTimeout(r, 60))
    const dragOk = Math.abs(g.importCrop.w - w0) > 1
    return { shapeOk, labelOk, dragOk }
  })
  // labelOk is informational only: Taro's H5 <input> fills event.detail.value via its
  // own wrapper, which a synthetic native input event can't reproduce. shape + drag
  // (set-shape, handle-mouse-down, bindWindowMouseDrag) are the real wiring gates.
  const wiringOk = wiring.shapeOk && wiring.dragOk
  console.log('import editor wiring:', JSON.stringify(wiring), wiringOk ? 'OK ✓ (label check informational)' : 'BROKEN ✗')
  if (errors.length) { console.log('PAGE ERRORS:'); errors.slice(0, 8).forEach((e) => console.log('  ' + e)) }

  const pass = isBlue(shelfColor) && isBlue(stageColor) && roundTripOk && domOk && wiringOk
  console.log(pass ? '\nPASS: shelf/stage match + crop preserved + import editor renders & wired' : '\nFAIL: crop regression')
  await browser.close()
  server.close()
  process.exit(pass ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(1) })
