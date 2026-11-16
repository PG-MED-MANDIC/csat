"""Testes do cálculo de engajamento novo (Book + checklist). Rodar (de csat/pipeline): python -m unittest discover -s testes -v"""
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engajamento_novo import construir, mes_da_resposta  # noqa: E402


def _linha(di, mes, convites, unidade="CAMPINAS", hab="Dermatologia"):
    return {"di": di, "turma": f"X (DI {di})", "unidade": unidade, "habilitacao": hab, "mes": mes,
            "modulos": 1, "alunos": convites, "convites": convites}


def _resp(i, di, ano, mes_order):
    return {"db-id": str(i), "di_turma": f"Derm CPS - T1 (DI {di})", "ano_resposta": ano, "mes_order": mes_order}


def test_mes_da_resposta():
    assert mes_da_resposta(2026, 8) == "2026-08"
    assert mes_da_resposta(2026, 13) == "2026-09"   # set/26
    assert mes_da_resposta(2026, 15) == "2026-11"
    assert mes_da_resposta(2027, 17) == "2027-01"   # jan/27
    assert mes_da_resposta(None, None) is None


def test_turma_sem_resposta_fica_zero_e_soma_antes_de_dividir():
    convites = {"linhas": [_linha("1", "2026-09", 10), _linha("2", "2026-09", 30)], "gerado_em": "x", "book": {}}
    dg = [_resp(i, "1", 2026, 13) for i in range(5)]  # só a turma 1 respondeu (5 de 10)
    novo, _ = construir(convites, dg, None, date(2026, 11, 16), novo_desde="2026-06")
    m = novo["mensal"][0]
    assert (m["conv"], m["resp"], m["pct"]) == (40, 5, 12.5)  # 5/40, não média de 50% e 0%


def test_resposta_duplicada_conta_uma_vez_e_mes_corrente_entra():
    convites = {"linhas": [_linha("1", "2026-10", 10), _linha("1", "2026-11", 10)], "gerado_em": "x", "book": {}}
    dg = [_resp(1, "1", 2026, 14), _resp(1, "1", 2026, 14), _resp(2, "1", 2026, 15)]
    novo, _ = construir(convites, dg, None, date(2026, 11, 16), novo_desde="2026-06")
    # nov/26 (mês corrente) entra com o que já chegou; a mesma resposta (db-id) em duplicidade conta 1 vez
    assert [(m["mes"], m["conv"], m["resp"]) for m in novo["mensal"]] == [("2026-10", 10, 1), ("2026-11", 10, 1)]


def test_historico_antigo_antes_do_corte():
    antigo = {"mensal": [{"mes": "2026-01", "mes_label": "jan/26", "conv": 100, "resp": 25, "pct": 25.0}]}
    convites = {"linhas": [_linha("1", "2026-09", 10)], "gerado_em": "x", "book": {}}
    novo, _ = construir(convites, [], antigo, date(2026, 11, 16), novo_desde="2026-06")
    assert [m["mes"] for m in novo["mensal"]] == ["2026-01", "2026-09"]


class EngajamentoNovoTests(unittest.TestCase):
    def test_mes_da_resposta(self):
        test_mes_da_resposta()

    def test_turma_sem_resposta_zero(self):
        test_turma_sem_resposta_fica_zero_e_soma_antes_de_dividir()

    def test_duplicada_e_mes_corrente(self):
        test_resposta_duplicada_conta_uma_vez_e_mes_corrente_entra()

    def test_historico_antigo(self):
        test_historico_antigo_antes_do_corte()


if __name__ == "__main__":
    unittest.main()
