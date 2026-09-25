import { formatCode } from './catalog.js';

export const MAX_QUERY_LENGTH = 4000;
export const MAX_DEEP_LINK_LENGTH = 200;
export const MAX_CODES_PER_QUERY = 10;
export const TEST_CODE = 'TESTE676767';
const MAX_RUN_LENGTH = 16;
const MAX_HASH_LENGTH = 32;
const SCAN_SEPARATORS = ' -.:_';

const ORDINAL_PATTERN = /[\u00ba\u00aa\u00b0]/g;
const FORMAT_CHARACTER_PATTERN = /\p{Cf}/gu;
const P_LOOKALIKE_PATTERN = /[\u0420\u0440\u03a1\u03c1]/g;
const O_LOOKALIKE_PATTERN = /[\u041e\u043e\u039f\u03bf]/g;
const DASH_PATTERN = /[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g;
const SPACE_PATTERN = /\s+/g;
const COMPACT_SEPARATOR_PATTERN = /[\s#\-._:]+/g;
const DIRECT_CODE_PATTERN = /^[Pp]?([0-9OoIl|]+)$/;
const PARTIAL_PATTERN = /^[Pp]?[OoIl|]*$/;
const TOKEN_CODE_PATTERN = /^[Pp]?[0-9Oo]{4,}$/;
const LEADING_P_PATTERN = /^[Pp]/;
const LETTER_O_PATTERN = /[Oo]/g;
const LETTER_ONE_PATTERN = /[Il|]/g;
const DIGIT_RUN_PATTERN = /[0-9]+/g;
const RUN_CHARACTER_PATTERN = /[0-9Oo]/;
const LETTER_OR_DIGIT_PATTERN = /[\p{L}\p{N}]/u;
const LOWERCASE_PATTERN = /\p{Ll}/u;

export function normalizeText(raw) {
  return String(raw ?? '')
    .slice(0, MAX_QUERY_LENGTH)
    .replace(ORDINAL_PATTERN, ' ')
    .normalize('NFKC')
    .replace(FORMAT_CHARACTER_PATTERN, '')
    .replace(P_LOOKALIKE_PATTERN, 'P')
    .replace(O_LOOKALIKE_PATTERN, 'O')
    .replace(DASH_PATTERN, '-')
    .replace(SPACE_PATTERN, ' ')
    .trim();
}

function toDigits(run) {
  return run.replace(LETTER_O_PATTERN, '0').replace(LETTER_ONE_PATTERN, '1');
}

function settleFor(run) {
  if (run.length >= 4) return 'now';
  return run[0] === '0' || run[0] === 'O' || run[0] === 'o' ? 'commit' : 'idle';
}

function isDigitAt(text, index) {
  const code = text.charCodeAt(index);
  return code >= 48 && code <= 57;
}

function parseDirect(text) {
  const compact = text.replace(COMPACT_SEPARATOR_PATTERN, '');
  if (PARTIAL_PATTERN.test(compact)) return { kind: 'partial' };
  const match = DIRECT_CODE_PATTERN.exec(compact);
  if (!match) return null;

  const tokens = text.split(COMPACT_SEPARATOR_PATTERN).filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => TOKEN_CODE_PATTERN.test(token))) {
    const codes = [];
    for (const token of tokens.slice(0, MAX_CODES_PER_QUERY)) {
      const code = formatCode(toDigits(token.replace(LEADING_P_PATTERN, '')));
      if (!code) return { kind: 'invalid', reason: 'long' };
      if (!codes.includes(code)) codes.push(code);
    }
    return { kind: 'codes', codes, source: 'direct', settle: 'now' };
  }

  const run = match[1];
  const code = formatCode(toDigits(run));
  if (!code) return { kind: 'invalid', reason: 'long' };
  return { kind: 'codes', codes: [code], source: 'direct', settle: settleFor(run) };
}

function scanText(text) {
  const codes = [];
  let lastEnd = -1;
  let shortestRun = Infinity;

  for (let index = 0; index < text.length && codes.length < MAX_CODES_PER_QUERY; index += 1) {
    const character = text[index];
    if (character !== 'P' && character !== 'p') continue;

    const previous = index > 0 ? text[index - 1] : '';
    const hashBefore = previous === '#' || (previous === ' ' && text[index - 2] === '#');
    const glued = previous !== '' && !hashBefore && LETTER_OR_DIGIT_PATTERN.test(previous);
    if (glued) {
      const chained = index === lastEnd;
      const gluedToWord = character === 'P' && LOWERCASE_PATTERN.test(previous);
      if (!chained && !gluedToWord) continue;
    }

    let cursor = index + 1;
    let separators = 0;
    while (cursor < text.length && separators < 3 && SCAN_SEPARATORS.includes(text[cursor])) {
      cursor += 1;
      separators += 1;
    }

    const runStart = cursor;
    let runEnd = -1;
    while (cursor < text.length && cursor - runStart < MAX_RUN_LENGTH && RUN_CHARACTER_PATTERN.test(text[cursor])) {
      if (isDigitAt(text, cursor)) runEnd = cursor + 1;
      cursor += 1;
    }
    if (runEnd === -1 || isDigitAt(text, runEnd)) continue;

    const run = text.slice(runStart, runEnd);
    if (!hashBefore && run.length < 4) continue;
    const code = formatCode(toDigits(run));
    if (!code) continue;

    if (!codes.includes(code)) codes.push(code);
    shortestRun = Math.min(shortestRun, run.length);
    lastEnd = runEnd;
    index = runEnd - 1;
  }

  if (!codes.length) return null;
  return { kind: 'codes', codes, source: 'text', settle: shortestRun >= 4 ? 'now' : 'idle' };
}

function suggestFromNumbers(text) {
  const runs = text.match(DIGIT_RUN_PATTERN);
  if (!runs || runs.length !== 1) return null;
  const code = formatCode(runs[0]);
  return code ? { kind: 'suggestion', code } : null;
}

export function parseQuery(raw) {
  const text = normalizeText(raw);
  if (!text) return { kind: 'empty' };
  if (text.toUpperCase() === TEST_CODE) return { kind: 'codes', codes: [TEST_CODE], source: 'direct', settle: 'now' };
  return parseDirect(text) || scanText(text) || suggestFromNumbers(text) || { kind: 'invalid', reason: 'format' };
}

export function parseDeepLink(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_DEEP_LINK_LENGTH) return null;
  const query = parseQuery(raw);
  return query.kind === 'codes' ? query.codes : null;
}

export function parseHash(hash) {
  if (typeof hash !== 'string' || hash.length < 2 || hash.length > MAX_HASH_LENGTH) return null;
  let value;
  try {
    value = decodeURIComponent(hash.slice(1));
  } catch {
    return null;
  }
  const query = parseQuery(value);
  return query.kind === 'codes' && query.source === 'direct' ? query.codes : null;
}
