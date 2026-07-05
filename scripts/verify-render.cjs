const puppeteer = require('./_puppeteer.cjs')()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const RENDER_URL = process.env.RENDER_URL || 'http://localhost:10099/index.html'
;(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE.ERR: ' + m.text().slice(0, 160)) })
  await page.goto(RENDER_URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(2500)
  const info = await page.evaluate(() => {
    const q = (s) => document.querySelector(s)
    return {
      hasApp: !!q('#app') && q('#app').children.length > 0,
      cellPlus: !!q('.cell-plus'),
      matShelf: !!q('.cats') || !!q('[class*=cat]'),
      stageArea: !!q('[class*=stage]') || !!q('[class*=canvas]'),
      bodyText: (document.body.innerText || '').slice(0, 120),
      appHtmlLen: q('#app') ? q('#app').innerHTML.length : 0,
    }
  })
  console.log('RENDER INFO', JSON.stringify(info, null, 2))
  console.log('ERRORS (' + errors.length + '):')
  errors.slice(0, 15).forEach((e) => console.log('  ' + e))
  await page.screenshot({ path: '/tmp/v2-render.png' })
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
