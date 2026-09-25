"""Testa dev/publicador_referencia.py contra o simulador dev/mock_github.py.

Uso: pip install jsonschema && python3 dev/test-publicador.py
"""
import base64
import json
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "dev"))

from mock_github import SimuladorGitHub, TOKEN  # noqa: E402
from publicador_referencia import ErroPublicacao, Publicador, formatar_codigo  # noqa: E402

SCHEMA = json.loads((RAIZ / "schema" / "products.schema.json").read_text(encoding="utf-8"))
INICIAL = (RAIZ / "data" / "products.json").read_bytes()
falhas = []


def produto(numero, titulo=None, link=None):
    codigo = formatar_codigo(numero)
    return {"code": codigo, "title": titulo or f"Produto de teste {codigo} — edição “especial” 🔥",
            "link": link or f"https://loja.example.com/p/{numero}?aff=shelfy"}


def novo_ambiente(arquivo=INICIAL):
    simulador = SimuladorGitHub({"data/products.json": arquivo})
    publicador = Publicador(schema=SCHEMA, token=TOKEN, api_url=simulador.url,
                            url_publica=simulador.url + "/public/data/products.json", espera_base=0.01)
    return simulador, publicador


def catalogo(simulador):
    return json.loads(simulador.arquivos["data/products.json"].decode("utf-8"))


def validar_com_o_site(dados: bytes):
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as arquivo:
        arquivo.write(dados)
    resultado = subprocess.run(["node", "dev/validate-catalog.mjs", arquivo.name, "--strict"], cwd=RAIZ, capture_output=True, text=True)
    Path(arquivo.name).unlink()
    assert resultado.returncode == 0, resultado.stdout


def caso(nome):
    def decorar(funcao):
        try:
            funcao()
            print("ok   " + nome)
        except Exception as erro:
            falhas.append(nome)
            print(f"FAIL {nome}: {type(erro).__name__}: {erro}")
        return funcao
    return decorar


@caso("adiciona o primeiro produto no catálogo vazio")
def _():
    simulador, publicador = novo_ambiente()
    commit = publicador.publicar(adicionar=[produto(22, "Espremedor de frutas elétrico 300ml")])
    assert commit and simulador.commits[0]["message"] == "catalogo: adiciona P0022"
    dados = catalogo(simulador)
    assert dados["version"] == 1 and dados["products"] == [produto(22, "Espremedor de frutas elétrico 300ml")]
    assert dados["updatedAt"].endswith("Z") and len(dados["updatedAt"]) == 20
    bruto = simulador.arquivos["data/products.json"]
    assert bruto.endswith(b"\n") and b'\n  "products"' in bruto and "elétrico".encode() in bruto
    validar_com_o_site(bruto)
    simulador.encerrar()


@caso("vários de uma vez: um commit, mensagem agrupada, ordem numérica")
def _():
    simulador, publicador = novo_ambiente()
    publicador.publicar(adicionar=[produto(10000), produto(9999), produto(23), produto(22)])
    assert simulador.commits[0]["message"] == "catalogo: adiciona P0022, P0023, P9999, P10000"
    assert [p["code"] for p in catalogo(simulador)["products"]] == ["P0022", "P0023", "P9999", "P10000"]
    assert len(simulador.commits) == 1
    simulador.encerrar()


@caso("idempotência: repetir não duplica; mudar título atualiza; remover inexistente não é erro")
def _():
    simulador, publicador = novo_ambiente()
    publicador.publicar(adicionar=[produto(22)])
    assert publicador.publicar(adicionar=[produto(22)]) is None
    assert publicador.publicar(remover=["P0999"]) is None
    assert len(simulador.commits) == 1
    publicador.publicar(adicionar=[produto(22, "Título novo")], remover=["P0999"])
    assert simulador.commits[0]["message"] == "catalogo: atualiza P0022"
    assert [p["title"] for p in catalogo(simulador)["products"]] == ["Título novo"]
    publicador.publicar(adicionar=[produto(23)], remover=["P0022"])
    assert simulador.commits[0]["message"] == "catalogo: adiciona P0023; remove P0022"
    assert [p["code"] for p in catalogo(simulador)["products"]] == ["P0023"]
    simulador.encerrar()


@caso("produto inválido não chega a ser enviado")
def _():
    simulador, publicador = novo_ambiente()
    for ruim in (produto(22, link="javascript:alert(1)"), produto(22, link="http://loja.example.com/p/1"),
                 produto(22, titulo="   "), {"code": "P22", "title": "x", "link": "https://loja.example.com/p"},
                 {"code": "P0022\n", "title": "x", "link": "https://loja.example.com/p"}):
        try:
            publicador.publicar(adicionar=[ruim])
        except ErroPublicacao:
            continue
        raise AssertionError(f"aceitou produto inválido: {ruim}")
    assert simulador.puts == 0 and simulador.commits == []
    simulador.encerrar()


@caso("conflito de sha (409): relê, preserva a escrita concorrente e tenta de novo")
def _():
    simulador, publicador = novo_ambiente()
    publicador.publicar(adicionar=[produto(22)])

    def outra_escrita(atual: bytes) -> bytes:
        dados = json.loads(atual)
        dados["products"].append(produto(100 + len(dados["products"])))
        dados["products"].sort(key=lambda p: int(p["code"][1:]))
        return (json.dumps(dados, ensure_ascii=False, indent=2) + "\n").encode()

    simulador.escrita_concorrente = outra_escrita
    simulador.conflitos_forcados = 2
    publicador.publicar(adicionar=[produto(23)])
    codigos = [p["code"] for p in catalogo(simulador)["products"]]
    assert codigos == ["P0022", "P0023", "P0101", "P0102"], codigos
    assert simulador.puts == 4
    simulador.encerrar()


@caso("conflito que não passa: desiste depois das tentativas, sem estado pela metade")
def _():
    simulador, publicador = novo_ambiente()
    simulador.escrita_concorrente = lambda atual: atual.replace(b'"updatedAt": null', b'"updatedAt": "2026-01-01T00:00:00Z"', 1) + b" "
    simulador.conflitos_forcados = 99
    try:
        publicador.publicar(adicionar=[produto(22)])
        raise AssertionError("deveria falhar")
    except ErroPublicacao as erro:
        assert "conflito" in str(erro)
    assert all(c["message"] == "catalogo: escrita concorrente" for c in simulador.commits)
    simulador.encerrar()


@caso("catálogo acima de 1 MB é lido pela API de blobs")
def _():
    grande = {"version": 1, "updatedAt": None, "products": [produto(n) for n in range(1, 7001)]}
    bruto = (json.dumps(grande, ensure_ascii=False, indent=2) + "\n").encode()
    assert len(bruto) > 1024 * 1024
    simulador, publicador = novo_ambiente(bruto)
    publicador.publicar(adicionar=[produto(7001)])
    assert len(catalogo(simulador)["products"]) == 7001
    simulador.encerrar()


@caso("token errado vira erro claro (401)")
def _():
    simulador, _ = novo_ambiente()
    ruim = Publicador(schema=SCHEMA, token="errado", api_url=simulador.url, espera_base=0.01)
    try:
        ruim.publicar(adicionar=[produto(22)])
        raise AssertionError("deveria falhar")
    except ErroPublicacao as erro:
        assert str(erro).startswith("401")
    simulador.encerrar()


@caso("espera o arquivo novo estar no ar antes de postar")
def _():
    simulador, publicador = novo_ambiente()
    simulador.atraso_publico = 3
    publicador.publicar(adicionar=[produto(22)])
    assert publicador.aguardar_no_ar(presentes=["P0022"], limite=5, intervalo=0.05)
    simulador.atraso_publico = 1000
    publicador.publicar(adicionar=[produto(23)])
    assert not publicador.aguardar_no_ar(presentes=["P0023"], limite=0.3, intervalo=0.05)
    simulador.encerrar()


@caso("detecta commit que mexeu em outro arquivo")
def _():
    simulador, publicador = novo_ambiente()
    publicador.publicar(adicionar=[produto(22)])
    simulador.registrar_commit("atualiza pagina", ["index.html", "privacidade.html"])
    suspeitos = publicador.commits_suspeitos("2000-01-01T00:00:00Z")
    assert [s[1] for s in suspeitos] == ["atualiza pagina"] and suspeitos[0][2] == ["index.html", "privacidade.html"]
    simulador.encerrar()


@caso("o conteúdo enviado é base64 de JSON UTF-8 com 2 espaços e quebra final")
def _():
    simulador, publicador = novo_ambiente()
    publicador.publicar(adicionar=[produto(22, "Título com acento, aspas \"duplas\" e <tag>")])
    bruto = simulador.arquivos["data/products.json"]
    assert json.loads(bruto) == json.loads(base64.b64decode(base64.b64encode(bruto)))
    assert bruto.decode("utf-8") == json.dumps(catalogo(simulador), ensure_ascii=False, indent=2) + "\n"
    validar_com_o_site(bruto)
    simulador.encerrar()


print(f"{'todos os testes passaram' if not falhas else str(len(falhas)) + ' teste(s) falharam'}")
sys.exit(1 if falhas else 0)
