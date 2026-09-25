import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEV = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(DEV, 'fixtures');

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const next = random(22);
const pick = (list) => list[Math.floor(next() * list.length)];
const code = (number) => 'P' + String(number).padStart(4, '0');

const items = ['Espremedor de frutas', 'Luminária de mesa', 'Garrafa térmica', 'Organizador de gavetas', 'Mini processador de alimentos',
  'Tapete antiderrapante', 'Suporte de celular', 'Kit de potes herméticos', 'Mochila impermeável', 'Fone de ouvido sem fio',
  'Panela elétrica de arroz', 'Escova secadora', 'Umidificador de ar', 'Relógio digital de parede', 'Caixa de som portátil',
  'Jogo de facas de cozinha', 'Porta-temperos giratório', 'Travesseiro de espuma', 'Cortina blackout', 'Carregador portátil'];
const details = ['elétrico 300ml', 'LED recarregável', 'inox 1 litro', 'com 8 divisórias', 'de vidro com tampa', 'dobrável',
  'com ajuste de altura', 'para viagem', 'bivolt', 'com controle remoto', 'em bambu', 'com 3 velocidades', 'à prova d’água',
  'com luz noturna', 'de silicone', 'em cerâmica', 'kit com 6 peças', 'tamanho família', 'com timer', 'extra macio'];
const extras = ['', '', '', ' — edição especial', ' (cor sortida)', ' 🔥', ' “oferta da semana”', ' com 2 anos de garantia',
  ' | frete rápido', ' 🧡✨', " 'aspas simples'", ' e "aspas duplas"', ' <b>negrito literal</b>', ' <script>alert("xss")</script>'];

function slug(text) {
  return text.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60);
}

function sampleTitle(index) {
  let title = pick(items) + ' ' + pick(details) + pick(extras);
  if (index % 97 === 0) title += ' — ' + 'descrição longa do produto com detalhes de tamanho, cor, voltagem e conteúdo da embalagem '.repeat(3).trim();
  return title;
}

function sampleLink(number, title) {
  const roll = next();
  if (roll < 0.03) return pick(['http://loja.example.com/p/' + number, 'javascript:alert(document.domain)', 'data:text/html,<script>alert(1)</script>', '/produto/' + number, 'https://usuario:senha@loja.example.com/p/' + number, 'nao-e-um-link']);
  return 'https://loja.example.com/p/' + slug(title) + '-' + number + '?aff=shelfy&src=bio';
}

function buildSample() {
  const products = [];
  for (let number = 1; number <= 2100; number += 1) {
    if (number !== 22 && number !== 23 && next() < 0.05) continue;
    const title = number === 22 ? 'Espremedor de frutas elétrico 300ml' : sampleTitle(number);
    products.push({ code: code(number), title, link: number === 22 ? 'https://loja.example.com/p/espremedor-de-frutas-eletrico-300ml-22?aff=shelfy' : sampleLink(number, title) });
  }
  products.push({ code: 'P12345', title: 'Luminária de mesa LED recarregável com 3 temperaturas de cor', link: 'https://loja.example.com/p/luminaria-12345' });
  return { version: 1, updatedAt: '2026-09-24T14:05:00Z', products };
}

const hostileTitles = [
  '<script>alert("xss")</script> Garrafa térmica',
  '<img src=x onerror=alert(1)> Luminária',
  '"><svg onload=alert(1)> Tapete',
  '&lt;b&gt;entidade&lt;/b&gt; &amp; &#x3C;script&#x3E; Organizador',
  'Fone com RLO __RLO__ossefrop olad oirártnoc',
  'Cha__ZWSP__leira com zero__ZWJ__width__ZWNJ__ e __WJ__ invisíveis',
  'Controle__NUL__ com__BEL__ caracteres de__ESC__ controle',
  'Bidi __LRI__isolado__PDI__ e __RLE__embutido__PDF__',
  '🔥🔥 Oferta relâmpago 🔥🔥 👨‍👩‍👧 família',
  'مصباح LED قابل لإعادة الشحن',
  'Z̴̡̛͓a̶̢͎l̷̙͝g̸̖̏o̵̲͂ combinando marcas',
  'Título enorme ' + 'muito longo '.repeat(80),
  'javascript:alert(1)',
  '   '
];

const hostileLinks = [
  'javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'java__TAB__script:alert(1)', 'jav&#x09;ascript:alert(1)',
  'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'http://loja.example.com/p/1', 'HTTPS://LOJA.EXAMPLE.COM/p/1',
  'https://usuario:senha@loja.example.com/p/1', 'https://loja.example.com@evil.example/p/1', 'https://evil.example__BACKSLASH__@loja.example.com/',
  'https://127.0.0.1/p/1', 'https://[::1]/p/1', 'https://localhost/p/1', 'https://loja.example.com:8443/p/1', '//loja.example.com/p/1',
  '/p/1', 'https://loja.example.com/' + 'a'.repeat(3000), 'https://loja.example.com/__RLO__lmth.exe', 'https://loja.example.com/ espaço',
  'https://-loja.example.com/p/1', 'https://loja..example.com/p/1', 'https://loja.example.c0m/p/1', 'https://loja.example.com./p/1',
  'https://xn--bcher-kva.example/p/1', 'https://loja.example.com/p/1?q=<script>alert(1)</script>', 12345, null, ['https://loja.example.com/p/1'], { href: 'https://loja.example.com' }
];

function buildHostile() {
  const products = [];
  let number = 1;
  for (const title of hostileTitles) {
    products.push({ code: code(number), title: expand(title), link: 'https://loja.example.com/p/' + number });
    number += 1;
  }
  const firstLink = number;
  for (const link of hostileLinks) {
    products.push({ code: code(number), title: 'Link hostil ' + code(number), link: typeof link === 'string' ? expand(link) : link });
    number += 1;
  }
  products.push({ code: 'P0022', title: 'Primeira versão (deve perder)', link: 'https://loja.example.com/p/antigo' });
  products.push({ code: 'P0022', title: 'Versão mais nova (deve ganhar)', link: 'https://loja.example.com/p/novo' });
  products.push({ code: 'P00023', title: 'Código não canônico P00023 vira P0023', link: 'https://loja.example.com/p/23' });
  products.push(null, 'texto', 42, [], {}, { code: 'P0200' }, { title: 'Sem código', link: 'https://loja.example.com/p/x' });
  products.push({ code: 'P0201', title: 'Sem link (indisponível)' });
  products.push({ code: 'P0202', title: 42, link: 'https://loja.example.com/p/202' });
  products.push({ code: 22, title: 'Código numérico', link: 'https://loja.example.com/p/22' });
  products.push({ code: 'p0203', title: 'Código minúsculo', link: 'https://loja.example.com/p/203' });
  products.push({ code: 'P-0204', title: 'Código com hífen', link: 'https://loja.example.com/p/204' });
  products.push({ code: 'P123456789', title: 'Código com 9 dígitos', link: 'https://loja.example.com/p/9' });
  products.push({ code: 'P' + '0'.repeat(30) + '5', title: 'Código gigante', link: 'https://loja.example.com/p/5' });
  products.push({ code: '<script>alert(1)</script>', title: 'Código com script', link: 'https://loja.example.com/p/s' });
  products.push({ code: 'P0205', title: 'Campos extras são ignorados', link: 'https://loja.example.com/p/205', preco: 19.9, tags: ['a'], constructor: 'x' });
  return { version: 1, updatedAt: '2026-09-24T14:05:00Z', products, extra: { ignorado: true }, firstHostileLink: firstLink };
}

const replacements = {
  __RLO__: 0x202e, __ZWSP__: 0x200b, __ZWJ__: 0x200d, __ZWNJ__: 0x200c, __WJ__: 0x2060, __NUL__: 0x0000, __BEL__: 0x0007,
  __ESC__: 0x001b, __LRI__: 0x2066, __PDI__: 0x2069, __RLE__: 0x202b, __PDF__: 0x202c, __TAB__: 0x0009, __BACKSLASH__: 0x005c
};

function expand(text) {
  let result = text;
  for (const [token, point] of Object.entries(replacements)) result = result.split(token).join(String.fromCodePoint(point));
  return result;
}

function buildHuge(count) {
  const products = [];
  for (let number = 1; number <= count; number += 1) {
    products.push({ code: code(number), title: 'Produto de teste número ' + number + ' com um título de tamanho médio', link: 'https://loja.example.com/p/' + number + '?aff=shelfy' });
  }
  return { version: 1, updatedAt: '2026-09-24T14:05:00Z', products };
}

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
}

write(join(DEV, 'products.sample.json'), buildSample());
write(join(FIXTURES, 'hostile.json'), buildHostile());
write(join(FIXTURES, 'empty.json'), { version: 1, updatedAt: null, products: [] });
write(join(FIXTURES, 'broken.json'), '{"version": 1, "updatedAt": null, "products": [{"code": "P0022", "title": "Quebrado"');
write(join(FIXTURES, 'version2.json'), { version: 2, updatedAt: null, products: [] });
write(join(FIXTURES, 'version-string.json'), { version: '1', updatedAt: null, products: [] });
write(join(FIXTURES, 'no-products.json'), { version: 1, updatedAt: null });
write(join(FIXTURES, 'products-object.json'), { version: 1, updatedAt: null, products: { P0022: 'x' } });
write(join(FIXTURES, 'array-root.json'), [{ code: 'P0022', title: 'Raiz errada', link: 'https://loja.example.com/p/22' }]);
write(join(FIXTURES, 'deep-nesting.json'), '{"version":1,"products":[' + '['.repeat(20000) + ']'.repeat(20000) + ']}');
write(join(FIXTURES, 'gen-huge-5000.json'), buildHuge(5000));
write(join(FIXTURES, 'gen-huge-12000.json'), buildHuge(12000));
const oversized = buildHuge(1);
oversized.padding = 'x'.repeat(5200000);
write(join(FIXTURES, 'gen-oversized.json'), oversized);
console.log('fixtures geradas em', FIXTURES);
