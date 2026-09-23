"""Criptografia dos dados publicados (proteção por senha de verdade, não só
visual).

Por que existe: o dashboard é um site estático público (GitHub Pages) e tem
nome de aluno em DATA_FEEDBACK_FULL. Uma senha checada em JavaScript não
protege nada -- os dados já estariam no HTML. Então o repositório só guarda
data.enc (data.js criptografado) e o navegador decifra com a senha digitada
(ver ../protecao.js). data.js aberto nunca é versionado (.gitignore).

A senha nunca fica em arquivo: vem da variável de ambiente CSAT_SENHA
(secret do GitHub Actions no repo automacao-dashboard) ou, rodando na mão,
é digitada no terminal.

Formato do data.enc (JSON), compatível com a Web Crypto API do navegador:
    {"v": 1, "iter": <PBKDF2 iterações>, "salt": b64, "iv": b64, "ct": b64}
    chave = PBKDF2-HMAC-SHA256(senha, salt, iter) -> AES-256-GCM
    ct    = texto cifrado + tag GCM (mesma ordem que crypto.subtle espera)

Uso manual:
    python pipeline/protecao.py cifrar      # data.js -> data.enc
    python pipeline/protecao.py decifrar    # data.enc -> data.js
"""
from __future__ import annotations

import base64
import getpass
import json
import os
import secrets
import sys
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

VAR_SENHA = "CSAT_SENHA"
ITERACOES = 600_000


class SenhaAusenteError(RuntimeError):
    pass


def obter_senha(confirmar: bool = False) -> str:
    senha = os.getenv(VAR_SENHA)
    if senha:
        return senha
    if not sys.stdin.isatty():
        raise SenhaAusenteError(
            f"{VAR_SENHA} não definida -- no GitHub Actions, cadastre o secret "
            f"{VAR_SENHA} no repo automacao-dashboard."
        )
    senha = getpass.getpass("Senha do dashboard: ")
    if confirmar and getpass.getpass("Repita a senha: ") != senha:
        raise SenhaAusenteError("As senhas digitadas não conferem.")
    if not senha:
        raise SenhaAusenteError("Senha vazia.")
    return senha


def _chave(senha: str, salt: bytes, iteracoes: int) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iteracoes)
    return kdf.derive(senha.encode("utf-8"))


def cifrar_texto(texto: str, senha: str) -> str:
    salt = secrets.token_bytes(16)
    iv = secrets.token_bytes(12)
    ct = AESGCM(_chave(senha, salt, ITERACOES)).encrypt(iv, texto.encode("utf-8"), None)
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    return json.dumps({"v": 1, "iter": ITERACOES, "salt": b64(salt), "iv": b64(iv), "ct": b64(ct)})


def decifrar_texto(pacote_json: str, senha: str) -> str:
    p = json.loads(pacote_json)
    d = lambda s: base64.b64decode(s)
    chave = _chave(senha, d(p["salt"]), int(p["iter"]))
    # InvalidTag aqui = senha errada (ou arquivo corrompido)
    return AESGCM(chave).decrypt(d(p["iv"]), d(p["ct"]), None).decode("utf-8")


# Bytes crus nas duas pontas: read_text() converteria \r soltos dentro dos
# comentários dos alunos, e a ida-e-volta deixaria de ser idêntica.
def cifrar_arquivo(origem: Path, destino: Path, senha: str) -> None:
    destino.write_text(cifrar_texto(origem.read_bytes().decode("utf-8"), senha), encoding="ascii")


def decifrar_arquivo(origem: Path, destino: Path, senha: str) -> None:
    destino.write_bytes(decifrar_texto(origem.read_text(encoding="ascii"), senha).encode("utf-8"))


if __name__ == "__main__":
    from config import DATA_ENC_PATH, DATA_JS_PATH

    acao = sys.argv[1] if len(sys.argv) > 1 else ""
    if acao == "cifrar":
        cifrar_arquivo(DATA_JS_PATH, DATA_ENC_PATH, obter_senha(confirmar=True))
        print(f"OK -- {DATA_ENC_PATH.name} gerado a partir de {DATA_JS_PATH.name}.")
    elif acao == "decifrar":
        decifrar_arquivo(DATA_ENC_PATH, DATA_JS_PATH, obter_senha())
        print(f"OK -- {DATA_JS_PATH.name} gerado a partir de {DATA_ENC_PATH.name}.")
    else:
        print(__doc__)
        sys.exit(2)
