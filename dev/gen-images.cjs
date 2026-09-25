const path = require('node:path');
const { readFileSync } = require('node:fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const jobs = [
  { source: 'img/favicon.svg', output: 'img/favicon-32.png', width: 32, height: 32 },
  { source: 'dev/art/apple-touch-icon.svg', output: 'img/apple-touch-icon.png', width: 180, height: 180 },
  { source: 'dev/art/og.svg', output: 'img/og.png', width: 1200, height: 630 }
];

(async () => {
  const browser = await chromium.launch();
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width: job.width, height: job.height }, deviceScaleFactor: 1 });
    const svg = readFileSync(path.join(ROOT, job.source), 'utf8').replace('<svg ', '<svg width="' + job.width + '" height="' + job.height + '" ');
    await page.setContent('<!doctype html><html><body style="margin:0;background:transparent">' + svg + '</body></html>');
    await page.screenshot({ path: path.join(ROOT, job.output), omitBackground: true, clip: { x: 0, y: 0, width: job.width, height: job.height } });
    await page.close();
    console.log('gerado', job.output);
  }
  await browser.close();
})();
