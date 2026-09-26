// Monta dev/logos/index.html a partir de logo-1.svg ... logo-5.svg (os SVGs são a fonte).
// Uso: node dev/logos/gerar.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = dirname(fileURLToPath(import.meta.url));
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; require-trusted-types-for 'script'; trusted-types 'none'; upgrade-insecure-requests";

export const PROPOSTAS = [
  {
    nome: 'Clássica',
    porque: 'O carrinho branco sobre o laranja, na mesma lógica do ícone de hoje: quem já conhece a shelfy reconhece na hora. A cesta inteira vira o rosto, com olhinhos ovais e um sorriso largo.',
    animacao: 'pisca de vez em quando'
  },
  {
    nome: 'Monolinha',
    porque: 'Um traço só, da alça às rodas, com a mesma espessura em tudo: leve e moderna, com cara de desenho à mão. Olhinhos de risquinho e um sorriso pequeno.',
    animacao: 'as rodinhas giram e o carrinho sacoleja'
  },
  {
    nome: 'Tigela',
    porque: 'Geometria pura: aro reto, cesta em meia-lua e rodas redondas sobre o terracota. A meia-lua repete a curva do sorriso e dá peso de marca.',
    animacao: 'balança como cadeira de balanço'
  },
  {
    nome: 'Empinadinho',
    porque: 'O carrinho gordinho empinando a frente, de olhos fechados de alegria e boca aberta. A mais expressiva e fofa das cinco.',
    animacao: 'dá um pulinho e aterrissa amassando'
  },
  {
    nome: 'Sorriso-cesta',
    porque: 'A cesta é o próprio sorriso: uma curva com dois olhinhos já vira o carrinho. A mais simples e a mais fácil de lembrar.',
    animacao: 'os olhinhos passeiam e piscam'
  }
];

function lerSvg(numero) {
  return readFileSync(join(PASTA, 'logo-' + numero + '.svg'), 'utf8').trim();
}

function svgEmLinha(numero) {
  return lerSvg(numero)
    .replace('<svg xmlns="http://www.w3.org/2000/svg" ', '<svg class="logo logo-' + numero + '" aria-hidden="true" focusable="false" ')
    .replace(/\n\s*/g, '');
}

function img(numero, tamanho, classe = 'lp-foto') {
  return '<img class="' + classe + '" src="logo-' + numero + '.svg" width="' + tamanho + '" height="' + tamanho + '" alt="">';
}

function ladoALado() {
  const tema = (classe, rotulo) => '<div class="lp-lado ' + classe + '"><p class="lp-rotulo">' + rotulo + '</p><ol class="lp-lado-lista">' +
    PROPOSTAS.map((proposta, indice) => '<li><span class="lp-numero">' + (indice + 1) + '</span>' + img(indice + 1, 110) + img(indice + 1, 40) + img(indice + 1, 32) + '</li>').join('') +
    '</ol></div>';
  return '<section class="lp-secao" aria-labelledby="lado-a-lado"><h2 id="lado-a-lado" class="lp-h2">Lado a lado, como foto de perfil</h2>' +
    '<p class="lp-texto">Recortadas em círculo em 110, 40 e 32 px, no tema claro e no escuro dos aplicativos.</p>' +
    tema('lp-claro', 'Tema claro') + tema('lp-escuro', 'Tema escuro') + '</section>';
}

function perfil(numero, classe, rotulo) {
  return '<div class="lp-perfil ' + classe + '"><p class="lp-rotulo">' + rotulo + '</p>' + img(numero, 110) +
    '<div class="lp-linha">' + img(numero, 40) + '<span class="lp-nome">shelfy</span><span class="lp-comentario"></span></div>' +
    '<div class="lp-linha lp-linha-pequena">' + img(numero, 32) + '<span class="lp-comentario"></span></div></div>';
}

function proposta(dados, indice) {
  const numero = indice + 1;
  const id = 'proposta-' + numero;
  return '<section class="lp-secao lp-proposta" id="logo-' + numero + '" aria-labelledby="' + id + '">' +
    '<div class="lp-cabeca"><h2 id="' + id + '" class="lp-h2"><span class="lp-numero">' + numero + '</span>' + dados.nome + '</h2>' +
    '<p class="lp-texto">' + dados.porque + '</p><p class="lp-animacao">Animação: ' + dados.animacao + '.</p></div>' +
    '<div class="lp-palco">' +
    '<figure class="lp-grande"><div class="lp-arte">' + svgEmLinha(numero) + '</div><figcaption>logo-' + numero + '.svg, com a animação</figcaption></figure>' +
    perfil(numero, 'lp-claro', 'Foto de perfil, tema claro') + perfil(numero, 'lp-escuro', 'Foto de perfil, tema escuro') +
    '<figure class="lp-topo"><div class="lp-topo-palco"><span class="lp-marca">' + svgEmLinha(numero) + '</span>' +
    '<p class="eyebrow eyebrow-name"><span class="eyebrow-dot" aria-hidden="true"></span>shelfy<span class="eyebrow-dot" aria-hidden="true"></span></p>' +
    '<p class="hero-title lp-titulo">Viu no post? <span class="hero-accent">Ache na shelfy.</span></p></div>' +
    '<figcaption>No topo do site</figcaption></figure>' +
    '</div></section>';
}

export function montarPagina() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex, nofollow">
<title>Propostas de logo — shelfy</title>
<link rel="icon" href="../../img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../../css/site.css">
<link rel="stylesheet" href="logos.css">
</head>
<body class="lp">
<main class="lp-pagina">
<header class="lp-topo-pagina">
<h1 class="lp-h1">Propostas de logo da shelfy</h1>
<p class="lp-texto">Cinco carrinhos com carinha, todos na paleta laranja do site. A logo atual continua no site até a escolha; esta página não tem link a partir dele.</p>
</header>
${ladoALado()}
${PROPOSTAS.map(proposta).join('\n')}
</main>
</body>
</html>
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(PASTA, 'index.html'), montarPagina());
  console.log('gerado dev/logos/index.html');
}
