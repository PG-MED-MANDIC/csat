// ============ ABA "FATO · CAUSA" (relatório mensal por unidade) ============
// Arquivo isolado: não altera nenhuma outra aba. Reaproveita analyzeComment()/TEMA_DICT
// (mesmo motor lexical da aba Análise de Comentários) e só lê DATA_FEEDBACK.
//  1 Fato  = temas mais citados nos comentários (gráficos)
//  2 Causa = palavras/expressões que mais se repetem nos comentários do tema escolhido
//  3 Ação e 4 Resultado = textos digitados na hora, NÃO são salvos -- só vão pro PDF.

const FCAR = { unidade: '', curso: '', mes: '', sem: '', base: 'neg', tema: '' };
const FCAR_SEM_LBL = { 1: 'Sem 1 (dias 1-7)', 2: 'Sem 2 (8-14)', 3: 'Sem 3 (15-21)', 4: 'Sem 4 (22-28)', 5: 'Sem 5 (29+)' };
// semana do mês a partir de ts (AAAAMMDDhhmmss): dias 1-7 = Sem 1, 8-14 = Sem 2, ... 29+ = Sem 5; 0 se não houver data
function fcarSemDe(r) { const d = r.ts ? Math.floor(r.ts / 1e6) % 100 : 0; return d ? Math.min(Math.ceil(d / 7), 5) : 0; }
const FCAR_COR = ['#01559B', '#F5C518', '#16a34a', '#dc2626', '#7C3AED'];
const FCAR_STOP = new Set(('a o as os um uma uns umas de da do das dos em na no nas nos por para pra com sem sob sobre ate ' +
  'e ou mas que se como quando onde porque pois nao nem ja so tambem ainda muito muita muitos muitas pouco pouca mais menos ' +
  'bem mal melhor pior tudo todo toda todos todas isso isto esse essa esses essas este esta estes estas aquele aquela ' +
  'ele ela eles elas eu voce nos meu minha meus minhas seu sua seus suas foi ser sao era eram esta estao estava ter tem ' +
  'tinha tive teve ha havia ficou fica ficar fazer faz fez feito pode poder podem deve ao aos pelo pela pelos pelas ' +
  'la aqui lhe lhes me te vez vezes so apenas porem entao assim muito alem durante antes depois ainda sempre nunca ' +
  'ate cada outro outra outros outras mesmo mesma coisa coisas ponto parte tipo forma tanto tantos algum alguma alguns ' +
  'algumas nenhum nenhuma ficaram foram sendo sido vai vao ir indo dia dias hoje ontem curso').split(/\s+/));

function fcarBaseRows(mes, comSem) {
  if (mes === undefined) mes = FCAR.mes;
  return DATA_FEEDBACK.filter(r => {
    if (!r.feedback || r.feedback.trim().length <= 8) return false;
    if (FCAR.unidade && r.unidade !== FCAR.unidade) return false;
    if (FCAR.curso && r.hab !== FCAR.curso) return false;
    if (mes && r.mes_label !== mes) return false;
    if (comSem && FCAR.sem && String(fcarSemDe(r)) !== String(FCAR.sem)) return false;
    return true;
  }).map(r => Object.assign({}, r, analyzeComment(r)));
}

function fcarSentOk(r) {
  if (FCAR.base === 'neg') return r.sentiment === 'neg';
  return r.sentiment === 'pos';
}

function fcarPopulateFilters() {
  const fill = (id, vals) => {
    const sel = document.getElementById(id);
    if (!sel || sel.options.length > 1) return;
    vals.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
  };
  fill('fcar-f-unidade', [...new Set(DATA_FEEDBACK.map(r => r.unidade).filter(Boolean))].sort());
  fill('fcar-f-curso', [...new Set(DATA_FEEDBACK.map(r => r.hab).filter(Boolean))].sort());
  const presentes = new Set(DATA_FEEDBACK.map(r => r.mes_order).filter(Boolean));
  const mesesLbl = ANALISE_MES_SEQ.filter(m => presentes.has(m)).map(m => ANALISE_MES_LABEL_MAP[m]);
  FCAR._meses = mesesLbl;
  const selMes = document.getElementById('fcar-f-mes');
  if (selMes && !selMes.options.length) mesesLbl.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; selMes.appendChild(o); });
  if (!FCAR.mes || mesesLbl.indexOf(FCAR.mes) < 0) FCAR.mes = mesesLbl[mesesLbl.length - 1] || '';
  if (selMes) selMes.value = FCAR.mes;
}

// clique no tema: seleciona; clicar de novo no tema já selecionado abre/fecha a comparação com o mês anterior
function fcarClickTema(t) {
  if (t === FCAR.tema) FCAR.exp = !FCAR.exp;
  else { FCAR.tema = t; FCAR.exp = false; }
  renderFcarTab();
}

// normal padrão: P(Z <= z) (aproximação de Abramowitz-Stegun)
function fcarNormCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
const fcarPct1 = v => (Math.round(v * 10) / 10).toString().replace('.', ',');

// compara a PROPORÇÃO do tema (comentários do tema ÷ comentários do mês) entre este mês e o anterior,
// com teste de duas proporções (z) para dizer se a diferença é real ou pode ser só acaso
function fcarComparacao(n1, N1, n0, N0, mesAnt, nome) {
  const p1 = N1 ? n1 / N1 : 0, p0 = N0 ? n0 / N0 : 0, dif = (p1 - p0) * 100;
  const pool = (N1 + N0) ? (n1 + n0) / (N1 + N0) : 0;
  const se = Math.sqrt(pool * (1 - pool) * (1 / N1 + 1 / N0));
  const z = se ? (p1 - p0) / se : 0;
  const pv = 2 * (1 - fcarNormCdf(Math.abs(z)));
  const seD = Math.sqrt(p1 * (1 - p1) / N1 + p0 * (1 - p0) / N0) * 100;
  const pos = FCAR.base === 'pos';
  const real = Math.abs(z) >= 1.96;
  const bom = pos ? dif > 0 : dif < 0;
  const cl = !real ? 'eq' : bom ? 'dn' : 'up';
  const seta = dif > 0 ? '▲' : dif < 0 ? '▼' : '•';
  const veredito = !real
    ? 'Sem mudança relevante: a diferença é pequena para o volume de comentários e pode ser só acaso.'
    : (bom ? (pos ? 'Melhorou: mais elogios a este tema que no mês anterior.' : 'Melhorou: menos reclamações sobre este tema que no mês anterior.')
           : (pos ? 'Piorou: menos elogios a este tema que no mês anterior.' : 'Piorou: mais reclamações sobre este tema que no mês anterior.'));
  const esperado = Math.round(p0 * N1);
  const aviso = (N1 < 10 || N0 < 10) ? '<div class="fcar-exp-aviso">Poucos comentários (menos de 10 em um dos meses): qualquer variação pode ser acaso. Interprete com cautela.</div>' : '';
  const tp = (FCAR.base === 'pos' ? 'positivo' : 'negativo');
  const fr = (n, N) => `<b>${n} ${N === 1 ? 'de' : 'dos'} ${N}</b> comentário${N === 1 ? '' : 's'} ${tp}${N === 1 ? '' : 's'}`;
  const mesAtual = (FCAR.mes || 'todos os meses') + (FCAR.sem ? ' (' + FCAR_SEM_LBL[FCAR.sem] + ')' : '');
  return `<div class="fcar-exp">` +
    `<div class="fcar-exp-f"><b>${nome}</b> aparece em ${fr(n1, N1)} de <b>${mesAtual}</b>.<br>No mês anterior (<b>${mesAnt}</b>), apareceu em ${fr(n0, N0)}.</div>` +
    `<div class="fcar-exp-t">Comparação com o mês anterior, em % (assim fica justa mesmo com quantidades diferentes de comentários)</div>` +
    `<div class="fcar-exp-g">` +
      `<div><small>Este mês</small><b>${n1} de ${N1}</b><span>${fcarPct1(p1 * 100)}% dos comentários</span></div>` +
      `<div><small>Mês anterior (${mesAnt})</small><b>${n0} de ${N0}</b><span>${fcarPct1(p0 * 100)}% dos comentários</span></div>` +
      `<div><small>Variação</small><b class="fcar-var ${cl}" style="display:block;font-size:15px">${seta} ${dif > 0 ? '+' : ''}${fcarPct1(dif)} pp</b><span>pp = pontos percentuais</span></div>` +
    `</div>` +
    `<div class="fcar-exp-v ${cl}">${veredito}</div>` +
    `<div class="fcar-exp-n">Em escala igual: se o mês anterior tivesse os mesmos ${N1} comentários de hoje, esperaríamos ≈ <b>${esperado}</b> sobre este tema (hoje: <b>${n1}</b>).<br>` +
    `Chance de essa diferença ser só acaso: <b>${pv < 0.001 ? 'menos de 0,1' : fcarPct1(pv * 100)}%</b> · variação provável entre <b>${dif - 1.96 * seD > 0 ? '+' : ''}${fcarPct1(dif - 1.96 * seD)}</b> e <b>${dif + 1.96 * seD > 0 ? '+' : ''}${fcarPct1(dif + 1.96 * seD)}</b> pp (95% de confiança).</div>` +
    aviso + `</div>`;
}

function fcarClickSem(w) {
  FCAR.sem = String(FCAR.sem) === String(w) ? '' : String(w);  // clicar de novo na semana marcada volta para todas
  FCAR.exp = false;
  renderFcarTab();
}

function fcarSet(chave, valor) {
  FCAR[chave] = valor;
  FCAR.exp = false;
  if (chave !== 'tema' && chave !== 'base') FCAR.tema = '';
  if (chave === 'base') FCAR.tema = '';
  if (chave === 'mes') FCAR.sem = '';
  renderFcarTab();
}

function fcarLimpar() {
  Object.assign(FCAR, { unidade: '', curso: '', mes: '', sem: '', base: 'neg', tema: '' });
  ['unidade', 'curso', 'base'].forEach(k => { const s = document.getElementById('fcar-f-' + k); if (s) s.value = FCAR[k]; });
  renderFcarTab();
}

function fcarTokens(texto) {
  return normWord(texto).split(/[^a-z0-9]+/).filter(w => w.length > 3 && !/^\d+$/.test(w) && !FCAR_STOP.has(w));
}

function renderFcarTab() {
  if (!document.getElementById('fcar-fato-box')) return;
  fcarPopulateFilters();
  // semanas que existem no mês escolhido (o filtro de semana só mostra essas)
  const doMes = fcarBaseRows(FCAR.mes, false);
  const semMes = [1, 2, 3, 4, 5].filter(w => doMes.some(r => fcarSemDe(r) === w));
  if (FCAR.sem && semMes.indexOf(Number(FCAR.sem)) < 0) FCAR.sem = '';
  const selSem = document.getElementById('fcar-f-sem');
  if (selSem) {
    selSem.innerHTML = '<option value="">Todas as semanas</option>' + semMes.map(w => `<option value="${w}">${FCAR_SEM_LBL[w]}</option>`).join('');
    selSem.value = FCAR.sem;
  }
  const semTxt = FCAR.sem ? ` · ${FCAR_SEM_LBL[FCAR.sem]}` : '';
  const baseTodos = fcarBaseRows(FCAR.mes, true);
  const rows = baseTodos.filter(fcarSentOk);

  // ---- 1 FATO: temas mais citados ----
  const cont = {};
  rows.forEach(r => r.temas.forEach(t => { cont[t] = (cont[t] || 0) + 1; }));
  const ranking = Object.keys(cont).map(t => ({ tema: t, n: cont[t] })).sort((a, b) => b.n - a.n);
  if (!FCAR.tema || !cont[FCAR.tema]) FCAR.tema = ranking.length ? ranking[0].tema : '';

  const info = document.getElementById('fcar-info');
  const baseTxt = { neg: 'negativos', pos: 'positivos' }[FCAR.base];
  info.textContent = `Mês: ${FCAR.mes || '-'}${semTxt} · ${rows.length} comentário(s) ${baseTxt} de ${baseTodos.length} com texto ${FCAR.sem ? 'nesta semana' : 'neste mês'}.` +
    (ranking.length ? '' : ' Sem comentários para este filtro.');

  // ---- visual do Fato: ranking em barras de % + tabela tema x mês ----
  const nomeT = t => TEMA_LABEL_MAP[t] || t;
  const tot = rows.length || 1;
  const boxF = document.getElementById('fcar-fato-box');
  const lista = FCAR.todos ? ranking : ranking.slice(0, 8);
  // mês anterior (mesmos filtros) só para mostrar a variação da % de cada tema
  const iMes = (FCAR._meses || []).indexOf(FCAR.mes), mesAnt = iMes > 0 ? FCAR._meses[iMes - 1] : '';
  const prevRows = (mesAnt && !FCAR.sem) ? fcarBaseRows(mesAnt, false).filter(fcarSentOk) : [];  // com semana escolhida não compara com o mês anterior inteiro
  const prevTot = prevRows.length, prevCont = {};
  prevRows.forEach(r => r.temas.forEach(t => { prevCont[t] = (prevCont[t] || 0) + 1; }));
  FCAR._rank = ranking.slice(0, 8).map(x => ({ nome: nomeT(x.tema), n: x.n, tot: rows.length, pct: x.n / tot * 100 }));
  if (!ranking.length) {
    boxF.innerHTML = '<div class="fcar-vazio">Sem comentários para este filtro.</div>';
  } else {
    const t1 = ranking[0];
    let h = `<div class="fcar-resumo">${FCAR.base === 'pos' ? 'O tema mais elogiado é' : 'O principal problema é'} <b>${nomeT(t1.tema)}</b>: aparece em <b>${t1.n} ${rows.length === 1 ? 'de' : 'dos'} ${rows.length}</b> comentário${rows.length === 1 ? '' : 's'} ${FCAR.base === 'pos' ? 'positivo' : 'negativo'}${rows.length === 1 ? '' : 's'} de <b>${FCAR.mes || 'todos os meses'}${FCAR.sem ? ' (' + FCAR_SEM_LBL[FCAR.sem] + ')' : ''}</b>.</div>`;
    // comparação completa com o mês anterior (inteiro), independente do filtro de semana
    const prevAll = mesAnt ? fcarBaseRows(mesAnt, false).filter(fcarSentOk) : [];
    const prevAllCont = {};
    prevAll.forEach(r => r.temas.forEach(t => { prevAllCont[t] = (prevAllCont[t] || 0) + 1; }));
    const painelExp = x => !mesAnt ? '<div class="fcar-exp"><div class="fcar-exp-aviso">Não há mês anterior com comentários para comparar.</div></div>'
      : !prevAll.length ? `<div class="fcar-exp"><div class="fcar-exp-aviso">O mês anterior (${mesAnt}) não tem comentários ${FCAR.base === 'pos' ? 'positivos' : 'negativos'} neste filtro.</div></div>`
      : fcarComparacao(x.n, rows.length, prevAllCont[x.tema] || 0, prevAll.length, mesAnt, nomeT(x.tema));
    h += lista.map((x, i) => {
      const p = Math.round(x.n / tot * 100);
      let dl = '';
      if (prevTot) {
        const d = Math.round(x.n / tot * 100 - (prevCont[x.tema] || 0) / prevTot * 100);
        const bom = FCAR.base === 'pos';  // positivos: subir é bom (verde); negativos: subir é ruim (vermelho)
        const cl = d === 0 ? 'eq' : (d > 0) === bom ? 'dn' : 'up';
        dl = `<small class="fcar-var ${cl}">${d > 0 ? '▲' : d < 0 ? '▼' : '•'} mês anterior: ${prevCont[x.tema] || 0} de ${prevTot}</small>`;
      }
      return `<div class="fcar-rk${x.tema === FCAR.tema ? ' sel' : ''}" data-t="${x.tema}" onclick="fcarClickTema(this.dataset.t)" title="${x.tema === FCAR.tema ? (FCAR.exp ? 'Clique para recolher a comparação' : 'Clique de novo para ver a comparação com o mês anterior') : 'Clique para ver a causa deste tema'}">` +
        `<span class="fcar-pos">${i + 1}</span><span class="fcar-nome">${nomeT(x.tema)}</span>` +
        `<div class="fcar-trk"><div class="fcar-fill" style="width:${Math.max(p, 2)}%"></div></div>` +
        `<span class="fcar-val"><b>${x.n} de ${tot}</b> comentário${tot === 1 ? '' : 's'}${dl}</span></div>` +
        (x.tema === FCAR.tema && !FCAR.exp ? `<div class="fcar-dica">▾ clique de novo neste tema para ver se melhorou em relação ao mês anterior</div>` : '') +
        (x.tema === FCAR.tema && FCAR.exp ? painelExp(x) : '');
    }).join('');
    if (ranking.length > 8) h += `<button class="fcar-mais" onclick="FCAR.todos=!FCAR.todos;renderFcarTab()">${FCAR.todos ? 'Mostrar só os 8 principais' : `Mostrar todos os ${ranking.length} temas`}</button>`;
    boxF.innerHTML = h;
  }

  // evolução semana a semana DENTRO do mês escolhido (só dados desse mês)
  const rowsEv = doMes.filter(fcarSentOk);
  const semDe = fcarSemDe, SEM_LBL = FCAR_SEM_LBL;
  const semPres = [1, 2, 3, 4, 5].filter(w => rowsEv.some(r => semDe(r) === w));
  const top5 = ranking.slice(0, 5).map(x => x.tema);
  destroyChart('fcar-evol-chart');
  const ctx2 = document.getElementById('fcar-evol-chart');
  const vazioE = document.getElementById('fcar-evol-vazio');
  const chipEl = document.getElementById('fcar-sem-chip');
  const filtAt = [FCAR.unidade ? 'Unidade: ' + FCAR.unidade : '', FCAR.curso ? 'Curso: ' + FCAR.curso : ''].filter(Boolean);
  const avisoFiltro = filtAt.length
    ? `<div class="fcar-filtro">⚠ Gráfico filtrado: mostra <b>somente</b> ${filtAt.map(f => `<b>${f}</b>`).join(' · ')}. Para ver tudo, escolha "Todas/Todos" nos filtros acima.</div>`
    : `<div class="fcar-filtro-ok">Mostrando todas as unidades e todos os cursos.</div>`;
  if (chipEl) chipEl.innerHTML = avisoFiltro + (semPres.length
    ? `<div class="fcar-sems"><span class="fcar-sems-t">Filtrar por semana:</span>` +
      semPres.map(w => `<button class="fcar-sem${String(FCAR.sem) === String(w) ? ' on' : ''}" onclick="fcarClickSem('${w}')">${SEM_LBL[w]}</button>`).join('') +
      (FCAR.sem ? `<button class="fcar-x" onclick="fcarSet('sem','')">✕ ver todas</button>` : '') + `</div>` +
      `<div style="font-size:11px;color:var(--muted);margin-top:4px">${FCAR.sem ? 'O ranking e os comentários mostram só a semana marcada. Clique nela de novo para voltar.' : 'Clique numa semana para filtrar o ranking e os comentários só por ela.'}</div>`
    : '');
  const posB = FCAR.base === 'pos', tipoC = posB ? 'positivos' : 'negativos';
  const legEl = document.getElementById('fcar-evol-leg');
  if (legEl) {
    legEl.innerHTML = (semPres.length ? `<div class="fcar-como"><b>Como ler:</b> cada linha é um tema. ` +
      `<span class="fcar-var ${posB ? 'dn' : 'up'}" style="display:inline">Linha subindo</span> = mais comentários ${tipoC} citaram o tema naquela semana. ` +
      `<span class="fcar-var ${posB ? 'up' : 'dn'}" style="display:inline">Linha descendo</span> = menos comentários ${tipoC} citaram o tema.</div>` : '');
  }
  const temEv = top5.length && semPres.length;
  vazioE.style.display = temEv ? 'none' : 'block';
  ctx2.parentNode.style.display = temEv ? '' : 'none';
  if (temEv) {
    CHARTS['fcar-evol-chart'] = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: semPres.map(w => SEM_LBL[w]),
        datasets: top5.map((t, i) => ({
          label: nomeT(t),
          data: semPres.map(w => rowsEv.filter(r => semDe(r) === w && r.temas.includes(t)).length),
          borderColor: FCAR_COR[i], backgroundColor: FCAR_COR[i], borderWidth: 2.5, pointRadius: ctx => String(semPres[ctx.dataIndex]) === String(FCAR.sem) ? 8 : 4, pointHoverRadius: 7, tension: .3
        }))
      },
      plugins: [{
        id: 'fcarSemSel',
        beforeDatasetsDraw(ch) {
          const i = semPres.findIndex(w => String(w) === String(FCAR.sem));
          if (i < 0) return;
          const xs = ch.scales.x, a = ch.chartArea, x = xs.getPixelForValue(i);
          const w = semPres.length > 1 ? (xs.getPixelForValue(1) - xs.getPixelForValue(0)) : (a.right - a.left);
          ch.ctx.save(); ch.ctx.fillStyle = 'rgba(1,85,155,0.10)';
          ch.ctx.fillRect(Math.max(a.left, x - w / 2), a.top, Math.min(w, a.right - Math.max(a.left, x - w / 2)), a.bottom - a.top);
          ch.ctx.restore();
        }
      }],
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y} comentário(s) ${tipoC}` } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f0f0f0' }, title: { display: true, text: 'Nº de comentários ' + tipoC, font: { size: 11 } } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // ---- 2 CAUSA: palavras e expressões do tema escolhido ----
  const sel = document.getElementById('fcar-tema-sel');
  sel.innerHTML = ranking.map(x => `<option value="${x.tema}"${x.tema === FCAR.tema ? ' selected' : ''}>${TEMA_LABEL_MAP[x.tema] || x.tema} (${x.n})</option>`).join('');

  // comentários que sustentam o tema escolhido: os que mais usam palavras do tema vêm primeiro
  const doTema = rows.filter(r => r.temas.includes(FCAR.tema)).sort((x, y) =>
    ((y.temaHits[FCAR.tema] || 0) - (x.temaHits[FCAR.tema] || 0)) || ((x.nota || 0) - (y.nota || 0)) || ((y.ts || 0) - (x.ts || 0)));
  if (FCAR._temaMostrado !== FCAR.tema + '|' + FCAR.base + '|' + FCAR.unidade + '|' + FCAR.curso + '|' + FCAR.mes) {
    FCAR._temaMostrado = FCAR.tema + '|' + FCAR.base + '|' + FCAR.unidade + '|' + FCAR.curso + '|' + FCAR.mes;
    FCAR.qtd = 5;
  }
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const destaca = txt => String(txt).split(/([\p{L}\p{N}]+)/u).map(p =>
    (/^[\p{L}\p{N}]+$/u.test(p) && TEMA_LOOKUP[normWord(p)] === FCAR.tema) ? `<mark>${esc(p)}</mark>` : esc(p)).join('');
  const mostrados = doTema.slice(0, FCAR.qtd);
  FCAR._coment = mostrados.map(r => ({ nota: r.nota, unidade: r.unidade, mes: r.mes_label, texto: r.feedback.trim() }));
  const boxC = document.getElementById('fcar-coment-box');
  if (!doTema.length) {
    boxC.innerHTML = '<div class="fcar-vazio">Nenhum comentário para este tema neste recorte.</div>';
  } else {
    let h = `<div class="fcar-resumo">Mostrando <b>${mostrados.length}</b> de <b>${doTema.length}</b> comentários que falam de <b>${TEMA_LABEL_MAP[FCAR.tema] || FCAR.tema}</b>. ` +
      'As palavras destacadas são as que ligaram o comentário a este tema. Leia-os para entender a causa.</div>';
    h += mostrados.map(r => {
      const n = r.nota, cor = n <= 6 ? '#dc2626' : n <= 8 ? '#d97706' : '#16a34a';
      return `<div class="fcar-com"><div class="fcar-com-h"><span class="fcar-nota" style="background:${cor}">Nota ${n}</span>` +
        `<span>${esc(r.unidade || '')}${r.hab ? ' · ' + esc(r.hab) : ''}${r.mes_label ? ' · ' + esc(r.mes_label) : ''}</span></div>` +
        `<div class="fcar-com-t${r.feedback.trim().length > 200 ? ' rec' : ''}">${destaca(r.feedback.trim())}</div>` +
        (r.feedback.trim().length > 200 ? `<button class="fcar-vm" onclick="fcarVerMais(this)">Ver mais ▾</button>` : '') + `</div>`;
    }).join('');
    if (doTema.length > FCAR.qtd) h += `<button class="fcar-mais" onclick="FCAR.qtd+=5;renderFcarTab()">Mostrar mais 5 (restam ${doTema.length - FCAR.qtd})</button>`;
    if (FCAR.qtd > 5) h += ` <button class="fcar-mais" onclick="FCAR.qtd=5;renderFcarTab()">Mostrar só 5</button>`;
    boxC.innerHTML = h;
  }
}

function fcarVerMais(btn) {
  const t = btn.previousElementSibling, aberto = t.classList.toggle('rec') === false;
  btn.textContent = aberto ? 'Ver menos ▴' : 'Ver mais ▾';
}

// ---- PDF ----
async function fcarGerarPdf() {
  const btn = document.getElementById('fcar-pdf-btn');
  const original = btn.textContent;
  btn.textContent = 'Gerando...'; btn.disabled = true;
  try {
    if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 14, CW = W - 2 * M;
    let y = 0;
    const nova = h => { if (y + h > 285) { doc.addPage(); y = M; } };

    doc.setFillColor(26, 36, 89); doc.rect(0, 0, W, 24, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('Relatório Mensal - Fato, Causa, Ação e Resultado', M, 11);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('CSAT Pós Med - São Leopoldo Mandic', M, 18);
    y = 32; doc.setTextColor(40, 40, 40);

    const filtros = `Unidade: ${FCAR.unidade || 'Todas'}  |  Curso: ${FCAR.curso || 'Todos'}  |  Mês: ${FCAR.mes || 'Todos'}${FCAR.sem ? ' - ' + FCAR_SEM_LBL[FCAR.sem] : ''}  |  Base: ` +
      ({ neg: 'comentários negativos', pos: 'comentários positivos' }[FCAR.base]);
    doc.setFontSize(9); doc.text(doc.splitTextToSize(filtros, CW), M, y); y += 8;
    doc.setFontSize(8); doc.setTextColor(110, 110, 110);
    doc.text(document.getElementById('fcar-info').textContent, M, y); y += 8;

    const secao = t => { nova(14); doc.setTextColor(1, 85, 155); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      doc.text(t, M, y); y += 6; doc.setTextColor(40, 40, 40); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); };
    const imagem = (id, wMm) => {
      const c = document.getElementById(id); if (!c || !CHARTS[id]) return;
      const h = wMm * c.height / c.width; nova(h + 3);
      const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height;
      const t = tmp.getContext('2d'); t.fillStyle = '#fff'; t.fillRect(0, 0, tmp.width, tmp.height); t.drawImage(c, 0, 0);
      doc.addImage(tmp.toDataURL('image/png'), 'PNG', M, y, wMm, h); y += h + 4;
    };
    const texto = (t, vazio) => {
      const linhas = doc.splitTextToSize((t || '').trim() || vazio, CW);
      linhas.forEach(l => { nova(5); doc.text(l, M, y); y += 5; }); y += 4;
    };

    secao(FCAR.base === 'pos' ? '1. Fato - temas mais elogiados' : '1. Fato - principais problemas identificados');
    doc.setFontSize(9);
    (FCAR._rank || []).forEach(x => {
      nova(7); doc.setTextColor(40, 40, 40);
      doc.text(doc.splitTextToSize(x.nome, 52)[0], M, y + 3.5);
      doc.setFillColor(226, 232, 240); doc.rect(M + 56, y, 90, 4, 'F');
      doc.setFillColor(1, 85, 155); doc.rect(M + 56, y, Math.max(0.8, 90 * Math.min(x.pct, 100) / 100), 4, 'F');
      doc.text(`${x.n} de ${x.tot}`, M + 150, y + 3.5); y += 7;
    });
    imagem('fcar-evol-chart', CW);
    doc.setFontSize(10);
    secao('2. Causa - comentários que sustentam o tema' + (FCAR.tema ? ` (tema: ${TEMA_LABEL_MAP[FCAR.tema] || FCAR.tema})` : ''));
    doc.setFontSize(9);
    (FCAR._coment || []).forEach((c, i) => {
      const cab = `${i + 1}. Nota ${c.nota} - ${c.unidade || ''}${c.mes ? ' - ' + c.mes : ''}`;
      const t = c.texto.length > 600 ? c.texto.slice(0, 600) + '...' : c.texto;
      const linhas = doc.splitTextToSize(t, CW - 4);
      nova(6 + 4.5 * Math.min(linhas.length, 3));
      doc.setFont('helvetica', 'bold'); doc.text(cab, M, y); y += 4.5; doc.setFont('helvetica', 'normal');
      linhas.forEach(l => { nova(5); doc.text(l, M + 3, y); y += 4.3; }); y += 3;
    });
    doc.setFontSize(10);
    secao('3. Ação - o que a unidade fez / está fazendo');
    texto(document.getElementById('fcar-acao').value, '(não preenchido)');
    secao('4. Resultado - o que mudou depois da ação');
    texto(document.getElementById('fcar-resultado').value, '(não preenchido)');

    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(130, 130, 130);
      doc.text(`Página ${i} de ${n}`, W - M, 292, { align: 'right' }); }
    const nome = ['relatorio_fcar', (FCAR.unidade || 'todas').toLowerCase().replace(/\s+/g, '_'), (FCAR.mes || 'todos').replace('/', '-')].join('_');
    doc.save(nome + '.pdf');
    btn.textContent = 'PDF baixado';
  } catch (e) {
    console.error('[fcarGerarPdf] falhou:', e);
    btn.textContent = 'Erro - tente de novo';
  }
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2500);
}

(function () {
  const st = document.createElement('style');
  st.textContent = `
    .fcar-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
    @media(max-width:900px){.fcar-grid{grid-template-columns:1fr}}
    .fcar-chip{display:inline-block;background:#eef4fb;border:1px solid #cfe0f2;color:#1A2459;border-radius:14px;padding:3px 10px;margin:0 6px 6px 0;font-size:12px}
    .fcar-chip b{color:#01559B;margin-left:4px}
    .fcar-txt{width:100%;min-height:110px;border:1px solid var(--border);border-radius:6px;padding:10px;font:13px/1.5 inherit;resize:vertical;box-sizing:border-box}
    .fcar-stack>div+div{margin-top:24px;padding-top:18px;border-top:1px solid var(--border)}
    @media(max-width:600px){.fcar-stack .cwrap{height:340px!important}}
    .fcar-dica{font-size:11px;color:#01559B;margin:-2px 0 6px 44px}
    .fcar-exp{background:#f5f8ff;border:1px solid #cfdcf3;border-radius:8px;padding:12px 14px;margin:2px 0 10px 8px}
    .fcar-exp-f{font-size:13px;line-height:1.6;color:#1a1a2e;background:#fff;border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:10px}
    .fcar-exp-t{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px}
    .fcar-exp-g{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
    .fcar-exp-g>div{background:#fff;border:1px solid var(--border);border-radius:8px;padding:8px 10px}
    .fcar-exp-g small{display:block;font-size:10.5px;color:var(--muted)}
    .fcar-exp-g b{display:block;font-size:15px;color:#1A2459;margin:2px 0}
    .fcar-exp-g span{font-size:11px;color:#555}
    .fcar-exp-v{font-size:13px;font-weight:700;margin-bottom:6px}
    .fcar-exp-v.up{color:#dc2626}.fcar-exp-v.dn{color:#16a34a}.fcar-exp-v.eq{color:#6b7280}
    .fcar-exp-n{font-size:12px;line-height:1.6;color:#444}
    .fcar-exp-aviso{font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 8px;margin-top:8px}
    @media(max-width:600px){.fcar-exp-g{grid-template-columns:1fr}.fcar-dica{margin-left:0}.fcar-exp{margin-left:0}}
    .fcar-sems{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
    .fcar-sems-t{font-size:12px;font-weight:700;color:#1A2459}
    .fcar-sem{border:1.5px solid #01559B;background:#fff;color:#01559B;border-radius:20px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
    .fcar-sem:hover{background:#eef4fb}
    .fcar-sem.on{background:#1A2459;border-color:#1A2459;color:#fff}
    .fcar-filtro{font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin-bottom:8px}
    .fcar-filtro-ok{font-size:11px;color:var(--muted);margin-bottom:8px}
    .fcar-x{border:0;background:none;color:#01559B;font-size:11px;font-weight:700;cursor:pointer;margin-left:6px}
    .fcar-resumo{background:#fff7e0;border-left:4px solid #F5C518;border-radius:6px;padding:10px 12px;font-size:13px;line-height:1.5;margin-bottom:12px}
    .fcar-rk{display:grid;grid-template-columns:26px minmax(90px,170px) 1fr 150px;align-items:center;gap:10px;padding:7px 8px;border-radius:8px;cursor:pointer;border:1px solid transparent}
    .fcar-rk:hover{background:#f5f7fc}
    .fcar-rk.sel{background:#eef2fb;border-color:#9db4e0}
    .fcar-pos{width:24px;height:24px;border-radius:50%;background:#e5e7eb;color:#1A2459;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center}
    .fcar-rk.sel .fcar-pos{background:#1A2459;color:#fff}
    .fcar-nome{font-size:13px;font-weight:600;color:#1A2459;overflow-wrap:anywhere}
    .fcar-trk{background:#e5e7eb;border-radius:6px;height:14px;overflow:hidden}
    .fcar-fill{height:100%;background:#01559B;border-radius:6px}
    .fcar-rk.sel .fcar-fill{background:#1A2459}
    .fcar-val{font-size:12px;color:#444;text-align:right;white-space:nowrap}
    .fcar-var{display:block;font-size:10.5px;font-weight:600;margin-top:1px}
    .fcar-var.up{color:#dc2626}.fcar-var.dn{color:#16a34a}.fcar-var.eq{color:#6b7280}
    .fcar-mais{margin-top:8px;border:1px solid var(--border);background:#fff;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;color:#01559B}
    .fcar-vazio{color:var(--muted);font-size:12px;padding:12px 0}
    @media(max-width:600px){.fcar-rk{grid-template-columns:26px 1fr 132px}.fcar-trk{grid-column:1/-1;order:5}}
    .fcar-com{border:1px solid var(--border);border-left:4px solid #01559B;border-radius:8px;padding:10px 12px;margin-bottom:8px;background:#fff}
    .fcar-com-h{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted);margin-bottom:6px;flex-wrap:wrap}
    .fcar-nota{color:#fff;border-radius:10px;padding:2px 9px;font-weight:700;font-size:11px}
    .fcar-com-t{font-size:13px;line-height:1.55;color:#1a1a2e;overflow-wrap:anywhere}
    .fcar-com-t.rec{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    .fcar-vm{margin-top:4px;border:0;background:none;color:#01559B;font-size:12px;font-weight:600;cursor:pointer;padding:2px 0}
    .fcar-com{padding:8px 12px}
    .fcar-como{font-size:12px;line-height:1.6;color:#444;background:#f5f7fc;border-radius:6px;padding:8px 10px;margin-top:10px}
    .fcar-com-t mark{background:#fde68a;color:#1a1a2e;border-radius:3px;padding:0 2px}
    .fcar-pdf{background:#1A2459;color:#F5C518;border:0;border-radius:6px;padding:10px 18px;font-weight:700;cursor:pointer}
    .fcar-pdf:disabled{opacity:.6;cursor:default}`;
  document.head.appendChild(st);
})();
