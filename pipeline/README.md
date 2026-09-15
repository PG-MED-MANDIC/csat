# Pipeline de atualização de dados (Python)

Scripts para regenerar 4 das constantes de dados em `../index.html`:
`DATA_GERAL`, `DATA_ITENS`, `DATA_FEEDBACK` e `DATA_TURMAS` -- o dataset
"CSAT por item", a partir da pesquisa correspondente no Indecx (**mesma
conta já usada no pipeline do NPS-PACIENTE**, pesquisa diferente).

## Instalação

```
cd pipeline
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Copie `.env.example` para `.env` e preencha com os mesmos
`INDECX_EMAIL`/`INDECX_SENHA`/`INDECX_FRONTEND_ACCESS_KEY` já usados no
pipeline do NPS-PACIENTE. **Nunca** commite o `.env`.

## Uso

Um comando só (busca no Indecx + recalcula os 4 arrays + regrava `index.html`):

```
python atualizar_tudo.py
```

Ou duplo clique em `Atualizar Dashboard.bat`, na raiz do projeto. Nenhum dos
dois faz `git add`/`commit`/`push` -- isso continua manual de propósito,
pra sempre ter uma revisão antes de publicar no repositório público:

```
git status
git diff -- index.html
git add index.html
git commit -m "Atualiza dados do dashboard (CSAT por item)"
git push
```

A planilha baixada fica em `../../dados-fonte/export_indecx_csat_AA_MM_DD.xlsx`
-- pasta compartilhada com os outros pipelines deste workspace (ver
`CONTEXTO-GITHUB.md` na raiz), fora do controle de versão. **Atenção**: o
nome do arquivo é baseado na data de hoje e é sobrescrito sem aviso se
rodar de novo no mesmo dia -- por isso `atualizar_tudo.py` reaproveita a
planilha do dia se ela já existir, em vez de baixar de novo.

## O que este pipeline NÃO faz

**`index.html` na verdade tem 2 conjuntos de dados independentes, e este
pipeline só cobre um deles:**

- **"CSAT por item"** (`DATA_GERAL`, `DATA_ITENS`, `DATA_FEEDBACK`,
  `DATA_TURMAS`) -- é o que este pipeline atualiza. Antes disso existir,
  era atualizado manualmente pelo botão "📂 Atualizar base" da própria
  página (upload de Excel, `loadNewBase()` em index.html). **Não é mais um
  port fiel desse JS** -- `loadNewBase()` só lê 1 pergunta por item e não
  reconhece a exportação real do Indecx (colunas largas, uma por pergunta,
  não o formato "linha por item" que a função espera). A fórmula real de
  `transform_csat.py` foi obtida comparando com a versão de referência
  mantida na conta antiga (`TCM-18`, 2026-09-15) -- ver "Fórmula dos itens"
  abaixo. As duas formas de atualizar continuam existindo (pipeline ou
  botão da página), mas hoje só o pipeline calcula os itens corretamente.
- **"NPS Pós-Médica"** (`DATA_NPS`, com campos `curso`/`coordenador`) e o
  **feedback completo com nome do aluno** (`DATA_FEEDBACK_FULL`) -- este
  pipeline **nunca toca nesses dois**. Não existe, dentro de `index.html`,
  nenhuma lógica que regenere esses dados a partir de uma planilha bruta
  (o botão de upload da página também não mexe neles) -- a pesquisa Indecx
  de origem (`groupId`/`actionId` próprios) ainda não foi identificada.
  Continuam sendo atualizados do jeito que sempre foram, fora deste
  pipeline, até decidirmos o que fazer com eles.

`DI_TURMA_MAP` (tabela estática código-de-turma → rótulo) também não é
regravada -- é lida (`render_index.py::read_di_turma_map()`) pra montar o
campo `di_turma`, mas nunca alterada.

`IDX_GERAL` não precisa ser gravado: fica sempre `{}` no arquivo e é
recalculado no navegador a partir de `DATA_GERAL` ao carregar a página
(`index.html:742`) -- não é dado persistido.

## O que cada campo significa

- **`DATA_GERAL`**: uma linha por resposta (`db-id`), com a nota geral, a
  classificação NPS (nota ≥9 Promotor, ≥7 Neutro, senão Detrator), unidade
  calculada (`unidade_calc` -- "ONLINE" se a habilitação for Psiquiatria
  Clínica ou Endocrinologia Clínica, senão mapeada de `unidade`), mês/semana
  da resposta, `disciplina` (nome do módulo) e as notas dos 6 itens
  avaliados nessa mesma resposta (`nota_Aula_Online`, `nota_Aula_Prática`,
  `nota_Infraestrutura`, `nota_Plataforma_Avida`, `nota_Professor`,
  `nota_Triagem` -- ver "Fórmula dos itens" abaixo). Só entram respostas de
  unidade válida (Brasília/Campinas/Consolação/Online) -- "Outros" é
  descartado.
- **`DATA_ITENS`**: uma linha por avaliação de item (várias por `db-id`) --
  `tipo_avaliacao` + `nota`. Base para médias por item.
- **`DATA_FEEDBACK`**: um comentário por `db-id` (o primeiro não-vazio) --
  nota geral, unidade, disciplina, data e o texto do comentário.
- **`DATA_TURMAS`**: agregado por unidade+habilitação+turma+mês -- média,
  total de respostas e contagem de promotores/neutros/detratores.

## Fórmula dos itens (achado em 2026-09-15, confirmado em 4 respostas reais)

Cada um dos 6 itens de `DATA_GERAL` vem de 1 ou 2 perguntas "(reviews)" da
exportação (ver `transform_csat.py: ITEM_COLUNAS`), e quando são 2, o valor
final é a **média** das duas (`build_data_geral()` soma+conta por tipo):

| Item | Pergunta(s) de origem | Nº perguntas |
|---|---|---|
| `nota_Aula_Online` | "satisfação com as aulas online" **+** "aulas online aproximaram... prática clínica" | 2 (média) |
| `nota_Aula_Prática` | "satisfação com as aulas práticas" **+** "condução da aula prática pelo professor" (singular OU plural, mutuamente exclusivas por linha) | 2 (média) |
| `nota_Infraestrutura` | "qualidade da infraestrutura dos consultórios" | 1 |
| `nota_Plataforma_Avida` | "facilidade de uso da plataforma" | 1 |
| `nota_Professor` | "dinâmica da aula e didática dos professores da aula **online**" | 1 |
| `nota_Triagem` | "avalia a triagem dos pacientes" | 1 |

Duas coisas contraintuitivas aqui, então documentadas com destaque:

1. **`nota_Professor` não vem da pergunta sobre o professor da aula
   prática** -- essa pergunta ("condução da aula prática pelo professor")
   entra no cálculo de `nota_Aula_Prática`. `nota_Professor` vem da
   pergunta de didática da aula *online*. Contraintuitivo, mas confirmado
   batendo exatamente com a versão de referência em 4 respostas
   independentes (24 conferências de campo, todas corretas).
2. **A pergunta "condução da aula prática pelo professor" tem duas
   redações mutuamente exclusivas na planilha** (uma ação usa singular
   "...pelo professor (nome do professor)?", outra usa plural "...pelos
   professores?") -- nunca as duas preenchidas na mesma resposta. Sem
   tratar isso como fallback por linha, ~99% das respostas ficam sem essa
   nota (bug real que existia neste pipeline antes dessa correção: só 21
   de 2210 respostas tinham a redação singular).

## O que o pipeline garante

- **Lista de permissão de colunas**: só as colunas em
  `transform_csat.py: RAW_COLUMNS_OBRIGATORIAS` + as usadas por
  `ITEM_COLUNAS`/`COL_AGRADOU_ALIASES`/`COL_MELHORAR_ALIASES` são lidas da
  planilha -- nome/email/telefone de aluno (presentes na exportação real)
  nunca entram em nenhuma das 4 constantes.
- **Regravação cirúrgica** (`render_index.py`): `upsert_all()` substitui só
  as 4 linhas `const DATA_GERAL`/`DATA_ITENS`/`DATA_FEEDBACK`/`DATA_TURMAS`
  -- o resto do arquivo (`DATA_NPS`, `DATA_FEEDBACK_FULL`, `DI_TURMA_MAP`,
  HTML, CSS, lógica de gráficos/filtros) não é tocado.
- **Sem automação não supervisionada**: assim como nos outros pipelines
  deste workspace, nada aqui roda sozinho (sem agendador/cron) -- cada
  execução no Indecx traz comentário livre de aluno, então cada execução é
  uma decisão de quem está rodando. O arquivo em `dados-fonte/` nunca é
  versionado nem hospedado.
