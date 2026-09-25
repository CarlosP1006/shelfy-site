# Segurança do shelfy-site

Este repositório é público: qualquer pessoa lê o HTML, o JavaScript, o catálogo e todo o histórico de commits. Este documento é o modelo de ameaça do site, o que já está mitigado, o que **não dá** para mitigar num site estático no GitHub Pages, e as configurações que o dono do repositório deve aplicar à mão.

**Achou uma falha?** Escreva para dinosauroxd9@gmail.com (ou use “Report a vulnerability” na aba Security, se o relato privado estiver ligado — ver [recomendação 5](#5-relato-privado-de-vulnerabilidades)). Não abra issue pública com detalhes de uma falha.

## Resumo

- O site não tem servidor, login, banco de dados nem dados de quem visita. O pior que um visitante mal-intencionado consegue fazer sozinho é travar o próprio navegador — e há tetos para isso.
- O risco real é **alguém conseguir escrever no repositório** (token do publicador vazado, conta do dono comprometida, PR malicioso aceito sem leitura). Quem escreve no repositório controla o site inteiro, inclusive `privacidade.html`, que o Google usa para manter o acesso da aplicação ao Drive.
- Dados do catálogo são tratados como hostis no navegador: títulos são sempre texto, links passam por validação, e CSP + Trusted Types impedem execução de script injetado.
- O GitHub Pages não deixa configurar cabeçalhos HTTP. Tudo que depende de cabeçalho (bloquear iframe de verdade, `Permissions-Policy`, COOP) não está disponível; onde deu, há alternativa em `<meta>` ou em JavaScript.

## 1. Modelo de ameaça

### O que proteger

| Ativo | Por que importa |
| --- | --- |
| `index.html` e `privacidade.html` nas URLs cadastradas no Google | Se sumirem ou perderem o conteúdo exigido, o Google pode bloquear o app e a aplicação perde o acesso ao Drive. |
| Confiança de quem visita | A pessoa clica em “Ver produto” esperando ir para a loja certa, sem ser rastreada nem enganada. |
| Links de afiliado do catálogo | Trocar os links desvia comissão ou manda gente para golpe. |
| Token do publicador | Quem tem o token escreve no repositório. |

### Quem ataca, o que quer, por onde entra

| # | Ameaça | Por onde entra | Mitigação no site | Risco residual |
| --- | --- | --- | --- | --- |
| T1 | XSS pelo catálogo (título com `<script>`, `<img onerror>`, entidades HTML) | `data/products.json` escrito por um publicador com bug ou por quem roubou o token | Título entra só por `textContent`; nenhum dado vira HTML (não existe `innerHTML`, `outerHTML`, `insertAdjacentHTML` nem `document.write` no código, e um teste unitário garante isso). CSP sem `'unsafe-inline'` e sem `'unsafe-eval'` em `script-src`: mesmo HTML injetado não executaria handler inline. Trusted Types (`require-trusted-types-for 'script'; trusted-types 'none'`) faz o navegador recusar qualquer string em sink de HTML (Chrome/Edge 83+, Safari 26+, Firefox 148+). | Nenhum conhecido. |
| T2 | XSS ou texto enganoso pela URL (`?c=<script>`, `#<img …>`, `?c=Promoção encerrada, compre em golpe.exemplo`) | Link malicioso compartilhado | A URL passa pelo mesmo normalizador da busca; só sai dele código no formato `P` + dígitos. O texto da URL **nunca** é refletido: nem na página, nem na caixa de busca. Parâmetro inválido vira um aviso genérico e é removido da barra de endereço (`history.replaceState`). Tetos: 200 caracteres em `?c=`, 32 no `#`. | Nenhum conhecido. |
| T3 | Link de produto malicioso (`javascript:`, `data:`, `http:`, `https://usuario:senha@…`, `https://loja@golpe…`, barra invertida, IP, `localhost`, porta, caracteres invisíveis ou bidi) | Catálogo | Só vira `<a href>` o link que passa em todas as regras de `js/catalog.js`: começa literalmente com `https://`; 12 a 2048 caracteres; só ASCII visível (sem espaço, controle, `\`, Unicode cru); sem `@` e sem `:` na autoridade (nada de credencial ou porta); host com rótulos DNS válidos e TLD alfabético (ou `xn--`), o que exclui IP e nomes de um rótulo; e a URL reinterpretada pelo navegador precisa bater com o host lido. Link inválido deixa o produto como **indisponível**, nunca como link. O `href` é atribuído pela propriedade, com a URL já normalizada. Tudo sem lista de lojas (a regra de marca proíbe nomes de loja no repositório). | Quem controla o catálogo ainda pode apontar para **qualquer** domínio `https` válido, inclusive um parecido com o da loja. Validar o destino exigiria uma lista de domínios permitidos, que aqui não pode existir. Recomendação: a aplicação mantém essa lista **no repositório privado dela** e recusa publicar link fora dela (ver README, seção de integração). |
| T4 | Redirecionamento aberto a partir do site | Link `…/shelfy-site/?algo=https://golpe…` | O site não tem nenhum parâmetro que leve a outro endereço. O destino de “Ver produto” só vem do catálogo, nunca da URL. | Nenhum. |
| T5 | Clickjacking: o site dentro de um `<iframe>` invisível para induzir cliques | Página de terceiros | O ideal seria `frame-ancestors`/`X-Frame-Options`, mas o GitHub Pages não permite cabeçalhos e **as duas diretivas são ignoradas em `<meta>`** (especificação CSP3). Alternativa em JavaScript: se a página detecta que está dentro de outro site (`window.top !== window.self`), a busca não mostra link de produto e exibe um aviso com link para o endereço oficial (nova aba). Num iframe com `sandbox` sem scripts, a página fica só com texto e links de navegação. | O site não tem sessão, login nem ação sensível; o pior caso é alguém ser induzido a abrir uma página de produto. Impacto baixo. |
| T6 | Vazamento de dados de quem visita | Requisições a terceiros, referrer, armazenamento local, fingerprint | CSP `default-src 'none'` com só `'self'` liberado: nenhum script, fonte, imagem, CSS ou beacon de outro domínio (o teste ponta a ponta confere a aba Network). `<meta name="referrer" content="no-referrer">` + `rel="noreferrer"` nos links de produto: a loja não sabe de onde a pessoa veio. Sem cookies, sem analytics, sem fingerprint. O único dado guardado no aparelho são até 3 códigos já encontrados (sem título, sem data), apagáveis no botão “Limpar”; a política de privacidade diz isso. | O servidor do GitHub Pages vê IP e user-agent, como qualquer servidor web (a política de privacidade informa). Ver também **origem compartilhada**, na seção 2. |
| T7 | Token do publicador vazado ou comprometido | Log, `.env` commitado, máquina da aplicação invadida | Ver [seção 3](#3-o-token-do-publicador). | O token pode escrever **qualquer** arquivo do repositório. |
| T8 | Pull request malicioso de estranho | Fork + PR (todo repositório público aceita) | O site não tem CI: nenhum código de PR roda em lugar nenhum. Nada é publicado sem merge na `main`. | Um merge sem leitura atenta publica o que estiver no PR. Ver [recomendação 7](#7-pull-requests-de-estranhos). |
| T9 | Cadeia de suprimentos (dependência, CDN, script de terceiros) | Pacote npm, CDN, fonte externa | Não existe nenhum: zero dependência em produção, nenhum `<script>` ou `<link>` para fora, nenhuma etapa de build. Os scripts de `dev/` usam só o Node embutido (os testes ponta a ponta usam Playwright, instalado à parte e nunca carregado pelo site). | Nenhum no site. |
| T10 | Negação de serviço no navegador | Catálogo gigante, JSON malformado ou aninhado, texto enorme colado, regex com backtracking | Catálogo lido em streaming e abortado acima de 5 MB; no máximo 10 000 produtos processados; `JSON.parse` em `try/catch` e leitura sem recursão; download com timeout de 15 s. Busca: `maxlength` de 4000 e corte no código; o extrator de códigos é uma varredura linear escrita à mão (sem lookbehind, sem quantificador aninhado), e as regex restantes são lineares — os testes rodam entradas hostis de 100 000+ caracteres em menos de 200 ms. Títulos limitados a 500 caracteres (cortados com reticências) e com `line-clamp` no CSS. | Um catálogo de 5 MB ainda leva alguns segundos para baixar em conexão ruim. |
| T11 | Segredo commitado por engano | `.env`, token colado em código | O site não precisa de segredo nenhum; o token vive só no ambiente da aplicação. No GitHub, repositório público tem varredura de segredos gratuita e automática, a “push protection for users” vem ligada por padrão e bloqueia o push de segredos conhecidos, e um token do GitHub publicado em repositório público é **revogado automaticamente**. | Histórico do git é para sempre: se algum segredo vazar, revogue e gere outro; não basta apagar o arquivo. |
| T12 | Quebra acidental das páginas do Google | Bug do publicador, edição apressada | Regra de ouro no README (o publicador escreve **só** `data/products.json`); testes ponta a ponta conferem o texto exigido com JavaScript desligado; checklist de deploy no README. | Depende de disciplina e de revisão. |

### Controles implementados (referência rápida)

- **CSP idêntica em todas as páginas**, via `<meta http-equiv>` logo no início do `<head>`:
  `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; require-trusted-types-for 'script'; trusted-types 'none'; upgrade-insecure-requests`.
  Sem `'unsafe-inline'` nem `'unsafe-eval'`; nenhum `<style>` inline nem atributo `style` no HTML. `frame-ancestors`, `report-uri`/`report-to` e `sandbox` ficaram de fora porque o navegador ignora essas diretivas em `<meta>` (e o Chrome registra erro no console).
- **Trusted Types** com política nenhuma: o código nunca precisa gerar HTML a partir de texto.
- **Referrer**: `no-referrer` na página e `rel="sponsored nofollow noopener noreferrer"` nos links de produto, que abrem na mesma aba.
- **Validação do catálogo** em `js/catalog.js`, a mesma usada por `dev/validate-catalog.mjs` e espelhada em `schema/products.schema.json` (há um teste que compara os três caso a caso).
- **Sem `eval`, `new Function`, `setTimeout` com string** (teste unitário procura esses padrões no código do site).
- **Anti-iframe** em `js/app.js`.
- **Tetos** de tamanho em tudo que vem de fora (tabela acima).

## 2. O que não dá para mitigar aqui, e por quê

- **Cabeçalhos HTTP.** O GitHub Pages não permite configurar cabeçalhos. Ficam de fora: `frame-ancestors` e `X-Frame-Options` de verdade (anti-iframe só por JavaScript), `Permissions-Policy`, `Cross-Origin-Opener-Policy`, relatórios de violação de CSP, e o `Cache-Control` (o Pages manda `max-age=600`).
- **Origem compartilhada.** Todos os sites GitHub Pages da conta `carlosp1006` vivem na mesma origem, `https://carlosp1006.github.io`. Uma página de outro repositório dessa conta poderia ler o `localStorage` deste site e abri-lo num iframe de mesma origem. Hoje isso só expõe até 3 códigos de produto, mas é motivo para **não publicar, nesta mesma conta, páginas com código de terceiros**. A solução definitiva seria domínio próprio — e isso mudaria as URLs cadastradas no Google, então só com recadastro.
- **Restringir o token a um arquivo.** Token fine-grained não tem permissão por caminho, e “push rulesets” com restrição de caminho só existem para repositórios privados em planos pagos. O token do publicador consegue escrever qualquer arquivo. As camadas que reduzem o risco estão na seção 3.
- **Garantir que o link leva à loja certa.** Sem lista de domínios permitidos no repositório (proibida pela regra de marca), o site só garante que o link é `https` e bem formado. A lista de domínios deve ficar no repositório privado da aplicação.
- **Assinatura do catálogo (avaliada e descartada).** A ideia seria o publicador assinar o JSON e o site conferir a assinatura com uma chave pública. Só que quem tem o token também pode trocar a chave pública ou o próprio `js/app.js`, então a assinatura não protege contra o cenário que importa (token vazado). Contra adulteração no caminho, o HTTPS do Pages já protege. Custo real (chave privada na aplicação, passo a mais no publicador, código a mais no site) sem ganho real: não adotada.

## 3. O token do publicador

**O que um atacante com o token consegue:** com “Contents: Read and write” neste repositório, escrever qualquer arquivo em qualquer branch, inclusive `main`: trocar links do catálogo, desfigurar o site, apagar ou alterar `privacidade.html` (risco para o app no Google) ou publicar JavaScript de golpe.

**O que ele não consegue** (se o token seguir a recomendação): mudar configurações do repositório, rulesets ou colaboradores (não tem “Administration”); criar ou alterar workflows em `.github/workflows` (não tem “Workflows”); acessar outros repositórios privados da conta; forçar push ou apagar a `main` se o ruleset da recomendação 3 estiver ativo — ou seja, **o histórico bom sempre continua lá para reverter**.

**Como limitar o estrago**
1. Token fine-grained, só este repositório, só “Contents: Read and write”, com expiração (recomendação 2).
2. Guardado só em variável de ambiente da aplicação (`GITHUB_SITE_TOKEN`), nunca em código, log ou mensagem de erro.
3. Ruleset na `main` bloqueando force push e deleção (recomendação 3).
4. Validação do lado da aplicação: o publicador só publica links dos domínios da loja com que trabalha (lista mantida no repositório privado dele).

**Como detectar**
- O publicador, a cada ciclo, confere os commits novos da `main` desde o último ciclo e alerta o dono se algum commit tocou arquivo que não seja `data/products.json` (receita no README, seção de integração).
- Acompanhe o feed dos commits da `main`: `https://github.com/CarlosP1006/shelfy-site/commits/main.atom`. Todo commit legítimo do publicador começa com `catalogo:`.
- Em Settings → Developer settings → Personal access tokens → Fine-grained tokens, confira a data de último uso do token.
- O log de segurança da conta (Settings → Archives → Security log) registra criação, regeneração e revogação de tokens.

**Como responder (roteiro de incidente)**
1. Revogue o token: Settings → Developer settings → Personal access tokens → Fine-grained tokens → token do publicador → **Revoke**.
2. Veja o que mudou: `git fetch origin && git log --stat origin/main` (ou o feed acima).
3. Desfaça sem reescrever histórico: `git revert <commit-malicioso>` (um por commit) ou restaure arquivos de um commit bom com `git checkout <commit-bom> -- index.html privacidade.html js css` e faça um commit novo. Envie para a `main` (via PR, se o ruleset exigir).
4. Confira no ar, depois do deploy do Pages: `https://carlosp1006.github.io/shelfy-site/` e `…/privacidade.html` abrem com o conteúdo exigido (o README tem o checklist).
5. Gere um token novo, atualize `GITHUB_SITE_TOKEN` na aplicação e investigue por onde o antigo vazou.

## 4. Configurações recomendadas (aplicar à mão)

Nada disto foi configurado pelo código deste repositório: são passos para o dono aplicar nas configurações do GitHub. Nenhum deles quebra o publicador, exceto onde está dito com todas as letras.

### 1. Verificação em duas etapas na conta

Settings (da conta) → Password and authentication → Two-factor authentication. Prefira passkey ou aplicativo autenticador a SMS. Quem invade a conta do dono tem mais poder que qualquer token.

### 2. Token fine-grained do publicador (e rotação)

Link já preenchido (nome, descrição, dono, 90 dias e “Contents: Read and write”):

```
https://github.com/settings/personal-access-tokens/new?name=shelfy-site-publicador&description=Publicador+do+shelfy%3A+escreve+so+data%2Fproducts.json&target_name=CarlosP1006&expires_in=90&contents=write
```

Na tela, confira:
- **Resource owner:** CarlosP1006.
- **Expiration:** 90 dias (o máximo permitido é 366; “sem expiração” existe, mas não use). O GitHub também revoga sozinho token sem uso por um ano.
- **Repository access:** *Only select repositories* → **CarlosP1006/shelfy-site** (este campo não vem preenchido pelo link; marque à mão).
- **Permissions → Repository permissions:** *Contents: Read and write*. “Metadata: Read-only” entra automaticamente e é obrigatório. **Nenhuma outra.**

Rotação (a cada 90 dias, ou já, se houver suspeita): gere o token novo → troque `GITHUB_SITE_TOKEN` na aplicação → rode um ciclo de teste do publicador (um GET do catálogo basta) → revogue o token antigo. Deixe um lembrete no calendário alguns dias antes do vencimento: token vencido faz o publicador receber `401` e parar de publicar.

### 3. Ruleset na `main`

Settings → Rules → Rulesets → New ruleset → **New branch ruleset**:
- **Ruleset name:** `proteger-main` · **Enforcement status:** Active.
- **Target branches:** Add target → *Include default branch*.
- Marque **Restrict deletions** e **Block force pushes**.
- Não precisa de bypass: o publicador faz commits normais pela API, que não são force push nem deleção. Isso garante que nenhum token consegue apagar a `main` ou reescrever o histórico.

**Sobre “Require a pull request before merging”** (para obrigar mudanças humanas a passarem por PR): num repositório pessoal, o token fine-grained age **como o dono**, que é administrador. Então:
- Marcar a regra **sem bypass** bloqueia o publicador. Não faça isso.
- Marcar com bypass para **Repository admin (Always allow)** mantém o publicador funcionando, mas libera você também: vira só um aviso para você (e os pushes com bypass ficam registrados).
- Para exigir PR de você **e** deixar o publicador escrever direto, o publicador precisa ter identidade própria: um **GitHub App** instalado só neste repositório, com “Contents: Read and write”, colocado sozinho na lista de bypass. Funciona no plano gratuito, mas o publicador passa a gerar um token de instalação (válido por 1 hora) a partir da chave privada do App, o que é mais trabalho de integração — e a chave do App continua podendo escrever qualquer arquivo.
- Recomendação hoje: ruleset só com deleção e force push bloqueados, e o hábito de fazer mudanças humanas por branch e PR (como este).

Não marque “Require status checks” (o repositório não tem CI), “Require signed commits” (pode recusar commits do publicador) nem “Restrict updates” (bloqueia o publicador).

### 4. Varredura de segredos e push protection

Settings → Security → Advanced Security (em algumas contas, “Code security”): ligue **Secret Protection** / **Push protection** se aparecerem desligados. Em repositório público isso é gratuito, e a varredura já roda automaticamente. Alertas aparecem na aba **Security**. Se um alerta aparecer, siga o roteiro de incidente acima: revogar vem antes de apagar.

### 5. Relato privado de vulnerabilidades

Settings → Security → **Private vulnerability reporting** → Enable. Assim quem achar uma falha consegue avisar sem expor os detalhes numa issue pública.

### 6. Actions

O site não usa Actions, mas o GitHub Pages usa um fluxo interno (“pages build and deployment”) para publicar a partir da branch. **Não desligue as Actions do repositório.** Em Settings → Actions → General:
- *Fork pull request workflows from outside collaborators:* **Require approval for all outside collaborators**.
- *Workflow permissions:* **Read repository contents and packages permissions**.

### 7. Pull requests de estranhos

- Nunca faça merge sem ler o diff inteiro, arquivo por arquivo. Desconfie especialmente de mudanças em `js/`, nos `<meta>` de CSP, em `privacidade.html`, em `index.html` e em links do catálogo.
- O site não tem CI e ninguém precisa rodar o código de um PR para revisá-lo. Mantenha assim. Se um dia criar um workflow, nunca use `pull_request_target` com checkout do código do PR.
- Mudanças no catálogo feitas por humanos também devem passar em `node dev/validate-catalog.mjs`.

## 5. Checklist de revisão para quem mexer no código

- Nenhum dado externo em `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function` ou `setTimeout` com string (o teste `node --test dev/test-unit.mjs` falha se aparecer).
- A CSP continua idêntica nas quatro páginas, sem `'unsafe-inline'` em `script-src`, e nenhum recurso de outro domínio foi adicionado (o teste ponta a ponta confere).
- Link de produto só vira `href` por `readProductLink()`.
- Regex novo que recebe entrada externa é linear e tem teste com entrada hostil.
- `index.html` e `privacidade.html` continuam na raiz, com o conteúdo exigido pelo Google visível sem JavaScript.
