"""Engajamento (adesão) pelo método NOVO -- Book + checklist (convites) x respostas do csat.

Regras (decididas com o usuário em 16/11/2026):
  adesão = respostas da turma no mês / convites da turma no mês, somando antes de dividir em
  unidade/habilitação (nunca média de %).
  - Convites vêm de `convites_turma_modulo.json` (gerado LOCALMENTE por
    automacao-dashboard/atualizar_convites_book.py: alunos "Matriculado" no Book x módulos que
    começaram no mês, 1 módulo = 1 convite, mês = 1º dia de prática). Só contagens, sem dado pessoal.
  - Respostas = respostas únicas (db-id) de DATA_GERAL (Indecx + Typeform já mesclados) cuja turma
    (DI) e mês da resposta casam com uma linha de convites. Turma que teve módulo e nenhuma resposta
    fica com 0%. Resposta de turma/mês sem convite não entra (vai pro relatório).
  - Meses antes de ENGAJAMENTO_NOVO_DESDE ficam com o método antigo (convites do Indecx/BigQuery,
    `engajamento_mensal.json`). O mês corrente NÃO entra (só publica mês fechado).

Este módulo é puro (sem I/O de data.js): recebe os dados e devolve o dicionário no MESMO formato
do engajamento_mensal.json (mensal, por_unidade, por_habilitacao, mensal_por_unidade,
mensal_por_habilitacao) + o relatório de comparação novo x antigo.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

NOVO_DESDE_PADRAO = "2026-06"
MES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
_DI_RE = re.compile(r"\(DI (\d+)\)")


def mes_label(mes: str) -> str:
    return f"{MES_ABREV[int(mes[5:7]) - 1]}/{mes[2:4]}"


def _pct(resp: int, conv: int):
    return round(resp / conv * 100, 1) if conv else None


def carregar_convites(*pastas: Path) -> dict | None:
    for pasta in pastas:
        f = Path(pasta) / "convites_turma_modulo.json"
        if f.exists():
            try:
                d = json.loads(f.read_text(encoding="utf-8"))
                if isinstance(d.get("linhas"), list):
                    return d
            except (OSError, ValueError):
                pass
    return None


def mes_da_resposta(ano, mes_order) -> str | None:
    """DATA_GERAL guarda mes_order 1-12 (+ano_resposta) até ago/26 e 13, 14, 15... para set/26, out/26,
    nov/26... (ver transform_csat.parse_mes). Devolve 'AAAA-MM'."""
    try:
        mo = int(mes_order)
    except (TypeError, ValueError):
        return None
    if mo >= 13:
        k = mo - 13 + 8  # meses desde jan/2026 (set/26 -> 8)
        return f"{2026 + k // 12:04d}-{k % 12 + 1:02d}"
    try:
        return f"{int(ano):04d}-{mo:02d}"
    except (TypeError, ValueError):
        return None


def respostas_por_turma_mes(data_geral: list[dict]) -> tuple[dict[tuple[str, str], int], int]:
    """(DI, 'AAAA-MM') -> nº de respostas únicas; e quantas ficaram sem DI identificável."""
    cont: dict[tuple[str, str], int] = defaultdict(int)
    sem_di = 0
    vistos: set = set()
    for r in data_geral:
        id_ = r.get("db-id")
        if id_ in vistos:
            continue
        vistos.add(id_)
        m = _DI_RE.search(str(r.get("di_turma") or ""))
        mes = mes_da_resposta(r.get("ano_resposta"), r.get("mes_order"))
        if not m:
            sem_di += 1
            continue
        if not mes:
            continue
        cont[(m.group(1), mes)] += 1
    return cont, sem_di


def _serie(agg: dict) -> list[dict]:
    return [
        {"mes": mes, "mes_label": mes_label(mes), "conv": v["conv"], "resp": v["resp"], "pct": _pct(v["resp"], v["conv"])}
        for mes, v in sorted(agg.items())
    ]


def construir(convites: dict, data_geral: list[dict], antigo: dict | None, hoje: date,
              novo_desde: str = NOVO_DESDE_PADRAO) -> tuple[dict, list[str]]:
    """Devolve (dados no formato do engajamento_mensal.json, linhas de relatório)."""
    rel: list[str] = []
    mes_atual = f"{hoje.year:04d}-{hoje.month:02d}"
    resp_tm, sem_di = respostas_por_turma_mes(data_geral)
    chaves_conv = {(l["di"], l["mes"]) for l in convites["linhas"]}

    mensal: dict[str, dict] = defaultdict(lambda: {"conv": 0, "resp": 0})
    por_u: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {"conv": 0, "resp": 0}))
    por_h: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {"conv": 0, "resp": 0}))
    meses_novos: set[str] = set()
    for l in convites["linhas"]:
        mes = l["mes"]
        if not (novo_desde <= mes < mes_atual):
            continue
        meses_novos.add(mes)
        resp = resp_tm.get((l["di"], mes), 0)
        for alvo in (mensal[mes],
                     por_u[l["unidade"]][mes] if l.get("unidade") else None,
                     por_h[l["habilitacao"]][mes] if l.get("habilitacao") else None):
            if alvo is not None:
                alvo["conv"] += int(l["convites"])
                alvo["resp"] += resp

    # histórico (método antigo): meses antes de novo_desde, e meses >= novo_desde que o novo não cobriu
    ant = antigo or {}
    def mantem(mes: str) -> bool:
        return mes < novo_desde or (mes not in meses_novos and mes < mes_atual and mes >= novo_desde)

    for m in ant.get("mensal", []):
        if mantem(m["mes"]):
            mensal[m["mes"]] = {"conv": m["conv"], "resp": m["resp"]}
    for u, serie in (ant.get("mensal_por_unidade") or {}).items():
        for m in serie:
            if mantem(m["mes"]):
                por_u[u][m["mes"]] = {"conv": m["conv"], "resp": m["resp"]}
    for h, serie in (ant.get("mensal_por_habilitacao") or {}).items():
        for m in serie:
            if mantem(m["mes"]):
                por_h[h][m["mes"]] = {"conv": m["conv"], "resp": m["resp"]}

    def soma(series: dict[str, dict]) -> tuple[int, int]:
        return sum(v["conv"] for v in series.values()), sum(v["resp"] for v in series.values())

    por_unidade = []
    for u, s in por_u.items():
        c, r = soma(s)
        por_unidade.append({"unidade": u, "conv": c, "resp": r, "pct": _pct(r, c) or 0})
    por_unidade.sort(key=lambda v: v["pct"], reverse=True)
    por_hab = []
    for h, s in por_h.items():
        c, r = soma(s)
        if c >= 5:  # mesma amostra mínima do método antigo
            por_hab.append({"habilitacao": h, "conv": c, "resp": r, "pct": _pct(r, c) or 0})
    por_hab.sort(key=lambda v: v["pct"], reverse=True)

    dados = {
        "mensal": _serie(mensal),
        "por_unidade": por_unidade,
        "por_habilitacao": por_hab[:10],
        "mensal_por_unidade": {u: _serie(s) for u, s in por_u.items()},
        "mensal_por_habilitacao": {h: _serie(s) for h, s in por_h.items()},
        "metodo_novo_desde": novo_desde,
    }

    # relatório: novo x antigo por mês + respostas que ficaram de fora
    ant_mes = {m["mes"]: m for m in ant.get("mensal", [])}
    rel.append(f"  Engajamento NOVO (Book+checklist) desde {novo_desde}; convites gerados em {convites.get('gerado_em')} "
               f"(Book {convites.get('book', {}).get('modificado')}).")
    rel.append("  mês     | NOVO conv resp %      | ANTIGO conv resp %")
    for mes in sorted(meses_novos):
        n = mensal[mes]
        a = ant_mes.get(mes)
        antigo_txt = f"{a['conv']:5d} {a['resp']:4d} {a['pct']}%" if a else "-"
        rel.append(f"  {mes}  | {n['conv']:5d} {n['resp']:4d} {_pct(n['resp'], n['conv'])}% | {antigo_txt}")
    fora = sum(v for (di, mes), v in resp_tm.items() if (di, mes) not in chaves_conv and novo_desde <= mes < mes_atual)
    if fora:
        rel.append(f"  {fora} resposta(s) de turma/mês sem convite no Book+checklist ficaram fora do cálculo.")
    if sem_di:
        rel.append(f"  {sem_di} resposta(s) sem DI identificável na turma (fora do cálculo).")
    return dados, rel
