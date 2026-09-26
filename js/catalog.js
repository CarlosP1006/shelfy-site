export const CATALOG_VERSION = 1;
export const MAX_CATALOG_BYTES = 5000000;
export const MAX_PRODUCTS = 10000;
export const MAX_CODE_LENGTH = 16;
export const MAX_SIGNIFICANT_DIGITS = 8;
export const CODE_DIGITS = 5;
export const MAX_TITLE_LENGTH = 500;
export const MIN_LINK_LENGTH = 12;
export const MAX_LINK_LENGTH = 2048;
export const MAX_HOST_LENGTH = 253;

const CODE_PATTERN = /^P[0-9]{4,}$/;
const HOST_LABEL_PATTERN = /^[a-z0-9-]{1,63}$/;
const TOP_LEVEL_LABEL_PATTERN = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const NON_BLANK_PATTERN = /[^\t\n\v\f\r ]/;
const LEADING_ZEROS_PATTERN = /^0+/;

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function formatCode(digits) {
  const significant = digits.replace(LEADING_ZEROS_PATTERN, '');
  if (significant.length > MAX_SIGNIFICANT_DIGITS) return null;
  return 'P' + significant.padStart(CODE_DIGITS, '0');
}

export function codeProblem(code) {
  if (typeof code !== 'string') return 'type';
  if (code.length > MAX_CODE_LENGTH) return 'length';
  if (!CODE_PATTERN.test(code)) return 'pattern';
  if (!formatCode(code.slice(1))) return 'digits';
  return '';
}

export function canonicalCode(code) {
  return codeProblem(code) ? null : formatCode(code.slice(1));
}

function codePointCut(text, limit) {
  if (text.length <= limit) return -1;
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (count === limit) return index;
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) index += 1;
    }
    count += 1;
  }
  return -1;
}

export function titleProblem(title) {
  if (typeof title !== 'string') return 'type';
  if (!NON_BLANK_PATTERN.test(title)) return 'blank';
  if (codePointCut(title, MAX_TITLE_LENGTH) !== -1) return 'length';
  return '';
}

export function readTitle(title) {
  const problem = titleProblem(title);
  if (problem && problem !== 'length') return null;
  if (!problem) return title;
  return title.slice(0, codePointCut(title, MAX_TITLE_LENGTH)).trimEnd() + '\u2026';
}

function hostnameProblem(host) {
  if (host.length < 4 || host.length > MAX_HOST_LENGTH) return 'host';
  const labels = host.split('.');
  if (labels.length < 2) return 'host';
  for (const label of labels) {
    if (!HOST_LABEL_PATTERN.test(label) || label.startsWith('-') || label.endsWith('-')) return 'host';
  }
  return TOP_LEVEL_LABEL_PATTERN.test(labels[labels.length - 1]) ? '' : 'host';
}

function inspectLink(link) {
  if (typeof link !== 'string') return { problem: 'type' };
  if (link.length < MIN_LINK_LENGTH || link.length > MAX_LINK_LENGTH) return { problem: 'length' };
  if (!link.startsWith('https://')) return { problem: 'scheme' };
  for (let index = 0; index < link.length; index += 1) {
    const code = link.charCodeAt(index);
    if (code < 0x21 || code > 0x7e || code === 0x5c) return { problem: 'characters' };
  }
  const rest = link.slice(8);
  let authorityEnd = rest.length;
  for (const separator of ['/', '?', '#']) {
    const position = rest.indexOf(separator);
    if (position !== -1 && position < authorityEnd) authorityEnd = position;
  }
  const authority = rest.slice(0, authorityEnd);
  if (authority.includes('@')) return { problem: 'credentials' };
  if (authority.startsWith('[')) return { problem: 'host' };
  if (authority.includes(':')) return { problem: 'port' };
  const host = authority.toLowerCase();
  if (hostnameProblem(host)) return { problem: 'host' };
  let url;
  try {
    url = new URL(link);
  } catch {
    return { problem: 'parse' };
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hostname !== host) {
    return { problem: 'parse' };
  }
  return { problem: '', href: url.href };
}

export function linkProblem(link) {
  return inspectLink(link).problem;
}

export function readProductLink(link) {
  const inspection = inspectLink(link);
  return inspection.problem ? null : inspection.href;
}

export function readProduct(entry) {
  if (!isPlainObject(entry)) return null;
  const code = canonicalCode(own(entry, 'code'));
  const title = readTitle(own(entry, 'title'));
  if (!code || !title) return null;
  return { code, title, link: readProductLink(own(entry, 'link')) };
}

export function buildCatalog(data) {
  if (!isPlainObject(data)) return { ok: false, reason: 'shape' };
  if (own(data, 'version') !== CATALOG_VERSION) return { ok: false, reason: 'version' };
  const entries = own(data, 'products');
  if (!Array.isArray(entries)) return { ok: false, reason: 'shape' };

  const products = new Map();
  const limit = Math.min(entries.length, MAX_PRODUCTS);
  let ignored = 0;
  for (let index = 0; index < limit; index += 1) {
    const product = readProduct(entries[index]);
    if (product) products.set(product.code, product);
    else ignored += 1;
  }

  let highestNumber = -1;
  for (const code of products.keys()) {
    const number = Number(code.slice(1));
    if (number > highestNumber) highestNumber = number;
  }

  return {
    ok: true,
    products,
    highestNumber,
    ignored,
    truncated: entries.length > limit
  };
}

export function parseCatalog(text) {
  if (typeof text !== 'string') return { ok: false, reason: 'shape' };
  if (text.length > MAX_CATALOG_BYTES) return { ok: false, reason: 'size' };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'json' };
  }
  return buildCatalog(data);
}
