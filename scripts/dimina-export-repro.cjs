// Reproduce the native export flow in the REAL Dimina web runtime (headless).
// Loads the mini-app, taps the export (download) button, and captures ALL
// console/errors from every frame — especially the render frame where
// canvasToTempFilePath / image loading run — so we can see the true failure.
// Prereq: Dimina dev server at http://localhost:5173 with our bundle deployed
// (scripts/dimina-redeploy.sh). Usage: node scripts/dimina-export-repro.cjs
const puppeteer = require('./_puppeteer.cjs')()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const DIMINA_URL = process.env.DIMINA_URL || 'http://localhost:5173/'
const OUT = process.argv[2] || '/tmp/dimina-export.png'

;(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  const pg = await b.newPage()
  await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const log = (tag, t) => console.log(tag, String(t).slice(0, 300))
  pg.on('pageerror', (e) => log('PAGEERR', e.message))
  // capture console from main page AND all child frames/workers
  pg.on('console', (m) => log('C', m.text()))
  pg.on('workercreated', (w) => log('WORKER+', w.url()))
  await pg.goto(DIMINA_URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(1500)
  // attach console listeners to workers (service layer runs in a web worker)
  const targets = b.targets()
  for (const t of targets) {
    if (t.type() === 'other' || t.type() === 'worker') {
      try {
        const w = await t.worker()
        if (w) w.on('console', (m) => log('SVC', m.text()))
      } catch (_) {}
    }
  }
  b.on('targetcreated', async (t) => {
    try { const w = await t.worker(); if (w) w.on('console', (m) => log('SVC', m.text())) } catch (_) {}
  })
  // open our mini-app from the launcher
  await pg.evaluate(() => { const it = document.querySelector('.dimina-app__mini-used-list-item'); if (it) it.click() })
  await sleep(8000)
  // find the render frame (the mini-app webview)
  const frames = pg.frames()
  console.log('frames:', frames.length)
  let appFrame = null
  for (const f of frames) {
    try {
      const hit = await f.evaluate(() => !!document.querySelector('.export-btn, .topbar'))
      if (hit) { appFrame = f; break }
    } catch (_) {}
  }
  if (!appFrame) { console.log('!! app frame not found'); await pg.screenshot({ path: OUT }); await b.close(); return }
  console.log('app frame url:', appFrame.url().slice(0, 80))
  // tap the export button
  const tapped = await appFrame.evaluate(() => {
    const el = document.querySelector('.export-btn')
    if (!el) return 'no-export-btn'
    const r = el.getBoundingClientRect()
    const opts = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }
    el.dispatchEvent(new TouchEvent('touchstart', opts))
    el.dispatchEvent(new TouchEvent('touchend', opts))
    el.dispatchEvent(new MouseEvent('click', opts))
    return 'tapped'
  })
  console.log('export tap:', tapped)
  await sleep(6000)
  // did the export preview open?
  const state = await appFrame.evaluate(() => ({
    preview: !!document.querySelector('.export-preview, .result-preview, [class*="preview"]'),
    toast: (document.querySelector('.taro-toast__content, [class*="toast"]')?.textContent || '').slice(0, 60),
    body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
  })).catch((e) => ({ err: e.message }))
  console.log('after-export state:', JSON.stringify(state))
  await pg.screenshot({ path: OUT })
  console.log('screenshot ->', OUT)
  await b.close()
})().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
