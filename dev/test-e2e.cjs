const { spawn } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.E2E_PORT || 8181);
const BASE = 'http://localhost:' + PORT + '/shelfy-site/';
const CHROME = process.env.CHROME_PATH || undefined;

const tests = [];
const it = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startServer() {
  const server = spawn(process.execPath, [path.join(ROOT, 'dev/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve) => server.stdout.once('data', resolve));
  return server;
}

async function openPage(browser, url, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, ...options });
  const page = await context.newPage();
  const problems = [];
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    const swappedCatalog = /[?&]catalog=/.test(page.url()) && /was preloaded using link preload but not used/.test(message.text());
    if (!swappedCatalog) problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push('pageerror: ' + error.message));
  page.on('dialog', async (dialog) => { problems.push('DIALOG: ' + dialog.message()); await dialog.dismiss(); });
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  if (url) await page.goto(url);
  return { context, page, problems, requests };
}

async function typeCode(page, text) {
  await page.fill('#codigo', '');
  await page.type('#codigo', text, { delay: 30 });
}

async function resultTitles(page) {
  return page.$$eval('[data-results] .result-title', (nodes) => nodes.map((node) => node.textContent));
}

async function noticeTitle(page) {
  return page.$eval('[data-results] .notice-title', (node) => node.textContent).catch(() => null);
}

it('jornada (a): digitou 22 e achou o produto', async (browser) => {
  const { page, problems, context } = await openPage(browser, BASE + '?catalog=dev');
  await typeCode(page, '22');
  await page.waitForSelector('[data-results] .result');
  assert.deepEqual(await resultTitles(page), ['Espremedor de frutas elétrico 300ml']);
  const link = await page.$eval('[data-results] a.button-primary', (a) => ({ href: a.href, rel: a.rel, target: a.getAttribute('target'), text: a.textContent.replace(/\s+/g, ' ').trim() }));
  assert.equal(link.href, 'https://loja.example.com/p/espremedor-de-frutas-eletrico-300ml-22?aff=shelfy');
  assert.equal(link.rel, 'sponsored nofollow noopener noreferrer');
  assert.equal(link.target, null);
  assert.equal(link.text, 'Ver produto P0022');
  assert.match(await page.textContent('[data-results]'), /Link de afiliado/);
  await page.press('#codigo', 'Enter');
  await page.waitForFunction(() => new URL(location.href).searchParams.get('c') === 'P0022');
  assert.match(await page.textContent('#status-busca'), /Produto encontrado: P0022/);
  assert.deepEqual(problems, [], problems.join('\n'));
  await context.close();
});

it('jornada (b): título, descrição e busca pronta para digitar', async (browser) => {
  const { page, context } = await openPage(browser, BASE, { viewport: { width: 1280, height: 800 } });
  assert.match(await page.title(), /^shelfy/);
  assert.match(await page.getAttribute('meta[name="description"]', 'content'), /código/);
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'codigo');
  await context.close();
});

it('jornada (c): colou a legenda inteira (evento paste)', async (browser) => {
  const { page, context, problems } = await openPage(browser, BASE + '?catalog=dev');
  const paste = (text) => page.evaluate((value) => {
    const input = document.getElementById('codigo');
    input.focus();
    input.value = '';
    const data = new DataTransfer();
    data.setData('text/plain', value);
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
  await paste('Gostou? 🧡\nBusca o código #P0022\nno link da bio');
  await page.waitForSelector('[data-results] .result');
  assert.deepEqual(await resultTitles(page), ['Espremedor de frutas elétrico 300ml']);
  assert.equal(await page.inputValue('#codigo'), 'Gostou? 🧡 Busca o código #P0022 no link da bio');
  await paste('Achados: #P0022 e #P0023 🔥');
  await page.waitForFunction(() => document.querySelectorAll('[data-results] .result').length === 2);
  assert.match(await page.textContent('.results-heading'), /2 códigos/);
  assert.deepEqual(problems, [], problems.join('\n'));
  await context.close();
});

it('jornada (c): texto inserido sem evento paste (teclado do celular)', async (browser) => {
  const { page, context } = await openPage(browser, BASE + '?catalog=dev');
  await page.focus('#codigo');
  await page.keyboard.insertText('Busca o código #P0022\nno link da bio');
  await page.waitForSelector('[data-results] .result');
  assert.deepEqual(await resultTitles(page), ['Espremedor de frutas elétrico 300ml']);
  await context.close();
});

it('jornada (d): erros comuns de digitação', async (browser) => {
  const { page, context } = await openPage(browser, BASE + '?catalog=dev');
  for (const form of ['PO022', 'p 22', '#p0022', 'P-0022', 'P00 22', 'p00022', 'P022']) {
    await typeCode(page, form);
    await page.press('#codigo', 'Enter');
    await page.waitForFunction(() => document.querySelector('[data-results] .result-title'));
    assert.deepEqual(await resultTitles(page), ['Espremedor de frutas elétrico 300ml'], form);
  }
  await context.close();
});

it('jornada (e): link direto ?c= e #', async (browser) => {
  const { page, context, problems } = await openPage(browser, BASE + '?catalog=dev&c=P0022');
  await page.waitForSelector('[data-results] .result');
  assert.equal(await page.inputValue('#codigo'), 'P0022');
  await page.goto(BASE + '?catalog=dev#p22');
  await page.waitForSelector('[data-results] .result');
  await page.waitForFunction(() => location.search.includes('c=P0022') && !location.hash);
  await page.goto(BASE + '?catalog=dev&c=%23P0022+P0023');
  await page.waitForFunction(() => document.querySelectorAll('[data-results] .result').length === 2);
  assert.deepEqual(problems, [], problems.join('\n'));
  await context.close();
});

it('jornada (f): internet lenta, digitou antes do catálogo chegar', async (browser) => {
  const { page, context } = await openPage(browser, null);
  await page.route('**/dev/products.sample.json', async (route) => { await sleep(2500); await route.continue(); });
  await page.goto(BASE + '?catalog=dev');
  await typeCode(page, 'P0022');
  await page.press('#codigo', 'Enter');
  await page.waitForSelector('[data-results] .result-loading');
  assert.match(await page.textContent('[data-results]'), /Carregando o catálogo/);
  await page.waitForSelector('[data-results] .result-title', { timeout: 8000 });
  assert.deepEqual(await resultTitles(page), ['Espremedor de frutas elétrico 300ml']);
  await context.close();
});

it('jornada (g): produto que saiu do ar e código novo demais', async (browser) => {
  const { page, context } = await openPage(browser, BASE + '?catalog=dev');
  const missing = await page.evaluate(async () => {
    const data = await (await fetch('dev/products.sample.json')).json();
    const have = new Set(data.products.map((p) => p.code));
    for (let n = 1; n < 2100; n += 1) { const code = 'P' + String(n).padStart(4, '0'); if (!have.has(code)) return code; }
    return null;
  });
  await typeCode(page, missing);
  await page.press('#codigo', 'Enter');
  await page.waitForSelector('[data-results] .notice');
  assert.equal(await noticeTitle(page), 'Não encontramos o ' + missing);
  assert.match(await page.textContent('[data-results]'), /não existe ou o produto saiu do ar/);
  await typeCode(page, 'P20000');
  await page.press('#codigo', 'Enter');
  await page.waitForFunction(() => /ainda não chegou/.test(document.querySelector('[data-results]').textContent));
  await context.close();
});

it('não pisca "não encontrado" enquanto digita', async (browser) => {
  const { page, context } = await openPage(browser, BASE + '?catalog=dev');
  await page.focus('#codigo');
  await page.keyboard.type('P20000', { delay: 20 });
  await sleep(250);
  assert.equal(await page.$('[data-results] .notice'), null);
  await sleep(900);
  assert.ok(await page.$('[data-results] .notice'), 'depois da pausa o estado aparece');
  await context.close();
});

it('estados: catálogo vazio (arquivo real)', async (browser) => {
  const { page, context, problems } = await openPage(browser, BASE);
  await typeCode(page, '22');
  await page.press('#codigo', 'Enter');
  await page.waitForSelector('[data-results] .notice');
  assert.equal(await noticeTitle(page), 'A prateleira ainda está vazia');
  assert.deepEqual(problems, [], problems.join('\n'));
  await context.close();
});

it('estados: formato inválido e sugestão', async (browser) => {
  const { page, context } = await openPage(browser, BASE + '?catalog=dev');
  await typeCode(page, 'tenis nike');
  await page.press('#codigo', 'Enter');
  await page.waitForSelector('[data-results] .notice');
  assert.equal(await noticeTitle(page), 'Não achamos um código aí');
  await typeCode(page, 'codigo 22 por favor');
  await page.press('#codigo', 'Enter');
  await page.waitForFunction(() => /Você quis dizer P0022/.test(document.querySelector('[data-results]').textContent));
  await page.click('[data-results] .notice-actions button');
  await page.waitForSelector('[data-results] .result');
  assert.equal(await page.inputValue('#codigo'), 'P0022');
  await typeCode(page, 'P');
  await page.press('#codigo', 'Enter');
  await page.waitForFunction(() => /Faltou o número/.test(document.querySelector('[data-results]').textContent));
  await context.close();
});

for (const [fixture, expected] of [['broken', 'temporariamente indisponível'], ['version2', 'temporariamente indisponível'], ['version-string', 'temporariamente indisponível'],
  ['no-products', 'temporariamente indisponível'], ['products-object', 'temporariamente indisponível'], ['array-root', 'temporariamente indisponível'],
  ['gen-oversized', 'temporariamente indisponível'], ['deep-nesting', '']]) {
  it('estados: catálogo ' + fixture, async (browser) => {
    const { page, context, problems } = await openPage(browser, BASE + '?catalog=' + fixture);
    await typeCode(page, 'P0022');
    await page.press('#codigo', 'Enter');
    await page.waitForSelector('[data-results] .notice', { timeout: 8000 });
    const text = await page.textContent('[data-results]');
    if (expected) {
      assert.match(text, new RegExp(expected));
      assert.ok(await page.$('[data-results] .notice-actions button'), 'botão tentar de novo');
    }
    assert.deepEqual(problems.filter((p) => !/Failed to load resource/.test(p)), []);
    await context.close();
  });
}

it('estados: rede falhando, tentar de novo recupera', async (browser) => {
  const { page, context } = await openPage(browser, null);
  let fail = true;
  await page.route('**/dev/products.sample.json', (route) => (fail ? route.abort('internetdisconnected') : route.continue()));
  await page.goto(BASE + '?catalog=dev');
  await typeCode(page, 'P0022');
  await page.press('#codigo', 'Enter');
  await page.waitForFunction(() => /Não conseguimos baixar o catálogo/.test(document.querySelector('[data-results]').textContent));
  fail = false;
  await sleep(3000);
  const recovered = await page.$('[data-results] .result');
  if (!recovered) await page.click('[data-results] .notice-actions button');
  await page.waitForSelector('[data-results] .result', { timeout: 8000 });
  await context.close();
});

it('segurança: catálogo hostil não executa nada e não vira link', async (browser) => {
  const { page, context, problems } = await openPage(browser, BASE + '?catalog=hostile');
  const hostile = await page.evaluate(async () => (await fetch('dev/fixtures/hostile.json')).json());
  for (let index = 0; index < 11; index += 1) {
    const entry = hostile.products[index];
    await typeCode(page, entry.code);
    await page.press('#codigo', 'Enter');
    await page.waitForSelector('[data-results] .result-title');
    const shown = await page.$eval('[data-results] .result-title', (node) => node.textContent);
    assert.equal(shown, entry.title, 'título ' + entry.code + ' exibido como texto');
  }
  assert.equal(await page.$$eval('[data-results] script, [data-results] img, [data-results] svg[onload]', (n) => n.length), 0);
  let first = hostile.firstHostileLink;
  const safeLinks = new Set(['https://xn--bcher-kva.example/p/1', 'https://loja.example.com/p/1?q=%3Cscript%3Ealert(1)%3C/script%3E']);
  for (let number = first; number < first + 31; number += 1) {
    const code = 'P' + String(number).padStart(4, '0');
    if (code === 'P0022' || code === 'P0023') continue;
    await typeCode(page, code);
    await page.press('#codigo', 'Enter');
    await page.waitForSelector('[data-results] .result');
    const href = await page.$eval('[data-results] .result', (card) => { const a = card.querySelector('a[href]'); return a ? a.href : null; });
    if (href !== null) assert.ok(safeLinks.has(href), code + ' virou link: ' + href);
    else assert.ok(await page.$('[data-results] .result.is-unavailable'), code + ' aparece como indisponível');
  }
  await typeCode(page, 'P0022');
  await page.press('#codigo', 'Enter');
  await page.waitForFunction(() => document.querySelector('[data-results] .result-title').textContent === 'Versão mais nova (deve ganhar)');
  const everyHref = await page.$$eval('a[href]', (anchors) => anchors.map((a) => a.href));
  assert.ok(everyHref.every((href) => /^(https?:|mailto:)/.test(href)), 'nenhum href perigoso na página');
  assert.deepEqual(problems, [], problems.join('\n'));
  await context.close();
});

it('segurança: URL hostil (?c= e #) não é refletida nem executada', async (browser) => {
  const { page, context, problems } = await openPage(browser, BASE + '?catalog=dev&c=%3Cscript%3Ealert(1)%3C%2Fscript%3E%3Cimg%20src%3Dx%20onerror%3Dalert(2)%3E');
  await page.waitForSelector('[data-results] .notice');
  assert.equal(await noticeTitle(page), 'O link aberto não tem um código válido');
  assert.equal(await page.inputValue('#codigo'), '');
  assert.equal(new URL(page.url()).searchParams.get('c'), null, 'payload removido da URL');
  assert.ok(!(await page.content()).includes('onerror=alert(2)'));
  await page.goto(BASE + '?catalog=dev#%3Cimg%20src%3Dx%20onerror%3Dalert(3)%3E');
  await sleep(500);
  await page.goto(BASE + '?catalog=dev&c=Promo%C3%A7%C3%A3o%20encerrada%2C%20compre%20em%20golpe.example');
  await page.waitForSelector('[data-results] .notice');
  assert.ok(!(await page.textContent('body')).includes('golpe.example'), 'texto da URL não aparece na página');
  assert.deepEqual(problems, [], problems.join('\n'));
  await context.close();
});

it('segurança: Trusted Types bloqueia innerHTML com string', async (browser) => {
  const { page, context } = await openPage(browser, BASE);
  const blocked = await page.evaluate(() => { try { document.body.insertAdjacentHTML('beforeend', '<b>x</b>'); return false; } catch (error) { return error.name; } });
  assert.equal(blocked, 'TypeError');
  await context.close();
});

it('segurança: dentro de iframe a busca não vira link', async (browser) => {
  const { page, context } = await openPage(browser, null);
  await page.setContent('<iframe src="' + BASE + '?catalog=dev&c=P0022" width="400" height="700"></iframe>');
  const frame = await (await page.waitForSelector('iframe')).contentFrame();
  await frame.waitForSelector('[data-results] .notice');
  assert.match(await frame.textContent('[data-results]'), /Abra o shelfy no endereço oficial/);
  assert.equal(await frame.$('[data-results] a.button-primary'), null);
  await context.close();
});

it('escala: 5000 e 12000 produtos', async (browser) => {
  const { page, context } = await openPage(browser, BASE + '?catalog=gen-huge-5000');
  await typeCode(page, 'P4999');
  await page.waitForSelector('[data-results] .result');
  await page.goto(BASE + '?catalog=gen-huge-12000&c=P10000');
  await page.waitForSelector('[data-results] .result');
  await typeCode(page, 'P11000');
  await page.press('#codigo', 'Enter');
  await page.waitForSelector('[data-results] .notice');
  await context.close();
});

it('sem JavaScript: conteúdo do Google continua visível', async (browser) => {
  const { page, context } = await openPage(browser, BASE, { javaScriptEnabled: false });
  const h1 = await page.textContent('h1');
  assert.match(h1, /shelfy/);
  const body = await page.innerText('body');
  for (const text of ['Sobre o shelfy', 'Google Drive', 'drive.file', 'só enxerga os arquivos e pastas que ele mesmo criou', 'Nenhum dado do Google é compartilhado, vendido ou enviado a terceiros', 'Política de privacidade', 'precisa do JavaScript']) {
    assert.ok(body.includes(text), 'visível sem JS: ' + text);
  }
  const privacyLink = await page.$('a[href="privacidade.html"]');
  assert.ok(await privacyLink.isVisible());
  await page.goto(BASE + 'privacidade.html');
  const policy = await page.innerText('body');
  for (const text of ['drive.file', 'Não lê, não altera e não apaga nenhum outro arquivo do Drive', 'myaccount.google.com/permissions', 'dinosauroxd9@gmail.com', 'não usa cookies', 'links de afiliado', 'Última atualização']) {
    assert.ok(policy.includes(text), 'política: ' + text);
  }
  assert.match(await page.title(), /Política de privacidade — shelfy/);
  await context.close();
});

it('404 em URL profunda: estilo, links e busca funcionam', async (browser) => {
  const { page, context, problems, requests } = await openPage(browser, null);
  const response = await page.goto('http://localhost:' + PORT + '/shelfy-site/uma/pasta/que/nao/existe.html?catalog=dev');
  assert.equal(response.status(), 404);
  const styled = await page.$eval('body', (body) => getComputedStyle(body).display);
  assert.equal(styled, 'flex', 'CSS carregado a partir do <base>');
  const hrefs = await page.$$eval('a[href]', (anchors) => anchors.map((a) => a.href));
  assert.ok(hrefs.includes('http://localhost:' + PORT + '/shelfy-site/privacidade.html'));
  assert.ok(hrefs.includes('http://localhost:' + PORT + '/shelfy-site/'));
  await typeCode(page, '22');
  await page.waitForSelector('[data-results] .result');
  assert.ok(requests.every((url) => url.startsWith('http://localhost:' + PORT + '/shelfy-site/')), 'tudo carregado do subcaminho');
  assert.deepEqual(problems.filter((p) => !/Failed to load resource: the server responded with a status of 404/.test(p)), []);
  await context.close();
});

it('rede: nenhuma requisição para outro domínio; catálogo baixado uma vez', async (browser) => {
  for (const pagePath of ['', 'privacidade.html', 'termos.html', 'x/404']) {
    const { page, context, requests, problems } = await openPage(browser, BASE + pagePath);
    await page.waitForLoadState('networkidle');
    assert.ok(requests.every((url) => url.startsWith('http://localhost:' + PORT + '/')), pagePath + ': ' + requests.join(', '));
    if (pagePath === '') assert.equal(requests.filter((url) => url.includes('products.json')).length, 1, 'preload reaproveitado');
    assert.deepEqual(problems.filter((p) => !/status of 404/.test(p)), [], pagePath);
    await context.close();
  }
});

it('copiar link, recentes e título longo', async (browser) => {
  const { page, context } = await openPage(browser, BASE + '?catalog=dev', { permissions: ['clipboard-read', 'clipboard-write'] });
  await typeCode(page, 'P0022');
  await page.press('#codigo', 'Enter');
  await page.waitForSelector('[data-results] .result');
  await page.click('[data-results] [data-slot="copy"]');
  await page.waitForFunction(() => /copiado/.test(document.querySelector('[data-slot="copy-label"]').textContent));
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), BASE + '?c=P0022');
  await page.fill('#codigo', '');
  await page.dispatchEvent('#codigo', 'input');
  await page.waitForSelector('[data-recent]:not([hidden])');
  assert.deepEqual(await page.$$eval('.recent-chip', (chips) => chips.map((c) => c.textContent)), ['P0022']);
  await page.click('.recent-chip');
  await page.waitForSelector('[data-results] .result');
  const longCode = await page.evaluate(async () => {
    const data = await (await fetch('dev/products.sample.json')).json();
    return data.products.find((p) => p.title.length > 200 && /^https:/.test(p.link)).code;
  });
  await typeCode(page, longCode);
  await page.press('#codigo', 'Enter');
  await page.waitForSelector('[data-results] .title-toggle:not([hidden])');
  await page.click('[data-results] .title-toggle');
  assert.equal(await page.getAttribute('[data-results] .title-toggle', 'aria-expanded'), 'true');
  await page.fill('#codigo', '');
  await page.dispatchEvent('#codigo', 'input');
  await page.click('[data-recent-clear]');
  assert.ok(await page.$('[data-recent][hidden]'));
  await context.close();
});

it('layout: 360×560 (navegador embutido) com busca acima da dobra', async (browser) => {
  const { page, context } = await openPage(browser, BASE, { viewport: { width: 360, height: 560 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const box = await page.$eval('.search-field', (node) => node.getBoundingClientRect().toJSON());
  assert.ok(box.bottom <= 560, 'caixa de busca visível: bottom=' + box.bottom);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.equal(overflow, 0, 'sem rolagem horizontal');
  await context.close();
});

it('movimento reduzido desliga animações', async (browser) => {
  const { page, context } = await openPage(browser, BASE + '?catalog=dev&c=P0022', { reducedMotion: 'reduce' });
  await page.waitForSelector('[data-results] .result');
  const motion = await page.$eval('[data-results] .result', (node) => getComputedStyle(node).transitionDuration);
  assert.equal(motion, '0s');
  await context.close();
});

(async () => {
  const server = await startServer();
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  let failed = 0;
  const only = process.argv[2];
  for (const { name, fn } of tests) {
    if (only && !name.includes(only)) continue;
    const started = Date.now();
    try {
      await fn(browser);
      console.log('ok   ' + name + ' (' + (Date.now() - started) + 'ms)');
    } catch (error) {
      failed += 1;
      console.log('FAIL ' + name + '\n     ' + String(error && error.stack || error).split('\n').slice(0, 4).join('\n     '));
    }
  }
  await browser.close();
  server.kill();
  console.log(failed ? failed + ' teste(s) falharam' : 'todos os testes passaram');
  process.exitCode = failed ? 1 : 0;
})();
