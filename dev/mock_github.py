"""Simulador mínimo da API REST de Contents do GitHub, só para testar dev/publicador_referencia.py.

Reproduz o que importa para o publicador: sha do blob, 409 quando o sha está desatualizado, 422 quando falta o sha,
401 com token errado, arquivo acima de 1 MB (conteúdo vazio no GET e leitura pela API de blobs), escrita concorrente
e um endereço "público" que demora para refletir o commit, como o GitHub Pages.
"""
from __future__ import annotations

import base64
import datetime as dt
import hashlib
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

REPO = "/repos/CarlosP1006/shelfy-site"
TOKEN = "token-de-teste"
LIMITE_INLINE = 1024 * 1024


def sha_do_blob(dados: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(dados) + dados).hexdigest()


def base64_do_github(dados: bytes) -> str:
    texto = base64.b64encode(dados).decode("ascii")
    return "\n".join(texto[i:i + 60] for i in range(0, len(texto), 60)) + "\n"


class SimuladorGitHub:
    def __init__(self, arquivos: dict[str, bytes]):
        self.arquivos = dict(arquivos)
        self.blobs = {sha_do_blob(dados): dados for dados in self.arquivos.values()}
        self.commits: list[dict] = []
        self.puts = 0
        self.conflitos_forcados = 0
        self.escrita_concorrente = None
        self.atraso_publico = 0
        self.versao_publica = self.arquivos.get("data/products.json")
        self.trava = threading.Lock()
        self.servidor = ThreadingHTTPServer(("127.0.0.1", 0), self._criar_handler())
        self.url = f"http://127.0.0.1:{self.servidor.server_port}"
        threading.Thread(target=self.servidor.serve_forever, daemon=True).start()

    def encerrar(self) -> None:
        self.servidor.shutdown()

    def registrar_commit(self, mensagem: str, arquivos: list[str]) -> str:
        sha = hashlib.sha1(f"{len(self.commits)}:{mensagem}".encode()).hexdigest()
        data = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.commits.insert(0, {"sha": sha, "message": mensagem, "files": arquivos, "date": data})
        return sha

    def gravar(self, caminho: str, dados: bytes, mensagem: str) -> str:
        self.arquivos[caminho] = dados
        self.blobs[sha_do_blob(dados)] = dados
        if caminho == "data/products.json" and self.atraso_publico == 0:
            self.versao_publica = dados
        return self.registrar_commit(mensagem, [caminho])

    def _criar_handler(self):
        simulador = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                return

            def responder(self, status: int, corpo: object, cabecalhos: dict | None = None) -> None:
                dados = json.dumps(corpo).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(dados)))
                for chave, valor in (cabecalhos or {}).items():
                    self.send_header(chave, valor)
                self.end_headers()
                self.wfile.write(dados)

            def autorizado(self) -> bool:
                if self.headers.get("Authorization") != f"Bearer {TOKEN}":
                    self.responder(401, {"message": "Bad credentials", "status": "401"})
                    return False
                return True

            def do_GET(self):
                caminho = urlparse(self.path).path
                if caminho == "/public/data/products.json":
                    with simulador.trava:
                        if simulador.atraso_publico > 0:
                            simulador.atraso_publico -= 1
                            dados = simulador.versao_publica
                        else:
                            dados = simulador.versao_publica = simulador.arquivos["data/products.json"]
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(dados)
                    return
                if not self.autorizado():
                    return
                if caminho == f"{REPO}/contents/data/products.json":
                    dados = simulador.arquivos.get("data/products.json")
                    if dados is None:
                        return self.responder(404, {"message": "Not Found"})
                    grande = len(dados) > LIMITE_INLINE
                    objeto = "object" in (self.headers.get("Accept") or "")
                    if grande and not objeto:
                        return self.responder(403, {"message": "This API returns blobs up to 1 MB in size.",
                                                    "errors": [{"code": "too_large"}]})
                    return self.responder(200, {
                        "type": "file", "name": "products.json", "path": "data/products.json", "size": len(dados),
                        "sha": sha_do_blob(dados), "encoding": "none" if grande else "base64",
                        "content": "" if grande else base64_do_github(dados)})
                if caminho.startswith(f"{REPO}/git/blobs/"):
                    dados = simulador.blobs.get(caminho.rsplit("/", 1)[1])
                    if dados is None:
                        return self.responder(404, {"message": "Not Found"})
                    return self.responder(200, {"sha": sha_do_blob(dados), "size": len(dados), "encoding": "base64",
                                                "content": base64_do_github(dados)})
                if caminho == f"{REPO}/commits":
                    return self.responder(200, [{"sha": c["sha"], "commit": {"message": c["message"]}} for c in simulador.commits])
                if caminho.startswith(f"{REPO}/commits/"):
                    sha = caminho.rsplit("/", 1)[1]
                    for commit in simulador.commits:
                        if commit["sha"] == sha:
                            return self.responder(200, {"sha": sha, "files": [{"filename": f} for f in commit["files"]]})
                    return self.responder(404, {"message": "Not Found"})
                return self.responder(404, {"message": "Not Found"})

            def do_PUT(self):
                if not self.autorizado():
                    return
                if urlparse(self.path).path != f"{REPO}/contents/data/products.json":
                    return self.responder(404, {"message": "Not Found"})
                corpo = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
                with simulador.trava:
                    simulador.puts += 1
                    if not corpo.get("message") or "content" not in corpo:
                        return self.responder(422, {"message": "Invalid request.\n\n\"message\" and \"content\" are required."})
                    if simulador.conflitos_forcados > 0 and simulador.escrita_concorrente:
                        simulador.conflitos_forcados -= 1
                        atual = simulador.arquivos["data/products.json"]
                        simulador.gravar("data/products.json", simulador.escrita_concorrente(atual), "catalogo: escrita concorrente")
                    atual = simulador.arquivos.get("data/products.json")
                    if atual is not None and "sha" not in corpo:
                        return self.responder(422, {"message": "Invalid request.\n\n\"sha\" wasn't supplied."})
                    if atual is not None and corpo["sha"] != sha_do_blob(atual):
                        return self.responder(409, {"message": f"data/products.json does not match {corpo['sha']}"})
                    try:
                        dados = base64.b64decode(corpo["content"], validate=True)
                    except ValueError:
                        return self.responder(422, {"message": "content is not valid Base64"})
                    commit = simulador.gravar("data/products.json", dados, corpo["message"])
                    return self.responder(201 if atual is None else 200, {
                        "content": {"path": "data/products.json", "sha": sha_do_blob(dados)},
                        "commit": {"sha": commit, "message": corpo["message"]}})

        return Handler
