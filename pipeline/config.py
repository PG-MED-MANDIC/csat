"""Configuração do pipeline: caminhos e credenciais do Indecx.

Mesma conta Indecx já usada no pipeline do NPS-PACIENTE (companyId igual) --
só a pesquisa é diferente ("CSAT por item" em vez de NPS de paciente), com
seu próprio groupId/actionId/metric (ver indecx_client.py). Credenciais
nunca ficam hardcoded aqui -- vêm de pipeline/.env (fora do controle de
versão); reaproveite os mesmos valores de INDECX_EMAIL/INDECX_SENHA/
INDECX_FRONTEND_ACCESS_KEY já usados lá.

DADOS_FONTE_DIR aponta pra fora deste repositório, pra dados-fonte/ na raiz
do workspace (pasta NPS-PACIENTE, que contém este repositório como
subpasta) -- é a MESMA pasta compartilhada usada pelos outros pipelines
(ver CONTEXTO-GITHUB.md na raiz do workspace), só que com um nome de
arquivo próprio (export_indecx_csat_*.xlsx) -- não há dado em comum pra
reaproveitar com os outros pipelines (é uma pesquisa diferente), mas fica
tudo no mesmo lugar pra facilitar limpeza. Só funciona com essa disposição
de pastas -- se este repositório for movido pra fora de NPS-PACIENTE,
ajuste este caminho.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PIPELINE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = PIPELINE_DIR.parent
INDEX_HTML_PATH = PROJECT_DIR / "index.html"
DADOS_FONTE_DIR = PROJECT_DIR.parent / "dados-fonte"


@dataclass(frozen=True)
class IndecxConfig:
    email: str | None
    senha: str | None
    frontend_access_key: str | None

    @property
    def is_configured(self) -> bool:
        return bool(self.email and self.senha and self.frontend_access_key)


def load_indecx_config() -> IndecxConfig:
    return IndecxConfig(
        email=os.getenv("INDECX_EMAIL") or None,
        senha=os.getenv("INDECX_SENHA") or None,
        frontend_access_key=os.getenv("INDECX_FRONTEND_ACCESS_KEY") or None,
    )


# Lista de colunas lidas da exportação real (ver transform_csat.py:
# RAW_COLUMNS_OBRIGATORIAS, ITEM_COLUNAS, COL_AGRADOU_ALIASES,
# COL_MELHORAR_ALIASES) -- nome/email/telefone do aluno (presentes na
# exportação real) nunca são lidos nem entram em DATA_GERAL/DATA_ITENS/
# DATA_FEEDBACK/DATA_TURMAS. Proposital: mesma filosofia de lista de
# permissão do pipeline do NPS-PACIENTE (ver pipeline/config.py de lá).
