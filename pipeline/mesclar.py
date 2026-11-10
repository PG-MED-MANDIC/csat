"""Mescla incremental dos datasets do csat, para nunca perder histórico.

Até aqui o pipeline regravava DATA_GERAL/DATA_ITENS/DATA_FEEDBACK inteiros a partir da exportação do
dia do Indecx. Com o Typeform não há exportação completa: cada resposta é nova. Então o resultado
do dia é MESCLADO com o que já está em data.js: as linhas existentes cujo id aparece no lote novo
são substituídas, as demais são mantidas e as novas entram. Rodar duas vezes com o mesmo lote não
duplica nada.
"""
from __future__ import annotations

import re

_FALLBACK = re.compile(r"^(?P<hab>.*?) T(?P<cod>\d{3,5})(?:\.0)?$")


def mesclar_por_id(existente: list[dict], novo: list[dict], chave: str) -> list[dict]:
    ids_novos = {str(r.get(chave)) for r in novo if r.get(chave) is not None}
    mantidas = [r for r in existente if str(r.get(chave)) not in ids_novos]
    return mantidas + list(novo)


def rotular_pendentes(linhas: list[dict], di_turma_map: dict, campo: str = "di_turma") -> int:
    """Linhas antigas guardam o rótulo de reserva ("Psiquiatria T9116" ou "Dermatologia T9214.0")
    se a turma ainda não estava no mapa. Troca pelo rótulo do mapa quando já existir. Devolve
    quantas mudaram. Altera `linhas` no lugar."""
    mudou = 0
    for r in linhas:
        m = _FALLBACK.match(str(r.get(campo) or ""))
        if not m:
            continue
        novo = di_turma_map.get(m.group("cod"))
        if novo and novo != r[campo]:
            r[campo] = novo
            mudou += 1
    return mudou
