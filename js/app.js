import { parseCatalog, MAX_CATALOG_BYTES } from './catalog.js';
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

class CatalogError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
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
  if (!isLocalHost()) return CATALOG_URL;
  const name = new URLSearchParams(location.search).get('catalog');
  if (name === 'dev') return 'dev/products.sample.json';
  if (name && DEV_CATALOG_PATTERN.test(name)) return 'dev/fixtures/' + name + '.json';
  return CATALOG_URL;
}

async function readLimited(response, limit) {
  const declared = Number(response.headers.get('content-length'));
  if (declared > limit) throw new CatalogError('size');
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    if (text.length > limit) throw new CatalogError('size');
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      reader.cancel();
      throw new CatalogError('size');
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
    if (!response.ok) throw new CatalogError(response.status === 404 ? 'missing' : 'http');
    const catalog = parseCatalog(await readLimited(response, MAX_CATALOG_BYTES));
    if (!catalog.ok) throw new CatalogError(catalog.reason);
    state.catalog = catalog;
    if (state.committed) rememberFound();
  } catch (error) {
    state.catalogError = error instanceof CatalogError ? error.reason : controller.signal.aborted ? 'timeout' : 'network';
  } finally {
    clearTimeout(timer);
    state.loading = false;
  }
  render();
  if (state.catalogError && !state.autoRetried && isTransient(state.catalogError)) {
    state.autoRetried = true;
    setTimeout(loadCatalog, AUTO_RETRY_DELAY_MS);
  }
}

function isTransient(reason) {
  return reason === 'network' || reason === 'timeout' || reason === 'http';
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

function shareUrl(code) {
  const url = new URL(siteRoot.href);
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
  title.id = 'produto-' + product.code;
  title.textContent = product.title;

  const toggle = slot(card, 'toggle');
  toggle.setAttribute('aria-controls', title.id);
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
  let copied = false;
  try {
    await navigator.clipboard.writeText(url);
    copied = true;
  } catch {
    copied = legacyCopy(url);
  }
  label.textContent = copied ? 'Link copiado!' : 'Não deu para copiar';
  button.classList.toggle('is-done', copied);
  announce(copied ? 'Link do ' + code + ' copiado.' : 'Não foi possível copiar o link. O endereço é ' + url);
  setTimeout(() => {
    label.textContent = 'Copiar link';
    button.classList.remove('is-done');
  }, 2400);
}

function legacyCopy(text) {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.className = 'visually-hidden';
  document.body.append(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  field.remove();
  return copied;
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

function catalogErrorNotice() {
  const retry = makeButton('Tentar de novo', () => loadCatalog());
  if (state.catalogError === 'network' || state.catalogError === 'timeout') {
    return {
      notice: buildNotice({
        tone: 'error',
        title: 'Não conseguimos baixar o catálogo',
        text: 'Parece que a conexão falhou. Confira a internet e tente de novo.',
        actions: [retry]
      }),
      message: 'Não foi possível baixar o catálogo. Confira a conexão e tente de novo.'
    };
  }
  return {
    notice: buildNotice({
      tone: 'error',
      title: 'O catálogo está temporariamente indisponível',
      text: 'Estamos com um problema para ler a lista de produtos. Tente de novo em alguns minutos.',
      actions: [retry]
    }),
    message: 'O catálogo está temporariamente indisponível. Tente de novo em alguns minutos.'
  };
}

function describeMissing(code) {
  const number = Number(code.slice(1));
  if (state.catalog && number > state.catalog.highestNumber) {
    return {
      notice: buildNotice({
        tone: 'fresh',
        title: 'O ' + code + ' ainda não chegou aqui',
        text: 'Se o post acabou de sair, o produto pode levar alguns minutos para aparecer. Confira o código e tente de novo daqui a pouco.',
        actions: [makeButton('Tentar de novo', () => loadCatalog())]
      }),
      message: 'O código ' + code + ' ainda não está no catálogo. Tente de novo em alguns minutos.'
    };
  }
  return {
    notice: buildNotice({
      tone: 'notfound',
      title: 'Não encontramos o ' + code,
      text: 'Esse código não existe ou o produto saiu do ar. Confira no vídeo se o código é esse mesmo.'
    }),
    message: 'Nenhum produto com o código ' + code + '. Esse código não existe ou o produto saiu do ar.'
  };
}

function view(key, nodes, message) {
  if (key === state.view) return;
  state.view = key;
  resultsBody.classList.remove('is-stale');
  resultsBody.replaceChildren(...nodes);
  if (nodes.some((node) => node.classList && node.classList.contains('result'))) {
    requestAnimationFrame(revealTitleToggles);
  }
  if (state.revealPending && key !== 'loading') {
    state.revealPending = false;
    requestAnimationFrame(revealResults);
  }
  if (message) announce(message);
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
    view('framed', [buildNotice({
      tone: 'framed',
      title: 'Abra o shelfy no endereço oficial',
      text: 'Esta página foi aberta dentro de outro site. Para sua segurança, a busca só funciona no endereço ' + siteRoot.host + siteRoot.pathname.replace(/\/$/, '') + '.',
      actions: [official]
    })], 'Abra o shelfy no endereço oficial para buscar.');
    return;
  }

  if (query.kind === 'empty') {
    if (state.badLink) {
      view('bad-link', [buildNotice({
        tone: 'invalid',
        title: 'O link aberto não tem um código válido',
        text: 'Digite o código que apareceu no vídeo. Os códigos são assim: P0022.'
      })], 'O link aberto não tem um código válido.');
      return;
    }
    view('empty', [], '');
    return;
  }

  if (query.kind === 'partial') {
    if (!committed) return markStale();
    view('partial', [buildNotice({
      tone: 'invalid',
      title: 'Faltou o número',
      text: 'Os códigos são assim: P0022. Digite o P seguido dos números, ou só os números.'
    })], 'Faltou o número. Os códigos são assim: P0022.');
    return;
  }

  if (query.kind === 'invalid') {
    if (!committed) return markStale();
    const long = query.reason === 'long';
    view('invalid-' + query.reason, [buildNotice({
      tone: 'invalid',
      title: long ? 'Esse número é grande demais' : 'Não achamos um código aí',
      text: long
        ? 'Os códigos têm um P e até 8 números, assim: P0022.'
        : 'Os códigos são assim: P0022. A busca é só por código; o nome do produto não funciona aqui.'
    })], 'Os códigos são assim: P0022.');
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
    view('suggest-' + query.code, [buildNotice({
      tone: 'suggest',
      title: 'Você quis dizer ' + query.code + '?',
      text: 'Não achamos um código no formato P0022 no que você digitou, mas achamos um número.',
      actions: [accept]
    })], 'Não achamos um código. Você quis dizer ' + query.code + '?');
    return;
  }

  const codes = query.codes;

  if (!state.catalog) {
    if (state.catalogError && !state.loading) {
      const { notice, message } = catalogErrorNotice();
      view('error-' + state.catalogError, [notice], message);
      return;
    }
    if (query.settle !== 'now' && !committed) return markStale();
    const loading = cloneTemplate('tpl-loading');
    view('loading', [loading, buildNotice({
      tone: 'loading',
      title: 'Carregando o catálogo…',
      text: 'Sua busca aparece aqui assim que ele chegar.'
    })], 'Carregando o catálogo. Sua busca aparece em seguida.');
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
      view('catalog-empty', [buildNotice({
        tone: 'empty',
        title: 'A prateleira ainda está vazia',
        text: 'Os primeiros produtos do shelfy estão chegando. Volte daqui a pouco e busque o código de novo.'
      })], 'O catálogo ainda está vazio. Os primeiros produtos chegam em breve.');
      return;
    }
    if (missing.length === 1) {
      const { notice, message } = describeMissing(missing[0]);
      view('missing-' + missing[0] + '-' + state.catalog.highestNumber, [notice], message);
      return;
    }
    view('missing-' + missing.join('+'), [buildNotice({
      tone: 'notfound',
      title: 'Nenhum desses códigos está no catálogo',
      text: 'Procuramos ' + missing.join(', ') + '. Eles não existem ou os produtos saíram do ar.'
    })], 'Nenhum dos códigos foi encontrado.');
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
  const codes = parseHash(location.hash);
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
