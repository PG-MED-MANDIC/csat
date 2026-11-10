"""Testes da fonte Typeform e da mescla. Só dados FICTÍCIOS (nenhuma resposta real).

Rodar (de csat/pipeline): python -m unittest discover -s testes -v
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fonte_typeform import (  # noqa: E402
    COL_NOME, REF_ITENS, REF_NOME, REF_NOTA, para_dataframe, payload_para_registro,
    registros_de_linhas, rows_do_typeform,
)
from mesclar import mesclar_por_id, rotular_pendentes  # noqa: E402
from transform_csat import build_data_feedback, build_data_geral, build_data_itens, build_data_turmas  # noqa: E402

CELULAR_FICTICIO = "+5500900000000"
MAPA = {"9116": "Psiquiatria SP - T5 (DI 9116)"}


def payload(token="tok1", submitted="2026-11-09T21:24:50Z", cod="9116", nota=10, itens=5,
            nome="Aluno Ficticio", comentario=None, hidden_extra=None, com_nome=True):
    hidden = {"codturma": cod, "habilitacao": "Psiquiatria ", "unidade": "CONSOLAÇÃO",
              "nomedisciplina": "Disciplina Ficticia I", "datainicio": "2026-10-15", "datafim": "2026-11-09"}
    hidden.update(hidden_extra or {})
    respostas = [{"type": "number", "number": nota, "field": {"ref": REF_NOTA, "type": "opinion_scale"}}]
    if comentario is not None:
        respostas.append({"type": "text", "text": comentario, "field": {"ref": "ref-long", "type": "long_text"}})
    for ref in REF_ITENS:
        respostas.append({"type": "number", "number": itens, "field": {"ref": ref, "type": "rating"}})
    if com_nome:
        respostas.append({"type": "text", "text": nome, "field": {"ref": REF_NOME, "type": "short_text"}})
        respostas.append({"type": "phone_number", "phone_number": CELULAR_FICTICIO,
                          "field": {"ref": "ref-fone", "type": "phone_number"}})
    fr = {"form_id": "F", "token": token, "hidden": hidden, "answers": respostas}
    if submitted:
        fr["submitted_at"] = submitted
    return {"event_type": "form_response", "form_response": fr}


def linha(p):
    """Como a Data Table entrega: payload em texto."""
    return {"recebido_em": "2026-11-09T21:25:00Z", "metodo": "POST", "payload_json": json.dumps(p)}


class RegistroTest(unittest.TestCase):
    def test_resposta_valida_converte_data_para_brasilia(self):
        reg, motivo = payload_para_registro(payload())
        self.assertEqual(motivo, "")
        self.assertEqual(reg["db-id"], "tok1")
        self.assertEqual(reg["data_resposta"], "09/11/2026 18:24:50")  # 21:24Z = 18:24 BRT
        self.assertEqual(reg["codturma"], "9116")
        self.assertEqual(reg["habilitacao"], "Psiquiatria")  # espaço do final removido
        self.assertEqual(reg[COL_NOME], "Aluno Ficticio")

    def test_parcial_e_descartada(self):
        reg, motivo = payload_para_registro(payload(submitted=None))
        self.assertIsNone(reg)
        self.assertIn("parcial", motivo)

    def test_teste_com_codturma_xxxxx_e_descartado(self):
        for cod in ("xxxxx", "hidden_value", ""):
            reg, motivo = payload_para_registro(payload(cod=cod))
            self.assertIsNone(reg, cod)
            self.assertIn("teste", motivo)

    def test_sem_nota_geral_e_descartada(self):
        p = payload()
        p["form_response"]["answers"] = [a for a in p["form_response"]["answers"] if a["field"]["ref"] != REF_NOTA]
        self.assertIsNone(payload_para_registro(p)[0])

    def test_celular_nunca_aparece_no_registro(self):
        reg, _ = payload_para_registro(payload())
        self.assertNotIn(CELULAR_FICTICIO, json.dumps(reg, ensure_ascii=False))
        self.assertNotIn("phone", json.dumps(reg).lower())

    def test_formulario_sem_nome_nem_celular(self):
        reg, _ = payload_para_registro(payload(com_nome=False, hidden_extra={"ra": "123456"}))
        self.assertEqual(reg[COL_NOME], "")
        self.assertNotIn("123456", json.dumps(reg))  # RA não é usado


class LoteTest(unittest.TestCase):
    def test_duplicata_mantem_a_mais_recente_e_conta_descartes(self):
        linhas = [
            linha(payload(token="a", submitted="2026-11-09T10:00:00Z", nota=7)),
            linha(payload(token="a", submitted="2026-11-09T12:00:00Z", nota=9)),   # mesma resposta, mais nova
            linha(payload(token="b", submitted=None)),                              # parcial
            linha(payload(token="c", cod="xxxxx")),                                 # teste
            {"payload_json": "{quebrado"},                                          # ilegível
        ]
        regs, descartes = registros_de_linhas(linhas)
        self.assertEqual([r["db-id"] for r in regs], ["a"])
        self.assertEqual(regs[0]["nota"], 9)
        self.assertEqual(descartes["duplicada (token repetido)"], 1)
        self.assertEqual(sum(descartes.values()), 4)

    def test_payload_direto_tambem_e_aceito(self):
        regs, _ = registros_de_linhas([payload(token="z")])
        self.assertEqual(len(regs), 1)


class PipelineTest(unittest.TestCase):
    def setUp(self):
        self.avisos = []
        linhas = [linha(payload(token="t1", comentario="Excelente aula")),
                  linha(payload(token="t2", nota=6, itens=3, comentario=None))]
        self.rows, self.resumo = rows_do_typeform(linhas, warnings=self.avisos)

    def test_nao_ha_aviso_de_item_ausente(self):
        self.assertEqual(self.avisos, [])

    def test_data_geral_itens_e_classificacao(self):
        geral = {r["db-id"]: r for r in build_data_geral(self.rows, MAPA)}
        t1, t2 = geral["t1"], geral["t2"]
        self.assertEqual(t1["unidade_calc"], "CONSOLAÇÃO")
        self.assertEqual(t1["classificacao"], "Promotor")
        self.assertEqual(t2["classificacao"], "Detrator")
        for campo in ("nota_Aula_Online", "nota_Aula_Prática", "nota_Infraestrutura",
                      "nota_Plataforma_Avida", "nota_Professor", "nota_Triagem"):
            self.assertEqual(t1[campo], 5, campo)
            self.assertEqual(t2[campo], 3, campo)
        self.assertEqual(t1["di_turma"], "Psiquiatria SP - T5 (DI 9116)")

    def test_comentario_so_quando_existe(self):
        fb = build_data_feedback(self.rows, MAPA)
        self.assertEqual([f["db_id"] for f in fb], ["t1"])
        self.assertEqual(fb[0]["feedback"], "Excelente aula")
        self.assertEqual(fb[0]["nome"], "Aluno Ficticio")
        self.assertEqual(fb[0]["data"], "09/11/2026")

    def test_itens_e_turmas(self):
        self.assertTrue(build_data_itens(self.rows))
        turmas = build_data_turmas(build_data_geral(self.rows, MAPA))
        self.assertEqual(sum(t["cnt"] for t in turmas), 2)


class MesclaTest(unittest.TestCase):
    def test_mantem_historico_substitui_mesmo_id_e_nao_duplica(self):
        antigo = [{"db-id": "x", "n": 1}, {"db-id": "y", "n": 2}]
        novo = [{"db-id": "y", "n": 99}, {"db-id": "z", "n": 3}]
        r = mesclar_por_id(antigo, novo, "db-id")
        self.assertEqual({d["db-id"]: d["n"] for d in r}, {"x": 1, "y": 99, "z": 3})
        self.assertEqual(mesclar_por_id(r, novo, "db-id"), r)  # idempotente

    def test_itens_com_varias_linhas_por_id(self):
        antigo = [{"db-id": "a", "tipo": "T1"}, {"db-id": "a", "tipo": "T2"}, {"db-id": "b", "tipo": "T1"}]
        novo = [{"db-id": "a", "tipo": "T9"}]
        r = mesclar_por_id(antigo, novo, "db-id")
        self.assertEqual([(d["db-id"], d["tipo"]) for d in r], [("b", "T1"), ("a", "T9")])

    def test_rotular_pendentes(self):
        linhas = [{"di_turma": "Psiquiatria T9116"}, {"di_turma": "Psiquiatria T9116.0"},
                  {"di_turma": "Dermatologia SP - T1 (DI 7591)"}, {"di_turma": "Outra T9999"}]
        n = rotular_pendentes(linhas, MAPA)
        self.assertEqual(n, 2)
        self.assertEqual(linhas[0]["di_turma"], "Psiquiatria SP - T5 (DI 9116)")
        self.assertEqual(linhas[2]["di_turma"], "Dermatologia SP - T1 (DI 7591)")
        self.assertEqual(linhas[3]["di_turma"], "Outra T9999")  # sem entrada no mapa: não mexe


if __name__ == "__main__":
    unittest.main()
