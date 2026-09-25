import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CATALOG_VERSION,
  MAX_CATALOG_BYTES,
  MAX_PRODUCTS,
  MAX_TITLE_LENGTH,
  MAX_LINK_LENGTH,
  MIN_LINK_LENGTH,
  MAX_CODE_LENGTH,
  canonicalCode,
  codeProblem,
  titleProblem,
  linkProblem
} from '../js/catalog.js';

const UPDATED_AT_PATTERN = /^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,9})?Z$/;

export function readUpdatedAt(value) {
  if (typeof value !== 'string' || !UPDATED_AT_PATTERN.test(value)) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time);
}

const CODE_MESSAGES = {
  type: 'code precisa ser texto (string)',
  length: 'code tem mais de ' + MAX_CODE_LENGTH + ' caracteres',
  pattern: 'code fora do padrão ^P[0-9]{4,}$ (P maiúsculo + no mínimo 4 dígitos, nada mais)',
  digits: 'code tem mais de 8 dígitos significativos; a busca não alcança'
};
const TITLE_MESSAGES = {
  type: 'title precisa ser texto (string)',
  blank: 'title está vazio ou só tem espaços',
  length: 'title passa de ' + MAX_TITLE_LENGTH + ' caracteres (o site corta, mas o contrato não permite)'
};
const LINK_MESSAGES = {
  type: 'link precisa ser texto (string)',
  length: 'link precisa ter entre ' + MIN_LINK_LENGTH + ' e ' + MAX_LINK_LENGTH + ' caracteres',
  scheme: 'link precisa começar com https:// (http:, javascript:, data: e links relativos são recusados)',
  characters: 'link tem espaço, caractere de controle, barra invertida ou caractere fora do ASCII (use percent-encoding)',
  credentials: 'link tem usuário/senha antes do host (padrão https://usuario@host) — proibido',
  port: 'link tem porta explícita (:1234) — proibido',
  host: 'host do link inválido (precisa ser um domínio como loja.exemplo.com; IP, localhost e rótulos inválidos são recusados)',
  parse: 'link não é uma URL válida'
};

export function validateCatalogText(text, byteLength = Buffer.byteLength(text)) {
  const errors = [];
  const warnings = [];
  const error = (path, message) => errors.push({ path, message });
  const warning = (path, message) => warnings.push({ path, message });

  if (byteLength > MAX_CATALOG_BYTES) {
    error('(arquivo)', 'arquivo tem ' + byteLength + ' bytes; o site recusa acima de ' + MAX_CATALOG_BYTES);
    return { errors, warnings };
  }
  if (text.charCodeAt(0) === 0xfeff) error('(arquivo)', 'arquivo começa com BOM; grave UTF-8 sem BOM');

  let data;
  try {
    data = JSON.parse(text);
  } catch (problem) {
    error('(arquivo)', 'JSON inválido: ' + problem.message);
    return { errors, warnings };
  }

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    error('(raiz)', 'a raiz precisa ser um objeto { "version", "updatedAt", "products" }');
    return { errors, warnings };
  }
  if (!Object.prototype.hasOwnProperty.call(data, 'version')) error('version', 'campo obrigatório ausente');
  else if (data.version !== CATALOG_VERSION) error('version', 'precisa ser o número 1 (veio ' + JSON.stringify(data.version) + ')');

  if (!Object.prototype.hasOwnProperty.call(data, 'updatedAt')) error('updatedAt', 'campo obrigatório ausente (use null se nunca foi gerado)');
  else if (data.updatedAt !== null && !readUpdatedAt(data.updatedAt)) {
    error('updatedAt', 'precisa ser null ou data ISO 8601 em UTC, como 2026-10-02T14:05:00Z (veio ' + JSON.stringify(data.updatedAt) + ')');
  }

  if (!Array.isArray(data.products)) {
    error('products', 'precisa ser uma lista (array), mesmo que vazia');
    return { errors, warnings };
  }
  if (data.products.length > MAX_PRODUCTS) {
    error('products', 'tem ' + data.products.length + ' itens; o máximo é ' + MAX_PRODUCTS + ' (o site ignora o excedente)');
  }

  const seen = new Map();
  let previousNumber = -1;
  data.products.forEach((entry, index) => {
    const path = 'products[' + index + ']';
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      error(path, 'cada produto precisa ser um objeto { "code", "title", "link" }');
      return;
    }
    const codeIssue = codeProblem(entry.code);
    if (codeIssue) error(path + '.code', CODE_MESSAGES[codeIssue] + ' (veio ' + JSON.stringify(entry.code) + ')');
    const titleIssue = titleProblem(entry.title);
    if (titleIssue) error(path + '.title', TITLE_MESSAGES[titleIssue]);
    if (!Object.prototype.hasOwnProperty.call(entry, 'link')) error(path + '.link', 'campo obrigatório ausente');
    else {
      const linkIssue = linkProblem(entry.link);
      if (linkIssue) error(path + '.link', LINK_MESSAGES[linkIssue]);
    }
    if (codeIssue) return;
    const canonical = canonicalCode(entry.code);
    if (canonical !== entry.code) warning(path + '.code', entry.code + ' não está na forma canônica; o site trata como ' + canonical);
    if (seen.has(canonical)) {
      error(path + '.code', canonical + ' repetido (também em products[' + seen.get(canonical) + ']); no site vale o último');
    }
    seen.set(canonical, index);
    const number = Number(canonical.slice(1));
    if (number < previousNumber) warning(path + '.code', 'lista fora de ordem: ordene pelo número do código (' + entry.code + ' veio depois de um número maior)');
    previousNumber = Math.max(previousNumber, number);
  });

  if (!errors.length && JSON.stringify(data, null, 2) + '\n' !== text.replace(/\r\n/g, '\n')) {
    warning('(arquivo)', 'formatação diferente do padrão (JSON com 2 espaços de indentação e quebra de linha final)');
  }
  return { errors, warnings };
}

function main(argv) {
  const args = argv.filter((arg) => !arg.startsWith('--'));
  const asJson = argv.includes('--json');
  const strict = argv.includes('--strict');
  const file = resolve(args[0] || 'data/products.json');
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch (problem) {
    console.error('não foi possível ler ' + file + ': ' + problem.message);
    return 2;
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    console.error(file + ': o arquivo não é UTF-8 válido');
    return 1;
  }
  const { errors, warnings } = validateCatalogText(text, bytes.length);
  const failed = errors.length > 0 || (strict && warnings.length > 0);
  if (asJson) {
    console.log(JSON.stringify({ file, ok: !failed, errors, warnings }, null, 2));
  } else {
    for (const item of errors) console.log('ERRO   ' + item.path + ': ' + item.message);
    for (const item of warnings) console.log('AVISO  ' + item.path + ': ' + item.message);
    console.log((failed ? 'REPROVADO' : 'OK') + ' — ' + file + ': ' + errors.length + ' erro(s), ' + warnings.length + ' aviso(s)');
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
