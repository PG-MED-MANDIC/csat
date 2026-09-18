"""Transforma a planilha bruta da pesquisa "CSAT por item" (Indecx) nas 4
constantes que ../index.html usa: DATA_GERAL, DATA_ITENS, DATA_FEEDBACK e
DATA_TURMAS.

build_data_geral/build_data_itens/build_data_feedback/build_data_turmas são
port fiel, linha por linha, da função loadNewBase() que já existe dentro de
index.html (JavaScript -- é o que roda hoje quando alguém sobe um Excel
manualmente pelo botão "Atualizar base" da página) -- elas esperam um
formato "longo" (uma linha por item avaliado, várias por resposta).

ACHADO AO RODAR CONTRA A EXPORTAÇÃO REAL (2026-09-15): a exportação de
verdade do Indecx não vem nesse formato longo -- vem "larga" (uma linha por
resposta, com as 8 perguntas de item como colunas cujo texto é a pergunta
inteira, ex. "como você avalia a facilidade de uso da plataforma
educacional avida? (reviews)"). `melt_raw_export()` converte esse formato
largo pro formato longo que as funções acima esperam, usando busca por
trecho (sem acento, case-insensitive) no texto da pergunta -- igual ao
`encontrar_coluna()` de sistemas/ouvidoria-csat-teste/backend/backend_api.py
(outro projeto que já lê essa mesma pesquisa, só que pra outro fim -- só
consultado como referência, nunca alterado).

Também usa o mesmo fallback de comentário que aquele projeto usa
(`montar_comentario()`): a ação "QROCDE" desta pesquisa deixa a coluna
`feedback` vazia e usa duas perguntas de texto livre separadas em vez
disso -- sem esse fallback, DATA_FEEDBACK sairia praticamente vazio pra
respostas desse canal.

Só lê as colunas em RAW_COLUMNS_OBRIGATORIAS + ITEM_COLUNAS + comentário --
nome/email/telefone de aluno (colunas "nome"/"email"/"telefone"/"informe
seu nome completo (input)"/"informe seu celular (contact)", presentes na
exportação real) nunca são lidos nem entram nos dados de saída.

DATA_FEEDBACK (2026-09-18): além dos campos de sempre, `build_data_feedback()`
agora inclui `db_id`/`mes_order`/`mes_label`/`semana_key`/`di_turma`/`ts` --
index.html usa isso pra alimentar toda a análise qualitativa por tema/palavra-
chave (Resumo Executivo, aba Análise de Comentários, cruzamento comentário×tema
por unidade), que antes dependia de `DATA_FEEDBACK_FULL`, uma base carregada à
mão que ficava parada entre atualizações manuais (ver PROGRESSO.md). Sem `nome`
de propósito, mesma razão do parágrafo acima.
"""
from __future__ import annotations

import math
import re
import unicodedata
from datetime import date, timedelta

import pandas as pd

ONLINE_HABS = {"Psiquiatria Clínica", "Endocrinologia Clínica"}

# Mesmo mapa fixo (ano letivo começando set/2025) que já existe em
# index.html -- mesma limitação lá: não tem rótulo além de mes_order=13
# (set/26). Portado como está, não "corrigido" aqui.
MES_LABEL = {
    9: "set/25", 10: "out/25", 11: "nov/25", 12: "dez/25",
    1: "jan/26", 2: "fev/26", 3: "mar/26", 4: "abr/26", 5: "mai/26",
    6: "jun/26", 7: "jul/26", 8: "ago/26", 13: "set/26",
}

# tipo_avaliacao (planilha) -> campo em DATA_GERAL.
TIPO_PARA_CAMPO = {
    "Aula Online": "nota_Aula_Online",
    "Aula Prática": "nota_Aula_Prática",
    "Infraestrutura": "nota_Infraestrutura",
    "Plataforma Avida": "nota_Plataforma_Avida",
    "Professor": "nota_Professor",
    "Triagem": "nota_Triagem",
}

UNIDADES_VALIDAS = {"BRASÍLIA", "CAMPINAS", "CONSOLAÇÃO", "ONLINE"}


def _num(x):
    """None se vazio/NaN; int se for um inteiro exato; float caso contrário
    -- evita numpy.int64/float64 (json.dumps não serializa esses tipos) e
    replica o comportamento do JS (nota ausente vira null)."""
    if x is None:
        return None
    if isinstance(x, str) and x.strip() == "":
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(f):
        return None
    return int(f) if f.is_integer() else f


def _str(x) -> str:
    if x is None:
        return ""
    if isinstance(x, float) and math.isnan(x):
        return ""
    return str(x).strip()


def _to_date(raw) -> date | None:
    if raw is None or (isinstance(raw, float) and math.isnan(raw)):
        return None
    # dayfirst=True: a exportação real traz data_resposta como texto
    # "DD/MM/AAAA HH:MM:SS" (formato brasileiro) -- sem isso, datas com dia
    # <=12 ficam ambíguas e o pandas pode interpretar como MM/DD por padrão.
    d = pd.to_datetime(raw, errors="coerce", dayfirst=True)
    if pd.isna(d):
        return None
    return d.date() if hasattr(d, "date") else d


def _to_datetime(raw):
    """Igual a `_to_date`, mas preserva a hora -- usado só pra gerar `ts`
    (YYYYMMDDHHMMSS numérico), critério de ordenação por recência já usado
    em várias listagens de comentários do index.html."""
    if raw is None or (isinstance(raw, float) and math.isnan(raw)):
        return None
    dt = pd.to_datetime(raw, errors="coerce", dayfirst=True)
    if pd.isna(dt):
        return None
    return dt


def parse_mes(data_resposta) -> int | None:
    """Mesmo cálculo de mes_order do JS: usa data_resposta como fonte da
    verdade (nome_mes_resposta pode estar desatualizado)."""
    d = _to_date(data_resposta)
    if d is None:
        return None
    mm, yy = d.month, d.year
    if yy > 2026 or (yy == 2026 and mm >= 9):
        return 13 + ((yy - 2026) * 12 + (mm - 9))
    return mm


def parse_ano(data_resposta, ano_resposta_fallback) -> int | None:
    d = _to_date(data_resposta)
    if d is not None:
        return d.year
    return _num(ano_resposta_fallback)


def _sem_acento(value) -> str:
    s = str(value if value is not None else "")
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def map_unidade(habilitacao, unidade) -> str:
    hab = _str(habilitacao)
    if hab in ONLINE_HABS:
        return "ONLINE"
    # Comparação sem acento (a exportação real traz "QUINTAL SLM -
    # BRASÍLIA" com acento -- o index.html embutido compara acentuado
    # também, o que na prática nunca bate com "BRASILIA" sem acento;
    # corrigido aqui pra não jogar respostas de Brasília em "OUTROS").
    u = _sem_acento(unidade).upper()
    if "BRASILIA" in u:
        return "BRASÍLIA"
    if "CAMPINAS" in u:
        return "CAMPINAS"
    if "CONSOLA" in u:
        return "CONSOLAÇÃO"
    return "OUTROS"


def classify(nota_geral) -> str:
    n = _num(nota_geral)
    if n is not None and n >= 9:
        return "Promotor"
    if n is not None and n >= 7:
        return "Neutro"
    return "Detrator"


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())  # weekday(): Monday=0..Sunday=6


def compute_semana_key(d: date | None) -> str | None:
    if d is None:
        return None
    monday = _monday_of(d)
    wn = (monday.day - 1) // 7 + 1
    return f"{monday.year}-{monday.month:02d}-W{wn}"


def compute_semana_label(d: date | None) -> str | None:
    if d is None:
        return None
    monday = _monday_of(d)
    sunday = monday + timedelta(days=6)
    return f"Seg {monday:%d/%m} – Dom {sunday:%d/%m}"


def di_turma_label(hab: str, cod, di_turma_map: dict) -> str:
    c = _str(cod)
    # DI_TURMA_MAP usa só o número (ex. "7590"), mas codturma na exportação
    # real vem como "E7590/24" (prefixo de letra + sufixo de ano) -- extrai
    # só os dígitos pra achar a entrada certa no mapa.
    m = re.search(r"\d+", c)
    key = m.group(0) if m else c
    return di_turma_map.get(key) or f"{hab} T{c}"


def build_data_geral(rows: list[dict], di_turma_map: dict) -> list[dict]:
    """Cada `tipo_avaliacao` pode ter mais de uma linha por resposta (ver
    ITEM_COLUNAS em melt_raw_export -- ex. "Aula Online" recebe 2 perguntas
    diferentes da planilha bruta) -- por isso acumula soma+contagem e tira a
    média no final, em vez de só sobrescrever com a última nota vista.
    Confirmado batendo com o dashboard de referência (ver pipeline/README.md
    > "Fórmula dos itens").
    """
    by_id: dict[str, dict] = {}
    item_soma: dict[tuple[str, str], float] = {}
    item_cnt: dict[tuple[str, str], int] = {}

    for r in rows:
        id_ = r.get("db-id")
        if not id_ or (isinstance(id_, float) and math.isnan(id_)):
            continue
        id_ = str(id_)
        hab = _str(r.get("habilitacao"))

        if id_ not in by_id:
            mes = parse_mes(r.get("data_resposta"))
            d = _to_date(r.get("data_resposta"))
            by_id[id_] = {
                "db-id": id_,
                "unidade_calc": map_unidade(hab, r.get("unidade")),
                "ano_resposta": parse_ano(r.get("data_resposta"), r.get("ano_resposta")),
                "mes_order": mes,
                "mes_label": MES_LABEL.get(mes, ""),
                "semana_key": compute_semana_key(d),
                "semana_label": compute_semana_label(d),
                "habilitacao": hab,
                "di_turma": di_turma_label(hab, r.get("codturma"), di_turma_map),
                "nota_geral": _num(r.get("nota_geral")),
                "classificacao": classify(r.get("nota_geral")),
                "disciplina": r.get("nomedisciplina") or "",
                "nota_Aula_Online": None, "nota_Aula_Prática": None,
                "nota_Infraestrutura": None, "nota_Plataforma_Avida": None,
                "nota_Professor": None, "nota_Triagem": None,
            }

        campo = TIPO_PARA_CAMPO.get(r.get("tipo_avaliacao"))
        nota = _num(r.get("nota"))
        if campo and nota is not None:
            chave = (id_, campo)
            item_soma[chave] = item_soma.get(chave, 0) + nota
            item_cnt[chave] = item_cnt.get(chave, 0) + 1

    for (id_, campo), cnt in item_cnt.items():
        by_id[id_][campo] = item_soma[(id_, campo)] / cnt

    return [r for r in by_id.values() if r["unidade_calc"] in UNIDADES_VALIDAS]


def build_data_itens(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        id_ = r.get("db-id")
        if not id_ or (isinstance(id_, float) and math.isnan(id_)):
            continue
        if map_unidade(r.get("habilitacao"), r.get("unidade")) not in UNIDADES_VALIDAS:
            continue
        out.append({
            "db-id": str(id_),
            "tipo_avaliacao": r.get("tipo_avaliacao"),
            "nota": _num(r.get("nota")),
        })
    return out


def build_data_feedback(rows: list[dict], di_turma_map: dict) -> list[dict]:
    """Igual a antes, + `db_id`/`mes_order`/`mes_label`/`semana_key`/`di_turma`/`ts`
    -- campos que faltavam pra index.html poder filtrar/juntar esses comentários
    com DATA_GERAL/DATA_ITENS (via db-id) e com os filtros de mês/semana/turma,
    do jeito que já fazia com DATA_FEEDBACK_FULL (a base manual que ficava parada
    entre atualizações -- ver PROGRESSO.md). `nome` continua de fora de propósito
    (ver módulo docstring): não expor identificação de aluno na base pública
    atualizada todo dia.
    """
    seen: set[str] = set()
    out = []
    for r in rows:
        id_ = r.get("db-id")
        if not id_ or (isinstance(id_, float) and math.isnan(id_)):
            continue
        id_ = str(id_)
        if id_ in seen:
            continue
        feedback = r.get("feedback")
        feedback_str = _str(feedback)
        if not feedback_str or feedback_str == "null":
            continue
        seen.add(id_)

        hab = _str(r.get("habilitacao"))
        d = _to_date(r.get("data_resposta"))
        dt = _to_datetime(r.get("data_resposta"))
        mes = parse_mes(r.get("data_resposta"))
        out.append({
            "db_id": id_,
            "cod": _str(r.get("codturma")),
            "turma": _str(r.get("turma")),
            "hab": hab,
            "data": d.strftime("%d/%m/%Y") if d else "",
            "unidade": map_unidade(hab, r.get("unidade")),
            "nota": _num(r.get("nota_geral")),
            "disciplina": r.get("nomedisciplina") or "",
            "feedback": feedback_str,
            "mes_order": mes,
            "mes_label": MES_LABEL.get(mes, ""),
            "semana_key": compute_semana_key(d),
            "di_turma": di_turma_label(hab, r.get("codturma"), di_turma_map),
            "ts": int(dt.strftime("%Y%m%d%H%M%S")) if dt else None,
        })
    return out


def build_data_turmas(data_geral: list[dict]) -> list[dict]:
    agg: dict[tuple, dict] = {}
    for r in data_geral:
        key = (r["unidade_calc"], r["habilitacao"], r["di_turma"], r["mes_order"])
        if key not in agg:
            agg[key] = {
                "unidade_calc": r["unidade_calc"], "habilitacao": r["habilitacao"],
                "di_turma": r["di_turma"], "mes_order": r["mes_order"],
                "mes_label": r["mes_label"], "sum": 0, "cnt": 0,
                "promotores": 0, "neutros": 0, "detratores": 0,
            }
        t = agg[key]
        nota = r["nota_geral"] or 0
        t["sum"] += nota
        t["cnt"] += 1
        if nota >= 9:
            t["promotores"] += 1
        elif nota >= 7:
            t["neutros"] += 1
        else:
            t["detratores"] += 1

    out = []
    for t in agg.values():
        media = t["sum"] / t["cnt"] if t["cnt"] else 0
        out.append({**t, "media": media, "total": t["cnt"]})
    return out


# ─── Adaptação do formato largo (exportação real) pro formato longo ────────

RAW_COLUMNS_OBRIGATORIAS = (
    "db-id", "habilitacao", "unidade", "nota", "data_resposta", "nomedisciplina",
)

# tipo_avaliacao (DATA_GERAL/DATA_ITENS) -> lista de "componentes", cada um
# uma lista de aliases (trecho sem acento, minúsculo) que localizam a coluna
# real na exportação. Um tipo com mais de um componente vira uma MÉDIA das
# perguntas correspondentes (build_data_geral soma+conta por tipo) -- é
# assim que o dashboard de referência calcula (conferido comparando 4
# respostas reais, ver pipeline/README.md > "Fórmula dos itens"; a
# nomenclatura de alguns campos é meio contraintuitiva -- "Professor", por
# exemplo, na verdade vem da pergunta de didática da aula ONLINE, não da
# pergunta sobre o professor da aula prática).
#
# Um componente com mais de um alias (ex. "Aula Prática", 2º componente)
# são duas perguntas mutuamente exclusivas por linha (a ação "PG Médica"
# usa uma redação no singular, outra ação usa o plural -- nunca as duas
# preenchidas na mesma resposta) -- por linha, usa a primeira que estiver
# preenchida. Sem esse fallback, ~99% das respostas ficam sem essa nota
# (achado real ao rodar contra a exportação: só 21 de 2210 tinham a
# variante singular preenchida).
ITEM_COLUNAS: dict[str, list[list[str]]] = {
    "Aula Online": [
        ["satisfacao com as aulas online"],
        ["aulas online apresentaram exemplos"],
    ],
    "Aula Prática": [
        ["satisfacao com as aulas praticas"],
        ["conducao da aula pratica pelo professor", "conducao das aulas praticas pelos professores"],
    ],
    "Infraestrutura": [["qualidade da infraestrutura dos consultorios"]],
    "Plataforma Avida": [["facilidade de uso da plataforma"]],
    "Professor": [["dinamica da aula e a didatica"]],
    "Triagem": [["avalia a triagem dos pacientes"]],
}

# Perguntas de texto livre usadas como comentário quando a coluna genérica
# "feedback" vem vazia -- ação "QROCDE" desta pesquisa não preenche
# "feedback", usa essas duas em vez disso (mesmo achado de
# ouvidoria-csat-teste/backend/backend_api.py::montar_comentario()).
COL_AGRADOU_ALIASES = ["o que mais te agradou"]
COL_MELHORAR_ALIASES = ["o que poderia ser melhorado"]


def _encontrar_coluna(colunas, aliases: list[str]) -> str | None:
    for alias in aliases:
        alvo = _sem_acento(alias).lower()
        for col in colunas:
            if alvo in _sem_acento(col).lower():
                return col
    return None


def _encontrar_colunas_grupo(colunas, aliases: list[str]) -> list[str]:
    """Acha TODAS as colunas que batem com qualquer alias do grupo (mantém
    a ordem em que aparecem na planilha) -- usado quando duas redações da
    mesma pergunta existem e são mutuamente exclusivas por linha."""
    encontradas = []
    for col in colunas:
        col_norm = _sem_acento(col).lower()
        if any(_sem_acento(alias).lower() in col_norm for alias in aliases) and col not in encontradas:
            encontradas.append(col)
    return encontradas


def _montar_comentario(row: dict, col_agradou: str | None, col_melhorar: str | None) -> str:
    feedback = _str(row.get("feedback"))
    if feedback:
        return feedback

    partes = []
    agradou = _str(row.get(col_agradou)) if col_agradou else ""
    melhorar = _str(row.get(col_melhorar)) if col_melhorar else ""
    if agradou:
        partes.append(f"O que mais agradou: {agradou}")
    if melhorar:
        partes.append(f"O que poderia melhorar: {melhorar}")
    return "\n".join(partes)


def melt_raw_export(df: pd.DataFrame, warnings: list[str] | None = None) -> list[dict]:
    """Converte a exportação real (uma linha por resposta, colunas largas
    por item) numa lista de dicts no formato longo que
    build_data_geral/build_data_itens/build_data_feedback já esperam (uma
    entrada por item avaliado, repetindo os campos da resposta)."""
    if warnings is None:
        warnings = []

    faltando = [c for c in RAW_COLUMNS_OBRIGATORIAS if c not in df.columns]
    if faltando:
        raise RuntimeError(f"Colunas obrigatórias ausentes na exportação: {', '.join(faltando)}")

    colunas = list(df.columns)
    # tipo -> lista de componentes resolvidos; cada componente é a lista de
    # colunas reais (1 ou mais, quando há variantes mutuamente exclusivas)
    # que alimentam aquela parte da média do item.
    item_grupos: dict[str, list[list[str]]] = {}
    for tipo, componentes in ITEM_COLUNAS.items():
        resolvidos = []
        for aliases in componentes:
            cols = _encontrar_colunas_grupo(colunas, aliases)
            if cols:
                resolvidos.append(cols)
            else:
                warnings.append(
                    f'Item "{tipo}": nenhuma coluna encontrada pra um dos componentes '
                    f'(aliases: {aliases}) -- essa parte da média ficará ausente.'
                )
        item_grupos[tipo] = resolvidos

    col_agradou = _encontrar_coluna(colunas, COL_AGRADOU_ALIASES)
    col_melhorar = _encontrar_coluna(colunas, COL_MELHORAR_ALIASES)
    codturma_col = "codturma" if "codturma" in df.columns else None

    rows: list[dict] = []
    for record in df.to_dict("records"):
        base = {
            "db-id": record.get("db-id"),
            "habilitacao": record.get("habilitacao"),
            "unidade": record.get("unidade"),
            "nota_geral": record.get("nota"),
            "data_resposta": record.get("data_resposta"),
            "codturma": record.get(codturma_col) if codturma_col else None,
            "turma": None,  # não existe na exportação real -- DATA_FEEDBACK.turma sai vazio
            "nomedisciplina": record.get("nomedisciplina"),
            "feedback": _montar_comentario(record, col_agradou, col_melhorar),
        }

        algum_item = False
        for tipo, componentes in item_grupos.items():
            for cols in componentes:
                nota = None
                for c in cols:
                    nota = _num(record.get(c))
                    if nota is not None:
                        break
                if nota is None:
                    continue
                rows.append({**base, "tipo_avaliacao": tipo, "nota": nota})
                algum_item = True

        if not algum_item:
            # Resposta sem nenhuma nota de item preenchida (ex.: canal
            # diferente de QROCDE) -- ainda entra em DATA_GERAL/DATA_FEEDBACK
            # (nota geral e comentário), só não contribui pra DATA_ITENS.
            rows.append({**base, "tipo_avaliacao": None, "nota": None})

    return rows
