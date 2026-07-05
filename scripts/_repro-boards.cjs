// Quick H5 repro: switch to 底板 category, screenshot the shelf grid + the 星空 card,
// and report each board card's rendered box vs its image so we can see centering.
const http = require('http'); const fs = require('fs'); const path = require('path')
const loadPuppeteer = require('./_puppeteer.cjs')
const DIST = path.join(__dirname, '..', 'dist')
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg' }
function serve(dir){return new Promise(r=>{const s=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0].split('#')[0]);if(p==='/')p='/index.html';const f=path.join(dir,p);if(!f.startsWith(dir)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.statusCode=404;return res.end('nf')}res.setHeader('content-type',MIME[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(res)});s.listen(0,'127.0.0.1',()=>r(s))})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
;(async()=>{
  const puppeteer=loadPuppeteer(); const server=await serve(DIST); const port=server.address().port
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']}); const pg=await b.newPage()
  await pg.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true})
  await pg.goto(`http://127.0.0.1:${port}/index.html#/pages/index/index`,{waitUntil:'networkidle2',timeout:60000})
  await pg.waitForFunction(()=>!!window.__gooda,{timeout:20000})
  await pg.evaluate(()=>{window.__gooda.category.value='底板';window.__gooda.subCat.value='全部'})
  await sleep(700)
  const info=await pg.evaluate(()=>{
    const cards=[...document.querySelectorAll('.cell')].map(cell=>{
      const label=cell.querySelector('.cell-label')?.textContent||''
      const thumb=cell.querySelector('.cell-board-box, .cell-board-thumb, .cell-thumb, .cell-none, .cell-block')
      if(!thumb) return {label, kind:'?'}
      const r=thumb.getBoundingClientRect(); const cardR=cell.querySelector('.cell-card').getBoundingClientRect()
      const cs=getComputedStyle(thumb)
      return {label, cls:thumb.className, w:Math.round(r.width), h:Math.round(r.height),
        offX:Math.round(r.left-cardR.left), offY:Math.round(r.top-cardR.top),
        cardW:Math.round(cardR.width), bgSize:cs.backgroundSize, bgPos:cs.backgroundPosition}
    })
    return cards
  })
  console.log(JSON.stringify(info,null,2))
  await pg.screenshot({path:'/tmp/repro-boards.png'})
  const star=await pg.$$eval('.cell',cells=>{const i=cells.findIndex(c=>c.querySelector('.cell-label')?.textContent==='星空');return i})
  if(star>=0){const el=(await pg.$$('.cell'))[star]; await el.screenshot({path:'/tmp/repro-star-card.png'})}
  console.log('screenshots: /tmp/repro-boards.png , /tmp/repro-star-card.png  (star idx', star, ')')
  await b.close(); server.close()
})().catch(e=>{console.error(e);process.exit(1)})
