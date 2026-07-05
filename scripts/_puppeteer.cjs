// Resolve puppeteer from a few known locations so the verify scripts run on any
// machine (not just one with a hardcoded path). Override with PUPPETEER_DIR=/path.
const path = require('path')
module.exports = function loadPuppeteer() {
  const candidates = [
    process.env.PUPPETEER_DIR,
    path.join(__dirname, '..', 'node_modules', 'puppeteer'),
    // legacy local fallback: the sibling PoC repo used to hold the only install
    path.join(__dirname, '..', '..', 'gooda-editor-poc', 'node_modules', 'puppeteer'),
  ].filter(Boolean)
  for (const c of candidates) {
    try { return require(c) } catch (_) {}
  }
  try { return require('puppeteer') } catch (_) {}
  throw new Error('puppeteer not found. Install it (pnpm add -D puppeteer) or set PUPPETEER_DIR=/abs/path/to/node_modules/puppeteer')
}
