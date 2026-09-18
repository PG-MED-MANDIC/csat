"""Orquestra a atualização do dataset "CSAT por item" do dashboard: obtém a
planilha da pesquisa no Indecx e regrava DATA_GERAL/DATA_ITENS/
DATA_FEEDBACK/DATA_TURMAS em ../index.html. Um comando só:

    python pipeline/atualizar_tudo.py

Antes de chamar a API, reaproveita a planilha de hoje se ela já tiver sido
baixada (evita gerar uma segunda exportação sem querer, se rodar duas vezes
no mesmo dia). Se quiser forçar um download novo, apague a planilha do dia
em dados-fonte/ antes de rodar.

NÃO mexe no dataset "NPS Pós-Médica" (DATA_NPS/DATA_FEEDBACK_FULL) -- ver
README.md > "O que este pipeline NÃO faz". Esse continua sendo atualizado
manualmente, fora deste pipeline, até decidirmos o que fazer com ele.

Não faz git add/commit/push -- isso continua manual de propósito (ver
README.md), pra sempre ter uma revisão humana antes de publicar no
repositório público. O resumo (console e pipeline/atualizacoes.log) só
contém contagens agregadas -- nunca nome, comentário completo ou qualquer
dado identificável de aluno.
"""
from __future__ import annotations

import sys
import traceback
from datetime import date, datetime
from pathlib import Path

import pandas as pd

from config import DADOS_FONTE_DIR, INDEX_HTML_PATH, PIPELINE_DIR
from fetch_indecx import fetch_and_save
from indecx_client import IndecxConfigurationError
from render_index import read_di_turma_map, upsert_all, upsert_last_update
from transform_csat import (
    build_data_feedback,
    build_data_geral,
    build_data_itens,
    build_data_turmas,
    melt_raw_export,
)

LOG_PATH = PIPELINE_DIR / "atualizacoes.log"


def _log(lines: list[str]) -> None:
    text = "\n".join(lines) + "\n"
    print(text)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(f"\n===== {datetime.now():%Y-%m-%d %H:%M:%S} =====\n")
        f.write(text)


def _planilha_de_hoje() -> Path | None:
    path = DADOS_FONTE_DIR / f"export_indecx_csat_{date.today():%y_%m_%d}.xlsx"
    return path if path.exists() else None


def main() -> int:
    report: list[str] = []

    report.append("PASSO 1/2 -- obter a planilha da pesquisa CSAT por item no Indecx")
    existing = _planilha_de_hoje()
    if existing is not None:
        output_path = existing
        report.append(
            f"  Reaproveitando planilha já baixada hoje: "
            f"{output_path.relative_to(DADOS_FONTE_DIR.parent)} "
            "(evita baixar a mesma base de novo)."
        )
    else:
        try:
            output_path = fetch_and_save()
        except (IndecxConfigurationError, RuntimeError) as e:
            report.append(f"  FALHOU: {e}")
            _log(report)
            return 1
        except Exception:
            report.append("  FALHOU: erro inesperado ao buscar na API. Detalhes:")
            report.append(traceback.format_exc())
            _log(report)
            return 1

        if output_path is None:
            report.append("  --dry-run ou exportação vazia -- index.html não foi alterado.")
            _log(report)
            return 0
        report.append(f"  OK -- planilha salva em {output_path.relative_to(DADOS_FONTE_DIR.parent)}.")

    report.append("\nPASSO 2/2 -- recalcular DATA_GERAL/DATA_ITENS/DATA_FEEDBACK/DATA_TURMAS")
    try:
        df = pd.read_excel(output_path)
        melt_warnings: list[str] = []
        rows = melt_raw_export(df, warnings=melt_warnings)
        di_turma_map = read_di_turma_map(INDEX_HTML_PATH)

        data_geral = build_data_geral(rows, di_turma_map)
        data = {
            "DATA_GERAL": data_geral,
            "DATA_ITENS": build_data_itens(rows),
            "DATA_FEEDBACK": build_data_feedback(rows, di_turma_map),
            "DATA_TURMAS": build_data_turmas(data_geral),
        }
        upsert_all(INDEX_HTML_PATH, data)
        upsert_last_update(INDEX_HTML_PATH, f"{datetime.now():%d/%m/%Y %H:%M}")
    except Exception:
        report.append("  FALHOU: erro ao processar/gravar os dados. Detalhes:")
        report.append(traceback.format_exc())
        _log(report)
        return 1

    report.append(
        f"  OK -- {len(data['DATA_GERAL'])} respostas · {len(data['DATA_ITENS'])} avaliações de item · "
        f"{len(data['DATA_FEEDBACK'])} comentários · {len(data['DATA_TURMAS'])} combinações turma/mês."
    )
    if melt_warnings:
        report.append("  Avisos (revisar manualmente):")
        for w in melt_warnings:
            report.append(f"    - {w}")

    report.append(
        "\nTudo certo. Próximos passos (revise antes de publicar):\n"
        "  git status\n"
        "  git diff -- index.html\n"
        "  git add index.html\n"
        '  git commit -m "Atualiza dados do dashboard (CSAT por item)"\n'
        "  git push"
    )
    _log(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
