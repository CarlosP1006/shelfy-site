import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseQuery, parseDeepLink, parseHash, normalizeText, MAX_CODES_PER_QUERY, TEST_CODE } from '../js/query.js';
import {
  buildCatalog, parseCatalog, readProduct, readTitle, readProductLink, linkProblem, codeProblem, canonicalCode, formatCode,
  MAX_PRODUCTS, MAX_TITLE_LENGTH, CODE_DIGITS
} from '../js/catalog.js';
import { validateCatalogText, readUpdatedAt } from './validate-catalog.mjs';

const char = (...points) => String.fromCodePoint(...points);
const codesOf = (input) => {
  const query = parseQuery(input);
  return query.kind === 'codes' ? query.codes : query.kind;
};

test('pedido do dono: todas estas formas acham o P00022', () => {
  const caption = 'Gostou? 🧡\nBusca o código #P00022 no link da bio 🛒';
  for (const form of ['22', 'P22', 'p22', 'P0022', 'P00022', '#P00022', 'P 00022', caption]) {
    assert.deepEqual(codesOf(form), ['P00022'], JSON.stringify(form));
  }
});

test('todas as formas de digitar viram P00022', () => {
  const forms = ['P00022', 'p00022', '#P00022', '#p00022', 'P22', 'p 22', '22', '022', '0022', '00022', ' #P00022 ', 'P-00022', 'P' + char(0xba) + '22',
    'PO0022', 'P0O022', 'po22', 'PO22', 'P 000 22', 'P000022', 'P022', '# P00022', 'P.00022', 'P_00022', 'P:00022', 'P - 00022',
    'P0022', 'p0022', '#P0022', '#p0022', 'P-0022', 'PO022', 'P 00 22', '# P0022', 'P.0022', 'P_0022', 'P:0022', 'P - 0022',
    char(0xff03, 0xff30, 0xff10, 0xff10, 0xff10, 0xff12, 0xff12), 'P' + char(0x200b) + '00022', char(0x202e) + 'P00022', 'P' + char(0x2013) + '00022',
    char(0x420) + '00022', 'P' + char(0x41e) + '0022', 'P00022' + char(0xfeff), char(0xa0) + 'P00022' + char(0x3000), 'p' + char(0xad) + '22'];
  for (const form of forms) assert.deepEqual(codesOf(form), ['P00022'], JSON.stringify(form));
});

test('códigos maiores e menores', () => {
  assert.equal(CODE_DIGITS, 5);
  assert.deepEqual(codesOf('P12345'), ['P12345']);
  assert.deepEqual(codesOf('12345'), ['P12345']);
  assert.deepEqual(codesOf('P99999'), ['P99999']);
  assert.deepEqual(codesOf('P100000'), ['P100000']);
  assert.deepEqual(codesOf('100000'), ['P100000']);
  assert.deepEqual(codesOf('P1234'), ['P01234']);
  assert.deepEqual(codesOf('1'), ['P00001']);
  assert.deepEqual(codesOf('P99999999'), ['P99999999']);
  assert.deepEqual(codesOf('P000000022'), ['P00022']);
  assert.equal(formatCode('0'), 'P00000');
  assert.equal(formatCode('000000000000022'), 'P00022');
  assert.equal(parseQuery('P123456789').kind, 'invalid');
  assert.equal(parseQuery('P123456789').reason, 'long');
});

test('pressa de mostrar: só código completo (5 dígitos) aparece na hora', () => {
  assert.equal(parseQuery('P00022').settle, 'now');
  assert.equal(parseQuery('P12345').settle, 'now');
  assert.equal(parseQuery('22').settle, 'idle');
  assert.equal(parseQuery('1234').settle, 'idle', 'pode estar no meio de um código de 5 dígitos');
  assert.equal(parseQuery('P0022').settle, 'commit', 'formato antigo espera a pausa ou o Enter');
  assert.equal(parseQuery('P0002').settle, 'commit', 'digitando P00022 não pisca o P00002');
  assert.equal(parseQuery('P002').settle, 'commit');
  assert.equal(parseQuery('P0').settle, 'commit');
  assert.equal(parseQuery('#P00022 no link').settle, 'now');
  assert.equal(parseQuery('#P0022 no link').settle, 'idle');
});

test('entradas incompletas não viram erro', () => {
  for (const form of ['#', 'P', 'p', '#P', 'PO', 'p-', ' # ', 'P ']) assert.equal(parseQuery(form).kind, 'partial', form);
  for (const form of ['', '   ', char(0x200b), char(0x202e, 0x2066)]) assert.equal(parseQuery(form).kind, 'empty', JSON.stringify(form));
});

test('legenda colada inteira', () => {
  assert.deepEqual(codesOf('Gostou? Busca o código #P00022 no link da bio'), ['P00022']);
  assert.deepEqual(codesOf('Gostou? Busca o código #P00022\nno link da bio'), ['P00022']);
  assert.deepEqual(codesOf('Gostou? Busca o código #P00022no link da bio'), ['P00022']);
  assert.deepEqual(codesOf('Busca no link da bioP00022'), ['P00022']);
  assert.deepEqual(codesOf('Achados da semana: #P00022 #P00023 e #P00137 🔥'), ['P00022', 'P00023', 'P00137']);
  assert.deepEqual(codesOf('#P00022#P00023'), ['P00022', 'P00023']);
  assert.deepEqual(codesOf('P00022P00023'), ['P00022', 'P00023']);
  assert.deepEqual(codesOf('00022 00023'), ['P00022', 'P00023']);
  assert.deepEqual(codesOf('código P00022, repetindo: P00022'), ['P00022']);
  assert.deepEqual(codesOf('código #p22 aqui'), ['P00022']);
  assert.deepEqual(codesOf('Frete grátis! Código PO0022 (com O)'), ['P00022']);
  assert.deepEqual(codesOf('CEP 01310-100, código P00022'), ['P00022']);
  assert.deepEqual(codesOf('Achados: #P100000 e #P99999'), ['P100000', 'P99999']);
  assert.deepEqual(codesOf('Post antigo: busca o código #P0022 no link da bio'), ['P00022'], 'legenda antiga, com 4 dígitos');
  assert.deepEqual(codesOf('Antigos: #P0022 #P0023'), ['P00022', 'P00023']);
  assert.deepEqual(codesOf('0022 0023'), ['P00022', 'P00023']);
  const many = Array.from({ length: 15 }, (_, index) => '#P' + String(index + 1).padStart(5, '0')).join(' ');
  assert.equal(codesOf(many).length, MAX_CODES_PER_QUERY);
});

test('sem falso positivo em texto comum', () => {
  for (const text of ['iPhone 15 Pro', 'Tamanho P 38', 'SP2024 promoção', 'Leve 3 pague 2', 'MP3 e P2', 'HP 2024', 'PS5 novo', 'tenis 42']) {
    const query = parseQuery(text);
    assert.notEqual(query.kind, 'codes', text);
  }
  assert.equal(parseQuery('Frete grátis acima de 99').kind, 'suggestion');
  assert.equal(parseQuery('Frete grátis acima de 99').code, 'P00099');
  assert.equal(parseQuery('codigo 22 por favor').code, 'P00022');
  assert.equal(parseQuery('Leve 3 pague 2').kind, 'invalid');
  assert.equal(parseQuery('tenis nike').kind, 'invalid');
});

test('entrada hostil não quebra nem demora', () => {
  const hostile = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', 'javascript:alert(1)', '%3Cscript%3E', '${alert(1)}',
    char(0) + char(7) + 'P00022', '\u0000'.repeat(10), 'P'.repeat(100000), 'P0'.repeat(50000), '#'.repeat(100000), '0'.repeat(100000),
    ('P' + '0'.repeat(15) + ' ').repeat(3000), 'a'.repeat(200000) + 'P00022'];
  for (const input of hostile) {
    const started = performance.now();
    const query = parseQuery(input);
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 150, 'demorou ' + elapsed.toFixed(1) + 'ms');
    assert.ok(['codes', 'invalid', 'partial', 'suggestion', 'empty'].includes(query.kind));
  }
  assert.ok(normalizeText('x'.repeat(100000)).length <= 4000);
});

test('deep link e hash', () => {
  assert.deepEqual(parseDeepLink('P00022'), ['P00022']);
  assert.deepEqual(parseDeepLink('P00022 P00023'), ['P00022', 'P00023']);
  assert.deepEqual(parseDeepLink('P0022'), ['P00022'], 'link antigo, com 4 dígitos');
  assert.deepEqual(parseDeepLink('P0022 P0023'), ['P00022', 'P00023']);
  assert.deepEqual(parseDeepLink('22'), ['P00022']);
  assert.equal(parseDeepLink('<script>alert(1)</script>'), null);
  assert.equal(parseDeepLink('x'.repeat(201)), null);
  assert.equal(parseDeepLink(''), null);
  assert.deepEqual(parseHash('#P00022'), ['P00022']);
  assert.deepEqual(parseHash('#p22'), ['P00022']);
  assert.deepEqual(parseHash('#%23P00022'), ['P00022']);
  assert.deepEqual(parseHash('#P0022'), ['P00022'], 'link antigo, com 4 dígitos');
  for (const hash of ['#como-funciona', '#buscar', '#sobre', '#conteudo', '#%E0%A4%A', '#<img src=x onerror=alert(1)>', '#' + 'P'.repeat(40)]) {
    assert.equal(parseHash(hash), null, hash);
  }
});

test('código de teste: só a palavra exata, fora do formato dos códigos', () => {
  assert.equal(TEST_CODE, 'TESTE676767');
  for (const input of ['TESTE676767', 'teste676767', ' Teste676767 ']) assert.deepEqual(codesOf(input), [TEST_CODE], input);
  assert.deepEqual(parseDeepLink('teste676767'), [TEST_CODE]);
  assert.deepEqual(parseHash('#teste676767'), [TEST_CODE]);
  assert.deepEqual(codesOf('676767'), ['P676767']);
  assert.deepEqual(codesOf('P676767'), ['P676767']);
  for (const input of ['teste 676767', 'TESTE67676', 'teste676767 P00022', 'legenda com TESTE676767 no meio']) {
    assert.notDeepEqual(codesOf(input), [TEST_CODE], input);
  }
  assert.notEqual(codeProblem(TEST_CODE), '', 'nunca vale como código do catálogo');
});

test('regras de link: só https seguro vira link', () => {
  const valid = ['https://loja.example.com/p/1?x=y#z', 'https://a.bc', 'https://LOJA.Example.com/P/1', 'https://xn--bcher-kva.example/p',
    'https://loja.example.com/p/1?q=<script>alert(1)</script>', 'https://sub.loja.example.com.br/produto/abc-123?aff=shelfy'];
  for (const link of valid) assert.equal(linkProblem(link), '', link);
  assert.equal(readProductLink('https://a.bc'), 'https://a.bc/');
  const invalid = {
    'javascript:alert(1)': 'scheme', 'JAVASCRIPT:alert(1)': 'scheme', ' javascript:alert(1)': 'scheme', 'data:text/html,<b>': 'scheme',
    'http://loja.example.com/p/1': 'scheme', 'HTTPS://LOJA.EXAMPLE.COM/p/1': 'scheme', '//loja.example.com/p/1': 'scheme', '/p/1': 'length',
    'https://usuario:senha@loja.example.com/': 'credentials', 'https://loja.example.com@evil.example/': 'credentials',
    'https://evil.example\\@loja.example.com/': 'characters', 'https://loja.example.com/ x': 'characters',
    'https://loja.example.com/\tx': 'characters', 'https://loja.example.com/é': 'characters', 'https://127.0.0.1/p': 'host',
    'https://[::1]/p': 'host', 'https://localhost/p': 'host', 'https://loja.example.com:8443/p': 'port', 'https://-a.example.com/': 'host',
    'https://a..example.com/': 'host', 'https://loja.example.c0m/': 'host', 'https://loja.example.com./': 'host', 'https://loja/': 'host'
  };
  for (const [link, problem] of Object.entries(invalid)) assert.equal(linkProblem(link), problem, link);
  assert.equal(linkProblem('https://loja.example.com/' + 'a'.repeat(3000)), 'length');
  for (const value of [null, undefined, 42, ['https://a.bc'], { href: 'https://a.bc' }]) assert.equal(readProductLink(value), null);
  assert.equal(linkProblem('https://loja.example.com/' + char(0x202e) + 'x'), 'characters');
});

test('códigos do catálogo', () => {
  assert.equal(canonicalCode('P00022'), 'P00022');
  assert.equal(canonicalCode('P0022'), 'P00022', 'arquivo antigo, com 4 dígitos: mesmo produto');
  assert.equal(canonicalCode('P000022'), 'P00022');
  assert.equal(canonicalCode('P00000'), 'P00000');
  assert.equal(canonicalCode('P0000'), 'P00000');
  assert.equal(canonicalCode('P99999'), 'P99999');
  assert.equal(canonicalCode('P100000'), 'P100000');
  assert.equal(canonicalCode('P12345678'), 'P12345678');
  assert.equal(codeProblem('P0022'), '', 'o arquivo continua aceitando 4 dígitos');
  assert.equal(codeProblem('P00022'), '');
  assert.equal(codeProblem('P123456789'), 'digits');
  assert.equal(codeProblem('p00022'), 'pattern');
  assert.equal(codeProblem(' P00022'), 'pattern');
  assert.equal(codeProblem('P022'), 'pattern');
  assert.equal(codeProblem('P' + char(0x662, 0x662, 0x662, 0x662)), 'pattern');
  assert.equal(codeProblem(22), 'type');
  assert.equal(codeProblem('P' + '0'.repeat(20)), 'length');
});

test('títulos: texto puro, com teto', () => {
  assert.equal(readTitle('<script>alert(1)</script>'), '<script>alert(1)</script>');
  assert.equal(readTitle('   '), null);
  assert.equal(readTitle(42), null);
  const long = readTitle('a'.repeat(MAX_TITLE_LENGTH + 100));
  assert.ok(long.length <= MAX_TITLE_LENGTH + 1 && long.endsWith(char(0x2026)));
  const emoji = readTitle('a'.repeat(MAX_TITLE_LENGTH - 1) + '🔥🔥');
  assert.ok(!/[\ud800-\udbff]$/.test(emoji.slice(0, -1)), 'não corta emoji ao meio');
});

test('catálogo: arquivo inválido vira erro; produto inválido é ignorado sozinho', () => {
  assert.equal(parseCatalog('{').reason, 'json');
  assert.equal(parseCatalog('[]').reason, 'shape');
  assert.equal(parseCatalog('null').reason, 'shape');
  assert.equal(parseCatalog('{"version":2,"products":[]}').reason, 'version');
  assert.equal(parseCatalog('{"version":"1","products":[]}').reason, 'version');
  assert.equal(parseCatalog('{"version":1}').reason, 'shape');
  assert.equal(parseCatalog('{"version":1,"products":{}}').reason, 'shape');
  assert.equal(parseCatalog('x'.repeat(5000001)).reason, 'size');
  const deep = parseCatalog('{"version":1,"products":[' + '['.repeat(20000) + ']'.repeat(20000) + ']}');
  assert.ok(deep.reason === 'json' || (deep.ok && deep.products.size === 0));
  const empty = parseCatalog('{"version":1,"updatedAt":null,"products":[]}');
  assert.ok(empty.ok && empty.products.size === 0 && empty.highestNumber === -1);
  const catalog = buildCatalog({ version: 1, updatedAt: '2026-10-02T14:05:00Z', extra: true, products: [
    { code: 'P0022', title: 'velho, com 4 dígitos', link: 'https://a.bc/1' }, null, 'x', { code: 'P00023', title: 'sem link' },
    { code: 'P00024', title: 'link ruim', link: 'javascript:alert(1)' }, { code: 'P00022', title: 'novo', link: 'https://a.bc/2', preco: 1 },
    { code: 'bad', title: 'x', link: 'https://a.bc' }, { code: 'P00025', title: '', link: 'https://a.bc' }
  ] });
  assert.ok(catalog.ok);
  assert.equal(catalog.products.get('P00022').title, 'novo', 'P0022 e P00022 são o mesmo produto; vale o último');
  assert.equal(catalog.products.get('P00022').link, 'https://a.bc/2');
  assert.equal(catalog.products.get('P00023').link, null);
  assert.equal(catalog.products.get('P00024').link, null);
  assert.ok(!catalog.products.has('P0022'), 'a chave é sempre a forma de 5 dígitos');
  const legacy = buildCatalog({ version: 1, updatedAt: null, products: [{ code: 'P0022', title: 'antigo', link: 'https://a.bc/9' }, { code: 'P0137', title: 'outro', link: 'https://a.bc/8' }] });
  assert.deepEqual([...legacy.products.keys()], ['P00022', 'P00137']);
  assert.equal(legacy.highestNumber, 137);
  assert.equal(catalog.products.size, 3);
  assert.equal(catalog.ignored, 4);
  assert.equal(catalog.highestNumber, 24);
  assert.equal(readUpdatedAt('2026-10-02T14:05:00Z').toISOString(), '2026-10-02T14:05:00.000Z');
  assert.equal(readUpdatedAt('ontem'), null);
  assert.ok(buildCatalog({ version: 1, updatedAt: 'ontem', products: [] }).ok, 'updatedAt ruim não derruba o catálogo');
  const polluted = JSON.parse('{"version":1,"products":[{"__proto__":{"code":"P00001","title":"x","link":"https://a.bc"}}]}');
  assert.equal(buildCatalog(polluted).products.size, 0);
});

test('catálogo: teto de quantidade', () => {
  const products = Array.from({ length: MAX_PRODUCTS + 50 }, (_, index) => ({ code: 'P' + String(index + 1).padStart(5, '0'), title: 't', link: 'https://a.bc/' + index }));
  const started = performance.now();
  const catalog = buildCatalog({ version: 1, updatedAt: null, products });
  assert.ok(performance.now() - started < 1500);
  assert.equal(catalog.products.size, MAX_PRODUCTS);
  assert.ok(catalog.truncated);
});

test('validador e site concordam produto a produto', () => {
  for (const file of ['dev/products.sample.json', 'dev/fixtures/hostile.json']) {
    const text = readFileSync(file, 'utf8');
    const { errors } = validateCatalogText(text);
    const flagged = new Set(errors.map((item) => (item.path.match(/^products\[(\d+)\]/) || [])[1]).filter(Boolean).map(Number));
    const data = JSON.parse(text);
    data.products.forEach((entry, index) => {
      const product = readProduct(entry);
      const siteOk = Boolean(product && product.link && product.title === entry.title);
      if (!flagged.has(index)) assert.ok(siteOk, file + ' products[' + index + '] passou no validador mas o site recusou');
      if (!siteOk) assert.ok(flagged.has(index), file + ' products[' + index + '] foi recusado pelo site mas passou no validador');
    });
  }
  assert.equal(validateCatalogText(readFileSync('data/products.json', 'utf8')).errors.length, 0);
});

test('regex usados com entrada externa são lineares', () => {
  const adversarial = ['a'.repeat(100000) + '!', ('a-' + 'a'.repeat(60) + '.').repeat(200) + '!', 'https://' + 'a.'.repeat(30000) + '!',
    'https://' + 'a'.repeat(100000), ' '.repeat(100000) + 'x', 'P' + '0'.repeat(100000)];
  for (const input of adversarial) {
    const started = performance.now();
    linkProblem(input);
    codeProblem(input);
    readTitle(input);
    parseQuery(input);
    assert.ok(performance.now() - started < 200, 'demorou demais com entrada de ' + input.length + ' caracteres');
  }
});

test('código do site não usa sinks perigosos', () => {
  const forbidden = [/\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new\s+Function\s*\(/,
    /setTimeout\s*\(\s*['"`]/, /setInterval\s*\(\s*['"`]/, /\.srcdoc\b/, /createContextualFragment/, /DOMParser/, /javascript:/i];
  for (const file of readdirSync('js')) {
    const source = readFileSync('js/' + file, 'utf8');
    for (const pattern of forbidden) assert.ok(!pattern.test(source), 'js/' + file + ' contém ' + pattern);
  }
});

test('shelfy é sempre feminina: a, da, na, pela, à', () => {
  const files = ['index.html', 'privacidade.html', 'termos.html', '404.html', 'opensearch.xml', 'README.md', 'SECURITY.md',
    ...readdirSync('js').map((file) => 'js/' + file)];
  const masculine = /(?<![\p{L}\p{N}_])(?:o|do|no|pelo|ao|um|num|dum|este|esse|deste|desse|neste|nesse)\s+shelfy(?![\p{L}\p{N}_-])/iu;
  for (const file of files) {
    const found = readFileSync(file, 'utf8').match(masculine);
    assert.equal(found, null, file + ': “' + found?.[0] + '”');
  }
});

test('exemplos de código nas páginas usam 5 dígitos', () => {
  const files = ['index.html', 'privacidade.html', 'termos.html', '404.html', 'opensearch.xml', 'dev/art/og.svg', ...readdirSync('js').map((file) => 'js/' + file)];
  for (const file of files) {
    const found = readFileSync(file, 'utf8').match(/(?<![A-Za-z0-9])[Pp][0-9]{1,4}(?![0-9])/g);
    assert.equal(found, null, file + ' tem código de exemplo com menos de 5 dígitos: ' + found);
  }
});

test('texto do site: não explica a ferramenta por dentro nem cita a hospedagem', () => {
  for (const page of ['index.html', 'privacidade.html', 'termos.html', '404.html']) {
    const text = readFileSync(page, 'utf8').replace(/<[^>]*>/g, ' ');
    for (const word of ['GitHub', 'drive.file', 'Google Drive', 'publicador', 'token']) assert.ok(!text.includes(word), page + ' cita “' + word + '”');
  }
});

test('HTML: CSP idêntica, nada inline, nada de outro domínio', () => {
  const pages = ['index.html', 'privacidade.html', 'termos.html', '404.html'];
  const policies = new Set();
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
    assert.ok(csp, page + ' sem CSP');
    policies.add(csp[1]);
    assert.ok(!/unsafe-inline|unsafe-eval/.test(csp[1]), page + ' com unsafe');
    assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<link'), page + ': CSP precisa vir antes dos recursos');
    assert.ok(!/\sstyle="/i.test(html), page + ' tem atributo style');
    assert.ok(!/<style[\s>]/i.test(html), page + ' tem <style>');
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), page + ' tem <script> inline');
    assert.ok(!/\son[a-z]+=/i.test(html), page + ' tem handler inline');
    for (const [tag, url] of html.matchAll(/<(?:script|link|img|iframe|source|video|audio)\b[^>]*\b(?:src|href)="([^"]+)"[^>]*>/gi)) {
      if (/rel="canonical"/.test(tag)) continue;
      assert.ok(!/^(?:[a-z]+:)?\/\//i.test(url), page + ' carrega recurso externo: ' + url);
    }
    assert.match(html, /<title>[^<]*shelfy[^<]*<\/title>/, page + ': title sem shelfy');
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, page + ': precisa de exatamente um h1');
  }
  assert.equal(policies.size, 1, 'CSP diferente entre as páginas');
});

test('logo escolhida: SVG limpo e só com cores da paleta do site', () => {
  const palette = new Set(['#fffdfa', '#fff9f2', '#fff4e8', '#ffecd8', '#fddec3', '#fdc8a0', '#fda96e', '#f2823d', '#d96226', '#b9491c',
    '#97371a', '#6f2817', '#2d1d16', '#ffa566', '#d45a1f', '#f08a4b']);
  const svg = readFileSync('dev/art/logo.svg', 'utf8');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 120 120">/);
  assert.ok(!/<(text|image|foreignObject|script|style|use|a)[\s>]|font|href|url\(|@import|\son[a-z]+=/i.test(svg), 'texto, fonte, imagem ou referência externa');
  for (const color of svg.match(/#[0-9a-f]{3,8}\b/gi) || []) assert.ok(palette.has(color.toLowerCase()), 'cor fora da paleta ' + color);
});

test('tema escuro: as mesmas cores valem pelo aparelho e pelo botão, em todas as páginas', () => {
  const css = readFileSync('css/site.css', 'utf8');
  const bySystem = css.match(/:root:not\(\[data-tema="claro"\]\)\s*\{([^}]*)\}/);
  const byButton = css.match(/:root\[data-tema="escuro"\]\s*\{([^}]*)\}/);
  assert.ok(bySystem && byButton, 'os dois blocos do tema escuro existem');
  const declarations = (block) => block[1].split(';').map((line) => line.trim()).filter(Boolean);
  assert.deepEqual(declarations(bySystem), declarations(byButton));
  const versions = new Set();
  for (const page of ['index.html', 'privacidade.html', 'termos.html', '404.html']) {
    const html = readFileSync(page, 'utf8');
    assert.match(html, /<script src="js\/tema\.js\?v=\w+"><\/script>\n<link rel="stylesheet" href="css\/site\.css\?v=\w+">/, page + ': tema.js logo antes do CSS');
    assert.equal((html.match(/<button class="theme-toggle" type="button" data-botao-tema aria-pressed="false" aria-label="Tema escuro" title="Tema escuro" hidden>/g) || []).length, 1, page + ': um botão de tema, escondido até o JS');
    for (const [, version] of html.matchAll(/\.(?:css|js)\?v=(\w+)"/g)) versions.add(version);
  }
  assert.equal(versions.size, 1, 'mesma versão do CSS e do tema.js em todas as páginas');
});
