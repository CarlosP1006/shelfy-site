"""Implementação de referência do publicador do catálogo do shelfy.

Escreve SÓ data/products.json no repositório CarlosP1006/shelfy-site, pela API REST de Contents do GitHub.
Depende só da biblioteca padrão e de `jsonschema` (pip install jsonschema). O manual completo está no README.md,
seção "Integração com a aplicação shelfy". Testada contra o simulador dev/mock_github.py por dev/test-publicador.py.

Uso mínimo:
    from publicador_referencia import Publicador
    publicador = Publicador(schema=json.load(open("products.schema.json")))
    publicador.publicar(adicionar=[{"code": "P0022", "title": "Espremedor", "link": "https://..."}], remover=["P0010"])
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request

from jsonschema import Draft202012Validator

API_URL = "https://api.github.com"
REPOSITORIO = "CarlosP1006/shelfy-site"
CAMINHO = "data/products.json"
BRANCH = "main"
VERSAO_API = "2026-03-10"
URL_PUBLICA = "https://carlosp1006.github.io/shelfy-site/data/products.json"
SCHEMA_URL = "https://raw.githubusercontent.com/CarlosP1006/shelfy-site/main/schema/products.schema.json"
CODIGO_CANONICO = re.compile(r"P(?:[0-9]{4}|[1-9][0-9]{4,7})")
LIMITE_CODIGOS_NA_MENSAGEM = 20


class ErroPublicacao(Exception):
    pass


class Conflito(Exception):
    pass


class LimiteDeTaxa(Exception):
    def __init__(self, espera: float):
        super().__init__(f"limite de taxa da API; esperar {espera:.0f}s")
        self.espera = espera


def formatar_codigo(numero: int) -> str:
    return f"P{numero:04d}"


def numero_do_codigo(codigo: str) -> int:
    return int(codigo[1:])


def agora_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def listar_codigos(codigos: list[str]) -> str:
    ordenados = sorted(codigos, key=numero_do_codigo)
    if len(ordenados) <= LIMITE_CODIGOS_NA_MENSAGEM:
        return ", ".join(ordenados)
    visiveis = ", ".join(ordenados[:LIMITE_CODIGOS_NA_MENSAGEM])
    return f"{visiveis} e mais {len(ordenados) - LIMITE_CODIGOS_NA_MENSAGEM}"


class Publicador:
    def __init__(self, schema: dict, token: str | None = None, api_url: str = API_URL, url_publica: str = URL_PUBLICA,
                 tentativas: int = 4, espera_base: float = 1.0, espera_maxima_limite: float = 300.0):
        self.token = token or os.environ["GITHUB_SITE_TOKEN"]
        self.api_url = api_url.rstrip("/")
        self.url_publica = url_publica
        self.tentativas = tentativas
        self.espera_base = espera_base
        self.espera_maxima_limite = espera_maxima_limite
        Draft202012Validator.check_schema(schema)
        self.validador = Draft202012Validator(schema)

    def _requisicao(self, metodo: str, caminho: str, corpo: dict | None = None,
                    aceitar: str = "application/vnd.github+json") -> tuple[int, object, dict]:
        dados = None if corpo is None else json.dumps(corpo).encode("utf-8")
        cabecalhos = {
            "Accept": aceitar,
            "Authorization": f"Bearer {self.token}",
            "X-GitHub-Api-Version": VERSAO_API,
            "User-Agent": "shelfy-publicador",
        }
        if dados is not None:
            cabecalhos["Content-Type"] = "application/json"
        pedido = urllib.request.Request(self.api_url + caminho, data=dados, method=metodo, headers=cabecalhos)
        try:
            with urllib.request.urlopen(pedido, timeout=30) as resposta:
                bruto = resposta.read()
                return resposta.status, json.loads(bruto) if bruto else None, {k.lower(): v for k, v in resposta.headers.items()}
        except urllib.error.HTTPError as erro:
            bruto = erro.read()
            try:
                detalhe = json.loads(bruto)
            except ValueError:
                detalhe = {"message": bruto.decode("utf-8", "replace")[:300]}
            return erro.code, detalhe, {k.lower(): v for k, v in erro.headers.items()}

    def _falhar(self, status: int, corpo: object, cabecalhos: dict) -> None:
        mensagem = corpo.get("message", "") if isinstance(corpo, dict) else str(corpo)
        if status in (403, 429):
            if "retry-after" in cabecalhos:
                raise LimiteDeTaxa(float(cabecalhos["retry-after"]))
            if cabecalhos.get("x-ratelimit-remaining") == "0":
                raise LimiteDeTaxa(max(1.0, float(cabecalhos.get("x-ratelimit-reset", time.time() + 60)) - time.time()))
            if "secondary rate limit" in mensagem.lower():
                raise LimiteDeTaxa(60.0)
        if status == 401:
            raise ErroPublicacao("401: token inválido, revogado ou vencido. Gere outro (SECURITY.md, recomendação 2).")
        if status == 403:
            raise ErroPublicacao(f"403: token sem 'Contents: Read and write' neste repositório, ou bloqueado por regra. {mensagem}")
        if status == 404:
            raise ErroPublicacao(f"404: {REPOSITORIO}/{CAMINHO} não encontrado, ou o token não tem acesso a este repositório.")
        raise ErroPublicacao(f"{status}: {mensagem}")

    def ler(self) -> tuple[dict, str]:
        status, corpo, cabecalhos = self._requisicao(
            "GET", f"/repos/{REPOSITORIO}/contents/{CAMINHO}?ref={BRANCH}", aceitar="application/vnd.github.object+json")
        if status != 200:
            self._falhar(status, corpo, cabecalhos)
        if corpo.get("encoding") == "base64":
            bruto = base64.b64decode(corpo.get("content", ""))
        else:
            status, blob, cabecalhos = self._requisicao("GET", f"/repos/{REPOSITORIO}/git/blobs/{corpo['sha']}")
            if status != 200:
                self._falhar(status, blob, cabecalhos)
            bruto = base64.b64decode(blob["content"])
        return json.loads(bruto.decode("utf-8")), corpo["sha"]

    def aplicar(self, catalogo: dict, adicionar: list[dict], remover: list[str]) -> tuple[dict | None, str]:
        produtos = {p["code"]: p for p in catalogo.get("products", []) if isinstance(p, dict) and "code" in p}
        adicionados, atualizados, removidos = [], [], []
        for item in adicionar:
            novo = {"code": item["code"], "title": item["title"], "link": item["link"]}
            antigo = produtos.get(novo["code"])
            if antigo is None:
                adicionados.append(novo["code"])
                produtos[novo["code"]] = novo
            elif (antigo.get("title"), antigo.get("link")) != (novo["title"], novo["link"]):
                atualizados.append(novo["code"])
                produtos[novo["code"]] = {**antigo, **novo}
        for codigo in remover:
            if produtos.pop(codigo, None) is not None:
                removidos.append(codigo)
        if not (adicionados or atualizados or removidos):
            return None, ""
        partes = []
        if adicionados:
            partes.append("adiciona " + listar_codigos(adicionados))
        if atualizados:
            partes.append("atualiza " + listar_codigos(atualizados))
        if removidos:
            partes.append("remove " + listar_codigos(removidos))
        novo_catalogo = {
            **catalogo,
            "version": 1,
            "updatedAt": agora_utc(),
            "products": sorted(produtos.values(), key=lambda produto: numero_do_codigo(produto["code"])),
        }
        return novo_catalogo, "catalogo: " + "; ".join(partes)

    def validar(self, catalogo: dict) -> None:
        erros = [f"{'/'.join(str(p) for p in erro.absolute_path) or '(raiz)'}: {erro.message}"
                 for erro in self.validador.iter_errors(catalogo)]
        codigos = [p.get("code") for p in catalogo.get("products", []) if isinstance(p, dict)]
        repetidos = sorted({c for c in codigos if codigos.count(c) > 1})
        if repetidos:
            erros.append("códigos repetidos: " + ", ".join(repetidos))
        if erros:
            raise ErroPublicacao("catálogo inválido, nada foi publicado:\n  " + "\n  ".join(erros[:20]))

    @staticmethod
    def serializar(catalogo: dict) -> bytes:
        return (json.dumps(catalogo, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

    def gravar(self, conteudo: bytes, sha: str, mensagem: str) -> str:
        corpo = {"message": mensagem, "content": base64.b64encode(conteudo).decode("ascii"), "sha": sha, "branch": BRANCH}
        status, resposta, cabecalhos = self._requisicao("PUT", f"/repos/{REPOSITORIO}/contents/{CAMINHO}", corpo)
        if status in (200, 201):
            return resposta["commit"]["sha"]
        mensagem_erro = resposta.get("message", "") if isinstance(resposta, dict) else ""
        if status == 409 or (status == 422 and "sha" in mensagem_erro.lower()):
            raise Conflito(mensagem_erro)
        self._falhar(status, resposta, cabecalhos)
        return ""

    def publicar(self, adicionar: list[dict] = (), remover: list[str] = ()) -> str | None:
        adicionar, remover = list(adicionar), list(remover)
        for item in adicionar:
            if not CODIGO_CANONICO.fullmatch(str(item.get("code", ""))):
                raise ErroPublicacao(f"código fora do padrão canônico (P0022, P12345): {item.get('code')!r}")
        ultima_falha = "nenhuma tentativa"
        for tentativa in range(self.tentativas):
            try:
                catalogo, sha = self.ler()
                novo, mensagem = self.aplicar(catalogo, adicionar, remover)
                if novo is None:
                    return None
                self.validar(novo)
                return self.gravar(self.serializar(novo), sha, mensagem)
            except Conflito as conflito:
                ultima_falha = f"conflito de sha: {conflito}"
                time.sleep(self.espera_base * (2 ** tentativa) + random.uniform(0, self.espera_base / 2))
            except LimiteDeTaxa as limite:
                ultima_falha = str(limite)
                if limite.espera > self.espera_maxima_limite:
                    break
                time.sleep(limite.espera)
        raise ErroPublicacao(f"não foi possível publicar depois de {self.tentativas} tentativas ({ultima_falha})")

    def aguardar_no_ar(self, presentes: list[str] = (), ausentes: list[str] = (), limite: float = 600, intervalo: float = 15) -> bool:
        fim = time.monotonic() + limite
        while True:
            try:
                pedido = urllib.request.Request(f"{self.url_publica}?t={time.time_ns()}",
                                                headers={"Cache-Control": "no-cache", "User-Agent": "shelfy-publicador"})
                with urllib.request.urlopen(pedido, timeout=20) as resposta:
                    dados = json.loads(resposta.read().decode("utf-8"))
                codigos = {p.get("code") for p in dados.get("products", []) if isinstance(p, dict)}
                if all(c in codigos for c in presentes) and not any(c in codigos for c in ausentes):
                    return True
            except (urllib.error.URLError, ValueError, TimeoutError, OSError):
                pass
            if time.monotonic() + intervalo > fim:
                return False
            time.sleep(intervalo)

    def commits_suspeitos(self, desde: str) -> list[tuple[str, str, list[str]]]:
        status, commits, cabecalhos = self._requisicao(
            "GET", f"/repos/{REPOSITORIO}/commits?sha={BRANCH}&since={desde}&per_page=100")
        if status != 200:
            self._falhar(status, commits, cabecalhos)
        suspeitos = []
        for commit in commits:
            status, detalhe, cabecalhos = self._requisicao("GET", f"/repos/{REPOSITORIO}/commits/{commit['sha']}")
            if status != 200:
                self._falhar(status, detalhe, cabecalhos)
            arquivos = [arquivo["filename"] for arquivo in detalhe.get("files", [])]
            if any(arquivo != CAMINHO for arquivo in arquivos):
                suspeitos.append((commit["sha"], commit["commit"]["message"].splitlines()[0], arquivos))
        return suspeitos


def _principal(argumentos: list[str]) -> int:
    if len(argumentos) < 2 or argumentos[0] not in {"verificar", "adicionar", "remover"}:
        print("uso: publicador_referencia.py verificar SCHEMA | adicionar SCHEMA CODIGO TITULO LINK | remover SCHEMA CODIGO...",
              file=sys.stderr)
        return 2
    comando, caminho_schema, *resto = argumentos[0], argumentos[1], *argumentos[2:]
    with open(caminho_schema, encoding="utf-8") as arquivo:
        publicador = Publicador(schema=json.load(arquivo))
    if comando == "verificar":
        catalogo, sha = publicador.ler()
        publicador.validar(catalogo)
        print(f"ok: {len(catalogo['products'])} produto(s), sha {sha}")
        return 0
    if comando == "adicionar":
        codigo, titulo, link = resto
        resultado = publicador.publicar(adicionar=[{"code": codigo, "title": titulo, "link": link}])
    else:
        resultado = publicador.publicar(remover=resto)
    print(f"commit {resultado}" if resultado else "nada mudou; nenhum commit feito")
    return 0


if __name__ == "__main__":
    sys.exit(_principal(sys.argv[1:]))
