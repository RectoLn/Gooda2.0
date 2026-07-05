// Diagnose the import-crop editor sizing on H5 (proxy for the shared logic).
// Serves dist, opens the import editor with non-square images, reports whether
// the displayed image aspect matches the natural aspect (i.e. stretched or not).
const http = require('http'); const fs = require('fs'); const path = require('path'); const zlib = require('zlib')
const puppeteer = require('/Users/rectoln/Workspace/Gooda/gooda-editor-poc/node_modules/puppeteer')
const DIST = '/Users/rectoln/Workspace/Gooda/gooda-editor-v2/dist'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function crc32(b){let c=~0;for(let i=0;i<b.length;i++){c^=b[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xedb88320&-(c&1))}return ~c>>>0}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,'ascii');const cr=Buffer.alloc(4);cr.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cr])}
function png(w,h,rgb){const s=Buffer.from([137,80,78,71,13,10,26,10]);const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;const row=Buffer.alloc(1+w*3);for(let x=0;x<w;x++){row[1+x*3]=rgb[0];row[1+x*3+1]=rgb[1];row[1+x*3+2]=rgb[2]}const raw=Buffer.concat(Array.from({length:h},()=>row));return Buffer.concat([s,chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])}
const CASES = [ {name:'landscape',w:600,h:300}, {name:'portrait',w:300,h:600}, {name:'square',w:400,h:400} ]
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'}
const server = http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(DIST,p);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end()}else{res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d)}})})
;(async()=>{
  await new Promise(r=>server.listen(10131,r))
  const browser = await puppeteer.launch({headless:'new',args:['--no-sandbox']})
  const page = await browser.newPage()
  await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true})
  page.on('pageerror',e=>console.log('PAGEERR',e.message))
  await page.goto('http://localhost:10131/index.html',{waitUntil:'networkidle2',timeout:60000})
  await page.waitForFunction(()=>!!window.__gooda,{timeout:30000})
  await page.waitForFunction(()=>!!window.__gooda, {timeout:15000})
  await page.evaluate(()=>{ window.__ss = window.__gooda })
  for(const cs of CASES){
    const url='data:image/png;base64,'+png(cs.w,cs.h,[230,120,140]).toString('base64')
    await page.evaluate(u=>window.__ss.openImportEditor(u),url)
    await page.waitForSelector('.import-editor-crop-stage',{visible:true,timeout:15000})
    await sleep(900)
    const info = await page.evaluate(()=>{
      const ss=window.__ss; const ic=ss.importCrop
      const dim=document.querySelector('.import-editor-crop-img.dim')
      const stg=document.querySelector('.import-editor-crop-stage')
      const r=dim&&dim.getBoundingClientRect(); const sr=stg&&stg.getBoundingClientRect()
      const inner=dim&&dim.querySelector('img')
      const ir=inner&&inner.getBoundingClientRect()
      return {imageW:ic.imageW,imageH:ic.imageH,stageW:Math.round(ic.stageW),stageH:Math.round(ic.stageH),
        dimBox:r?`${Math.round(r.width)}x${Math.round(r.height)}`:'?',
        stageBox:sr?`${Math.round(sr.width)}x${Math.round(sr.height)}`:'?',
        innerImg:ir?`${Math.round(ir.width)}x${Math.round(ir.height)}`:'(no inner img)'}
    })
    const natural=(cs.w/cs.h).toFixed(2)
    const dimA=info.dimBox.split('x'); const dispAspect=(dimA[0]/dimA[1]).toFixed(2)
    console.log(`\n[${cs.name} ${cs.w}x${cs.h} natural=${natural}]`)
    console.log(`  measured imageW/H=${info.imageW}x${info.imageH}  stage(js)=${info.stageW}x${info.stageH}`)
    console.log(`  stageBox=${info.stageBox}  dimBox=${info.dimBox} dispAspect=${dispAspect} ${dispAspect===natural?'OK':'*** STRETCHED ***'}`)
    console.log(`  innerImg=${info.innerImg}`)
    await page.evaluate(()=>window.__ss.cancelImportEditor && window.__ss.cancelImportEditor())
    await sleep(300)
  }
  await browser.close(); server.close()
})().catch(e=>{console.error(e);process.exit(1)})
