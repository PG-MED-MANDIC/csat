csat

Dashboard CSAT Pós Med — SLMandic. Estático, sem build: `index.html`
(marcação) + `style.css` (estilos) + `app.js` (lógica, ~150 funções/16 abas)
+ `data.js` (dados embutidos). O dado do dataset "CSAT por item" vem da API
do Indecx (mesma conta usada no pipeline do NPS-PACIENTE); ver
`pipeline/README.md` para como atualizar (`python pipeline/atualizar_tudo.py`
ou duplo clique em `Atualizar Dashboard.bat`). Commit/push continuam manuais
de propósito.

O dataset "NPS Pós-Médica" (aba NPS, com nome do aluno no feedback
completo) **não** é coberto por este pipeline -- ver
`pipeline/README.md` > "O que este pipeline NÃO faz".
