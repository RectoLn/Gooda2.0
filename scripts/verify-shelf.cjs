// Screenshot the 3 shelf states (collapsed / open / tall) in the H5 build by
// swiping vertically on the stage-wrap background. Serves dist at :10099.
const puppeteer = require('./_puppeteer.cjs')()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const URL = process.env.RENDER_URL || 'http://localhost:10099/index.html'

async function swipe(page, sel, dy) {
  await page.evaluate((sel, dy) => {
    const el = document.querySelector(sel)
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const y0 = r.top + Math.min(60, r.height / 2)
    const mk = (type, y) => new MouseEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: y })
    el.dispatchEvent(mk('mousedown', y0))
    for (let i = 1; i <= 6; i++) window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: cx, clientY: y0 + (dy * i) / 6 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: cx, clientY: y0 + dy }))
  }, sel, dy)
}

;(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  const pg = await b.newPage()
  await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  pg.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 160)))
  await pg.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(2500)
  const state = () => pg.evaluate(() => {
    const p = document.querySelector('.page')
    return { tall: p.classList.contains('shelf-tall'), collapsed: p.classList.contains('pure-view'),
      backdrop: !!document.querySelector('.shelf-backdrop.show') }
  })
  await pg.screenshot({ path: '/tmp/shelf-1-open.png' }); console.log('open:', JSON.stringify(await state()))
  // swipe up on the stage background -> open -> tall
  await swipe(pg, '.stage-wrap', -120); await sleep(700)
  await pg.screenshot({ path: '/tmp/shelf-2-tall.png' }); console.log('after up:', JSON.stringify(await state()))
  // swipe down -> tall -> open
  await swipe(pg, '.stage-wrap', 120); await sleep(700)
  await pg.screenshot({ path: '/tmp/shelf-3-open.png' }); console.log('after down:', JSON.stringify(await state()))
  // swipe down again -> open -> collapsed
  await swipe(pg, '.stage-wrap', 120); await sleep(700)
  await pg.screenshot({ path: '/tmp/shelf-4-collapsed.png' }); console.log('after down2:', JSON.stringify(await state()))
  await b.close()
})().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
