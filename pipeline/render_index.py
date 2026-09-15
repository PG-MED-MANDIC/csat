"""Regrava as constantes DATA_GERAL, DATA_ITENS, DATA_FEEDBACK e
DATA_TURMAS dentro de ../index.html -- o dataset "CSAT por item", que já
era recalculado pelo próprio botão de upload da página (ver loadNewBase()
em index.html). Preserva todo o resto do arquivo intocado.

Nunca toca em DATA_NPS, DATA_FEEDBACK_FULL, DATA_ITENS_AGG, EXTRA nem
DI_TURMA_MAP -- ver pipeline/README.md > "O que este pipeline NÃO faz".

IDX_GERAL também não é tocado: fica sempre `{}` no arquivo -- é recalculado
no navegador a partir de DATA_GERAL ao carregar a página (index.html:742),
não é dado persistido, então não há nada pra gravar aqui.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

NAMES = ("DATA_GERAL", "DATA_ITENS", "DATA_FEEDBACK", "DATA_TURMAS")


def _upsert_const(lines: list[str], name: str, value) -> list[str]:
    pattern = re.compile(rf"^const {re.escape(name)} = .*;")
    new_value = json.dumps(value, ensure_ascii=False)

    for i, line in enumerate(lines):
        if pattern.match(line):
            ending = line[len(line.rstrip("\r\n")):]
            lines[i] = f"const {name} = {new_value};{ending}"
            return lines

    raise RuntimeError(
        f"Não encontrei a linha 'const {name} = ...;' no index.html -- abortando para não "
        "corromper o arquivo. Verifique manualmente antes de rodar de novo."
    )


def read_di_turma_map(html_path: Path) -> dict:
    """Lê (sem alterar) a tabela DI_TURMA_MAP já embutida no arquivo -- é
    uma tabela estática (código de turma -> rótulo), não derivável da
    planilha bruta, então este pipeline nunca a regrava, só a lê pra
    reaproveitar no cálculo de `di_turma` (ver transform_csat.py).
    """
    text = html_path.read_text(encoding="utf-8")
    m = re.search(r"^const DI_TURMA_MAP = (\{.*\});", text, re.MULTILINE)
    if not m:
        raise RuntimeError("Não encontrei 'const DI_TURMA_MAP = ...;' no index.html.")
    return json.loads(m.group(1))


def upsert_all(html_path: Path, data: dict[str, list[dict]]) -> None:
    # newline="" evita reescrever \n -> \r\n no arquivo inteiro (Windows) --
    # sem isso o diff mostraria o arquivo inteiro como alterado a cada execução.
    lines = html_path.read_text(encoding="utf-8", newline="").splitlines(keepends=True)

    for name in NAMES:
        lines = _upsert_const(lines, name, data[name])

    html_path.write_text("".join(lines), encoding="utf-8", newline="")
