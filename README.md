# shelfy-site

### 🔗 Site no ar: **[carlosp1006.github.io/shelfy-site](https://carlosp1006.github.io/shelfy-site/)**

`https://carlosp1006.github.io/shelfy-site/` · [política de privacidade](https://carlosp1006.github.io/shelfy-site/privacidade.html) · [termos](https://carlosp1006.github.io/shelfy-site/termos.html) · exemplo de link direto: `https://carlosp1006.github.io/shelfy-site/?c=P0022`

Site público do **shelfy**, publicado pelo GitHub Pages.

Ele tem dois papéis, e os dois são obrigatórios:

- **Link da bio (Papel A).** Quem viu um produto num post do shelfy digita o código do post (`P0022`) e chega direto no link do produto. Sem login, sem cadastro, sem pop-up.
- **Homepage oficial do app no Google (Papel B).** Estas páginas estão cadastradas na tela de consentimento OAuth do Google Cloud como homepage e política de privacidade do app shelfy, que usa a API do Google Drive. Se elas quebrarem, a aplicação pode perder o acesso ao Drive.

## Sumário

1. [Regras do Google — não quebre isto](#1-regras-do-google--não-quebre-isto)
2. [Estrutura do repositório](#2-estrutura-do-repositório)
3. [Como rodar e testar localmente](#3-como-rodar-e-testar-localmente)
4. [Contrato do catálogo (`data/products.json`)](#4-contrato-do-catálogo-dataproductsjson)
5. [Integração com a aplicação shelfy](#5-integração-com-a-aplicação-shelfy)
6. [Segurança](#6-segurança)
7. [Front-end: decisões e orçamento](#7-front-end-decisões-e-orçamento)
8. [Checklist de deploy](#8-checklist-de-deploy)
9. [Trocar o endereço do site (domínio próprio ou organização)](#9-trocar-o-endereço-do-site-domínio-próprio-ou-organização)
10. [Fontes](#10-fontes)

## 1. Regras do Google — não quebre isto

Estes dois endereços estão cadastrados no Google Cloud e **não podem mudar, redirecionar nem deixar de responder 200**:

| Página | URL | Arquivo |
| --- | --- | --- |
| Homepage | https://carlosp1006.github.io/shelfy-site/ | `index.html` |
| Política de privacidade | https://carlosp1006.github.io/shelfy-site/privacidade.html | `privacidade.html` |

- `index.html` e `privacidade.html` ficam **na raiz**, com esses nomes exatos. Nunca renomear, mover, transformar em redirect (meta refresh, JavaScript, truque de 404) nem trocar por roteamento no navegador.
- Todo o conteúdo exigido está no HTML servido e aparece **com JavaScript desligado**. Nada escondido (`display: none`, modal, `<details>` fechado, conteúdo carregado por JS).
- A homepage precisa: mostrar o nome **shelfy**; descrever o que o app faz; explicar para que usa dados do Google (o Drive do próprio dono, com a permissão `drive.file`, só para guardar as imagens e vídeos que ele mesmo gera); e ter um link visível para `privacidade.html` (o mesmo endereço do cadastro). Isso está na seção “Sobre o shelfy” e no rodapé.
- A política precisa manter: escopo `drive.file` (só enxerga o que o shelfy criou; não lê, não altera, não apaga mais nada); arquivos só no Drive do dono; nenhum dado do Google compartilhado, vendido ou enviado a terceiros; link de revogação https://myaccount.google.com/permissions; contato dinosauroxd9@gmail.com; e a seção do site público (sem login, sem cookies, sem analytics, busca local, links de afiliado, data de atualização).
- `<title>` e `<h1>` das duas páginas contêm “shelfy”.
- Não criar `CNAME`, não mudar configurações do repositório ou do Pages, não criar GitHub Actions. O deploy é: commit na `main` → o Pages publica sozinho.
- **Qualquer coisa que colete dado** (analytics, fonte externa, embed, pixel) torna a política mentirosa e põe o app em risco. Não adicione.
- Se o Google pedir verificação de propriedade do site, dá para colocar o arquivo `googleXXXX.html` que ele fornecer na raiz, ou a meta tag `google-site-verification` no `<head>` de `index.html`. As duas coisas são compatíveis com a CSP.

Os testes ponta a ponta (`dev/test-e2e.cjs`) abrem as duas páginas com JavaScript desligado e conferem cada um desses textos.

## 2. Estrutura do repositório

```
index.html              busca (herói) + como funciona + sobre o shelfy (texto do Google)
privacidade.html        política de privacidade (nome e lugar intocáveis)
termos.html             termos de uso
404.html                página de erro com busca; usa <base href="/shelfy-site/">
css/site.css            o único CSS do site
js/app.js               interface da busca (módulo)
js/query.js             normalização do que a pessoa digita ou cola
js/catalog.js           regras do catálogo (as mesmas do validador)
data/products.json      catálogo — o ÚNICO arquivo que o publicador escreve
schema/products.schema.json   contrato do catálogo (JSON Schema 2020-12)
img/                    favicons e imagem de compartilhamento
dev/                    ferramentas de desenvolvimento (nunca carregadas pelo site)
robots.txt, sitemap.xml, opensearch.xml, .nojekyll
README.md, SECURITY.md
```

`robots.txt` e `sitemap.xml` ficam aqui por organização, mas os buscadores só leem o `robots.txt` da raiz do domínio (`carlosp1006.github.io/robots.txt`), fora deste repositório. O sitemap pode ser enviado direto no Google Search Console.

## 3. Como rodar e testar localmente

Pré-requisito: Node 18 ou mais novo. Nada para instalar no site.

```bash
node dev/serve.mjs            # http://localhost:8080/shelfy-site/
```

O servidor imita o GitHub Pages: serve o repositório no subcaminho `/shelfy-site/`, devolve `404.html` com status 404 para qualquer caminho inexistente, usa gzip, ETag e `Cache-Control: max-age=600`.

**Catálogos de teste** (só funcionam em `localhost`; no ar o parâmetro é ignorado):

- `http://localhost:8080/shelfy-site/?catalog=dev` usa `dev/products.sample.json` (cerca de 2000 produtos falsos, com títulos longos, emojis, aspas, `<script>` literal e links inválidos misturados). O `P0022` existe e é o “Espremedor de frutas elétrico 300ml”.
- `?catalog=<nome>` usa `dev/fixtures/<nome>.json`: `hostile`, `empty`, `broken`, `version2`, `version-string`, `no-products`, `products-object`, `array-root`, `deep-nesting`, e os gerados `gen-huge-5000`, `gen-huge-12000`, `gen-oversized`.
- `node dev/gen-fixtures.mjs` regenera tudo (os `gen-*` são grandes e ficam fora do git).

**Testes**

| Comando | O que testa | Precisa de |
| --- | --- | --- |
| `node --test dev/test-unit.mjs` | normalização da busca, extração de código em texto colado, regras de link/código/título, catálogo, tetos, regex lineares, código sem sinks perigosos, CSP idêntica | só Node |
| `node dev/validate-catalog.mjs [arquivo]` | valida um catálogo (padrão: `data/products.json`); sai com código ≠ 0 e lista cada erro | só Node |
| `python3 dev/test-schema.py` | o JSON Schema e as regras do site concordam, caso a caso | `pip install jsonschema` |
| `python3 dev/test-publicador.py` | o publicador de referência contra um simulador da API do GitHub | `pip install jsonschema` |
| `NODE_PATH=$(npm root -g) node dev/test-e2e.cjs` | jornadas completas no Chromium: busca, estados, deep link, catálogo hostil, URL hostil, iframe, sem JS, 404 profundo, rede, 360 px, reduced motion | `npm i -g playwright` e um Chromium do Playwright |
| `node dev/check-contrast.mjs` | contraste WCAG de todos os pares de cor usados, calculado a partir dos tokens do CSS | só Node |
| `NODE_PATH=$(npm root -g) node dev/gen-images.cjs && python3 dev/otimizar-png.py` | gera `img/og.png`, `img/apple-touch-icon.png` e `img/favicon-32.png` a partir dos SVGs de `img/` e `dev/art/` | Playwright; `pip install pillow imagequant pyoxipng` |

## 4. Contrato do catálogo (`data/products.json`)

```json
{
  "version": 1,
  "updatedAt": "2026-10-02T14:05:00Z",
  "products": [
    { "code": "P0022", "title": "Espremedor de frutas elétrico 300ml", "link": "https://loja.example.com/p/espremedor-300ml?aff=shelfy" },
    { "code": "P0023", "title": "Garrafa térmica inox 1 litro", "link": "https://loja.example.com/p/garrafa-termica?aff=shelfy" }
  ]
}
```

A fonte da verdade é `schema/products.schema.json` (JSON Schema draft 2020-12). O site aplica as mesmas regras em `js/catalog.js`, e `dev/validate-catalog.mjs` importa esse mesmo arquivo. `dev/test-schema.py` compara schema e site em mais de 2000 casos (hoje: nenhuma divergência).

| Campo | Regra | Se vier fora da regra, o site… |
| --- | --- | --- |
| `version` | número `1` | mostra “catálogo temporariamente indisponível” (arquivo inteiro recusado) |
| `updatedAt` | `null` ou data ISO 8601 em UTC terminando em `Z`, como `2026-10-02T14:05:00Z` | ignora a data |
| `products` | lista, pode ser vazia; no máximo 10 000 itens | sem lista: arquivo recusado; acima de 10 000: ignora o excedente |
| `code` | `^P[0-9]{4,}$`, no máximo 8 dígitos significativos e 16 caracteres, **único** no arquivo; forma canônica = `P` + número com zeros à esquerda até 4 dígitos (`P0022`, `P0137`, `P12345`) | ignora o produto. Código repetido: **vale o último** da lista. Código não canônico (`P00022`) é tratado como a forma canônica (`P0022`) |
| `title` | texto com pelo menos um caractere que não seja espaço, tab ou quebra de linha; até 500 caracteres Unicode; **sempre texto, nunca HTML** | ignora o produto; título acima de 500 é cortado com reticências |
| `link` | URL `https://` com 12 a 2048 caracteres, só ASCII visível (faça percent-encoding do resto), sem usuário/senha, sem porta, host de domínio (nada de IP, `localhost` ou nome de um rótulo só) | produto aparece como **indisponível**, sem link |
| campos extras | qualquer um, em qualquer nível | ignora em silêncio |

Observações para quem valida em Python: o schema usa `[0-9]` em vez de `\d` (no Python, `\d` aceita dígitos de outros alfabetos) e recusa quebra de linha à parte (no Python, `$` também casa antes de um `\n` final). Por isso ele concorda com o site nas duas linguagens.

## 5. Integração com a aplicação shelfy

> Esta seção é o manual do **publicador**: o componente da aplicação shelfy (outro repositório, em Python) que, a cada produto postado nas redes sociais, atualiza o catálogo deste site. Foi escrito para ser implementado só com base nele.

> ### ⚠️ Regra de ouro
> **O publicador escreve SÓ `data/products.json`.** Nunca `index.html`, `privacidade.html`, `termos.html`, `404.html`, `schema/`, `css/`, `js/` ou qualquer outro arquivo. Um bug que sobrescreva a política de privacidade pode derrubar o acesso da aplicação ao Google Drive (explicação no item h).

Existe uma **implementação de referência pronta**: [`dev/publicador_referencia.py`](dev/publicador_referencia.py) (só biblioteca padrão + `jsonschema`), testada contra um simulador da API em [`dev/test-publicador.py`](dev/test-publicador.py). Copie para a aplicação junto com uma cópia de `schema/products.schema.json`. O resto desta seção explica cada passo, com exemplos em `curl`.

### a) Autenticação

- **Token fine-grained do GitHub** com acesso **só** ao repositório `CarlosP1006/shelfy-site` e **só** a permissão de repositório **“Contents: Read and write”** (a “Metadata: Read-only” entra junto, automaticamente). Nenhuma outra permissão.
- Com expiração (recomendado: 90 dias; o máximo é 366) e rotação antes de vencer. O passo a passo, com link já preenchido, está no [SECURITY.md, recomendação 2](SECURITY.md#2-token-fine-grained-do-publicador-e-rotação).
- Guardado **só** em variável de ambiente da aplicação: `GITHUB_SITE_TOKEN`. Nunca no código, em log, em mensagem de erro ou em commit. (Se um token do GitHub for publicado num repositório público, o próprio GitHub o revoga.)
- Toda requisição à API leva:

```
Accept: application/vnd.github+json
Authorization: Bearer $GITHUB_SITE_TOKEN
X-GitHub-Api-Version: 2026-03-10
User-Agent: shelfy-publicador
```

A versão `2026-03-10` é a mais nova da API REST; a anterior (`2022-11-28`) tem suporte até 10/03/2028. Nenhuma mudança da `2026-03-10` afeta os endpoints usados aqui.

### b) Fluxo de escrita, passo a passo

Variáveis usadas nos exemplos:

```bash
API=https://api.github.com/repos/CarlosP1006/shelfy-site
H=(-H "Accept: application/vnd.github+json" -H "Authorization: Bearer $GITHUB_SITE_TOKEN" -H "X-GitHub-Api-Version: 2026-03-10")
```

**Passo 1 — ler o arquivo atual e o `sha`**

```bash
curl -sS "${H[@]}" -H "Accept: application/vnd.github.object+json" \
  "$API/contents/data/products.json?ref=main" > atual.json
```

Resposta `200 OK` (resumida):

```json
{
  "type": "file",
  "path": "data/products.json",
  "size": 58,
  "sha": "30755e9563baa10e02a4a8b4190f99af5823fe26",
  "encoding": "base64",
  "content": "ewogICJ2ZXJzaW9uIjogMSwKICAidXBkYXRlZEF0IjogbnVsbCwKICAicHJv\nZHVjdHMiOiBbXQp9Cg==\n"
}
```

- `content` vem em base64 **com quebras de linha**; `sha` é o sha do *blob* atual (guarde: ele vai no PUT).
- Decodificar: `jq -r .content atual.json | base64 -d > products.json` (no macOS antigo, `base64 -D`). Em Python, `base64.b64decode(conteudo)` ignora as quebras.
- **Arquivo acima de 1 MB** (com 5000 produtos e links de afiliado longos o catálogo passa de 1,5 MB): com o tipo `application/vnd.github.object+json` a resposta vem com `"encoding": "none"` e `"content": ""`. Aí leia o conteúdo pela API de blobs, que aceita até 100 MB:

```bash
SHA=$(jq -r .sha atual.json)
curl -sS "${H[@]}" "$API/git/blobs/$SHA" | jq -r .content | base64 -d > products.json
```

  (Com o tipo padrão `application/vnd.github+json`, um arquivo entre 1 e 100 MB não vem inline; por isso use sempre o tipo `object` no passo 1.)
- Status possíveis: `200` ok; `401` token inválido/vencido; `403` sem permissão ou limite de taxa (ver item e); `404` arquivo inexistente **ou** token sem acesso ao repositório.

**Passo 2 — alterar em memória e validar**

1. `json.loads` do conteúdo (UTF-8).
2. Aplicar as mudanças do ciclo com as regras de idempotência do item c (adicionar = inserir ou atualizar pelo `code`; remover = tirar pelo `code`).
3. Manter `products` **ordenado pelo número do código** (`P0022` antes de `P0137`; `P9999` antes de `P10000`): `produtos.sort(key=lambda p: int(p["code"][1:]))`.
4. `updatedAt` = agora, em UTC, sem frações: `datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")`.
5. `version` = `1`.
6. **Validar contra o schema antes de gravar.** Se não passar, **não grave e não poste**:

```python
import json
from jsonschema import Draft202012Validator

schema = json.load(open("products.schema.json", encoding="utf-8"))   # cópia de schema/products.schema.json
erros = list(Draft202012Validator(schema).iter_errors(catalogo))
codigos = [p["code"] for p in catalogo["products"]]
assert not erros and len(codigos) == len(set(codigos)), "catálogo inválido: não publicar"
```

  O schema não consegue expressar “code único”; por isso a checagem de repetidos à parte.
7. Recomendado: a aplicação mantém, **no repositório dela**, a lista de domínios da loja com que trabalha e recusa publicar `link` fora dela. Este repositório não pode ter essa lista (regra de marca), e é ela que impede um link de golpe mesmo que algo dê errado do lado de cá.

**Passo 3 — gravar (PUT)**

Serialize exatamente assim: JSON em UTF-8, **2 espaços** de indentação, acentos sem escape e **quebra de linha no final**. Em Python: `(json.dumps(catalogo, ensure_ascii=False, indent=2) + "\n").encode("utf-8")`. Depois, base64 **sem** quebras de linha.

```bash
jq -n --arg message "catalogo: adiciona P0022" \
      --arg content "$(base64 < products.json | tr -d '\n')" \
      --arg sha "$SHA" \
      '{message: $message, content: $content, sha: $sha, branch: "main"}' > corpo.json

curl -sS -X PUT "${H[@]}" "$API/contents/data/products.json" --data @corpo.json
```

Resposta `200 OK` (resumida):

```json
{
  "content": { "path": "data/products.json", "sha": "9c2d...novo sha do blob" },
  "commit": { "sha": "7f1e...sha do commit", "message": "catalogo: adiciona P0022" }
}
```

- `201 Created` só aparece se o arquivo não existisse (não é o caso: ele já existe no repositório).
- O commit sai em nome do dono do token; não precisa mandar `committer`.

**Passo 4 — conflito: repetir do passo 1**

Se outra escrita aconteceu entre o GET e o PUT, o `sha` enviado ficou velho e o GitHub recusa:

| Status | Quando | O que fazer |
| --- | --- | --- |
| `409 Conflict` | o `sha` enviado não é o do arquivo atual (mensagem parecida com `data/products.json does not match <sha>`) | voltar ao passo 1, reaplicar as mudanças sobre o conteúdo novo e tentar de novo |
| `422 Unprocessable Entity` | faltou o `sha` (mensagem parecida com `"sha" wasn't supplied`) ou o corpo é inválido | se a mensagem falar de `sha`, igual ao 409; senão é bug do publicador: não repita |
| `401` | token inválido, revogado ou vencido | parar e avisar o dono (gerar token novo) |
| `403` / `429` | limite de taxa (ver item e) ou falta de permissão | se houver `retry-after` ou `x-ratelimit-remaining: 0`, esperar e repetir; senão, parar e avisar |
| `404` | token sem acesso ao repositório | parar e avisar o dono |

Repita no máximo **4 vezes**, com espera curta e crescente (1 s, 2 s, 4 s, 8 s, mais um pouco de aleatório). O texto das mensagens pode mudar; decida pelo **status**. A API de Contents recusa escritas paralelas no mesmo repositório: rode **um publicador por vez** (fila ou trava na aplicação).

**Mensagem de commit** (nunca cite loja ou rede social):

- `catalogo: adiciona P0022`
- `catalogo: remove P0022`
- `catalogo: adiciona P0022, P0023` (várias mudanças no mesmo commit)
- `catalogo: atualiza P0022` (mesmo código, título ou link novo)
- `catalogo: adiciona P0024; remove P0010` (tipos misturados, separados por `;`)

### c) Idempotência

- **Adicionar um código que já existe atualiza** título e link dele; nunca duplica. Se título e link forem iguais aos atuais, não é mudança.
- **Remover um código que não existe não é erro**; simplesmente não muda nada.
- Se, depois de aplicar tudo, o catálogo não mudou, **não faça commit** (nada de commit vazio).
- Repetir um ciclo inteiro (por exemplo, depois de uma falha no meio) tem de produzir o mesmo arquivo final.

### d) Tempo até aparecer no site

1. Depois do commit, o GitHub Pages reconstrói e publica o site. A documentação oficial diz que **pode levar até 10 minutos**; na prática costuma ser bem menos, mas não há garantia. Há também um limite *soft* de **10 builds por hora** para sites publicados a partir de branch.
2. O Pages serve os arquivos com cache de ~10 minutos (`max-age=600`). O site busca o catálogo com `fetch(…, { cache: 'no-cache' })`, que revalida com ETag a cada visita, então quem abrir o site depois do deploy recebe o arquivo novo.
3. Por isso, o fluxo recomendado é:
   1. **Atualizar o catálogo ANTES de publicar o post** na rede social.
   2. **Esperar o arquivo novo estar no ar**: fazer GET em `https://carlosp1006.github.io/shelfy-site/data/products.json?t=<timestamp>` (o parâmetro evita cache), a cada ~15 s, até o código aparecer. Limite de espera: 10 minutos. A referência tem `aguardar_no_ar(presentes=["P0022"])`.
   3. **Só então postar**, com a legenda “… busca o código #P0022 no link da bio”. Assim ninguém busca um código que ainda não existe.
4. Se alguém buscar um código mais novo que o catálogo (por exemplo, se o post saiu antes), o site mostra “O P0022 ainda não chegou aqui… tente de novo daqui a pouco”, e não “não existe”.

### e) Volume e limites

O shelfy publica ~6 produtos novos por dia, mais remoções eventuais. **Agrupe as mudanças do mesmo ciclo num commit só.**

| Limite | Valor documentado | Uso do shelfy | Folga |
| --- | --- | --- | --- |
| Taxa primária da API (token pessoal) | 5000 requisições/hora | ~2 por ciclo (1 GET + 1 PUT; +1 GET de blob acima de 1 MB) | milhares de vezes |
| Taxa secundária: requisições que criam conteúdo | ≤ 80/minuto e ≤ 500/hora | 1 PUT por ciclo, ~6 por dia | enorme |
| Taxa secundária: pontos por endpoint | ≤ 900 pontos/minuto (GET = 1, PUT = 5) | poucos pontos por dia | enorme |
| Requisições simultâneas | ≤ 100 | 1 (um publicador por vez) | — |
| GET de Contents com conteúdo inline | até 1 MB (1–100 MB: tipo `object` + API de blobs; > 100 MB: não suportado) | 2000 produtos ≈ 0,4 MB; 5000 com links longos ≈ 1,5 MB | a referência já usa blobs acima de 1 MB |
| Tamanho de arquivo no GitHub | 100 MB | < 2 MB mesmo com 5000 produtos | enorme |
| Builds do Pages | *soft* 10 por hora | ≤ 6 por dia se agrupar | enorme |
| Tamanho do site publicado | 1 GB | < 5 MB | enorme |
| Banda do Pages | *soft* 100 GB/mês | catálogo de 5000 produtos ≈ 62 KB com gzip por primeira visita; depois só revalida (304) | ~1,6 milhão de primeiras visitas por mês |
| Teto do próprio site | 5 MB de arquivo, 10 000 produtos | — | ~3× acima do tamanho realista de 5000 produtos |

Ao receber `403`/`429` por limite: se vier `retry-after`, espere esses segundos; se `x-ratelimit-remaining` for `0`, espere até `x-ratelimit-reset` (epoch em segundos); senão, espere pelo menos 1 minuto e aumente a espera a cada nova falha.

### f) Remoção

Quando a aplicação descobrir que um produto saiu do ar, ela **remove o item do array** (`catalogo: remove P0022`). O post na rede social continua existindo; quem buscar o código vê “Não encontramos o P0022 — esse código não existe ou o produto saiu do ar”, com cara de informação, não de erro do site. Não reaproveite códigos: um código removido não volta a apontar para outro produto.

### g) Deep link

`https://carlosp1006.github.io/shelfy-site/?c=P0022` abre o site já com o resultado. Onde a rede social permitir link clicável, o publicador pode usar esse link direto. Também funcionam `?c=22`, `?c=%23P0022` e `#P0022`; vários códigos: `?c=P0022+P0023`. O botão “Copiar link” de cada resultado gera exatamente o formato `?c=P0022`.

### h) Regra de ouro (de novo, em destaque)

> **O publicador escreve SÓ `data/products.json`.**
>
> Nunca `index.html`, `privacidade.html`, `termos.html`, `404.html`, o schema ou qualquer outro arquivo.
>
> **Por quê:** `index.html` e `privacidade.html` estão cadastradas no Google Cloud como homepage e política de privacidade do app que acessa o Google Drive (seção 1). Se um bug do publicador apagar ou sobrescrever qualquer uma delas, a página some ou perde o conteúdo exigido, o Google pode suspender o app, e a aplicação inteira perde o acesso ao Drive — justamente onde ficam as imagens e os vídeos. O token tem poder técnico para escrever qualquer arquivo; a única coisa que impede o estrago é o publicador nunca montar outro caminho além de `data/products.json` (deixe o caminho como constante no código, sem concatenar nada vindo de fora).

### i) Checklist para integrar

1. Criar o token fine-grained (só este repositório, só “Contents: Read and write”, 90 dias) e guardar como `GITHUB_SITE_TOKEN` no ambiente da aplicação ([SECURITY.md](SECURITY.md#2-token-fine-grained-do-publicador-e-rotação)).
2. Copiar para a aplicação `schema/products.schema.json` e `dev/publicador_referencia.py`, e instalar `jsonschema`.
3. Conferir acesso: `python publicador_referencia.py verificar products.schema.json` deve imprimir `ok: 0 produto(s)…`.
4. Gerar os códigos no formato canônico: `"P" + str(numero).zfill(4)` (`P0022`, `P12345`), um número novo por produto, sem reaproveitar.
5. A cada ciclo: juntar os produtos novos e os removidos e chamar **uma vez** `publicar(adicionar=[…], remover=[…])` **antes** de postar.
6. Chamar `aguardar_no_ar(presentes=[códigos novos])` e só postar depois que voltar `True` (limite de 10 min; se estourar, adiar o post e alertar).
7. Tratar falhas: `ErroPublicacao` de validação → não postar e alertar; `401` → avisar o dono para renovar o token; nunca registrar o token em log.
8. (Recomendado) A cada ciclo, `commits_suspeitos(desde=<fim do ciclo anterior>)` e alertar o dono se aparecer commit que mexeu em outro arquivo além de `data/products.json` — pode ser uma mudança legítima dele, ou sinal de token vazado.

## 6. Segurança

Resumo: CSP restrita e idêntica em todas as páginas, Trusted Types, nenhum recurso de terceiros, `no-referrer`, títulos só como texto, links validados sem lista de lojas, anti-iframe por JavaScript, tetos para tudo que vem de fora. O modelo de ameaça completo, o que não dá para mitigar no GitHub Pages e as configurações recomendadas para o repositório (2FA, token, ruleset que não quebra o publicador, push protection, roteiro de incidente) estão em [SECURITY.md](SECURITY.md).

## 7. Front-end: decisões e orçamento

- Zero dependência: HTML + um CSS + módulos JS escritos à mão, sem build, sem CDN, sem fonte externa. Os módulos de `js/` já são o que vai para o ar.
- O HTML e o CSS sozinhos desenham a página inteira; o JavaScript só acende a busca.
- Orçamento (transferido, com gzip): HTML da index ≤ 14 KB, CSS ≤ 20 KB, JS ≤ 10 KB, fonte 0 KB (pilha do sistema). Medições e notas do Lighthouse ficam registradas no pull request de cada mudança grande.
- Cores em `oklch()` definidas como tokens em `css/site.css`; estados derivados com `color-mix()` (com valores de reserva para navegadores sem suporte). Todo par de cor usado em texto ou componente tem contraste calculado por `dev/check-contrast.mjs`.
- Recursos novos de CSS entram só como melhoria progressiva (`@supports` ou ignoráveis): a página funciona inteira em Chrome/WebView Android dos últimos anos e Safari iOS 16+. `prefers-reduced-motion` desliga toda animação que não é essencial.

## 8. Checklist de deploy

Antes de fazer merge na `main` (o Pages publica sozinho depois do merge):

- [ ] `node --test dev/test-unit.mjs` passa.
- [ ] `NODE_PATH=$(npm root -g) node dev/test-e2e.cjs` passa.
- [ ] `node dev/validate-catalog.mjs` passa para `data/products.json`.
- [ ] `index.html` e `privacidade.html` continuam na raiz; `<title>` e `<h1>` contêm “shelfy”.
- [ ] Com JavaScript desligado, a homepage mostra o nome, o que o app faz, o uso do Google Drive (`drive.file`) e o link para a política.
- [ ] Nenhum script, fonte, imagem ou CSS de outro domínio; CSP igual nas quatro páginas.
- [ ] Nenhum nome de loja, marketplace ou rede social em lugar nenhum do repositório.

Depois do merge, em até ~10 minutos:

- [ ] https://carlosp1006.github.io/shelfy-site/ abre (200), com o conteúdo acima.
- [ ] https://carlosp1006.github.io/shelfy-site/privacidade.html abre (200), com o conteúdo exigido.
- [ ] Uma busca por um código existente leva ao link certo.

## 9. Trocar o endereço do site (domínio próprio ou organização)

O endereço atual mostra o usuário pessoal do GitHub (`carlosp1006`). Trocar o endereço do site exigiria mudar o cadastro no Google Cloud, pagar domínio ou mover o repositório — e nada disso é desejado agora.

**Solução adotada: porta de entrada.** Um site mínimo, gratuito, numa organização do GitHub com o nome da marca (`NOME.github.io`), que só redireciona para este site. O link da bio, dos posts e do botão “Copiar link” deixa de mostrar o usuário pessoal; o site, as URLs do Google e este repositório não mudam. Os arquivos e o passo a passo estão em [`dev/porta/`](dev/porta/LEIA-ME.md). Depois de criada, preencha `data-link-curto="https://NOME.github.io/"` no `<body>` de `index.html` e `404.html` para o “Copiar link” usar o endereço curto. Limite: depois do redirecionamento, a barra de endereço mostra o endereço final.

As alternativas abaixo ficam registradas para o futuro. Qualquer uma que troque o endereço do site só pode acontecer junto com a atualização do cadastro OAuth (homepage e política), senão o Google pode suspender o acesso da aplicação ao Drive.

| Opção | Endereço | Custo | Esconde o usuário? | Observação |
| --- | --- | --- | --- | --- |
| **Domínio próprio (recomendado)** | `https://shelfy.com.br/` (exemplo) | domínio (~R$ 40/ano no .com.br) | Sim, se usar o domínio *apex* com registros A/AAAA. O registro `www` é um CNAME para `USUARIO.github.io` e revela o usuário a quem consultar o DNS | Link curto e fácil de digitar; domínio verificado é melhor para o Google |
| **Organização gratuita** no GitHub com o nome da marca | `https://NOME-DA-ORG.github.io/` | grátis | Sim (deixe a sua participação na organização como privada) | Transferir o repositório para a organização e renomeá-lo para `NOME-DA-ORG.github.io` |
| Organização + domínio próprio | `https://shelfy.com.br/` | domínio | Sim, inclusive no DNS (`www` aponta para a organização) | A combinação mais discreta |
| **Porta de entrada (adotada)** | `https://NOME.github.io/` redireciona | grátis | Na bio, nos posts e nos links copiados, sim; na barra de endereço depois do clique, não | Não muda o site, o Google nem este repositório. Ver `dev/porta/` |
| Encurtador na bio | — | — | Não: o endereço final aparece no navegador | Coloca rastreamento de terceiros no caminho; contradiz a política. Não use |

Mesmo trocando o endereço, o repositório público continua mostrando o histórico: o primeiro commit tem nome e e-mail do dono; o e-mail de contato está na política (o Google exige um contato; pode ser um e-mail só do shelfy, atualizado também no Google Cloud); e os commits do publicador saem com o usuário dono do token (com um GitHub App eles aparecem como robô). Com o GitHub Pro, o repositório pode ficar privado e o site continua público.

**Roteiro da troca de endereço do site** (só se um dia optar por domínio próprio ou organização; fazer tudo no mesmo dia):

1. Domínio próprio: verifique o domínio no GitHub **antes** de usar (Settings da conta ou da organização → Pages → *Add a domain*), para ninguém tomar o domínio (*domain takeover*). Nunca use DNS com curinga (`*.dominio`).
2. DNS do domínio apex: registros `A` para `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` e `AAAA` para `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`.
3. No repositório: Settings → Pages → *Custom domain* (isso cria o arquivo `CNAME` na raiz) → marque **Enforce HTTPS** quando ficar disponível (pode levar até 24 h).
4. Neste repositório, troque o endereço antigo pelo novo em: `canonical` e `og:*` das páginas, `sitemap.xml`, `robots.txt`, `opensearch.xml`, `$id` do schema, `URL_PUBLICA` e `REPOSITORIO` em `dev/publicador_referencia.py`, e na documentação (`grep -rn "carlosp1006" .`). Se o site passar a ficar na raiz do domínio, troque `<base href="/shelfy-site/">` do `404.html` por `<base href="/">`. O JavaScript e a CSP não têm endereço fixo e não precisam mudar.
5. No Google Cloud (tela de consentimento OAuth / Branding): atualize a homepage e a política para os endereços novos e adicione o domínio em *Authorized domains* (o Google pede verificação no Search Console).
6. Organização: gere um token novo para o repositório novo (o token antigo não vale lá) e atualize `GITHUB_SITE_TOKEN` e `REPOSITORIO` no publicador.
7. Confira os dois endereços novos no ar e o redirecionamento dos antigos.

## 10. Fontes

Documentação consultada em setembro de 2026:

- GitHub REST API — [Repository contents](https://docs.github.com/en/rest/repos/contents) (limites de 1 MB/100 MB, `sha`, 409/422, escritas paralelas), [Git blobs](https://docs.github.com/en/rest/git/blobs), [Rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions) e [Breaking changes](https://docs.github.com/en/rest/about-the-rest-api/breaking-changes).
- GitHub Pages — [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) (até 10 minutos para publicar), [Creating a custom 404 page](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site), [Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [Managing a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site), [Verifying your custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages).
- GitHub — [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens), [Token expiration and revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation), [About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets), [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [Creating rulesets for a repository](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository), [Push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection), [Secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning).
- Google Cloud — [App Homepage](https://support.google.com/cloud/answer/13807376), [App Privacy Policy](https://support.google.com/cloud/answer/13806988), [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).
- W3C — [Content Security Policy Level 3](https://www.w3.org/TR/CSP3/) (`frame-ancestors`, `report-uri` e `sandbox` não valem em `<meta>`); [Trusted Types](https://www.w3.org/TR/trusted-types/).
- Compatibilidade de navegadores: dados do pacote `web-features` (Baseline) e `@mdn/browser-compat-data`.
