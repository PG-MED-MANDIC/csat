csat

Dashboard CSAT Pós Med — SLMandic (`index.html`, estático, sem build). O
dado do dataset "CSAT por item" vem da API do Indecx (mesma conta usada no
pipeline do NPS-PACIENTE); ver `pipeline/README.md` para como atualizar
(`python pipeline/atualizar_tudo.py` ou duplo clique em `Atualizar
Dashboard.bat`). Commit/push continuam manuais de propósito.

O dataset "NPS Pós-Médica" (aba NPS, com nome do aluno no feedback
completo) **não** é coberto por este pipeline -- ver
`pipeline/README.md` > "O que este pipeline NÃO faz".
