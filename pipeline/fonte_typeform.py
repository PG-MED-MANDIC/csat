"""Fonte "CSAT por item" via webhook do Typeform (substitui a exportação do Indecx).

O n8n grava cada POST do Typeform na Data Table `hubspot_pesquisas_raw` (colunas recebido_em,
metodo, payload_json, query_json). Um passo à parte (endpoint do n8n, opção B) entrega essas linhas
em `dados-fonte/typeform_respostas.json`. Este módulo só lê esse arquivo e converte cada resposta
na MESMA forma de linha da exportação do Indecx, de modo que `melt_raw_export` e todo o resto do
pipeline (itens, NPS, comentários, mapa de turmas) funcionam sem alteração.

Regras (decididas com o usuário em 10/11/2026):
- Chave da resposta = `token` do Typeform (vira o `db-id`); reenvio da mesma resposta não duplica.
- Resposta PARCIAL (sem `submitted_at`) é ignorada: o formulário está configurado para enviar
  parciais também, e a completa chega depois com o mesmo token.
- Resposta de TESTE é ignorada: `codturma` oculto não numérico ("xxxxx", "hidden_value"...).
- Celular e e-mail NUNCA entram: só o nome (já autorizado em 25/09 para os comentários).
- `data_resposta` vai em horário de Brasília, "DD/MM/AAAA HH:MM:SS", como o Indecx exportava.
- Comentário = pergunta de texto longo ("Poderia nos contar o porquê da sua nota?"), quando existir.

As perguntas são identificadas pelo `ref` (igual nos dois formulários, ao contrário do `id`).
"""
from __future__ import annotations

import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

ARQUIVO = "typeform_respostas.json"
FUSO_BR = ZoneInfo("America/Sao_Paulo")

REF_NOTA = "e15dec37-d654-4da8-bb2a-db5b4f857d6f"  # "De 0 a 10, ... experiência com a Pós-Médica Mandic"
REF_NOME = "507d8fbb-5b04-4998-8d26-de5a5f9de57e"  # "Informe seu nome completo" (só no formulário QROCDE)

# ref (estável) -> nome de coluna no formato do Indecx; os trechos que `ITEM_COLUNAS` procura
# (sem acento, minúsculo) estão todos presentes nestes textos.
REF_ITENS = {
    "45426e4b-9724-4d3b-b02f-46ac76c6f2db": "Qual seu nível de satisfação com as aulas online deste módulo? (reviews)",
    "b3393c74-3f21-4057-bedf-3fe2833ebe5b": "Como você avalia a dinâmica da aula e a didática dos professores da aula online? (reviews)",
    "8d5a9f2c-aa48-4790-a975-6405c6b09a47": "As aulas online apresentaram exemplos, discussões ou atividades que aproximaram o conteúdo da prática clínica? (reviews)",
    "832cbf91-fa1b-4db8-9817-908f07064cab": "Qual seu nível de satisfação com as aulas práticas deste módulo? (reviews)",
    "760a2779-9aef-4189-ac20-c3c7961bc735": "Como você avalia a condução das aulas práticas pelos professores? (reviews)",
    "7f9d08b8-474a-405e-b4c5-aa1bb6fc38fd": "Como você avalia a facilidade de uso da plataforma educacional Avida? (reviews)",
    "8f707389-4306-4c2f-8fd5-c02e7cb1fce1": "Como você avalia a qualidade da infraestrutura dos consultórios e dos insumos disponibilizados no módulo? (reviews)",
    "089c72c3-0e10-44f6-8c4f-06dd2a977217": "Como você avalia a triagem dos pacientes no módulo? (reviews)",
}
COL_NOME = "informe seu nome completo (input)"
COLUNAS_ITENS = list(REF_ITENS.values())


def _como_payload(linha: dict) -> dict | None:
    """Aceita a linha da Data Table (com `payload_json` em texto) ou o próprio payload."""
    if "form_response" in linha:
        return linha
    bruto = linha.get("payload_json")
    if isinstance(bruto, dict):
        return bruto
    if isinstance(bruto, str):
        try:
            return json.loads(bruto)
        except ValueError:
            return None
    return None


def _data_br(submitted_at: str) -> str | None:
    try:
        dt = datetime.fromisoformat(submitted_at.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt.astimezone(FUSO_BR).strftime("%d/%m/%Y %H:%M:%S")


def payload_para_registro(payload: dict) -> tuple[dict | None, str]:
    """(registro, "") se a resposta vale; (None, motivo) se deve ser descartada."""
    fr = payload.get("form_response")
    if not isinstance(fr, dict):
        return None, "sem form_response"
    if not fr.get("submitted_at"):
        return None, "parcial (sem submitted_at)"
    token = str(fr.get("token") or "").strip()
    if not token:
        return None, "sem token"

    hidden = fr.get("hidden") or {}
    cod = str(hidden.get("codturma") or "").strip()
    if not cod.isdigit():
        return None, "teste (codturma oculto não numérico)"

    respostas: dict[str, dict] = {}
    comentario = ""
    for a in fr.get("answers") or []:
        campo = a.get("field") or {}
        ref = campo.get("ref")
        if campo.get("type") == "long_text":
            comentario = str(a.get("text") or "").strip()
        elif ref:
            respostas[ref] = a

    nota = (respostas.get(REF_NOTA) or {}).get("number")
    if nota is None:
        return None, "sem nota geral"
    data = _data_br(str(fr["submitted_at"]))
    if data is None:
        return None, "submitted_at inválido"

    reg = {
        "db-id": token,
        "habilitacao": str(hidden.get("habilitacao") or "").strip(),
        "unidade": str(hidden.get("unidade") or "").strip(),
        "nota": nota,
        "data_resposta": data,
        "nomedisciplina": str(hidden.get("nomedisciplina") or "").strip(),
        "codturma": cod,
        "feedback": comentario,
        COL_NOME: str((respostas.get(REF_NOME) or {}).get("text") or "").strip(),
        "_submitted_at": str(fr["submitted_at"]),
    }
    for ref, coluna in REF_ITENS.items():
        reg[coluna] = (respostas.get(ref) or {}).get("number")
    return reg, ""


def registros_de_linhas(linhas: list[dict]) -> tuple[list[dict], Counter]:
    """Converte as linhas brutas, descarta parciais/testes e deduplica por token (vale a mais
    recente por `submitted_at`). Devolve (registros, contagem de descartes por motivo)."""
    por_token: dict[str, dict] = {}
    descartes: Counter = Counter()
    for linha in linhas:
        payload = _como_payload(linha) if isinstance(linha, dict) else None
        if payload is None:
            descartes["payload ilegível"] += 1
            continue
        reg, motivo = payload_para_registro(payload)
        if reg is None:
            descartes[motivo] += 1
            continue
        atual = por_token.get(reg["db-id"])
        if atual is None or reg["_submitted_at"] >= atual["_submitted_at"]:
            if atual is not None:
                descartes["duplicada (token repetido)"] += 1
            por_token[reg["db-id"]] = reg
        else:
            descartes["duplicada (token repetido)"] += 1
    return list(por_token.values()), descartes


def para_dataframe(registros: list[dict]) -> pd.DataFrame:
    """Mesmas colunas da exportação do Indecx que `melt_raw_export` usa. Todas as colunas de item
    existem sempre (mesmo vazias), senão o `melt_raw_export` avisaria de item ausente."""
    colunas = ["db-id", "habilitacao", "unidade", "nota", "data_resposta", "nomedisciplina",
               "codturma", "feedback", COL_NOME, *COLUNAS_ITENS]
    df = pd.DataFrame(registros, columns=colunas)
    return df


def carregar_linhas(*pastas: Path) -> list[dict]:
    """Lê `typeform_respostas.json` da primeira pasta que o tiver; [] se não existir ou for inválido
    (a atualização segue sem a fonte Typeform)."""
    for pasta in pastas:
        f = Path(pasta) / ARQUIVO
        if f.exists():
            try:
                dados = json.loads(f.read_text(encoding="utf-8"))
            except (ValueError, OSError):
                return []
            if isinstance(dados, dict):
                dados = dados.get("rows") or dados.get("linhas") or []
            return [d for d in dados if isinstance(d, dict)]
    return []


def rows_do_typeform(linhas: list[dict], warnings: list[str] | None = None) -> tuple[list[dict], str]:
    """linhas brutas -> (rows no formato longo de `melt_raw_export`, resumo em texto)."""
    from transform_csat import melt_raw_export  # import tardio: evita ciclo e deixa o módulo testável

    registros, descartes = registros_de_linhas(linhas)
    resumo = f"{len(registros)} resposta(s) válida(s) de {len(linhas)} recebida(s)"
    if descartes:
        resumo += " | descartadas: " + ", ".join(f"{n}x {m}" for m, n in sorted(descartes.items()))
    if not registros:
        return [], resumo
    return melt_raw_export(para_dataframe(registros), warnings=warnings), resumo
