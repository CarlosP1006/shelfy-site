# Porta de entrada da shelfy (link curto sem o usuário do GitHub)

Estes arquivos formam um site mínimo que só redireciona para o site da shelfy. Ele fica numa **organização gratuita do GitHub** com o nome da marca, então o link que aparece na bio e nos posts não mostra o usuário pessoal. O site principal, os endereços cadastrados no Google e este repositório continuam exatamente iguais.

- `https://NOME-DA-ORG.github.io/` → abre o site da shelfy.
- `https://NOME-DA-ORG.github.io/?c=P0022` → abre o site já com o resultado do P0022 (use este formato em links clicáveis).
- `https://NOME-DA-ORG.github.io/P0022` → também funciona (atalho para quem digita), mas responde com status 404 antes de redirecionar; por isso, em link clicável prefira o `?c=`.

**Limite honesto:** depois do redirecionamento, o navegador mostra o endereço final (`carlosp1006.github.io/shelfy-site`). A porta esconde o usuário do GitHub na bio, nos posts e nos links compartilhados, não na barra de endereço. Esconder também na barra exigiria domínio próprio ou proxy (ver README, seção 9).

**Segurança:** a porta só aceita código no formato `P` + até 8 dígitos (com ou sem `#`, `P`, zeros) e manda sempre para o mesmo destino fixo. Qualquer outra coisa vai para a página inicial. Não é um redirecionador aberto. O script e o estilo são inline, liberados na CSP por hash `sha256` (sem `'unsafe-inline'`), para o redirecionamento sair na primeira resposta, sem requisição extra. `noindex` evita que a porta apareça no Google no lugar do site.

## Passo a passo (uns 5 minutos)

1. No GitHub, clique no **+** (canto superior direito) → **New organization** → plano **Free**. Escolha o nome da marca (por exemplo `shelfybr`, `shelfy-app` ou `useshelfy`; o nome precisa estar livre). Esse nome vira o endereço: `NOME.github.io`.
2. Na organização: **People** → deixe a sua participação como **Private**. Assim o seu perfil não aparece para quem visitar a organização.
3. Crie um repositório **público** chamado exatamente `NOME.github.io` (troque `NOME` pelo nome da organização).
4. Envie para ele os arquivos `index.html` e `404.html` desta pasta (Add file → Upload files → Commit).
5. Settings do repositório → **Pages** → *Deploy from a branch* → `main` / `(root)` → Save. Em até 10 minutos `https://NOME.github.io/` abre a shelfy.
6. Teste: `https://NOME.github.io/?c=P0022` e `https://NOME.github.io/P0022`.
7. Avise o Claude (ou edite você mesmo) para preencher o link curto no site: em `index.html` e `404.html`, troque `data-link-curto=""` por `data-link-curto="https://NOME.github.io/"`. A partir daí, o botão “Copiar link” gera `https://NOME.github.io/?c=P0022` em vez do endereço com o seu usuário.
8. Coloque `NOME.github.io` na bio das redes sociais.

Os commits da organização mostram quem os enviou. Para não ligar a organização ao seu perfil, envie os arquivos por upload no navegador com a opção “Keep my email addresses private” ligada (Settings da conta → Emails), ou peça para o Claude preparar os commits com um autor neutro.

Se o endereço do site principal mudar um dia, gere os arquivos de novo com o destino novo e atualize a CSP (os hashes mudam junto com o script).
