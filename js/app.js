import { parseCatalog, readProductLink, MAX_CATALOG_BYTES } from './catalog.js';
import { parseQuery, parseDeepLink, parseHash, MAX_QUERY_LENGTH } from './query.js';

const CATALOG_URL = 'data/products.json';
const FETCH_TIMEOUT_MS = 15000;
const AUTO_RETRY_DELAY_MS = 2500;
const IDLE_SHORT_MS = 450;
const IDLE_COMMIT_MS = 750;
const RECENT_KEY = 'shelfy:recentes';
const RECENT_LIMIT = 3;
const RECENT_CODE_PATTERN = /^P[0-9]{4,8}$/;
const DEV_CATALOG_PATTERN = /^[a-z0-9-]{1,40}$/;
const LINE_BREAK_PATTERN = /[\r\n\t\u2028\u2029]+/g;

const form = document.getElementById('buscar');
const input = document.getElementById('codigo');
const resultsBody = document.querySelector('[data-results]');
const statusRegion = document.getElementById('status-busca');
const recentBox = document.querySelector('[data-recent]');
const recentList = document.querySelector('[data-recent-list]');
const recentClear = document.querySelector('[data-recent-clear]');
const isHome = document.body.classList.contains('page-home');
const framed = detectFraming();
const siteRoot = new URL('./', document.baseURI);
const shortRoot = readShortRoot();

const state = {
  catalog: null,
  catalogError: '',
  loading: false,
  autoRetried: false,
  query: { kind: 'empty' },
  committed: false,
  badLink: false,
  revealPending: false,
  view: '',
  recent: readRecent()
};

let idleTimer = 0;
let commitTimer = 0;

function catalogError(reason) {
  return Object.assign(new Error(reason), { reason });
}

function detectFraming() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isLocalHost() {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

function catalogUrl() {
  const name = isLocalHost() && new URLSearchParams(location.search).get('catalog');
  if (name === 'dev') return 'dev/products.sample.json';
  return name && DEV_CATALOG_PATTERN.test(name) ? 'dev/fixtures/' + name + '.json' : CATALOG_URL;
}

async function readLimited(response, limit) {
  const declared = Number(response.headers.get('content-length'));
  if (declared > limit) throw catalogError('size');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      reader.cancel();
      throw catalogError('size');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function loadCatalog() {
  if (state.loading) return;
  state.loading = true;
  state.catalogError = '';
  render();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(catalogUrl(), { cache: 'no-cache', credentials: 'same-origin', signal: controller.signal });
    if (!response.ok) throw catalogError(response.status === 404 ? 'missing' : 'http');
    const catalog = parseCatalog(await readLimited(response, MAX_CATALOG_BYTES));
    if (!catalog.ok) throw catalogError(catalog.reason);
    state.catalog = catalog;
    if (state.committed) rememberFound();
  } catch (error) {
    state.catalogError = error.reason || (controller.signal.aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
    state.loading = false;
  }
  render();
  if (state.catalogError && !state.autoRetried && ['network', 'timeout', 'http'].includes(state.catalogError)) {
    state.autoRetried = true;
    setTimeout(loadCatalog, AUTO_RETRY_DELAY_MS);
  }
}

function readRecent() {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((code) => typeof code === 'string' && RECENT_CODE_PATTERN.test(code)).slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

function writeRecent(codes) {
  state.recent = codes;
  try {
    if (codes.length) localStorage.setItem(RECENT_KEY, JSON.stringify(codes));
    else localStorage.removeItem(RECENT_KEY);
  } catch {
    return;
  }
}

function rememberFound() {
  if (!state.catalog || state.query.kind !== 'codes') return;
  const found = state.query.codes.filter((code) => state.catalog.products.has(code));
  if (!found.length) return;
  const merged = [...found, ...state.recent.filter((code) => !found.includes(code))];
  writeRecent(merged.filter((code) => RECENT_CODE_PATTERN.test(code)).slice(0, RECENT_LIMIT));
}

function cloneTemplate(id) {
  return document.getElementById(id).content.firstElementChild.cloneNode(true);
}

function slot(node, name) {
  return node.querySelector('[data-slot="' + name + '"]');
}

function hiddenText(text) {
  const span = document.createElement('span');
  span.className = 'visually-hidden';
  span.textContent = text;
  return span;
}

function readShortRoot() {
  const href = readProductLink(document.body.dataset.linkCurto || '');
  if (!href) return null;
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  return url;
}

function shareUrl(code) {
  const url = new URL((shortRoot || siteRoot).href);
  url.searchParams.set('c', code);
  return url.href;
}

function makeButton(label, onClick, className = 'button button-secondary') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function buildNotice({ tone, title, text = '', actions = [] }) {
  const notice = cloneTemplate('tpl-notice');
  notice.dataset.tone = tone;
  slot(notice, 'title').textContent = title;
  slot(notice, 'text').textContent = text;
  const actionBox = slot(notice, 'actions');
  for (const action of actions) actionBox.append(action);
  return notice;
}

function buildResult(product, compact) {
  const card = cloneTemplate('tpl-result');
  if (compact) card.classList.add('result-compact');
  slot(card, 'code').textContent = product.code;

  const title = slot(card, 'title');
  title.textContent = product.title;

  const toggle = slot(card, 'toggle');
  toggle.addEventListener('click', () => {
    const expanded = title.classList.toggle('is-expanded');
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Ver menos' : 'Ver título completo';
  });

  const link = slot(card, 'link');
  const copy = slot(card, 'copy');
  if (product.link && !framed) {
    link.href = product.link;
    link.rel = 'sponsored nofollow noopener noreferrer';
    link.append(hiddenText(' ' + product.code));
    copy.append(hiddenText(' do ' + product.code));
    copy.addEventListener('click', () => copyLink(product.code, copy));
  } else {
    card.classList.add('is-unavailable');
    slot(card, 'actions').remove();
    slot(card, 'note').remove();
    copy.remove();
    slot(card, 'unavailable').hidden = false;
  }
  return card;
}

function revealTitleToggles() {
  for (const title of resultsBody.querySelectorAll('.result-title')) {
    const toggle = title.parentElement.querySelector('.title-toggle');
    if (toggle) toggle.hidden = title.scrollHeight <= title.clientHeight + 1;
  }
}

async function copyLink(code, button) {
  const url = shareUrl(code);
  const label = slot(button, 'copy-label');
  let copied = true;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    copied = false;
  }
  label.textContent = copied ? 'Link copiado!' : 'Não deu para copiar';
  button.classList.toggle('is-done', copied);
  announce(copied ? 'Link do ' + code + ' copiado.' : 'Não foi possível copiar o link. O endereço é ' + url);
  setTimeout(() => {
    label.textContent = 'Copiar link';
    button.classList.remove('is-done');
  }, 2400);
}

let lastAnnouncement = '';

function announce(message) {
  if (!statusRegion || message === lastAnnouncement) return;
  lastAnnouncement = message;
  statusRegion.textContent = '';
  requestAnimationFrame(() => {
    statusRegion.textContent = message;
  });
}

function retryButton() {
  return makeButton('Tentar de novo', () => loadCatalog());
}

function catalogErrorNotice() {
  const offline = state.catalogError === 'network' || state.catalogError === 'timeout';
  return {
    tone: 'error',
    title: offline ? 'Não conseguimos baixar o catálogo' : 'O catálogo está temporariamente indisponível',
    text: offline
      ? 'Parece que a conexão falhou. Confira a internet e tente de novo.'
      : 'Não conseguimos ler a lista de produtos agora. Tente de novo em alguns minutos.',
    actions: [retryButton()]
  };
}

function missingNotice(code) {
  if (Number(code.slice(1)) > state.catalog.highestNumber) {
    return {
      tone: 'fresh',
      title: 'O ' + code + ' ainda não chegou aqui',
      text: 'Se o post acabou de sair, o produto pode levar alguns minutos para aparecer aqui.',
      actions: [retryButton()]
    };
  }
  return {
    tone: 'notfound',
    title: 'Não encontramos o ' + code,
    text: 'Esse código não existe ou o produto saiu do ar. Confira no post se o código é esse mesmo.'
  };
}

function view(key, nodes, message) {
  if (key === state.view) return;
  const reveal = state.revealPending && key !== 'loading';
  if (reveal) state.revealPending = false;
  const swap = () => {
    resultsBody.classList.remove('is-stale');
    resultsBody.replaceChildren(...nodes);
    requestAnimationFrame(() => {
      revealTitleToggles();
      if (reveal) revealResults();
    });
  };
  if (state.view && document.startViewTransition) document.startViewTransition(swap);
  else swap();
  state.view = key;
  if (message) announce(message);
}

function showNotice(key, options, before = []) {
  const title = options.title;
  view(key, [...before, buildNotice(options)], title + (/[.?!\u2026]$/.test(title) ? ' ' : '. ') + (options.text || ''));
}

function markStale() {
  if (resultsBody.childElementCount) resultsBody.classList.add('is-stale');
}

function render() {
  if (!resultsBody) return;
  const { query, committed } = state;
  renderRecent();

  if (framed) {
    const official = document.createElement('a');
    official.className = 'button button-secondary';
    official.href = siteRoot.href;
    official.target = '_blank';
    official.rel = 'noopener noreferrer';
    official.textContent = 'Abrir o shelfy';
    showNotice('framed', {
      tone: 'framed',
      title: 'Abra o shelfy no endereço oficial',
      text: 'Esta página foi aberta dentro de outro site. Por segurança, a busca só funciona no endereço oficial.',
      actions: [official]
    });
    return;
  }

  if (query.kind === 'empty') {
    if (state.badLink) {
      showNotice('bad-link', {
        tone: 'invalid',
        title: 'O link aberto não tem um código válido',
        text: 'Digite o código que aparece no post. Os códigos são assim: P0022.'
      });
      return;
    }
    view('empty', [], '');
    return;
  }

  if (query.kind === 'partial') {
    if (!committed) return markStale();
    showNotice('partial', {
      tone: 'invalid',
      title: 'Faltou o número',
      text: 'Os códigos são assim: P0022. Digite o P seguido dos números, ou só os números.'
    });
    return;
  }

  if (query.kind === 'invalid') {
    if (!committed) return markStale();
    const long = query.reason === 'long';
    showNotice('invalid-' + query.reason, {
      tone: 'invalid',
      title: long ? 'Esse número é grande demais' : 'Não achamos um código aí',
      text: long
        ? 'Os códigos têm um P e até 8 números, assim: P0022.'
        : 'Os códigos são assim: P0022. A busca é só por código; o nome do produto não funciona aqui.'
    });
    return;
  }

  if (query.kind === 'suggestion') {
    if (!committed) return markStale();
    const accept = makeButton('Buscar ' + query.code, () => {
      input.value = query.code;
      handleInput();
      commit();
      input.focus({ preventScroll: true });
    });
    showNotice('suggest-' + query.code, {
      tone: 'suggest',
      title: 'Você quis dizer ' + query.code + '?',
      text: 'Não achamos um código no formato P0022 no que você digitou, mas achamos um número.',
      actions: [accept]
    });
    return;
  }

  const codes = query.codes;

  if (!state.catalog) {
    if (state.catalogError && !state.loading) {
      showNotice('error-' + state.catalogError, catalogErrorNotice());
      return;
    }
    if (query.settle !== 'now' && !committed) return markStale();
    showNotice('loading', {
      tone: 'loading',
      title: 'Carregando o catálogo\u2026',
      text: 'Sua busca aparece aqui assim que ele chegar.'
    }, [cloneTemplate('tpl-loading')]);
    return;
  }

  const { products } = state.catalog;
  const found = [];
  const missing = [];
  for (const code of codes) {
    const product = products.get(code);
    if (product) found.push(product);
    else missing.push(code);
  }

  if (!found.length) {
    if (!committed) return markStale();
    if (products.size === 0) {
      showNotice('catalog-empty', {
        tone: 'empty',
        title: 'A prateleira ainda está vazia',
        text: 'Os primeiros produtos do shelfy estão chegando. Volte daqui a pouco e busque o código de novo.'
      });
      return;
    }
    if (missing.length === 1) {
      showNotice('missing-' + missing[0] + '-' + state.catalog.highestNumber, missingNotice(missing[0]));
      return;
    }
    showNotice('missing-' + missing.join('+'), {
      tone: 'notfound',
      title: 'Nenhum desses códigos está no catálogo',
      text: 'Procuramos ' + missing.join(', ') + '. Eles não existem ou os produtos saíram do ar.'
    });
    return;
  }

  if (query.settle !== 'now' && !committed) return markStale();

  const nodes = [];
  const multiple = codes.length > 1;
  if (multiple) {
    const heading = document.createElement('p');
    heading.className = 'results-heading';
    heading.textContent = 'Achamos ' + codes.length + ' códigos no que você digitou:';
    nodes.push(heading);
  }
  for (const product of found) nodes.push(buildResult(product, multiple));
  if (missing.length && committed) {
    nodes.push(buildNotice({
      tone: 'notfound',
      title: missing.length === 1 ? 'O ' + missing[0] + ' não está no catálogo' : 'Estes não estão no catálogo: ' + missing.join(', '),
      text: 'Esses códigos não existem ou os produtos saíram do ar.'
    }));
  }

  const key = 'found-' + found.map((product) => product.code + (product.link ? '' : '!')).join('+') + (missing.length && committed ? '-' + missing.join('+') : '');
  const summary = found.length === 1
    ? (found[0].link ? 'Produto encontrado: ' + found[0].code + ', ' + found[0].title + '.' : 'O produto ' + found[0].code + ' está com o link indisponível no momento.')
    : found.length + ' produtos encontrados.';
  view(key, nodes, summary);
}

function renderRecent() {
  if (!recentBox) return;
  const show = state.query.kind === 'empty' && state.recent.length > 0 && !framed;
  recentBox.hidden = !show;
  if (!show) return;
  const items = state.recent.map((code) => {
    const item = document.createElement('li');
    const chip = makeButton(code, () => {
      input.value = code;
      handleInput();
      commit();
    }, 'recent-chip');
    chip.setAttribute('aria-label', 'Buscar ' + code + ' de novo');
    item.append(chip);
    return item;
  });
  recentList.replaceChildren(...items);
}

function syncUrl() {
  if (!isHome) return;
  const url = new URL(location.href);
  const codes = state.query.kind === 'codes' ? state.query.codes : [];
  if (codes.length) url.searchParams.set('c', codes.join(' '));
  else url.searchParams.delete('c');
  url.hash = '';
  if (url.href !== location.href) history.replaceState(null, '', url.href);
}

function clearTimers() {
  clearTimeout(idleTimer);
  clearTimeout(commitTimer);
}

function handleInput() {
  clearTimers();
  state.badLink = false;
  state.query = parseQuery(input.value);
  state.committed = false;
  if (state.query.kind === 'empty') {
    syncUrl();
    render();
    return;
  }
  render();
  if (state.query.kind === 'codes' && state.query.settle === 'idle') {
    idleTimer = setTimeout(() => {
      if (state.query.kind === 'codes') {
        state.query = { ...state.query, settle: 'now' };
        render();
      }
    }, IDLE_SHORT_MS);
  }
  if (state.query.kind !== 'partial') commitTimer = setTimeout(commit, IDLE_COMMIT_MS);
}

function commit() {
  clearTimers();
  if (state.query.kind === 'empty') return;
  state.committed = true;
  syncUrl();
  render();
  rememberFound();
}

function revealResults() {
  const target = resultsBody.firstElementChild;
  if (!target) return;
  const box = target.getBoundingClientRect();
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  if (box.bottom > viewportHeight || box.top < 0) {
    const smooth = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
    target.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
  }
}

function handlePaste(event) {
  const text = event.clipboardData && event.clipboardData.getData('text/plain');
  if (!text) return;
  event.preventDefault();
  const clean = text.replace(LINE_BREAK_PATTERN, ' ').slice(0, MAX_QUERY_LENGTH);
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.setRangeText(clean, start, end, 'end');
  handleInput();
  commit();
}

function handleInputEvent(event) {
  handleInput();
  const bulk = event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop' || (typeof event.data === 'string' && event.data.length > 6);
  if (bulk) commit();
}

function handleSubmit(event) {
  event.preventDefault();
  handleInput();
  commit();
  if (window.matchMedia('(pointer: coarse)').matches) input.blur();
  requestAnimationFrame(revealResults);
}

function applyCodes(codes) {
  input.value = codes.join(' ');
  handleInput();
  commit();
}

function readInitialCodes() {
  const params = new URLSearchParams(location.search);
  const value = params.get('c');
  if (value !== null && value.trim()) {
    return { codes: parseDeepLink(value), fromLink: true };
  }
  const segment = isHome ? '' : location.pathname.split('/').filter(Boolean).pop();
  const codes = parseHash(location.hash) || (segment ? parseHash('#' + segment) : null);
  return { codes, fromLink: Boolean(codes) };
}

function start() {
  if (framed) document.documentElement.dataset.framed = '';
  if (!form || !input || !resultsBody) return;

  form.addEventListener('submit', handleSubmit);
  input.addEventListener('input', handleInputEvent);
  input.addEventListener('paste', handlePaste);
  input.addEventListener('blur', () => {
    if (!state.committed && state.query.kind !== 'empty') commit();
  });
  if (recentClear) {
    recentClear.addEventListener('click', () => {
      writeRecent([]);
      renderRecent();
      input.focus({ preventScroll: true });
    });
  }
  window.addEventListener('hashchange', () => {
    const codes = parseHash(location.hash);
    if (codes) applyCodes(codes);
  });
  window.addEventListener('online', () => {
    if (state.catalogError) loadCatalog();
  });

  loadCatalog();

  const initial = readInitialCodes();
  if (initial.codes) {
    state.revealPending = true;
    applyCodes(initial.codes);
  } else if (initial.fromLink) {
    state.badLink = true;
    syncUrl();
    render();
  } else if (input.value) {
    handleInput();
  } else {
    render();
  }

  if (!initial.codes && !framed && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    input.focus({ preventScroll: true });
  }
}

start();
