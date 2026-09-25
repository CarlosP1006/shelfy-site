import { readFileSync } from 'node:fs';
import { codeProblem, titleProblem, linkProblem, readUpdatedAt } from '../js/catalog.js';

const char = (...points) => String.fromCodePoint(...points);
const cases = [];
const add = (kind, value) => cases.push({ kind, value });

for (const file of ['dev/products.sample.json', 'dev/fixtures/hostile.json']) {
  for (const entry of JSON.parse(readFileSync(file, 'utf8')).products) add('product', entry);
}

const base = { code: 'P0022', title: 'Produto', link: 'https://loja.example.com/p/1' };
const links = ['https://a.bc', 'https://a.b', 'https://a.bc\n', 'https://a.bc/\n', 'https://A.BC/X', 'https://loja.example.com.',
  'https://' + 'a'.repeat(63) + '.com', 'https://' + 'a'.repeat(64) + '.com', 'https://a_b.example.com/', 'https://a.example.123',
  'https://xn--bcher-kva.example', 'https://a.xn--p1ai/', 'https://a.xn--p1ai-/', 'https://a.bc/' + 'x'.repeat(2035), 'https://a.bc/' + 'x'.repeat(2036),
  'https://a.bc/%20', 'https://a.bc/?q=a b', 'https://a.bc#frag', 'https://a.bc?x', 'https://a.bc:443/', 'https://u@a.bc/', 'https://a.bc/' + char(0x7f),
  'https://a.bc/' + char(0xe9), 'https://a.bc/' + char(0x5c), 'https://%61.bc/', 'https://a.bc/' + char(0x202e), 'https://-a.bc/', 'https://a-.bc/',
  'https://1.2.3.4/', 'https://a.b-c/', 'https://a.bc./', ' https://a.bc/', 'https://a.bc/ ', 'ftp://a.bc/', 'https:/a.bc/', 'https:///a.bc/'];
for (const link of links) add('product', { ...base, link });
const codes = ['P0022', 'P00022', 'P123456789', 'P12345678', 'P0000', 'P' + '0'.repeat(15), 'P' + '0'.repeat(16), 'p0022', 'P0022\n', 'P022',
  'P' + char(0x662, 0x662, 0x662, 0x662), ' P0022', 'P0022 ', 'P00000000000001'];
for (const code of codes) add('product', { ...base, code });
const titles = ['', ' ', '\t\n', 'a', char(0xa0), char(0x3000), char(0x1c), char(0xfeff), 'x'.repeat(500), 'x'.repeat(501),
  '🔥'.repeat(300), '🔥'.repeat(500), '🔥'.repeat(501), 'e' + char(0x301).repeat(499), '<script>alert(1)</script>', 'a\nb'];
for (const title of titles) add('product', { ...base, title });
add('product', { code: 'P0022', title: 'sem link' });
add('product', { ...base, extra: { nested: true } });

const updatedAts = [null, '2026-10-02T14:05:00Z', '2026-10-02T14:05:00.123Z', '2026-10-02T14:05:00+00:00', '2026-02-30T00:00:00Z',
  '2026-13-01T00:00:00Z', '2026-10-02 14:05:00Z', '2026-10-02T14:05:00Z\n', '', 'ontem', 12345];
for (const updatedAt of updatedAts) add('updatedAt', updatedAt);

for (const item of cases) {
  if (item.kind === 'product') {
    const entry = item.value;
    const isObject = entry !== null && typeof entry === 'object' && !Array.isArray(entry);
    item.site = isObject && 'link' in entry && !codeProblem(entry.code) && !titleProblem(entry.title) && !linkProblem(entry.link);
  } else {
    item.site = item.value === null || Boolean(readUpdatedAt(item.value));
  }
}
process.stdout.write(JSON.stringify(cases));
