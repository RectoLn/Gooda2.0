// Drive our app in the REAL Dimina web runtime (headless) for verification.
// Prereq: Dimina dev server running at http://localhost:5173 with our bundle
// deployed (scripts/dimina-redeploy.sh). Screenshots the running mini-program.
// Usage: node scripts/dimina-test.cjs [outPng]
const puppeteer = require('./_puppeteer.cjs')()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = process.argv[2] || '/tmp/dimina-app.png'
const DIMINA_URL = process.env.DIMINA_URL || 'http://localhost:5173/'
;(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  const pg = await b.newPage()
  await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  pg.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 160)))
  pg.on('console', (m) => { const t = m.text(); if (/error|fail|exception/i.test(t)) console.log('C', t.slice(0, 160)) })
  await pg.goto(DIMINA_URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(2000)
  await pg.evaluate(() => { const it = document.querySelector('.dimina-app__mini-used-list-item'); if (it) it.click() })
  await sleep(9000)
  // the mini-app renders in a webview iframe
  const frame = pg.frames().find((f) => f.url().includes('pageFrame') || f !== pg.mainFrame())
  let appText = '(no frame)'
  if (frame) {
    try { appText = (await frame.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200))) } catch (e) { appText = 'frame err: ' + e.message }
  }
  console.log('frames:', pg.frames().length, '| app text:', appText)
  await pg.screenshot({ path: OUT })
  console.log('screenshot ->', OUT)
  await b.close()
})().catch((e) => { console.error(e.message); process.exit(1) })
