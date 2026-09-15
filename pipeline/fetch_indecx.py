"""CLI: baixa a planilha da pesquisa "CSAT por item" na API do Indecx
(login → solicitar exportação → aguardar ficar pronta → baixar) e salva em
../../dados-fonte/ (export_indecx_csat_<AA>_<MM>_<DD>.xlsx, pasta
compartilhada com os outros pipelines -- ver config.py). Rode manualmente
quando quiser atualizar DATA_GERAL/DATA_ITENS/DATA_FEEDBACK/DATA_TURMAS;
depois rode:

    python atualizar_tudo.py

Este script não é agendado nem automático -- só roda quando você chama. A
planilha baixada tem nota e comentário de aluno -- fica fora do controle de
versão (dados-fonte/ tem seu próprio .gitignore) e não deve ser hospedada.

Configuração: copie pipeline/.env.example para pipeline/.env e preencha
INDECX_EMAIL / INDECX_SENHA / INDECX_FRONTEND_ACCESS_KEY (mesma conta já
usada no pipeline do NPS-PACIENTE).

Uso:
    python fetch_indecx.py --dry-run
    python fetch_indecx.py
"""
from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

from config import DADOS_FONTE_DIR, PIPELINE_DIR, load_indecx_config
from indecx_client import IndecxClient, IndecxConfigurationError


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Baixa a planilha da pesquisa CSAT por item do Indecx.")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Só valida login/token, não solicita exportação nem baixa nada",
    )
    return parser.parse_args()


def fetch_and_save(*, dry_run: bool = False) -> Path | None:
    """Faz login, solicita a exportação, espera ficar pronta e baixa o
    arquivo em dados-fonte/. Devolve o caminho salvo, ou None em --dry-run.

    Levanta IndecxConfigurationError (credenciais ausentes/rejeitadas) ou
    RuntimeError (exportação falhou/expirou) -- quem chamar decide como
    reportar o erro.
    """
    client = IndecxClient(load_indecx_config())

    if dry_run:
        client.validar_credenciais()
        print("Credenciais do Indecx válidas.\n\n--dry-run: nenhuma exportação foi solicitada.")
        return None

    DADOS_FONTE_DIR.mkdir(exist_ok=True)
    filename = f"export_indecx_csat_{date.today():%y_%m_%d}.xlsx"
    output_path = DADOS_FONTE_DIR / filename
    if output_path.exists():
        print(f"Aviso: {output_path.name} já existe e será sobrescrito.")

    client.baixar_planilha(output_path)
    print(f"\nSalvo em {output_path.relative_to(PIPELINE_DIR.parent.parent)}")
    return output_path


def main() -> None:
    args = parse_args()

    try:
        output_path = fetch_and_save(dry_run=args.dry_run)
    except (IndecxConfigurationError, RuntimeError) as e:
        raise SystemExit(str(e))

    if output_path:
        print("Agora rode: python atualizar_tudo.py")


if __name__ == "__main__":
    main()
