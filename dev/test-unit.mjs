import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseQuery, parseDeepLink, parseHash, normalizeText, MAX_CODES_PER_QUERY } from '../js/query.js';
import {
  buildCatalog, parseCatalog, readProduct, readTitle, readProductLink, linkProblem, codeProblem, canonicalCode,
  MAX_PRODUCTS, MAX_TITLE_LENGTH
} from '../js/catalog.js';
import { validateCatalogText } from './validate-catalog.mjs';

const char = (...points) => String.fromCodePoint(...points);
const codesOf = (input) => {
  const query = parseQuery(input);
  return query.kind === 'codes' ? query.codes : query.kind;
};

test('todas as formas da seção 4.2 viram P0022', () => {
  const forms = ['P0022', 'p0022', '#P0022', '#p0022', 'P22', 'p 22', '22', '0022', ' #P0022 ', 'P-0022', 'P' + char(0xba) + '22',
    'PO022', 'P0O22', 'po22', 'PO22', 'P 00 22', 'P00022', 'P022', '022', '# P0022', 'P.0022', 'P_0022', 'P:0022', 'P - 0022',
    char(0xff03, 0xff30, 0xff10, 0xff10, 0xff12, 0xff12), 'P' + char(0x200b) + '0022', char(0x202e) + 'P0022', 'P' + char(0x2013) + '0022',
    char(0x420) + '0022', 'P' + char(0x41e) + '022', 'P0022' + char(0xfeff), char(0xa0) + 'P0022' + char(0x3000), 'p' + char(0xad) + '22'];
  for (const form of forms) assert.deepEqual(codesOf(form), ['P0022'], JSON.stringify(form));
});

test('códigos maiores e menores', () => {
  assert.deepEqual(codesOf('P12345'), ['P12345']);
  assert.deepEqual(codesOf('12345'), ['P12345']);
  assert.deepEqual(codesOf('P1234'), ['P1234']);
  assert.deepEqual(codesOf('1'), ['P0001']);
  assert.deepEqual(codesOf('P99999999'), ['P99999999']);
  assert.deepEqual(codesOf('P000000022'), ['P0022']);
  assert.equal(parseQuery('P123456789').kind, 'invalid');
  assert.equal(parseQuery('P123456789').reason, 'long');
});

test('pressa de mostrar: só código completo aparece na hora', () => {
  assert.equal(parseQuery('P0022').settle, 'now');
  assert.equal(parseQuery('22').settle, 'idle');
  assert.equal(parseQuery('P002').settle, 'commit');
  assert.equal(parseQuery('P0').settle, 'commit');
  assert.equal(parseQuery('#P0022 no link').settle, 'now');
});

test('entradas incompletas não viram erro', () => {
  for (const form of ['#', 'P', 'p', '#P', 'PO', 'p-', ' # ', 'P ']) assert.equal(parseQuery(form).kind, 'partial', form);
  for (const form of ['', '   ', char(0x200b), char(0x202e, 0x2066)]) assert.equal(parseQuery(form).kind, 'empty', JSON.stringify(form));
});

test('legenda colada inteira', () => {
  assert.deepEqual(codesOf('Gostou? Busca o código #P0022 no link da bio'), ['P0022']);
  assert.deepEqual(codesOf('Gostou? Busca o código #P0022\nno link da bio'), ['P0022']);
  assert.deepEqual(codesOf('Gostou? Busca o código #P0022no link da bio'), ['P0022']);
  assert.deepEqual(codesOf('Busca no link da bioP0022'), ['P0022']);
  assert.deepEqual(codesOf('Achados da semana: #P0022 #P0023 e #P0137 🔥'), ['P0022', 'P0023', 'P0137']);
  assert.deepEqual(codesOf('#P0022#P0023'), ['P0022', 'P0023']);
  assert.deepEqual(codesOf('P0022P0023'), ['P0022', 'P0023']);
  assert.deepEqual(codesOf('0022 0023'), ['P0022', 'P0023']);
  assert.deepEqual(codesOf('código P0022, repetindo: P0022'), ['P0022']);
  assert.deepEqual(codesOf('código #p22 aqui'), ['P0022']);
  assert.deepEqual(codesOf('Frete grátis! Código PO022 (com O)'), ['P0022']);
  assert.deepEqual(codesOf('CEP 01310-100, código P0022'), ['P0022']);
  const many = Array.from({ length: 15 }, (_, index) => '#P' + String(index + 1).padStart(4, '0')).join(' ');
  assert.equal(codesOf(many).length, MAX_CODES_PER_QUERY);
});

test('sem falso positivo em texto comum', () => {
  for (const text of ['iPhone 15 Pro', 'Tamanho P 38', 'SP2024 promoção', 'Leve 3 pague 2', 'MP3 e P2', 'HP 2024', 'PS5 novo', 'tenis 42']) {
    const query = parseQuery(text);
    assert.notEqual(query.kind, 'codes', text);
  }
  assert.equal(parseQuery('Frete grátis acima de 99').kind, 'suggestion');
  assert.equal(parseQuery('Frete grátis acima de 99').code, 'P0099');
  assert.equal(parseQuery('codigo 22 por favor').code, 'P0022');
  assert.equal(parseQuery('Leve 3 pague 2').kind, 'invalid');
  assert.equal(parseQuery('tenis nike').kind, 'invalid');
});

test('entrada hostil não quebra nem demora', () => {
  const hostile = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', 'javascript:alert(1)', '%3Cscript%3E', '${alert(1)}',
    char(0) + char(7) + 'P0022', '\u0000'.repeat(10), 'P'.repeat(100000), 'P0'.repeat(50000), '#'.repeat(100000), '0'.repeat(100000),
    ('P' + '0'.repeat(15) + ' ').repeat(3000), 'a'.repeat(200000) + 'P0022'];
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
  assert.deepEqual(parseDeepLink('P0022'), ['P0022']);
  assert.deepEqual(parseDeepLink('P0022 P0023'), ['P0022', 'P0023']);
  assert.equal(parseDeepLink('<script>alert(1)</script>'), null);
  assert.equal(parseDeepLink('x'.repeat(201)), null);
  assert.equal(parseDeepLink(''), null);
  assert.deepEqual(parseHash('#P0022'), ['P0022']);
  assert.deepEqual(parseHash('#p22'), ['P0022']);
  assert.deepEqual(parseHash('#%23P0022'), ['P0022']);
  for (const hash of ['#como-funciona', '#buscar', '#sobre', '#conteudo', '#%E0%A4%A', '#<img src=x onerror=alert(1)>', '#' + 'P'.repeat(40)]) {
    assert.equal(parseHash(hash), null, hash);
  }
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
  assert.equal(canonicalCode('P0022'), 'P0022');
  assert.equal(canonicalCode('P00022'), 'P0022');
  assert.equal(canonicalCode('P0000'), 'P0000');
  assert.equal(canonicalCode('P12345678'), 'P12345678');
  assert.equal(codeProblem('P123456789'), 'digits');
  assert.equal(codeProblem('p0022'), 'pattern');
  assert.equal(codeProblem(' P0022'), 'pattern');
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
  assert.ok(empty.ok && empty.products.size === 0 && empty.updatedAt === null && empty.highestNumber === -1);
  const catalog = buildCatalog({ version: 1, updatedAt: '2026-10-02T14:05:00Z', extra: true, products: [
    { code: 'P0022', title: 'velho', link: 'https://a.bc/1' }, null, 'x', { code: 'P0023', title: 'sem link' },
    { code: 'P0024', title: 'link ruim', link: 'javascript:alert(1)' }, { code: 'P0022', title: 'novo', link: 'https://a.bc/2', preco: 1 },
    { code: 'bad', title: 'x', link: 'https://a.bc' }, { code: 'P0025', title: '', link: 'https://a.bc' }
  ] });
  assert.ok(catalog.ok);
  assert.equal(catalog.products.get('P0022').title, 'novo');
  assert.equal(catalog.products.get('P0022').link, 'https://a.bc/2');
  assert.equal(catalog.products.get('P0023').link, null);
  assert.equal(catalog.products.get('P0024').link, null);
  assert.equal(catalog.products.size, 3);
  assert.equal(catalog.ignored, 4);
  assert.equal(catalog.highestNumber, 24);
  assert.equal(catalog.updatedAt.toISOString(), '2026-10-02T14:05:00.000Z');
  assert.equal(buildCatalog({ version: 1, updatedAt: 'ontem', products: [] }).updatedAt, null);
  const polluted = JSON.parse('{"version":1,"products":[{"__proto__":{"code":"P0001","title":"x","link":"https://a.bc"}}]}');
  assert.equal(buildCatalog(polluted).products.size, 0);
});

test('catálogo: teto de quantidade', () => {
  const products = Array.from({ length: MAX_PRODUCTS + 50 }, (_, index) => ({ code: 'P' + String(index + 1).padStart(4, '0'), title: 't', link: 'https://a.bc/' + index }));
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
