import { readFileSync } from 'node:fs';

const TEXT = 4.5;
const LARGE = 3;
const UI = 3;

const PAIRS = [
  ['ink', 'white', TEXT, 'texto principal'],
  ['ink', 'cream', TEXT, 'texto no rodapé'],
  ['ink', 'peach-50', TEXT, 'texto sobre o fundo do herói'],
  ['ink', 'peach-100', TEXT, 'texto em superfície pêssego'],
  ['ink', 'peach-200', TEXT, 'título sobre o brilho do herói'],
  ['ink', 'apricot-300', TEXT, 'texto selecionado'],
  ['ink-soft', 'white', TEXT, 'texto secundário'],
  ['ink-soft', 'cream', TEXT, 'texto secundário no rodapé'],
  ['ink-soft', 'peach-50', TEXT, 'texto secundário em card pêssego'],
  ['ink-soft', 'peach-100', TEXT, 'texto secundário em superfície pêssego'],
  ['ink-muted', 'white', TEXT, 'legendas e dicas'],
  ['ink-muted', 'cream', TEXT, 'legendas no rodapé'],
  ['ink-muted', 'peach-50', TEXT, 'dica da busca sobre o herói'],
  ['ink-muted', 'peach-100', TEXT, 'legendas em superfície pêssego'],
  ['terra-700', 'white', TEXT, 'links'],
  ['terra-700', 'cream', TEXT, 'links no rodapé'],
  ['terra-700', 'peach-50', TEXT, 'links em card pêssego'],
  ['terra-700', 'peach-200', LARGE, 'destaque do título grande sobre o brilho'],
  ['terra-800', 'white', TEXT, 'links fortes e botões secundários'],
  ['terra-800', 'cream', TEXT, 'links do rodapé'],
  ['terra-800', 'peach-50', TEXT, 'botão discreto'],
  ['terra-800', 'peach-100', TEXT, 'selo e links em superfície pêssego'],
  ['terra-900', 'peach-50', TEXT, 'aviso de indisponível'],
  ['terra-900', 'peach-100', TEXT, 'código do produto'],
  ['terra-900', 'peach-200', TEXT, 'botão copiar (copiado)'],
  ['terra-900', 'white', TEXT, 'marca shelfy'],
  ['white', 'terra-700', TEXT, 'botão principal (início do gradiente)'],
  ['white', 'terra-800', TEXT, 'botão principal (fim do gradiente)'],
  ['white', 'action-hover', TEXT, 'botão principal em hover'],
  ['white', 'terra-900', TEXT, 'botão principal em hover (fim)'],
  ['field-border', 'white', UI, 'borda da caixa de busca (lado de dentro)'],
  ['field-border', 'peach-50', UI, 'borda da caixa de busca (fundo do herói)'],
  ['field-border', 'cream', UI, 'borda da caixa de busca (fundo claro)'],
  ['focus', 'white', UI, 'anel de foco'],
  ['focus', 'cream', UI, 'anel de foco no rodapé'],
  ['focus', 'peach-50', UI, 'anel de foco em card pêssego'],
  ['focus', 'peach-100', UI, 'anel de foco em superfície pêssego'],
  ['action', 'white', UI, 'botão de enviar dentro da caixa de busca'],
  ['orange-600', 'white', UI, 'ícone da lupa'],
  ['terra-700', 'peach-100', UI, 'ícones dos passos e dos avisos']
];

function oklchToLinearSrgb(lightness, chroma, hue) {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
}

const clamp = (value) => Math.min(1, Math.max(0, value));
const luminance = ([r, g, b]) => 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
const inGamut = (rgb) => rgb.every((value) => value >= -0.001 && value <= 1.001);
const encode = (value) => (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);
const hex = (rgb) => '#' + rgb.map((value) => Math.round(clamp(encode(clamp(value))) * 255).toString(16).padStart(2, '0')).join('');

function readTokens(css) {
  const tokens = new Map();
  for (const [, name, value] of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    if (!tokens.has(name)) tokens.set(name, value.trim());
  }
  return tokens;
}

function resolve(tokens, name, seen = new Set()) {
  if (seen.has(name)) throw new Error('referência circular em --' + name);
  seen.add(name);
  const value = tokens.get(name);
  if (!value) throw new Error('token --' + name + ' não encontrado');
  const alias = value.match(/^var\(--([a-z0-9-]+)\)$/);
  if (alias) return resolve(tokens, alias[1], seen);
  const color = value.match(/^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (!color) throw new Error('--' + name + ' não é oklch() opaco: ' + value);
  return oklchToLinearSrgb(Number(color[1]) / 100, Number(color[2]), Number(color[3]));
}

const tokens = readTokens(readFileSync(new URL('../css/site.css', import.meta.url), 'utf8'));
let failures = 0;
const rows = [];
for (const [foreground, background, minimum, usage] of PAIRS) {
  const fg = resolve(tokens, foreground);
  const bg = resolve(tokens, background);
  const lighter = Math.max(luminance(fg), luminance(bg));
  const darker = Math.min(luminance(fg), luminance(bg));
  const ratio = (lighter + 0.05) / (darker + 0.05);
  const ok = ratio >= minimum;
  if (!ok) failures += 1;
  const gamut = inGamut(fg) && inGamut(bg) ? '' : ' (fora do sRGB)';
  rows.push((ok ? 'ok   ' : 'FALHA') + '  ' + ratio.toFixed(2).padStart(5) + ':1  mín ' + minimum + '  --' + foreground + ' ' + hex(fg) + ' sobre --' + background + ' ' + hex(bg) + gamut + '  — ' + usage);
}
console.log(rows.join('\n'));
console.log(failures ? failures + ' par(es) abaixo do mínimo' : 'todos os ' + PAIRS.length + ' pares passam no WCAG 2.2 AA');
process.exitCode = failures ? 1 : 0;
