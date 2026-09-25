// ============ EMBEDDED DATA ============
function diTurmaLabel(hab, cod){ const c=String(cod==null?'':cod).trim(); return DI_TURMA_MAP[c] || ((hab||'') + ' T' + c); }


// Build index: db-id -> geral record (for joining itens)
const IDX_GERAL = {};
DATA_GERAL.forEach(r => { IDX_GERAL[r['db-id']] = r; });

// ============ COLORS ============
const UCOL = {
  'BRASÍLIA':'#01559B','CAMPINAS':'#1A2459','CONSOLAÇÃO':'#e67e22','ONLINE':'#7C3AED'
};
const UNITS = ['BRASÍLIA','CAMPINAS','CONSOLAÇÃO','ONLINE'];

// ============ FILTER STATE ============
const F = { unidade:'', ano:'', mes:[], hab:'', diturma:'', itens:[], semana:'' };

// ============ POPULATE FILTER DROPDOWNS ============
function populateFilters() {
  // Clear existing options (keep first "Todos")
  ['f-hab','f-diturma'].forEach(id => {
    const sel = document.getElementById(id);
    while (sel.options.length > 1) sel.remove(1);
  });
  const mesOpts = [
    {o:9,l:'set/25'},{o:10,l:'out/25'},{o:11,l:'nov/25'},{o:12,l:'dez/25'},
    {o:1,l:'jan/26'},{o:2,l:'fev/26'},{o:3,l:'mar/26'},{o:4,l:'abr/26'},{o:5,l:'mai/26'},{o:6,l:'jun/26'},{o:7,l:'jul/26'},{o:8,l:'ago/26'},{o:13,l:'set/26'}
  ];
  const presentMes = new Set(DATA_GERAL.map(r=>r.mes_label));
  const mesContainer = document.getElementById('ms-mes-items');
  mesContainer.innerHTML = '';
  mesOpts.filter(m=>presentMes.has(m.l)).forEach(m=>{
    const lbl = document.createElement('label');
    lbl.className = 'ms-item';
    lbl.innerHTML = '<input type="checkbox" value="'+m.l+'"> '+m.l;
    lbl.querySelector('input').addEventListener('change', onMesChange);
    mesContainer.appendChild(lbl);
  });

  const habs = [...new Set(DATA_GERAL.map(r=>r.habilitacao))].sort();
  const hSel = document.getElementById('f-hab');
  habs.forEach(h=>{ const o=document.createElement('option'); o.value=h; o.textContent=h; hSel.appendChild(o); });

  const dts = [...new Set(DATA_GERAL.map(r=>r.di_turma))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
  const dtSel = document.getElementById('f-diturma');
  dts.forEach(d=>{ const o=document.createElement('option'); o.value=d; o.textContent=d; dtSel.appendChild(o); });
}

// ============ FILTER GERAL DATA ============
// Map checkbox value → per-item nota column in DATA_GERAL
const ITEM_COL_MAP = {"Aula Online": "nota_Aula_Online", "Aula Prática": "nota_Aula_Prática", "Infraestrutura": "nota_Infraestrutura", "Plataforma Avida": "nota_Plataforma_Avida", "Professor": "nota_Professor", "Triagem": "nota_Triagem"};

function computeNotaEfetiva(r) {
  // If no itens selected, use nota_geral as-is
  if (F.itens.length === 0) return r.nota_geral;
  // Otherwise average the selected item notas
  const vals = F.itens.map(t => r[ITEM_COL_MAP[t]]).filter(v => v !== null && v !== undefined);
  if (!vals.length) return r.nota_geral;
  // Scale from 1-5 to 0-10
  const avg5 = vals.reduce((a,b)=>a+b,0)/vals.length;
  return avg5 * 2;
}

function classifyEfetiva(n) {
  if (n >= 9) return 'Promotor';
  if (n >= 7) return 'Neutro';
  return 'Detrator';
}

function applyFilters(data) {
  return data
    .filter(r => {
      if (F.unidade && r.unidade_calc !== F.unidade) return false;
      if (F.ano && String(r.ano_resposta) !== String(F.ano)) return false;
      if (F.mes.length > 0 && !F.mes.includes(r.mes_label)) return false;
      if (F.hab && r.habilitacao !== F.hab) return false;
      if (F.diturma && r.di_turma !== F.diturma) return false;
      if (F.semana && r.semana_key !== F.semana) return false;
      return true;
    })
    .map(r => {
      const nota = computeNotaEfetiva(r);
      return Object.assign({}, r, {
        nota_geral: nota,
        classificacao: classifyEfetiva(nota)
      });
    });
}

// ============ FILTER ITENS (join via db-id) ============
function applyFiltersItens() {
  const filteredIds = new Set(applyFilters(DATA_GERAL).map(r => r['db-id']));
  let rows = DATA_ITENS.filter(r => filteredIds.has(r['db-id']));
  if (F.itens.length > 0) rows = rows.filter(r => F.itens.includes(r.tipo_avaliacao));
  return rows;
}

// ============ HELPERS ============
function fmt(n){ return n.toFixed(2).replace('.',','); }
function fmtPct(n,t){ return t?((n/t)*100).toFixed(1)+'%':'0%'; }
function notaCls(n){ return n>=8?'ng':n>=7?'nw':'nb'; }
function itemCls(n){ return n>=4?'ng':n>=3.5?'nw':'nb'; }
function avg(arr){ return arr.length? arr.reduce((a,b)=>a+b,0)/arr.length : null; }

// ============ CHART REGISTRY ============
const CHARTS = {};
function destroyChart(id){ if(CHARTS[id]){ CHARTS[id].destroy(); delete CHARTS[id]; } }

// ============ MONTHLY LINE ============
function monthlyLine(canvasId, units, filteredData) {
  destroyChart(canvasId);
  const allMes = [
    {o:9,l:'set/25'},{o:10,l:'out/25'},{o:11,l:'nov/25'},{o:12,l:'dez/25'},
    {o:1,l:'jan/26'},{o:2,l:'fev/26'},{o:3,l:'mar/26'},{o:4,l:'abr/26'},{o:5,l:'mai/26'},{o:6,l:'jun/26'},{o:7,l:'jul/26'},{o:8,l:'ago/26'},{o:13,l:'set/26'}
  ];
  const presentMes = new Set(filteredData.map(r=>r.mes_label));
  const labels = allMes.filter(m=>presentMes.has(m.l)).map(m=>m.l);
  const datasets = units.map(u => {
    const uData = filteredData.filter(r=>r.unidade_calc===u);
    const data = labels.map(l => {
      const rows = uData.filter(r=>r.mes_label===l);
      return rows.length ? avg(rows.map(r=>r.nota_geral)) : null;
    });
    return {
      label:u, data,
      borderColor:UCOL[u], backgroundColor:UCOL[u]+'22',
      borderWidth:2.5, pointRadius:5, pointHoverRadius:7,
      tension:.3, spanGaps:false
    };
  }).filter(ds=>ds.data.some(v=>v!==null));

  const ctx = document.getElementById(canvasId);
  if(!ctx) return;
  CHARTS[canvasId] = new Chart(ctx, {
    type:'line', data:{labels, datasets},
    options:{
      responsive:true, maintainAspectRatio:false, clip:false,
      layout:{padding:{top:14,bottom:14}},
      plugins:{
        legend:{position:'top',labels:{font:{size:11},usePointStyle:true,pointStyle:'circle',boxWidth:10,boxHeight:10}},
        tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.parsed.y?c.parsed.y.toFixed(2):'-'}`}}
      },
      scales:{
        y:{suggestedMin:0,suggestedMax:10,ticks:{callback:v=>v.toFixed(1)},grid:{color:'#f0f0f0'}},
        x:{grid:{display:false},ticks:{font:{size:11}}}
      },
      layout:{padding:{top:12,bottom:12}},
      clip:false
    }
  });
}

// ============ ENGAJAMENTO (adesao as pesquisas) ============
// DATA_ENGAJAMENTO vem de fora do pipeline deste repo -- publicado por um
// script local que consulta o datalake (BigQuery) e sobe só o agregado
// {mensal, por_unidade, por_habilitacao, mensal_por_unidade} (ver
// automacao-dashboard/atualizar_engajamento.py e memória do projeto,
// [[engajamento_csat_pipeline]]). Não é filtrável pelos mesmos filtros de
// unidade/mês do topo da página (a query de origem ainda não abre detalhe
// suficiente pra isso) -- tem um filtro PRÓPRIO só pro gráfico principal
// (ver engajamentoFiltroUnidade/populateEngajamentoFiltro abaixo, pedido do
// usuário 2026-09-25). Os 2 gráficos de baixo (por unidade/habilitação)
// continuam mostrando sempre todas as unidades -- é a função deles.

let engajamentoFiltroUnidade = ''; // '' = Todos

// Ordem fixa de exibição + rótulo amigável pro filtro -- "Disciplina Online"
// vira só "Online" no botão (mais curto), mas continua usando a cor de
// UCOL.ONLINE (mesmo critério de engajamentoUnidadeBar).
const ENGAJAMENTO_UNIDADE_ORDEM = ['BRASÍLIA', 'CAMPINAS', 'CONSOLAÇÃO', 'Disciplina Online'];
const ENGAJAMENTO_UNIDADE_LABEL = { 'BRASÍLIA': 'Brasília', 'CAMPINAS': 'Campinas', 'CONSOLAÇÃO': 'Consolação', 'Disciplina Online': 'Online' };

function engajamentoUnidadeCor(u) {
  return UCOL[u] || (u === 'Disciplina Online' ? UCOL.ONLINE : '#94a3b8');
}

function setEngajamentoFiltro(u) {
  engajamentoFiltroUnidade = u;
  populateEngajamentoFiltro();
  engajamentoCombo('ch-engajamento');
}

function populateEngajamentoFiltro() {
  const wrap = document.getElementById('engajamento-filtro-unidade');
  if (!wrap || typeof DATA_ENGAJAMENTO === 'undefined' || !DATA_ENGAJAMENTO?.mensal_por_unidade) return;
  const disponiveis = ENGAJAMENTO_UNIDADE_ORDEM.filter(u => DATA_ENGAJAMENTO.mensal_por_unidade[u]);
  const opcoes = ['', ...disponiveis];
  wrap.innerHTML = opcoes.map(u => {
    const label = u === '' ? 'Todos' : ENGAJAMENTO_UNIDADE_LABEL[u] || u;
    const ativo = engajamentoFiltroUnidade === u;
    const cor = u === '' ? '#1A2459' : engajamentoUnidadeCor(u);
    return `<button onclick="setEngajamentoFiltro('${u}')" style="font-size:11px;font-weight:700;padding:4px 12px;border-radius:999px;cursor:pointer;
      border:1px solid ${cor};background:${ativo ? cor : '#fff'};color:${ativo ? '#fff' : cor}">${label}</button>`;
  }).join('');
}

function engajamentoCombo(canvasId) {
  destroyChart(canvasId);
  if (typeof DATA_ENGAJAMENTO === 'undefined' || !DATA_ENGAJAMENTO?.mensal?.length) return;
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  populateEngajamentoFiltro();

  // Filtro por unidade: reindexa a série da unidade escolhida pelos MESMOS
  // meses de DATA_ENGAJAMENTO.mensal (preenchendo com 0/null onde a unidade
  // não teve convite naquele mês) -- mantém o eixo X estável ao trocar de
  // filtro, em vez de encolher/esticar o gráfico.
  let mensal = DATA_ENGAJAMENTO.mensal;
  if (engajamentoFiltroUnidade) {
    const serieUnidade = DATA_ENGAJAMENTO.mensal_por_unidade?.[engajamentoFiltroUnidade] || [];
    const porMes = {};
    serieUnidade.forEach(r => { porMes[r.mes] = r; });
    mensal = DATA_ENGAJAMENTO.mensal.map(base => porMes[base.mes] || { mes: base.mes, mes_label: base.mes_label, conv: 0, resp: 0, pct: null });
  }

  const labels = mensal.map(r => r.mes_label);
  const convites = mensal.map(r => r.conv);
  const pct = mensal.map(r => r.pct);
  const pctValidos = pct.filter(v => v != null);
  const maxY = pctValidos.length ? Math.max(...pctValidos) * 1.4 : 40;

  const engajamentoLabelsPlugin = {
    id: 'engajamentoLabelsPlugin_' + canvasId,
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      c.save();
      const barMeta = chart.getDatasetMeta(0);
      const lineMeta = chart.getDatasetMeta(1);
      // Convites: rótulo minimalista ACIMA da barra (cinza, discreto) -- pedido
      // explícito do usuário, diferente do "n=" em branco DENTRO da barra usado
      // em evolucaoGeralCombo. Quando o topo da barra fica perto do ponto da
      // linha de % (meses com convites altos + adesão alta ao mesmo tempo),
      // empilha o número de convites acima do rótulo de % em vez de deixar
      // os dois textos se sobreporem.
      barMeta.data.forEach((el, i) => {
        if (convites[i] == null) return;
        let y = el.y - 8;
        const lineEl = lineMeta.data[i];
        if (lineEl && pct[i] != null) {
          const pctLabelY = lineEl.y - 14;
          if (Math.abs(y - pctLabelY) < 18) y = pctLabelY - 16;
        }
        c.font = '600 10px Segoe UI, sans-serif';
        c.fillStyle = '#9ca3af';
        c.textAlign = 'center';
        c.fillText(convites[i], el.x, y);
      });
      lineMeta.data.forEach((el, i) => {
        if (pct[i] == null) return;
        c.font = '700 12px Segoe UI, sans-serif';
        c.fillStyle = '#16a34a';
        c.textAlign = 'center';
        c.fillText(pct[i].toFixed(1) + '%', el.x, el.y - 14);
      });
      c.restore();
    }
  };

  CHARTS[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar', label: 'Convites enviados', data: convites,
          backgroundColor: '#9ca3af4d', borderRadius: 4, borderSkipped: false,
          yAxisID: 'y1', order: 2, maxBarThickness: 46
        },
        {
          type: 'line', label: '% Adesão', data: pct,
          borderColor: '#16a34a', backgroundColor: '#16a34a',
          pointBackgroundColor: '#16a34a', pointBorderColor: '#fff', pointBorderWidth: 1.5,
          borderWidth: 3, pointRadius: 5, pointHoverRadius: 7,
          tension: .3, spanGaps: false, yAxisID: 'y', order: 1
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, clip: false,
      layout: { padding: { top: 34, bottom: 6 } },
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle', boxWidth: 10, boxHeight: 10, padding: 16 }
        },
        tooltip: {
          callbacks: {
            label: c => c.dataset.type === 'bar' ? `Convites enviados: ${c.parsed.y}` : `Adesão: ${c.parsed.y != null ? c.parsed.y.toFixed(1) : '-'}%`
          }
        }
      },
      scales: {
        y: {
          position: 'left', suggestedMin: 0, suggestedMax: maxY,
          ticks: { callback: v => v.toFixed(0) + '%' },
          grid: { color: '#f0f0f0' },
          title: { display: true, text: '% adesão', color: '#6b7280', font: { size: 10 } }
        },
        y1: {
          position: 'right', suggestedMin: 0,
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'convites', color: '#6b7280', font: { size: 10 } }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 } }
        }
      }
    },
    plugins: [engajamentoLabelsPlugin]
  });
}

function _engajamentoRankBar(canvasId, rows, labelKey, colorFn) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || !rows || !rows.length) return;
  const labels = rows.map(r => r[labelKey]);
  const pct = rows.map(r => r.pct);

  const rankLabelsPlugin = {
    id: 'engajamentoRankLabelsPlugin_' + canvasId,
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      c.save();
      c.font = '700 11px Segoe UI, sans-serif';
      c.fillStyle = '#1a1a2e';
      c.textAlign = 'left';
      chart.getDatasetMeta(0).data.forEach((el, i) => {
        c.fillText(pct[i].toFixed(1) + '%', el.x + 6, el.y + 4);
      });
      c.restore();
    }
  };

  CHARTS[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: pct, backgroundColor: rows.map(colorFn), borderRadius: 4 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 40 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `Adesão: ${c.parsed.x.toFixed(1)}%` } }
      },
      scales: {
        x: { suggestedMax: Math.max(...pct) * 1.25, grid: { color: '#f0f0f0' }, ticks: { callback: v => v.toFixed(0) + '%' } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    },
    plugins: [rankLabelsPlugin]
  });
}

// Adesão por unidade -- reaproveita UCOL (mesma paleta das outras abas).
// "Disciplina Online" (2026-09-25) = convites com habilitação "Psiquiatria
// Clínica"/"Endocrinologia Clínica" (mesmo ONLINE_HABS de transform_csat.py)
// -- cadastrados fisicamente em Campinas/Consolação, mas contados à parte
// aqui porque são turmas de modalidade online. Usa a cor de UCOL.ONLINE
// (já usada na aba "🖥️ Online" do dashboard) já que a chave do grupo vem
// como texto legível ("Disciplina Online"), não "ONLINE".
function engajamentoUnidadeBar(canvasId) {
  if (typeof DATA_ENGAJAMENTO === 'undefined' || !DATA_ENGAJAMENTO?.por_unidade) return;
  _engajamentoRankBar(canvasId, DATA_ENGAJAMENTO.por_unidade, 'unidade',
    r => UCOL[r.unidade] || (r.unidade === 'Disciplina Online' ? UCOL.ONLINE : '#94a3b8'));
}

// Adesão por habilitação (top 10) -- reaproveita HAB_COLORS (mesma paleta
// usada no ranking por módulo/turma).
function engajamentoHabBar(canvasId) {
  if (typeof DATA_ENGAJAMENTO === 'undefined' || !DATA_ENGAJAMENTO?.por_habilitacao) return;
  _engajamentoRankBar(canvasId, DATA_ENGAJAMENTO.por_habilitacao, 'habilitacao', (_, i) => HAB_COLORS[i % HAB_COLORS.length]);
}

// ============ EVOLUCAO GERAL (media + respostas) ============
function evolucaoGeralCombo(canvasId, filteredData) {
  destroyChart(canvasId);
  const allMes = [
    {o:9,l:'set/25'},{o:10,l:'out/25'},{o:11,l:'nov/25'},{o:12,l:'dez/25'},
    {o:1,l:'jan/26'},{o:2,l:'fev/26'},{o:3,l:'mar/26'},{o:4,l:'abr/26'},{o:5,l:'mai/26'},{o:6,l:'jun/26'},{o:7,l:'jul/26'},{o:8,l:'ago/26'},{o:13,l:'set/26'}
  ];
  const presentMes = new Set(filteredData.map(r=>r.mes_label));
  const mesFiltered = allMes.filter(m=>presentMes.has(m.l));
  const labels = mesFiltered.map(m=>m.l);
  const totais = mesFiltered.map(m => filteredData.filter(r=>r.mes_label===m.l).length);
  const medias = mesFiltered.map((m,i) => totais[i] ? avg(filteredData.filter(r=>r.mes_label===m.l).map(r=>r.nota_geral)) : null);

  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const evolucaoLabelsPlugin = {
    id: 'evolucaoLabelsPlugin_' + canvasId,
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      c.save();
      // "n=" labels drawn INSIDE the bar (near the top, in white) so they never collide
      // with the score line's labels, regardless of how the two y-axes happen to line up.
      const barMeta = chart.getDatasetMeta(0);
      barMeta.data.forEach((el, i) => {
        if (totais[i] == null) return;
        c.font = '700 11px Segoe UI, sans-serif';
        c.fillStyle = '#fff';
        c.textAlign = 'center';
        c.fillText('n=' + totais[i], el.x, el.y + 16);
      });
      const lineMeta = chart.getDatasetMeta(1);
      lineMeta.data.forEach((el, i) => {
        if (medias[i] == null) return;
        c.font = '700 12px Segoe UI, sans-serif';
        c.fillStyle = '#1A2459';
        c.textAlign = 'center';
        c.fillText(medias[i].toFixed(2), el.x, el.y - 14);
      });
      c.restore();
    }
  };

  CHARTS[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar', label: 'Respostas', data: totais,
          backgroundColor: '#01559Bcc', borderRadius: 4, borderSkipped: false,
          yAxisID: 'y1', order: 2, maxBarThickness: 46
        },
        {
          type: 'line', label: 'Nota média', data: medias,
          borderColor: '#F5C518', backgroundColor: '#F5C518',
          pointBackgroundColor: '#F5C518', pointBorderColor: '#1A2459', pointBorderWidth: 1.5,
          borderWidth: 3, pointRadius: 5, pointHoverRadius: 7,
          tension: .3, spanGaps: false, yAxisID: 'y', order: 1
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, clip: false,
      layout: { padding: { top: 26, bottom: 6 } },
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle', boxWidth: 10, boxHeight: 10 }
        },
        tooltip: {
          callbacks: {
            label: c => c.dataset.type === 'bar' ? `Respostas: ${c.parsed.y}` : `Nota média: ${c.parsed.y?.toFixed(2) ?? '-'}`
          }
        }
      },
      scales: {
        y: {
          position: 'left', suggestedMin: 0, suggestedMax: 10,
          ticks: { stepSize: 1, callback: v => v.toFixed(0) },
          grid: { color: '#f0f0f0' },
          title: { display: true, text: 'média', color: '#6b7280', font: { size: 10 } }
        },
        y1: {
          position: 'right', suggestedMin: 0,
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'respostas', color: '#6b7280', font: { size: 10 } }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 } }
        }
      }
    },
    plugins: [evolucaoLabelsPlugin]
  });
}

function evolucaoSemanalCombo(canvasId, filteredData) {
  destroyChart(canvasId);
  const semSet = {};
  filteredData.forEach(r => { if (r.semana_key && r.semana_label) semSet[r.semana_key] = r.semana_label; });
  const semSeq = Object.keys(semSet).sort();
  if (!semSeq.length) return;
  const labels = semSeq.map(k => semSet[k]);
  const totais = semSeq.map(k => filteredData.filter(r=>r.semana_key===k).length);
  const medias = semSeq.map((k,i) => totais[i] ? avg(filteredData.filter(r=>r.semana_key===k).map(r=>r.nota_geral)) : null);

  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const evolucaoSemanalLabelsPlugin = {
    id: 'evolucaoLabelsPlugin_' + canvasId,
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      c.save();
      const barMeta = chart.getDatasetMeta(0);
      barMeta.data.forEach((el, i) => {
        if (totais[i] == null) return;
        c.font = '700 10px Segoe UI, sans-serif';
        c.fillStyle = '#fff';
        c.textAlign = 'center';
        c.fillText('n=' + totais[i], el.x, el.y + 14);
      });
      const lineMeta = chart.getDatasetMeta(1);
      lineMeta.data.forEach((el, i) => {
        if (medias[i] == null) return;
        c.font = '700 11px Segoe UI, sans-serif';
        c.fillStyle = '#1A2459';
        c.textAlign = 'center';
        c.fillText(medias[i].toFixed(2), el.x, el.y - 13);
      });
      c.restore();
    }
  };

  CHARTS[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar', label: 'Respostas', data: totais,
          backgroundColor: '#01559Bcc', borderRadius: 4, borderSkipped: false,
          yAxisID: 'y1', order: 2, maxBarThickness: 32
        },
        {
          type: 'line', label: 'Nota média', data: medias,
          borderColor: '#F5C518', backgroundColor: '#F5C518',
          pointBackgroundColor: '#F5C518', pointBorderColor: '#1A2459', pointBorderWidth: 1.5,
          borderWidth: 3, pointRadius: 4, pointHoverRadius: 6,
          tension: .3, spanGaps: false, yAxisID: 'y', order: 1
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, clip: false,
      layout: { padding: { top: 26, bottom: 6 } },
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle', boxWidth: 10, boxHeight: 10 }
        },
        tooltip: {
          callbacks: {
            label: c => c.dataset.type === 'bar' ? `Respostas: ${c.parsed.y}` : `Nota média: ${c.parsed.y?.toFixed(2) ?? '-'}`
          }
        }
      },
      scales: {
        y: {
          position: 'left', suggestedMin: 0, suggestedMax: 10,
          ticks: { stepSize: 1, callback: v => v.toFixed(0) },
          grid: { color: '#f0f0f0' },
          title: { display: true, text: 'média', color: '#6b7280', font: { size: 10 } }
        },
        y1: {
          position: 'right', suggestedMin: 0,
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'respostas', color: '#6b7280', font: { size: 10 } }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 9 }, maxRotation: 60, minRotation: 0, autoSkip: true }
        }
      }
    },
    plugins: [evolucaoSemanalLabelsPlugin]
  });
}

// ============ HAB BAR ============
function habBar(canvasId, unit, filteredData, isOnline) {
  destroyChart(canvasId);
  const uData = filteredData.filter(r=>r.unidade_calc===unit);
  const habMap = {};
  uData.forEach(r=>{ if(!habMap[r.habilitacao]) habMap[r.habilitacao]={sum:0,cnt:0}; habMap[r.habilitacao].sum+=r.nota_geral; habMap[r.habilitacao].cnt++; });
  const habs = Object.keys(habMap).sort((a,b)=>habMap[b].sum/habMap[b].cnt - habMap[a].sum/habMap[a].cnt);
  if(!habs.length){ return; }
  const medias = habs.map(h=>habMap[h].sum/habMap[h].cnt);
  const col = isOnline?'#7C3AED':UCOL[unit];
  const ctx = document.getElementById(canvasId); if(!ctx) return;
  CHARTS[canvasId] = new Chart(ctx, {
    type:'bar',
    data:{
      labels:habs,
      datasets:[{
        label:'Nota Média', data:medias,
        backgroundColor: medias.map(v=>v>=8?col+'cc':v>=7?'#d97706cc':'#dc2626cc'),
        borderRadius:4, borderSkipped:false
      }]
    },
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.parsed.x.toFixed(2)}`}}},
      scales:{x:{suggestedMin:0,suggestedMax:10,ticks:{callback:v=>v.toFixed(1)},grid:{color:'#f0f0f0'}},y:{grid:{display:false},ticks:{font:{size:11}}}}
    }
  });
}

// ============ GERAL HAB GROUPED BAR ============
function geralHabBar(filteredData) {
  destroyChart('ch-hab-geral');
  const allHabs = [...new Set(filteredData.map(r=>r.habilitacao))].sort();
  if(!allHabs.length) return;
  const datasets = UNITS.map(u => {
    const uData = filteredData.filter(r=>r.unidade_calc===u);
    const data = allHabs.map(h => {
      const rows = uData.filter(r=>r.habilitacao===h);
      return rows.length ? avg(rows.map(r=>r.nota_geral)) : null;
    });
    return {label:u, data, backgroundColor:UCOL[u]+'bb', borderRadius:3};
  });
  const ctx = document.getElementById('ch-hab-geral'); if(!ctx) return;
  CHARTS['ch-hab-geral'] = new Chart(ctx, {
    type:'bar', data:{labels:allHabs, datasets},
    options:{
      responsive:true, maintainAspectRatio:false, clip:false,
      layout:{padding:{top:14,bottom:14}},
      plugins:{legend:{position:'top',labels:{font:{size:11},usePointStyle:true,pointStyle:'circle',boxWidth:10,boxHeight:10}}},
      scales:{
        y:{suggestedMin:0,suggestedMax:10,ticks:{callback:v=>v.toFixed(1)},grid:{color:'#f0f0f0'}},
        x:{
          grid:{display:false},
          offset:true,
          ticks:{
            font:{size:11},
            maxRotation:45,
            minRotation:45,
            autoSkip:false,
            padding:4
          }
        }
      }
    }
  });
}

// ============ PIE ============
function pieChart(filteredData) {
  destroyChart('ch-pie');
  const counts = UNITS.map(u=>({u, n:filteredData.filter(r=>r.unidade_calc===u).length})).filter(x=>x.n>0);
  const ctx = document.getElementById('ch-pie'); if(!ctx) return;
  CHARTS['ch-pie'] = new Chart(ctx, {
    type:'doughnut',
    data:{
      labels:counts.map(x=>x.u),
      datasets:[{data:counts.map(x=>x.n), backgroundColor:counts.map(x=>UCOL[x.u]), borderWidth:2, borderColor:'#fff'}]
    },
    options:{
      responsive:true, maintainAspectRatio:false, clip:false,
      layout:{padding:{top:14,bottom:14}},
      plugins:{
        legend:{position:'bottom',labels:{font:{size:11},usePointStyle:true,pointStyle:'circle',boxWidth:10,boxHeight:10}},
        tooltip:{callbacks:{label:c=>`${c.label}: ${c.parsed} resp. (${((c.parsed/c.dataset.data.reduce((a,b)=>a+b,0))*100).toFixed(1)}%)`}}
      }
    }
  });
}

// ============ ITENS GROUPED BAR ============
function itensBar(filteredItens) {
  destroyChart('ch-itens');
  const selectedTypes = F.itens.length>0 ? F.itens : ['Aula Online','Aula Prática','Professor','Triagem','Infraestrutura','Plataforma Avida'];
  const selectedUnits = F.unidade ? [F.unidade] : UNITS;
  const datasets = selectedUnits.map(u => {
    const uRows = filteredItens.filter(r=>IDX_GERAL[r['db-id']]?.unidade_calc===u);
    const data = selectedTypes.map(t => {
      const rows = uRows.filter(r=>r.tipo_avaliacao===t);
      return rows.length ? avg(rows.map(r=>r.nota)) : null;
    });
    return {label:u, data, backgroundColor:UCOL[u]+'bb', borderRadius:3};
  });
  const ctx = document.getElementById('ch-itens'); if(!ctx) return;
  CHARTS['ch-itens'] = new Chart(ctx, {
    type:'bar', data:{labels:selectedTypes, datasets},
    options:{
      responsive:true, maintainAspectRatio:false, clip:false,
      layout:{padding:{top:14,bottom:14}},
      plugins:{legend:{position:'top',labels:{font:{size:11},usePointStyle:true,pointStyle:'circle',boxWidth:10,boxHeight:10}}},
      scales:{
        y:{suggestedMin:0,suggestedMax:5,ticks:{callback:v=>v.toFixed(1)},grid:{color:'#f0f0f0'}},
        x:{grid:{display:false}}
      }
    }
  });
}

// ============ CARDS ============
function renderCards(containerId, unit, filteredData, isOnline) {
  const data = unit ? filteredData.filter(r=>r.unidade_calc===unit) : filteredData;
  const total = data.length;
  if(!total){ document.getElementById(containerId).innerHTML='<div class="nodata">Sem dados para os filtros selecionados.</div>'; return; }
  const media = avg(data.map(r=>r.nota_geral));
  const prom = data.filter(r=>r.classificacao==='Promotor').length;
  const neut = data.filter(r=>r.classificacao==='Neutro').length;
  const detr = data.filter(r=>r.classificacao==='Detrator').length;
  const cls = isOnline?'card c-online':'card';
  const valStyle = isOnline?'style="color:var(--online)"':'';
  document.getElementById(containerId).innerHTML = `
    <div class="${cls}"><div class="card-lbl">Total Respostas</div><div class="card-val" ${valStyle}>${total}</div><div class="card-sub">Avaliações únicas</div></div>
    <div class="${cls}"><div class="card-lbl">Satisfação Geral</div><div class="card-val" ${valStyle}>${fmt(media)}</div><div class="card-sub">Escala 0–10</div></div>
    <div class="card c-good"><div class="card-lbl">Promotores</div><div class="card-val" style="color:var(--good)">${prom}</div><div class="card-sub">${fmtPct(prom,total)} · Nota ≥ 9</div></div>
    <div class="card c-warn"><div class="card-lbl">Neutros</div><div class="card-val" style="color:var(--warn)">${neut}</div><div class="card-sub">${fmtPct(neut,total)} · Nota 7–8</div></div>
    <div class="card c-bad"><div class="card-lbl">Detratores</div><div class="card-val" style="color:var(--bad)">${detr}</div><div class="card-sub">${fmtPct(detr,total)} · Nota ≤ 6</div></div>
  `;
}

function renderGeralCards(filteredData) {
  const container = document.getElementById('cards-geral');
  const activeUnits = UNITS.filter(u=>filteredData.some(r=>r.unidade_calc===u));
  container.innerHTML = activeUnits.map(u => {
    const data = filteredData.filter(r=>r.unidade_calc===u);
    const media = avg(data.map(r=>r.nota_geral));
    const total = data.length;
    const prom = data.filter(r=>r.classificacao==='Promotor').length;
    const neut = data.filter(r=>r.classificacao==='Neutro').length;
    const detr = data.filter(r=>r.classificacao==='Detrator').length;
    const isOnline = u==='ONLINE';
    return `
      <div class="card${isOnline?' c-online':''}" style="min-width:150px">
        <div class="card-lbl">${u}</div>
        <div class="card-val">${fmt(media)}</div>
        <div class="card-sub">${total} respostas</div>
        <div style="display:flex;gap:8px;margin-top:6px;font-size:11px">
          <span style="color:var(--good)">▲${fmtPct(prom,total)}</span>
          <span style="color:var(--warn)">●${fmtPct(neut,total)}</span>
          <span style="color:var(--bad)">▼${fmtPct(detr,total)}</span>
        </div>
      </div>`;
  }).join('');
}

// ============ ITENS MINI CARDS ============
function renderItensCards(containerId, unit, filteredItens, isOnline) {
  const unitIds = new Set(applyFilters(DATA_GERAL).filter(r=>r.unidade_calc===unit).map(r=>r['db-id']));
  const rows = filteredItens.filter(r=>unitIds.has(r['db-id']));
  if(!rows.length){ document.getElementById(containerId).innerHTML=''; return; }
  const tipos = [...new Set(rows.map(r=>r.tipo_avaliacao))].sort();
  const cls = isOnline?'icard online-icard':'icard';
  document.getElementById(containerId).innerHTML = `
    <div class="sec-lbl">Itens Específicos (escala 1–5)</div>
    <div class="items-grid">
      ${tipos.map(t=>{
        const tRows = rows.filter(r=>r.tipo_avaliacao===t);
        const m = avg(tRows.map(r=>r.nota));
        const cl = m>=4?'ng':m>=3.5?'nw':'nb';
        return `<div class="${cls}">
          <div class="icard-lbl">${t}</div>
          <div class="icard-val ${cl}">${fmt(m)}</div>
          <div class="icard-sub">${new Set(tRows.map(r=>r['db-id'])).size} respondentes</div>
          <div class="ibar"><div class="ibar-fill" style="width:${(m/5)*100}%"></div></div>
        </div>`;
      }).join('')}
    </div>`;
}

// ============ ITENS TABLE ============
function renderItensTable(filteredItens) {
  const selectedUnits = F.unidade ? [F.unidade] : UNITS;
  const selectedTypes = F.itens.length>0 ? F.itens : ['Aula Online','Aula Prática','Professor','Triagem','Infraestrutura','Plataforma Avida'];
  const rows = selectedTypes.map(t => {
    const cols = selectedUnits.map(u => {
      const unitIds = new Set(applyFilters(DATA_GERAL).filter(r=>r.unidade_calc===u).map(r=>r['db-id']));
      const tRows = filteredItens.filter(r=>unitIds.has(r['db-id'])&&r.tipo_avaliacao===t);
      if(!tRows.length) return '<td style="color:var(--muted)">—</td>';
      const m = avg(tRows.map(r=>r.nota));
      const cl = m>=4?'ng':m>=3.5?'nw':'nb';
      return `<td class="${cl}">${fmt(m)}</td>`;
    });
    return `<tr><td><strong>${t}</strong></td>${cols.join('')}</tr>`;
  }).join('');
  document.getElementById('itens-tbl').innerHTML = `
    <div class="cbox full">
      <h3>Tabela Comparativa — Itens por Unidade</h3>
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Item</th>${selectedUnits.map(u=>`<th>${u}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ============ RENDER ALL ============

// ============ WEEKLY LINE — ALL UNITS ============
function weeklyLineAllUnits(canvasId, filteredData) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const semSet = {};
  filteredData.forEach(r => { if (r.semana_key && r.semana_label) semSet[r.semana_key] = r.semana_label; });
  const semSeq = Object.keys(semSet).sort();
  if (!semSeq.length) return;
  const labels = semSeq.map(k => semSet[k]);

  const UNIT_LIST = ['BRASÍLIA','CAMPINAS','CONSOLAÇÃO','ONLINE'];
  const UNIT_COLORS = {
    'BRASÍLIA':'#01559B',
    'CAMPINAS':'#F5C518',
    'CONSOLAÇÃO':'#16a34a',
    'ONLINE':'#7C3AED'
  };

  const datasets = UNIT_LIST.map(u => {
    const uData = filteredData.filter(r => r.unidade_calc === u);
    const data = semSeq.map(sk => {
      const rows = uData.filter(r => r.semana_key === sk);
      return rows.length ? avg(rows.map(r => r.nota_geral)) : null;
    });
    if (!data.some(v => v !== null)) return null;
    return {
      label: u, data,
      borderColor: UNIT_COLORS[u],
      backgroundColor: UNIT_COLORS[u] + '18',
      borderWidth: 2.5,
      pointRadius: 4, pointHoverRadius: 7,
      pointBackgroundColor: '#fff',
      pointBorderColor: UNIT_COLORS[u],
      pointBorderWidth: 2,
      tension: 0.3, spanGaps: false
    };
  }).filter(Boolean);

  CHARTS[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, clip: false,
      layout: { padding: { top: 14, bottom: 14 } },
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8 } },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + (c.parsed.y ? c.parsed.y.toFixed(2) : '-') } }
      },
      scales: {
        y: {
          suggestedMin: 5, suggestedMax: 10,
          ticks: { callback: v => v.toFixed(1), stepSize: 0.5 },
          grid: { color: '#f0f0f0' }
        },
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 0, autoSkip: true } }
      }
    }
  });
}


// ============ CROSS ANALYSIS: COMMENTS × TEMA ============
// Temas vêm do mesmo TEMA_DICT/analyzeComment() usado no Resumo Executivo e na
// aba Análise de Comentários (declarados mais abaixo) -- um comentário pode
// pertencer a mais de 1 tema, por isso a lista fixa aqui é só a ORDEM de
// exibição dos cards, não um dicionário de palavras separado.
const TEMA_ORDER = ['Aula Online','Aulas','Plataforma','Estrutura','Equipamentos','Professores','Triagem','Organizacao','Alimentacao','Alunos','Financeiro'];

function classifyNota(n) {
  return n >= 9 ? 'Promotor' : n >= 7 ? 'Neutro' : 'Detrator';
}

function renderCrossAnalise(containerId, unit, filteredData, filteredItens) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Fonte automática (DATA_FEEDBACK, atualizada todo dia pelo pipeline) --
  // classificação por tema via analyzeComment()/TEMA_DICT (mesmo dicionário
  // já usado no Resumo Executivo e na aba Análise de Comentários).
  const fbRows = DATA_FEEDBACK.filter(r => {
    if (r.unidade !== unit) return false;
    if (F.mes && F.mes.length > 0 && !F.mes.includes(r.mes_label)) return false;
    if (F.hab  && r.hab !== F.hab) return false;
    if (F.semana && r.semana_key !== F.semana) return false;
    return r.feedback && r.feedback.trim().length > 8;
  }).map(r => Object.assign({}, r, analyzeComment(r)));

  if (!fbRows.length) {
    container.innerHTML = '';
    return;
  }

  // Cross: cada comentário entra em UM só tema -- o dominante (mais palavras
  // do dicionário bateram nele; ver `temaDominante` em analyzeComment()) --
  // pra não repetir o mesmo comentário em 2 cards (ex.: "aulas online" batendo
  // em Aulas e Aula Online ao mesmo tempo). Diferente do Resumo Executivo/aba
  // Análise de Comentários, que de propósito contam um comentário em todos os
  // temas que ele toca -- aqui o objetivo é mostrar exemplos, não repetir.
  const cross = {};
  TEMA_ORDER.forEach(tema => { cross[tema] = { neg: [], neu: [], pos: [] }; });
  const seenText = new Set();
  fbRows.forEach(r => {
    if (!r.temaDominante || !cross[r.temaDominante]) return;
    const key = r.feedback.trim();
    if (seenText.has(key)) return;
    seenText.add(key);
    cross[r.temaDominante][r.sentiment].push(r);
  });

  const SENT_COLOR = { neg:'#dc2626', neu:'#d97706', pos:'#16a34a' };
  const SENT_LABEL = { neg:'Negativo', neu:'Neutro', pos:'Positivo' };

  const cardsHtml = TEMA_ORDER.map(tema => {
    const det = cross[tema].neg, neu = cross[tema].neu, pro = cross[tema].pos;
    const total = det.length + neu.length + pro.length;
    if (total === 0) return '';

    const dominante = det.length >= neu.length && det.length >= pro.length ? 'neg'
      : pro.length >= neu.length ? 'pos' : 'neu';
    const color = SENT_COLOR[dominante];

    // Exemplos por sentimento, mais recentes primeiro (ts = data+hora da resposta)
    function quoteRows(rows, sent, max) {
      return [...rows]
        .sort((a,b) => (b.ts||0) - (a.ts||0))
        .slice(0, max)
        .map(r => {
          const dotColor = SENT_COLOR[sent];
          const needsTrunc = r.feedback.length > 180;
          const shortText = needsTrunc ? r.feedback.slice(0,180)+'…' : r.feedback;
          const uid = 'fb' + Math.random().toString(36).slice(2,8);
          return `<div style="border-left:3px solid ${dotColor};padding:6px 10px;margin-bottom:6px;background:#fafafa;border-radius:0 4px 4px 0;font-size:12px;color:#374151;line-height:1.5">
            <span style="font-weight:700;color:${dotColor};font-size:11px">${SENT_LABEL[sent]}${r.nota!=null?` [${r.nota}]`:''}</span>
            <span style="color:#94a3b8;font-size:10px;margin-left:6px">${r.hab||''} · ${r.unidade||''}${r.data?' · '+r.data:''}</span>
            <p id="${uid}s" style="margin:4px 0 0">${shortText}${needsTrunc ? ` <button onclick="document.getElementById('${uid}s').style.display='none';document.getElementById('${uid}f').style.display='block'" style="background:none;border:none;color:#01559B;font-size:11px;cursor:pointer;padding:0;font-weight:600;text-decoration:underline">ver mais</button>` : ''}</p>
            ${needsTrunc ? `<p id="${uid}f" style="display:none;margin:4px 0 0">${r.feedback.replace(/`/g,"'")}<button onclick="document.getElementById('${uid}f').style.display='none';document.getElementById('${uid}s').style.display='block'" style="background:none;border:none;color:#01559B;font-size:11px;cursor:pointer;padding:0;font-weight:600;text-decoration:underline"> ver menos</button></p>` : ''}
          </div>`;
        }).join('');
    }

    const detQ = quoteRows(det, 'neg', 6);
    const neuQ = quoteRows(neu, 'neu', 4);
    const proQ = quoteRows(pro, 'pos', 4);
    const allQ = (detQ || neuQ || proQ)
      ? (detQ + neuQ + proQ)
      : '<p style="color:#94a3b8;font-size:12px">Sem comentários relacionados.</p>';

    return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;border-top:4px solid ${color}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7280">${TEMA_ICONS[tema]||''} ${TEMA_LABEL_MAP[tema]||tema}</div>
          <div style="font-size:26px;font-weight:800;color:${color};margin-top:2px">${total}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:#6b7280">comentário${total!==1?'s':''} relacionado${total!==1?'s':''}</div>
          <div style="display:flex;gap:8px;font-size:11px;margin-top:4px;justify-content:flex-end">
            <span style="color:#dc2626">▼ ${det.length}</span>
            <span style="color:#d97706">● ${neu.length}</span>
            <span style="color:#16a34a">▲ ${pro.length}</span>
          </div>
        </div>
      </div>
      <div style="display:flex;height:4px;border-radius:2px;overflow:hidden;margin-bottom:12px;gap:1px">
        ${det.length ? `<div style="flex:${det.length};background:#dc2626;border-radius:2px 0 0 2px"></div>` : ''}
        ${neu.length ? `<div style="flex:${neu.length};background:#d97706"></div>` : ''}
        ${pro.length ? `<div style="flex:${pro.length};background:#16a34a;border-radius:0 2px 2px 0"></div>` : ''}
      </div>
      <div style="font-size:11px;font-weight:700;color:#1A2459;margin-bottom:8px;text-transform:uppercase;letter-spacing:.3px">O que os alunos dizem</div>
      ${allQ}
    </div>`;
  }).filter(Boolean).join('');

  if (!cardsHtml) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;margin-top:4px">
      <h3 style="font-size:13px;font-weight:700;color:#1A2459;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px">
        💬 Análise de Comentários por Tema — ${unit}
      </h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px">
        ${cardsHtml}
      </div>
    </div>`;
}

// ============================ ONE PAGE ============================
// Aba de leitura executiva. Herda a barra de filtros global do topo
// (unidade, ano, mês, especialidade, turma, semana, itens) e acrescenta o
// filtro de Módulo, que não existe na barra global.

let onepageFilters = { modulo: '' };

const OP_TIPOS = ['Aula Online','Aula Prática','Professor','Infraestrutura','Plataforma Avida','Triagem'];
const OP_MES_SEQ = [9,10,11,12,1,2,3,4,5,6,7,8,13];
const OP_MES_LABEL = {9:'set/25',10:'out/25',11:'nov/25',12:'dez/25',
  1:'jan/26',2:'fev/26',3:'mar/26',4:'abr/26',5:'mai/26',6:'jun/26',7:'jul/26',8:'ago/26',13:'set/26'};
const OP_TEMA_LABEL = {
  'Organizacao':'Organização','Alimentacao':'Alimentação','Aula Online':'Aula Online',
  'Plataforma':'Plataforma','Professores':'Professores','Aulas':'Aulas','Estrutura':'Estrutura',
  'Equipamentos':'Equipamentos','Triagem':'Triagem','Alunos':'Alunos','Financeiro':'Financeiro'
};

// O que dizer ao professor quando um assunto aparece como acerto / como falha.
const OP_MANTER = {
  'Professores': 'Manter a mesma equipe do início ao fim do módulo — continuidade de professor é o elogio mais recorrente de toda a base.',
  'Aulas': 'Manter a proporção entre teoria e prática e a sequência de procedimentos usada neste módulo.',
  'Aula Online': 'Manter o formato das aulas online, com discussão de caso e exemplos ligados à prática.',
  'Triagem': 'Manter o critério de triagem deste módulo — os alunos reconheceram que os pacientes chegaram dentro do tema.',
  'Estrutura': 'Manter a configuração de sala e a organização do consultório usadas neste módulo.',
  'Equipamentos': 'Manter a lista de equipamentos e insumos disponibilizada neste módulo.',
  'Organizacao': 'Manter o cronograma e a comunicação prévia no mesmo prazo e nível de detalhe.',
  'Plataforma': 'Manter a organização do material na plataforma e o prazo de publicação antes das aulas.',
  'Alimentacao': 'Manter o cardápio e as opções restritivas oferecidas nesta unidade.',
  'Alunos': 'Manter o tamanho de grupo e a divisão de tarefas adotados na prática.',
  'Financeiro': 'Manter a clareza na comunicação de valores e cobranças.'
};
const OP_MELHORIA = {
  'Professores': 'Evitar troca de professor dentro do mesmo módulo e alinhar conduta entre quem divide a turma.',
  'Aulas': 'Rever a divisão entre teoria e prática e a profundidade do conteúdo teórico que antecede a prática.',
  'Aula Online': 'Rever as aulas online deste módulo: profundidade, casos clínicos e material de apoio.',
  'Triagem': 'Alinhar com a triagem o perfil de paciente que o módulo exige e conferir a agenda antes do dia da prática.',
  'Estrutura': 'Conferir sala, climatização e consultórios antes do módulo e sinalizar o que faltar.',
  'Equipamentos': 'Conferir insumos e equipamentos com antecedência e avisar a coordenação sobre faltas antes do início.',
  'Organizacao': 'Enviar cronograma e orientações antes do módulo e comunicar qualquer mudança com antecedência.',
  'Plataforma': 'Publicar slides e materiais na plataforma antes de cada aula.',
  'Alimentacao': 'Encaminhar à hotelaria os pedidos de variedade e de opções restritivas — não é ajuste de aula.',
  'Alunos': 'Rever a proporção de alunos por professor e por paciente na prática.',
  'Financeiro': 'Encaminhar à área responsável — não é ajuste de módulo.'
};

// ── Remoção de nomes de pessoas nos textos exibidos na One Page ─────────────
// Esta aba é enviada aos professores, então nenhum nome próprio pode aparecer.
// A lista de nomes NÃO é fixa: é aprendida da própria base a cada carregamento,
// por três caminhos independentes, e depois filtrada por uma stoplist.
const OP_NOME_PH = '[nome omitido]';
const OP_NAME_SRC = '[A-ZÁÂÃÀÉÊÍÓÔÕÚÜÇ][a-záâãàéêíóôõúüç]{2,}';
// Abreviações — podem vir com ponto ("Dra. Flávia").
const OP_ABBR_SRC = '(?:[Pp]rofa|[Pp]rof|[Dd]ras|[Dd]rs|[Dd]ra|[Dd]r|[Dd]oc)';
// Títulos escritos por extenso — NUNCA aceitam ponto antes do nome. Se houver
// ponto ali é fim de frase, e deixar o '\\.?' opcional fazia "os professores. Até
// o momento" virar título+nome, injetando "Até"/"Também"/"Durante" na lista.
const OP_FULL_SRC = '(?:[Pp]rofessoras|[Pp]rofessores|[Pp]rofessora|[Pp]rofessor|[Dd]outoras|[Dd]outores|[Dd]outora|[Dd]outor|[Dd]ocentes|[Dd]ocente|[Pp]receptoras|[Pp]receptores|[Pp]receptora|[Pp]receptor)';
const OP_TIT_SRC = '(?:' + OP_FULL_SRC.slice(3, -1) + '|' + OP_ABBR_SRC.slice(3, -1) + ')';
const OP_RE_NAME = new RegExp(OP_NAME_SRC, 'g');
const OP_ANY_SRC = '[A-Za-zÀ-ÿ]{3,}';
const OP_CAPS_SRC = '[A-ZÁÂÃÀÉÊÍÓÔÕÚÜÇ]{3,}';
// nome seguido de sobrenome, aceitando 'Volpon' e 'VOLPON'
const OP_SOBRE_SRC = '[A-ZÁÂÃÀÉÊÍÓÔÕÚÜÇ][A-Za-záâãàéêíóôõúüç]{2,}';
// Dentro de uma sequência que já começa com título, aceita nome de 2 letras
// ("Dra. Lu Bravi") — fora dela seria arriscado demais.
const OP_NAME2_SRC = '[A-ZÁÂÃÀÉÊÍÓÔÕÚÜÇ][a-záâãàéêíóôõúüç]+';
const OP_RE_NAME_FULL = new RegExp('^' + OP_NAME_SRC + '$');
const OP_RE_LOWER_FULL = /^[a-záâãàéêíóôõúüç]{3,}$/;
// título (opcionalmente com ponto) seguido de 1 a 4 nomes ligados por vírgula/"e"
const OP_SEQ_SRC = '((?:' + OP_NAME2_SRC + ')(?:\\s*(?:,|\\se\\s)\\s*(?:' + OP_TIT_SRC + ')?\\.?\\s*(?:' + OP_NAME2_SRC + ')){0,3})';
const OP_RE_TITNAME = new RegExp(
  '\\b(' + OP_ABBR_SRC + ')\\b\\.?\\s*' + OP_SEQ_SRC
  + '|\\b(' + OP_FULL_SRC + ')\\b\\s+' + OP_SEQ_SRC, 'g');

// Palavras que começam com maiúscula na base mas NÃO são nome de pessoa.
const OP_NAO_NOME = new Set(('mandic avida whats app zap ipad iphone google excel word pdf link site '
  + 'triagem modulo modulos aula aulas professor professora professores professoras preceptor preceptora '
  + 'preceptores doutor doutora doutores doutoras prof profa profs docente docentes doc '
  + 'dr dra drs dras sr sra srs sras '
  + 'consolacao campinas brasilia online unidade unidades faculdade leopoldo sao coordenacao coordenador '
  + 'coordenadora secretaria concierge recepcao instituicao curso cursos turma turmas alunos aluna alunas '
  + 'dermatologia dermato oftalmologia psiquiatria endocrinologia tricologia nutrologia neuropediatria '
  + 'pediatria clinica clinico estetica estetico esteticas pacientes paciente medico medica medicos medicas '
  + 'diabetes hipopituitarismo tireoide obesidade alopecia alopecias capilares capilar dermatoses cosmiatria '
  + 'toxina botulinica laser lasers peeling peelings harmonizacao preenchimento microagulhamento '
  + 'bioestimulador colageno seringa seringas insumos corticoide tricoscopia ledterapia ambulatorio '
  + 'alimentacao alimentacoes comida almoco lanche cafe coffee buffet cardapio hotelaria estacionamento '
  + 'plataforma cronograma didatica conteudo material materiais equipamento equipamentos '
  + 'adorei amei odiei gostei gostaria queria quero acredito acho achei sugiro sugerimos reforco reitero '
  + 'entretanto ademais porem entao enfim talvez inclusive apesar agora ainda antes depois hoje ontem '
  + 'amanha primeiramente segundo terceiro infelizmente felizmente realmente simplesmente somente apenas '
  + 'sugestao sugestoes melhoria melhorias parabens obrigada obrigado favor ola alem outro outra outros '
  + 'outras esse essa esses essas isso este esta muito mais menos tudo todos todas nada nunca sempre '
  + 'quanto sobre como quando onde porque pois mas nao sim uma outrossim tivemos estamos estou foram '
  + 'melhorar precisamos podemos poderia seria fico faltou falta teve houve nesse nessa neste nesta '
  + 'janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro '
  + 'segunda terca quarta quinta sexta sabado domingo pos graduacao teste testes saida saidas entrada').split(/\s+/));

function opNorm(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

let _opGaz = null;
function opGazetteer() {
  if (_opGaz) return _opGaz;
  const lowerCount = Object.create(null);
  const capCount = Object.create(null);
  const tituloTokens = Object.create(null);
  const roster = [];

  DATA_FEEDBACK.forEach(r => {
    const txt = r.feedback || '';
    // Tokeniza de verdade: \b do JS não funciona com acentuadas (á não é \w),
    // e um match solto de minúsculas casaria "gny" dentro de "Agny".
    txt.split(/[^A-Za-zÀ-ÿ]+/).forEach(w => {
      if (!w) return;
      if (OP_RE_LOWER_FULL.test(w)) lowerCount[w] = (lowerCount[w] || 0) + 1;
      else if (OP_RE_NAME_FULL.test(w)) capCount[w] = (capCount[w] || 0) + 1;
    });
    OP_RE_TITNAME.lastIndex = 0;
    let m;
    while ((m = OP_RE_TITNAME.exec(txt)) !== null) {
      const toks = ((m[2] || '') + ' ' + (m[4] || '')).match(OP_RE_NAME);
      if (toks) toks.forEach(w => { tituloTokens[w] = (tituloTokens[w] || 0) + 1; });
      if (OP_RE_TITNAME.lastIndex === m.index) OP_RE_TITNAME.lastIndex++;
    }
    const nm = (r.nome || '').match(/[A-Za-zÀ-ÿ]{3,}/g);
    if (nm) nm.forEach(w => roster.push(w));
  });

  const comuns = new Set();
  const muitoComuns = new Set();
  Object.keys(lowerCount).forEach(w => {
    if (lowerCount[w] >= 3) comuns.add(opNorm(w));
    if (lowerCount[w] >= 8) muitoComuns.add(opNorm(w));
  });

  const nomes = new Set();
  const add = (tok, trusted) => {
    const n = opNorm(tok);
    if (n.length < 3 || OP_NAO_NOME.has(n)) return;
    if (!trusted && comuns.has(n)) return;
    nomes.add(n);
  };
  // A — nomes colados a um título ("Dra Agny", "professor Thales"). Fonte
  // confiável: o que vem depois de "Dra"/"professor" é nome. Sem trusted, um
  // nome que por acaso apareça em minúscula na base (agny, 3×) escaparia.
  Object.keys(tituloTokens).forEach(w => add(w, true));
  // B — tokens do cadastro de respondentes (nomes brasileiros reais). NÃO é
  // fonte confiável: sobrenomes brasileiros coincidem com palavras comuns
  // (Dias, Luz, Leite, Faria, Branco, Quadros) e o campo nome às vezes vem
  // sujo. Sem o crivo de palavra-comum, "Até o momento" virava "[nome omitido]
  // o momento". Nomes de professores que só aparecem aqui e em minúscula na
  // base ficam por conta das fontes A e D.
  // Crivo extra: o token não pode aparecer NENHUMA vez como palavra minúscula na
  // base. Sobrenomes brasileiros coincidem com substantivos (Luz, Faria, Branco,
  // Laranja, Quadros) e redigi-los estragaria o texto.
  roster.forEach(w => { if (!(lowerCount[w.toLowerCase()] > 0)) add(w, false); });
  // C — capitalizados frequentes que praticamente nunca aparecem em minúscula
  Object.keys(capCount).forEach(w => {
    if (capCount[w] >= 3 && (lowerCount[w.toLowerCase()] || 0) <= 1) add(w, false);
  });

  // D — token de qualquer caixa logo depois de um título ("dra Flávia volpon",
  // "doc nati e fla"). Só entra se for curto (<=4) ou se a mesma palavra
  // aparecer capitalizada em algum lugar da base — sem esse crivo, 34 palavras
  // comuns ("qualificados", "auxiliando") entrariam junto.
  const anySeq = '((?:' + OP_ANY_SRC + ')(?:\\s*(?:,|\\se\\s)\\s*(?:' + OP_TIT_SRC + ')?\\.?\\s*(?:' + OP_ANY_SRC + ')){0,3})';
  const RE_D = new RegExp('\\b(?:' + OP_ABBR_SRC + ')\\b\\.?\\s*' + anySeq
    + '|\\b(?:' + OP_FULL_SRC + ')\\b\\s+' + anySeq, 'g');
  const capNorm = Object.create(null);
  Object.keys(capCount).forEach(w => { const n = opNorm(w); capNorm[n] = (capNorm[n] || 0) + capCount[w]; });
  DATA_FEEDBACK.forEach(r => {
    RE_D.lastIndex = 0;
    let m;
    while ((m = RE_D.exec(r.feedback || '')) !== null) {
      const toks = ((m[1] || '') + ' ' + (m[2] || '')).match(new RegExp(OP_ANY_SRC, 'g'));
      if (toks) toks.forEach(w => {
        const n = opNorm(w);
        if (n.length <= 4 || (capNorm[n] || 0) >= 1) add(w, false);
      });
      if (RE_D.lastIndex === m.index) RE_D.lastIndex++;
    }
  });

  _opGaz = { nomes, comuns, muitoComuns, capNorm };
  return _opGaz;
}

function opRedigeNomes(text) {
  if (!text) return '';
  const g = opGazetteer();
  let out = String(text).replace(OP_RE_TITNAME,
    (m, ab, abSeq, fu, fuSeq) => (ab || fu) + ' ' + OP_NOME_PH);
  out = out.replace(OP_RE_NAME, w => (g.nomes.has(opNorm(w)) ? OP_NOME_PH : w));
  // nomes escritos em CAIXA ALTA ("Dra FLAVIA VOLPON"). Caixa alta também é
  // usada para ênfase ("MUITO", "POR FAVOR"), por isso só troca o que já está
  // na lista de nomes.
  out = out.replace(new RegExp(OP_CAPS_SRC, 'g'),
    w => (g.nomes.has(opNorm(w)) ? OP_NOME_PH : w));
  // Nomes escritos em minúscula pelo próprio aluno ("professora tallita",
  // "elogios à cris", "aulas gravadas com o professor rodrigo"). Só atinge
  // tokens que já estão na lista de nomes, e a lista exclui por construção
  // qualquer palavra que apareça em minúscula como palavra comum na base —
  // medido: 20 tokens distintos, 24 ocorrências, todos nomes de pessoa.
  out = out.replace(/(^|[^A-Za-zÀ-ÿ])([a-záâãàéêíóôõúüç]{3,})(?![A-Za-zÀ-ÿ])/g,
    (m, pre, tok) => (g.nomes.has(opNorm(tok)) ? pre + OP_NOME_PH : m));
  // sobrenome imediatamente após um nome já omitido (não engole palavra comum)
  const reSobrenome = new RegExp('\\[nome omitido\\]\\s+(' + OP_SOBRE_SRC + ')', 'g');
  // Aqui o crivo é 'muito comum' (>=8), não 'comum' (>=3): grudado num nome já
  // omitido, um token raro é quase sempre sobrenome. Com o crivo de 3, "volpon"
  // (3 ocorrências em minúscula) sobrevivia em "Dra Flávia Volpon".
  for (let i = 0; i < 2; i++) {
    out = out.replace(reSobrenome, (m, tok) => {
      const n = opNorm(tok);
      return (g.muitoComuns.has(n) || OP_NAO_NOME.has(n)) ? m : OP_NOME_PH;
    });
  }
  // sobrenome/segundo nome em minúscula logo após um nome já omitido
  // ("Dra [nome omitido] volpon", "[nome omitido] e nathalia"): exige ser raro
  // E aparecer capitalizado em outro ponto da base.
  const reMin = /\[nome omitido\](\s*(?:,|e)?\s+)([a-záâãàéêíóôõúüç]{3,})/g;
  for (let i = 0; i < 2; i++) {
    out = out.replace(reMin, (m, sep, tok) => {
      const n = opNorm(tok);
      if (g.muitoComuns.has(n) || OP_NAO_NOME.has(n)) return m;
      return ((g.capNorm[n] || 0) >= 1 || g.nomes.has(n)) ? OP_NOME_PH : m;
    });
  }
  // placeholders em sequência viram um só
  out = out.replace(/(\[nome omitido\])(\s*(?:,|e)?\s*\[nome omitido\])+/g, OP_NOME_PH);
  return out;
}

function opModulosList() {
  return [...new Set(DATA_GERAL.map(r => (r.disciplina || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function populateOnepageFilters() {
  const sel = document.getElementById('op-f-modulo');
  if (!sel) return;
  const mods = opModulosList();
  const existing = [...sel.options].slice(1).map(o => o.value).join('|');
  if (existing !== mods.join('|')) {
    while (sel.options.length > 1) sel.remove(1);
    mods.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; sel.appendChild(o); });
  }
  if (sel.value !== (onepageFilters.modulo || '')) sel.value = onepageFilters.modulo || '';
  if (!sel._wired) {
    sel.addEventListener('change', e => { onepageFilters.modulo = e.target.value; renderAll(); });
    sel._wired = true;
  }
}

function clearOnepageModulo() {
  onepageFilters.modulo = '';
  const s = document.getElementById('op-f-modulo');
  if (s) s.value = '';
  renderAll();
}

// Espelha applyFilters() e acrescenta o módulo. ignoreUnidade=true serve ao
// bloco "todas as unidades", que precisa comparar as 4 unidades entre si.
function opFilterGeral(opts) {
  opts = opts || {};
  const uni = opts.ignoreUnidade ? '' : F.unidade;
  return DATA_GERAL.filter(r => {
    if (uni && r.unidade_calc !== uni) return false;
    if (F.ano && String(r.ano_resposta) !== String(F.ano)) return false;
    if (F.mes.length > 0 && !F.mes.includes(r.mes_label)) return false;
    if (F.hab && r.habilitacao !== F.hab) return false;
    if (F.diturma && r.di_turma !== F.diturma) return false;
    if (F.semana && r.semana_key !== F.semana) return false;
    if (onepageFilters.modulo && (r.disciplina || '').trim() !== onepageFilters.modulo) return false;
    return true;
  }).map(r => {
    const nota = computeNotaEfetiva(r);
    return Object.assign({}, r, { nota_geral: nota, classificacao: classifyEfetiva(nota) });
  });
}

function onepageBase() {
  const fd = opFilterGeral();
  const ids = new Set(fd.map(r => r['db-id']));
  const notaMap = {};
  fd.forEach(r => { notaMap[r['db-id']] = r.nota_geral; });
  const fi = DATA_ITENS.filter(r => ids.has(r['db-id']));
  const fb = DATA_FEEDBACK
    .filter(r => ids.has(r.db_id))
    .map(r => Object.assign({}, r, { nota: notaMap[r.db_id] != null ? notaMap[r.db_id] : r.nota }));
  const fdAllU = opFilterGeral({ ignoreUnidade: true });
  const idsAllU = new Set(fdAllU.map(r => r['db-id']));
  const fiAllU = DATA_ITENS.filter(r => idsAllU.has(r['db-id']));
  return { fd, fi, fb, fdAllU, fiAllU };
}

function opStats(rows) {
  const n = rows.length;
  if (!n) return { n: 0, media: null, nps: null, prom: 0, neu: 0, det: 0 };
  const media = rows.reduce((a, r) => a + r.nota_geral, 0) / n;
  const prom = rows.filter(r => r.classificacao === 'Promotor').length;
  const det = rows.filter(r => r.classificacao === 'Detrator').length;
  return { n, media, nps: Math.round((prom - det) / n * 100), prom, neu: n - prom - det, det };
}

function opItemAvg(itensRows, tipo) {
  const v = itensRows.filter(r => r.tipo_avaliacao === tipo).map(r => r.nota);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function opDelta(cur, ref) {
  if (cur == null || ref == null) return '';
  const d = cur - ref;
  if (Math.abs(d) < 0.005) return '<span style="font-size:11px;color:var(--muted)">=</span>';
  const col = d > 0 ? 'var(--good)' : 'var(--bad)';
  const arr = d > 0 ? '▲' : '▼';
  return '<span style="font-size:11px;font-weight:700;color:' + col + '">' + arr + ' ' + fmt(Math.abs(d)) + '</span>';
}

// ── Recorte ativo, em chips, para a página nunca ser lida fora de contexto ──
function opRecorteChips() {
  const chips = [];
  const add = (lbl, val) => chips.push(
    '<span style="background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:11px;font-weight:600;padding:3px 10px;border-radius:12px">'
    + lbl + ': ' + val + '</span>');
  if (F.unidade) add('Unidade', F.unidade);
  if (F.hab) add('Especialidade', F.hab);
  if (F.ano) add('Ano', F.ano);
  if (F.mes && F.mes.length) add('Mês', F.mes.join(', '));
  if (F.diturma) add('Turma', F.diturma);
  if (F.semana) add('Semana', F.semana);
  if (F.itens && F.itens.length) add('Nota por itens', F.itens.join(', '));
  if (onepageFilters.modulo) add('Módulo', onepageFilters.modulo);
  if (!chips.length) chips.push(
    '<span style="background:#f1f5f9;border:1px solid var(--border);color:var(--muted);font-size:11px;font-weight:600;padding:3px 10px;border-radius:12px">Base completa — nenhum filtro aplicado</span>');
  return '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' + chips.join('') + '</div>';
}

// ── 1. Visão geral do resultado ────────────────────────────────────────────
function buildOnepageVisaoGeral(fd) {
  const st = opStats(fd);
  const stBase = opStats(DATA_GERAL.map(r => Object.assign({}, r)));
  if (!st.n) {
    return '<div class="cbox full" style="text-align:center;padding:40px 20px;color:var(--muted)">'
      + '<div style="font-size:15px;font-weight:600;margin-bottom:6px">Nenhuma resposta neste recorte</div>'
      + '<div style="font-size:12px">Ajuste os filtros do topo ou o módulo selecionado acima.</div></div>';
  }
  const turmas = new Set(fd.map(r => r.di_turma)).size;
  const modulos = new Set(fd.map(r => (r.disciplina || '').trim()).filter(Boolean)).size;
  const pPct = st.n ? (st.prom / st.n * 100) : 0;
  const dPct = st.n ? (st.det / st.n * 100) : 0;
  const notaColor = st.media >= 8 ? 'c-good' : st.media >= 7 ? 'c-warn' : 'c-bad';
  const npsColor = st.nps >= 50 ? 'c-good' : st.nps >= 0 ? 'c-warn' : 'c-bad';
  const cards = `
    <div class="cards-row" style="margin-bottom:14px">
      <div class="card"><div class="card-lbl">Respostas</div>
        <div class="card-val">${st.n}</div>
        <div class="card-sub">${turmas} turma${turmas === 1 ? '' : 's'} · ${modulos} módulo${modulos === 1 ? '' : 's'}</div></div>
      <div class="card ${notaColor}"><div class="card-lbl">Nota média (0–10)</div>
        <div class="card-val">${fmt(st.media)}</div>
        <div class="card-sub">vs base completa ${fmt(stBase.media)} &nbsp;${opDelta(st.media, stBase.media)}</div></div>
      <div class="card ${npsColor}"><div class="card-lbl">NPS</div>
        <div class="card-val">${st.nps}</div>
        <div class="card-sub">base completa ${stBase.nps}</div></div>
      <div class="card c-good"><div class="card-lbl">Promotores</div>
        <div class="card-val">${pPct.toFixed(0)}%</div>
        <div class="card-sub">${st.prom} de ${st.n}</div></div>
      <div class="card c-bad"><div class="card-lbl">Detratores</div>
        <div class="card-val">${dPct.toFixed(0)}%</div>
        <div class="card-sub">${st.det} de ${st.n} · ${st.neu} neutros</div></div>
    </div>`;
  const charts = `
    <div class="charts-row">
      <div class="cbox" style="flex:2;min-width:340px"><h3>Evolução mensal do recorte</h3>
        <div class="cwrap"><canvas id="op-ch-evol"></canvas></div></div>
      <div class="cbox" style="flex:1;min-width:240px"><h3>Distribuição das respostas</h3>
        <div class="cwrap"><canvas id="op-ch-dist"></canvas></div></div>
    </div>`;
  return cards + charts;
}

function onepageEvolChart(canvasId, fd) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || !fd.length) return;
  const byMes = {};
  fd.forEach(r => {
    if (!byMes[r.mes_order]) byMes[r.mes_order] = [];
    byMes[r.mes_order].push(r.nota_geral);
  });
  const seq = OP_MES_SEQ.filter(m => byMes[m] && byMes[m].length);
  const labels = seq.map(m => OP_MES_LABEL[m] || String(m));
  const notas = seq.map(m => byMes[m].reduce((a, b) => a + b, 0) / byMes[m].length);
  const qtds = seq.map(m => byMes[m].length);
  CHARTS[canvasId] = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        { type: 'bar', label: 'Respostas', data: qtds, backgroundColor: '#cbd5e1', borderRadius: 3, yAxisID: 'y1', order: 2 },
        { type: 'line', label: 'Nota média', data: notas, borderColor: '#01559B', backgroundColor: '#01559B',
          borderWidth: 2.5, pointRadius: 3.5, tension: .25, yAxisID: 'y', order: 1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, clip: false,
      layout: { padding: { top: 20, bottom: 6 } },
      plugins: { legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle', boxWidth: 10, boxHeight: 10 } } },
      scales: {
        y: { position: 'left', suggestedMin: 0, suggestedMax: 10, ticks: { callback: v => v.toFixed(1) }, grid: { color: '#f0f0f0' } },
        y1: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { precision: 0 } },
        x: { grid: { display: false } }
      }
    },
    plugins: [{
      id: 'opEvolLabels',
      afterDatasetsDraw(chart) {
        try {
          const c = chart.ctx;
          const meta = chart.getDatasetMeta(1);
          if (!c || !meta || !meta.data) return;
          const vals = (chart.data && chart.data.datasets && chart.data.datasets[1]) ? chart.data.datasets[1].data : [];
          c.save();
          c.font = '700 11px sans-serif';
          c.fillStyle = '#01559B';
          c.textAlign = 'center';
          c.textBaseline = 'bottom';
          meta.data.forEach((el, i) => {
            const v = vals[i];
            if (el == null || v == null) return;
            c.fillText(v.toFixed(2).replace('.', ','), el.x, el.y - 6);
          });
          c.restore();
        } catch (e) { /* rótulo é decorativo */ }
      }
    }]
  });
}

function onepageDistChart(canvasId, fd) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || !fd.length) return;
  const st = opStats(fd);
  CHARTS[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Promotores (9–10)', 'Neutros (7–8)', 'Detratores (1–6)'],
      datasets: [{ data: [st.prom, st.neu, st.det], backgroundColor: ['#16a34a', '#d97706', '#dc2626'], borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle', boxWidth: 9, boxHeight: 9 } } }
    }
  });
}

// ── 2. Avaliação consolidada dos itens específicos ─────────────────────────
function buildOnepageItensBlock(fi, fiAllU) {
  const tiles = OP_TIPOS.map(t => {
    const v = opItemAvg(fi, t);
    const ref = opItemAvg(DATA_ITENS, t);
    const cls = v == null ? '' : (v >= 4 ? 'c-good' : v >= 3.5 ? 'c-warn' : 'c-bad');
    return `<div class="card ${cls}" style="min-width:130px">
      <div class="card-lbl">${t}</div>
      <div class="card-val" style="font-size:26px">${v == null ? '—' : fmt(v)}</div>
      <div class="card-sub">histórico ${ref == null ? '—' : fmt(ref)} &nbsp;${opDelta(v, ref)}</div></div>`;
  }).join('');

  const units = ['BRASÍLIA', 'CAMPINAS', 'CONSOLAÇÃO', 'ONLINE'];
  const perUnit = {};
  units.forEach(u => {
    const ids = new Set(DATA_GERAL.filter(r => r.unidade_calc === u).map(r => r['db-id']));
    perUnit[u] = fiAllU.filter(r => ids.has(r['db-id']));
  });
  const consAllU = OP_TIPOS.map(t => opItemAvg(fiAllU, t));

  const rows = OP_TIPOS.map((t, i) => {
    const cons = consAllU[i];
    const tds = units.map(u => {
      const v = opItemAvg(perUnit[u], t);
      const col = v == null ? 'var(--muted)' : (v >= 4 ? 'var(--good)' : v >= 3.5 ? 'var(--warn)' : 'var(--bad)');
      return `<td style="text-align:center;font-weight:700;color:${col}">${v == null ? '—' : fmt(v)}</td>`;
    }).join('');
    const n = fiAllU.filter(r => r.tipo_avaliacao === t).length;
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="font-weight:600;color:var(--navy)">${t}</td>
      <td style="text-align:center;font-weight:800;color:var(--navy)">${cons == null ? '—' : fmt(cons)}</td>
      ${tds}
      <td style="text-align:center;color:var(--muted);font-size:12px">${n}</td></tr>`;
  }).join('');

  const ths = units.map(u => `<th style="text-align:center;color:${UCOL[u]}">${u}</th>`).join('');
  const uniNote = F.unidade
    ? `<div style="font-size:11px;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin-bottom:10px">
         Os <b>quadros acima</b> seguem o filtro de unidade ativo (<b>${F.unidade}</b>). A <b>tabela e o gráfico abaixo</b> ignoram esse filtro de propósito, para manter a comparação entre as quatro unidades.</div>`
    : '';

  return `<div class="cbox full" style="margin-bottom:20px">
    <h3>Avaliação consolidada dos itens específicos <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--muted)">— escala 1–5 · todas as unidades</span></h3>
    <div class="cards-row" style="margin-bottom:16px">${tiles}</div>
    ${uniNote}
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
      <div style="flex:1;min-width:320px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="border-bottom:2px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted)">
            <th style="text-align:left">Item</th><th style="text-align:center">Consolidado</th>${ths}<th style="text-align:center">Avaliações</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="font-size:11px;color:var(--muted);margin-top:8px">
          Verde ≥ 4,0 · amarelo 3,5–3,9 · vermelho &lt; 3,5. "Avaliações" conta as respostas individuais de cada item — Aula Online e Aula Prática somam duas perguntas por resposta.</div>
      </div>
      <div style="flex:1;min-width:320px">
        <div class="cwrap"><canvas id="op-ch-itens"></canvas></div>
      </div>
    </div>
  </div>`;
}

function onepageItensChart(canvasId, fiAllU) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || !fiAllU.length) return;
  const units = ['BRASÍLIA', 'CAMPINAS', 'CONSOLAÇÃO', 'ONLINE'];
  const datasets = units.map(u => {
    const ids = new Set(DATA_GERAL.filter(r => r.unidade_calc === u).map(r => r['db-id']));
    const rows = fiAllU.filter(r => ids.has(r['db-id']));
    return { label: u, data: OP_TIPOS.map(t => opItemAvg(rows, t)), backgroundColor: UCOL[u] + 'bb', borderRadius: 3 };
  }).filter(d => d.data.some(v => v != null));
  CHARTS[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: { labels: OP_TIPOS, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { font: { size: 10 }, usePointStyle: true, pointStyle: 'circle', boxWidth: 9, boxHeight: 9 } } },
      scales: {
        y: { suggestedMin: 0, suggestedMax: 5, ticks: { callback: v => v.toFixed(1) }, grid: { color: '#f0f0f0' } },
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 40, minRotation: 0 } }
      }
    }
  });
}

// ── 3. Pontos de atenção (positivos e negativos) ───────────────────────────
function opRankBy(fd, keyFn, minN) {
  const map = {};
  fd.forEach(r => {
    const k = keyFn(r);
    if (!k) return;
    if (!map[k]) map[k] = [];
    map[k].push(r.nota_geral);
  });
  return Object.entries(map)
    .map(([k, v]) => ({ key: k, media: v.reduce((a, b) => a + b, 0) / v.length, total: v.length }))
    .filter(e => e.total >= minN)
    .sort((a, b) => a.media - b.media);
}

function opTemaCounts(analyzed, sentiment) {
  const c = {};
  analyzed.filter(r => r.sentiment === sentiment).forEach(r => {
    r.temas.forEach(t => { c[t] = (c[t] || 0) + 1; });
  });
  return Object.entries(c).map(([tema, n]) => ({ tema, n })).sort((a, b) => b.n - a.n);
}

function opBulletList(items, color) {
  if (!items.length) return '<div style="font-size:12px;color:var(--muted);padding:4px 0">Nada a destacar neste recorte.</div>';
  return '<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.65;color:var(--text)">'
    + items.map(i => '<li style="margin-bottom:5px"><b style="color:' + color + '">' + i.h + '</b>' + (i.s ? ' <span style="color:var(--muted);font-size:12px">' + i.s + '</span>' : '') + '</li>').join('')
    + '</ul>';
}

function buildOnepagePontosAtencao(fd, fb) {
  if (!fd.length) return '';
  const analyzed = fb.map(r => Object.assign({}, r, analyzeComment(r)));
  const negT = opTemaCounts(analyzed, 'neg');
  const posT = opTemaCounts(analyzed, 'pos');

  const turmas = opRankBy(fd, r => r.di_turma, 3);
  const modulos = opRankBy(fd, r => (r.disciplina || '').trim(), 3);

  const fdIds = new Set(fd.map(r => r['db-id']));
  const fiLocal = DATA_ITENS.filter(r => fdIds.has(r['db-id']));
  const itensV = OP_TIPOS.map(t => ({ t, v: opItemAvg(fiLocal, t) })).filter(x => x.v != null).sort((a, b) => a.v - b.v);

  const negItems = [];
  itensV.filter(x => x.v < 4).slice(0, 3).forEach(x =>
    negItems.push({ h: x.t + ' em ' + fmt(x.v) + '/5', s: '— item abaixo de 4,0' }));
  turmas.filter(e => e.media < 7).slice(0, 3).forEach(e =>
    negItems.push({ h: e.key + ' — ' + fmt(e.media), s: '(' + e.total + ' respostas)' }));
  modulos.filter(e => e.media < 7).slice(0, 3).forEach(e =>
    negItems.push({ h: 'Módulo ' + e.key + ' — ' + fmt(e.media), s: '(' + e.total + ' respostas)' }));
  negT.slice(0, 3).forEach(x =>
    negItems.push({ h: (OP_TEMA_LABEL[x.tema] || x.tema) + ': ' + x.n + (x.n === 1 ? ' menção negativa' : ' menções negativas'), s: 'nos comentários' }));

  const posItems = [];
  itensV.slice().reverse().filter(x => x.v >= 4.5).slice(0, 3).forEach(x =>
    posItems.push({ h: x.t + ' em ' + fmt(x.v) + '/5', s: '— item acima de 4,5' }));
  turmas.slice().reverse().filter(e => e.media >= 9).slice(0, 3).forEach(e =>
    posItems.push({ h: e.key + ' — ' + fmt(e.media), s: '(' + e.total + ' respostas)' }));
  modulos.slice().reverse().filter(e => e.media >= 9).slice(0, 3).forEach(e =>
    posItems.push({ h: 'Módulo ' + e.key + ' — ' + fmt(e.media), s: '(' + e.total + ' respostas)' }));
  posT.slice(0, 3).forEach(x =>
    posItems.push({ h: (OP_TEMA_LABEL[x.tema] || x.tema) + ': ' + x.n + (x.n === 1 ? ' elogio' : ' elogios'), s: 'nos comentários' }));

  const fbNote = 'números do recorte · os comentários vêm no bloco seguinte';

  return `<div class="cbox full" style="margin-bottom:20px">
    <h3>Principais pontos de atenção <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--muted)">— ${fbNote}</span></h3>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:320px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:14px 16px">
        <div style="font-size:12px;font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">⚠️ Negativos — o que puxa a nota para baixo</div>
        ${opBulletList(negItems, '#b91c1c')}
      </div>
      <div style="flex:1;min-width:320px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px 16px">
        <div style="font-size:12px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">✅ Positivos — o que sustenta a nota</div>
        ${opBulletList(posItems, '#15803d')}
      </div>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:10px">
      Turmas e módulos entram na lista com pelo menos 3 respostas no recorte. A classificação de sentimento combina a nota (9–10 promotor · 7–8 neutro · 1–6 detrator) com a análise do texto, mesma regra da aba Análise de Comentários.</div>
  </div>`;
}

// ── 4 e 5. Resumo dos comentários e boas práticas ───────────────────────────
// ── Citação enxuta, já sem nomes, para o documento do professor ─────────────
function opQuote(r, tipo) {
  const bg = tipo === 'pos' ? '#f0fdf4' : tipo === 'neg' ? '#fef2f2' : '#f8fafc';
  const bd = tipo === 'pos' ? '#86efac' : tipo === 'neg' ? '#fca5a5' : '#e2e8f0';
  const txt = opRedigeNomes(String(r.feedback || '').replace(/\s+/g, ' ').trim());
  const curto = txt.length > 320 ? txt.slice(0, 320) + '…' : txt;
  const nota = r.nota != null
    ? '<span style="font-size:10px;background:#e5e7eb;padding:1px 7px;border-radius:8px;font-weight:700">nota ' + fmt(r.nota) + '</span>' : '';
  const mod = r.disciplina
    ? '<span style="font-size:10px;color:var(--muted)">' + String(r.disciplina).trim().slice(0, 60) + '</span>' : '';
  return '<div style="background:' + bg + ';border:1px solid ' + bd + ';border-radius:8px;padding:9px 12px;margin-bottom:7px;font-size:12.5px;line-height:1.6">'
    + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;flex-wrap:wrap">'
    + '<span style="font-size:10px;background:#dbeafe;color:#1e3a8a;padding:1px 7px;border-radius:8px;font-weight:700">' + (r.di_turma || '') + '</span>'
    + nota + mod
    + '<span style="font-size:10px;color:var(--muted);margin-left:auto">' + (r.mes_label || '') + '</span></div>'
    + '<div style="font-style:italic">"' + curto + '"</div></div>';
}

function opChips(items, cor, bgc) {
  if (!items.length) return '';
  return '<div style="display:flex;gap:5px;flex-wrap:wrap;margin:4px 0 8px">'
    + items.map(i => '<span style="background:' + bgc + ';color:' + cor + ';font-size:11px;font-weight:600;padding:2px 9px;border-radius:10px">' + i + '</span>').join('')
    + '</div>';
}

// ── Resumo do que a turma está comentando ───────────────────────────────────
function buildOnepageResumoComentarios(fd, fb) {
  if (!fd.length) return '';
  const analyzed = fb.map(r => Object.assign({}, r, analyzeComment(r)));
  const nPos = analyzed.filter(r => r.sentiment === 'pos').length;
  const nNeg = analyzed.filter(r => r.sentiment === 'neg').length;
  const nNeu = analyzed.length - nPos - nNeg;

  if (!analyzed.length) {
    return '<div class="cbox full" style="margin-bottom:20px"><h3>O que a turma está comentando</h3>'
      + '<div style="font-size:13px;color:var(--muted)">Nenhum comentário escrito neste recorte — as ' + fd.length
      + ' resposta(s) trouxeram apenas as notas.</div></div>';
  }

  // agrupa por tema
  const porTema = {};
  analyzed.forEach(r => {
    const ts = r.temas.length ? r.temas : ['Geral'];
    ts.forEach(t => {
      if (!porTema[t]) porTema[t] = { pos: [], neg: [], neu: [] };
      porTema[t][r.sentiment].push(r);
    });
  });
  const temas = Object.entries(porTema)
    .map(([tema, d]) => ({ tema, ...d, total: d.pos.length + d.neg.length + d.neu.length }))
    .sort((a, b) => (a.tema === 'Geral' ? 1 : b.tema === 'Geral' ? -1 : b.total - a.total));

  // frase-síntese
  const top3 = temas.filter(t => t.tema !== 'Geral').slice(0, 3);
  const tomPct = Math.round(nPos / analyzed.length * 100);
  const tom = tomPct >= 60 ? 'predominantemente positivo' : tomPct >= 35 ? 'dividido' : 'predominantemente crítico';
  const problemasGerais = detectProblemas(analyzed.filter(r => r.sentiment === 'neg'), 'Geral')
    .concat(temas.filter(t => t.neg.length).flatMap(t => detectProblemas(t.neg, t.tema)));
  const agg = {};
  problemasGerais.forEach(p => { agg[p.prob] = (agg[p.prob] || 0) + p.count; });
  const topProb = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
  const sintese = 'Nos <b>' + analyzed.length + ' comentário' + (analyzed.length === 1 ? '' : 's') + '</b> deste recorte'
    + (top3.length ? ', os assuntos mais citados são <b>' + top3.map(t => (OP_TEMA_LABEL[t.tema] || t.tema) + ' (' + t.total + ')').join('</b>, <b>') + '</b>' : '')
    + '. O tom é <b>' + tom + '</b> (' + tomPct + '% dos comentários são elogios).'
    + (topProb.length ? ' As críticas se concentram em <b>' + topProb.join('</b>, <b>') + '</b>.' : '');

  // Um comentário longo dispara vários temas. Sem controle, o MESMO texto
  // aparecia em 5 cartões seguidos e o documento ficava ilegível.
  const usados = new Set();
  const pega = (rows, tipo, max) => {
    const ord = tipo === 'pos'
      ? rows.slice().sort((a, b) => (b.score || 0) - (a.score || 0))
      : rows.slice().sort((a, b) => a.nota - b.nota);
    const out = [];
    for (const r of ord) {
      if (out.length >= max) break;
      if (usados.has(r.db_id)) continue;
      usados.add(r.db_id);
      out.push(opQuote(r, tipo));
    }
    return out.join('');
  };
  const cards = temas.slice(0, 7).map(t => {
    const label = (TEMA_ICONS[t.tema] ? TEMA_ICONS[t.tema] + ' ' : '') + (OP_TEMA_LABEL[t.tema] || (t.tema === 'Geral' ? 'Vários assuntos no mesmo comentário' : t.tema));
    const probs = t.neg.length ? detectProblemas(t.neg, t.tema).slice(0, 4) : [];
    const chips = opChips(probs.map(p => p.prob + ' (' + p.count + ')'), '#b91c1c', '#fee2e2');
    const posQ = pega(t.pos, 'pos', 2);
    const negQ = pega(t.neg, 'neg', 2);
    const semNovo = (!posQ && !negQ)
      ? '<div style="font-size:12px;color:var(--muted)">Este assunto aparece dentro de comentários já citados nos blocos acima.</div>' : '';
    return '<div style="border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:12px">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">'
      + '<span style="font-size:14px;font-weight:700;color:var(--navy)">' + label + '</span>'
      + '<span style="font-size:11px;font-weight:600;background:#e5e7eb;color:#374151;padding:2px 9px;border-radius:10px">' + t.total + (t.total === 1 ? ' menção' : ' menções') + '</span>'
      + (t.pos.length ? '<span style="font-size:11px;font-weight:600;color:#15803d">' + t.pos.length + ' elogio' + (t.pos.length === 1 ? '' : 's') + '</span>' : '')
      + (t.neg.length ? '<span style="font-size:11px;font-weight:600;color:#b91c1c">' + t.neg.length + ' crítica' + (t.neg.length === 1 ? '' : 's') + '</span>' : '')
      + (t.neu.length ? '<span style="font-size:11px;font-weight:600;color:#a16207">' + t.neu.length + ' neutro' + (t.neu.length === 1 ? '' : 's') + '</span>' : '')
      + '</div>'
      + (probs.length ? '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Pontos citados nas críticas</div>' + chips : '')
      + semNovo
      + '<div style="display:flex;gap:12px;flex-wrap:wrap">'
      + (posQ ? '<div style="flex:1;min-width:280px">' + posQ + '</div>' : '')
      + (negQ ? '<div style="flex:1;min-width:280px">' + negQ + '</div>' : '')
      + '</div></div>';
  }).join('');

  const cobertura = fd.length ? Math.round(analyzed.length / fd.length * 100) : 0;

  return '<div class="cbox full" style="margin-bottom:20px">'
    + '<h3>O que a turma está comentando <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--muted)">— leitura de todos os ' + analyzed.length + ' comentários do recorte</span></h3>'
    + '<div style="background:#f8fafc;border-left:3px solid var(--navy);padding:10px 14px;font-size:13.5px;line-height:1.65;margin-bottom:14px">' + sintese + '</div>'
    + '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">'
    + '<div style="flex:1;min-width:120px;text-align:center;border:1px solid var(--border);border-radius:8px;padding:10px"><div style="font-size:24px;font-weight:800;color:var(--navy)">' + analyzed.length + '</div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Comentários</div><div style="font-size:10px;color:var(--muted)">' + cobertura + '% das respostas</div></div>'
    + '<div style="flex:1;min-width:120px;text-align:center;border:1px solid #86efac;border-radius:8px;padding:10px;background:#f0fdf4"><div style="font-size:24px;font-weight:800;color:#15803d">' + nPos + '</div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Elogios</div></div>'
    + '<div style="flex:1;min-width:120px;text-align:center;border:1px solid #fde68a;border-radius:8px;padding:10px;background:#fffbeb"><div style="font-size:24px;font-weight:800;color:#a16207">' + nNeu + '</div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Neutros</div></div>'
    + '<div style="flex:1;min-width:120px;text-align:center;border:1px solid #fca5a5;border-radius:8px;padding:10px;background:#fef2f2"><div style="font-size:24px;font-weight:800;color:#b91c1c">' + nNeg + '</div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Críticas</div></div>'
    + '</div>'
    + cards
    + '<div style="font-size:11px;color:var(--muted);margin-top:4px">Um comentário que fala de mais de um assunto é contado em cada um deles, por isso a soma das menções passa do total de comentários. Nomes de pessoas são removidos automaticamente.</div>'
    + '</div>';
}

// ── Boas práticas: manter + melhorar ───────────────────────────────────────
function buildOnepageBoasPraticas(fd, fb) {
  if (!fd.length) return '';
  const analyzed = fb.map(r => Object.assign({}, r, analyzeComment(r)));
  // Um elogio só conta como boa prática se o TEXTO for positivo: analyzeComment
  // marca nota>=9 como 'pos' pela nota, então uma nota 10 com crítica escrita
  // entraria aqui como acerto.
  const elogios = analyzed.filter(r => r.sentiment === 'pos' && r.score > 0);
  const criticas = analyzed.filter(r => r.sentiment === 'neg');

  const agrupa = rows => {
    const m = {};
    rows.forEach(r => {
      const ts = r.temas.length ? r.temas : ['Geral'];
      ts.forEach(t => { if (!m[t]) m[t] = []; m[t].push(r); });
    });
    return Object.entries(m).map(([tema, rs]) => ({ tema, rows: rs }))
      .sort((a, b) => (a.tema === 'Geral' ? 1 : b.tema === 'Geral' ? -1 : b.rows.length - a.rows.length));
  };

  const usadosBP = new Set();
  const bloco = (item, tipo) => {
    const label = (TEMA_ICONS[item.tema] ? TEMA_ICONS[item.tema] + ' ' : '')
      + (OP_TEMA_LABEL[item.tema] || (item.tema === 'Geral' ? 'Vários assuntos' : item.tema));
    const cor = tipo === 'pos' ? '#15803d' : '#b91c1c';
    const n = item.rows.length;
    const acao = tipo === 'pos'
      ? (OP_MANTER[item.tema] || 'Manter a prática que a turma reconheceu neste ponto e registrá-la para os próximos módulos.')
      : (OP_MELHORIA[item.tema] || 'Revisar este ponto com a turma antes do próximo módulo.');
    const probs = tipo === 'neg' ? detectProblemas(item.rows, item.tema).slice(0, 3) : [];
    const chips = opChips(probs.map(p => p.prob + ' (' + p.count + ')'), '#b91c1c', '#fee2e2');
    const ordenado = (tipo === 'pos'
      ? item.rows.slice().sort((a, b) => (b.score || 0) - (a.score || 0))
      : item.rows.slice().sort((a, b) => a.nota - b.nota))
      .filter(r => !usadosBP.has(r.db_id));
    ordenado.slice(0, 2).forEach(r => usadosBP.add(r.db_id));
    return '<div style="border-left:3px solid ' + cor + ';padding:2px 0 2px 12px;margin-bottom:14px">'
      + '<div style="font-size:13px;font-weight:700;color:' + cor + '">' + label
      + '<span style="font-size:11px;font-weight:600;background:' + (tipo === 'pos' ? '#dcfce7' : '#fee2e2') + ';color:' + cor + ';padding:1px 8px;border-radius:10px;margin-left:6px">'
      + n + (tipo === 'pos' ? (n === 1 ? ' elogio' : ' elogios') : (n === 1 ? ' crítica' : ' críticas')) + '</span></div>'
      + chips
      + ordenado.slice(0, 2).map(r => opQuote(r, tipo)).join('')
      + '<div style="font-size:12px;color:' + cor + ';margin-top:4px">→ <b>' + (tipo === 'pos' ? 'Continuar' : 'Ajustar') + ':</b> ' + acao + '</div>'
      + '</div>';
  };

  const esq = agrupa(elogios).slice(0, 4);
  const dir = agrupa(criticas).slice(0, 4);

  const esquerda = '<div style="flex:1;min-width:340px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px 16px">'
    + '<div style="font-size:12px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">✅ O que tem sido feito e precisa continuar</div>'
    + (esq.length ? esq.map(i => bloco(i, 'pos')).join('')
      : '<div style="font-size:12px;color:var(--muted);line-height:1.6">Não há elogios escritos neste recorte. Amplie o recorte — por exemplo, retire o filtro de mês ou de módulo.</div>')
    + '</div>';

  const direita = '<div style="flex:1;min-width:340px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px">'
    + '<div style="font-size:12px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">🔧 Possíveis melhorias</div>'
    + (dir.length ? dir.map(i => bloco(i, 'neg')).join('')
      : '<div style="font-size:12px;color:var(--muted);line-height:1.6">Nenhuma crítica escrita neste recorte.</div>')
    + '</div>';

  return '<div class="cbox full" style="margin-bottom:20px"><h3>Boas práticas</h3>'
    + '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">' + esquerda + direita + '</div>'
    + '<div style="font-size:11px;color:var(--muted);margin-top:10px">Os dois lados saem dos comentários deste recorte, agrupados pelos mesmos assuntos da aba Análise de Comentários. Um elogio só entra à esquerda se o texto for positivo — nota alta com crítica escrita vai para a coluna da direita.</div>'
    + '</div>';
}

// ── Orquestração ───────────────────────────────────────────────────────────
function renderOnepage() {
  populateOnepageFilters();
  const chips = document.getElementById('op-recorte');
  if (chips) chips.innerHTML = opRecorteChips();
  const base = onepageBase();
  const body = document.getElementById('op-body');
  if (!body) return;
  body.innerHTML = buildOnepageVisaoGeral(base.fd)
    + (base.fd.length ? buildOnepageItensBlock(base.fi, base.fiAllU) : '')
    + (base.fd.length ? buildOnepagePontosAtencao(base.fd, base.fb) : '')
    + (base.fd.length ? buildOnepageResumoComentarios(base.fd, base.fb) : '')
    + (base.fd.length ? buildOnepageBoasPraticas(base.fd, base.fb) : '');
  if (base.fd.length) {
    setTimeout(() => {
      safeCall(() => onepageEvolChart('op-ch-evol', base.fd), 'onepageEvolChart');
      safeCall(() => onepageDistChart('op-ch-dist', base.fd), 'onepageDistChart');
      safeCall(() => onepageItensChart('op-ch-itens', base.fiAllU), 'onepageItensChart');
    }, 40);
  }
}

async function copyOnepageToClipboard() {
  const btn = document.getElementById('op-copy-btn');
  const el = document.getElementById('op-capture');
  if (!el) return;
  const original = btn ? btn.textContent : '';
  if (btn) { btn.textContent = 'Gerando...'; btn.disabled = true; }
  try {
    if (typeof html2canvas === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    }
    if (btn) btn.style.visibility = 'hidden';
    const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2 });
    if (btn) btn.style.visibility = 'visible';
    canvas.toBlob(async (blob) => {
      let copied = false;
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          copied = true;
        }
      } catch (e) { copied = false; }
      if (copied) {
        if (btn) { btn.textContent = '✅ Copiado! Ctrl+V no PPT'; setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2500); }
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'one_page_csat.png';
        a.click();
        if (btn) { btn.textContent = 'Imagem baixada'; setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2500); }
      }
    });
  } catch (err) {
    console.error('[copyOnepageToClipboard] falhou:', err);
    if (btn) { btn.textContent = 'Erro — tente de novo'; btn.disabled = false; }
  }
}

function safeCall(fn, label) {
  try { fn(); } catch (e) { console.error('[renderAll] falha em ' + label + ':', e); }
}

function renderAll() {
  safeCall(()=>buildSemanaCheckboxes(), 'buildSemanaCheckboxes');
  const fd = applyFilters(DATA_GERAL);
  const fi = applyFiltersItens();
  const activeTab = document.querySelector('.tab-content.active')?.id?.replace('tab-','');

  // Always render geral cards (shown in geral tab & as reference)
  safeCall(()=>renderGeralCards(fd), 'renderGeralCards');

  if (activeTab === 'geral') {
    safeCall(()=>monthlyLine('ch-monthly', UNITS, fd), 'monthlyLine');
    safeCall(()=>engajamentoCombo('ch-engajamento'), 'engajamentoCombo');
    safeCall(()=>engajamentoUnidadeBar('ch-engajamento-unidade'), 'engajamentoUnidadeBar');
    safeCall(()=>engajamentoHabBar('ch-engajamento-hab'), 'engajamentoHabBar');
    safeCall(()=>evolucaoGeralCombo('ch-evolucao-geral', fd), 'evolucaoGeralCombo');
    safeCall(()=>evolucaoSemanalCombo('ch-evolucao-semanal', fd), 'evolucaoSemanalCombo');
    safeCall(()=>weeklyLineAllUnits('ch-weekly-units', fd), 'weeklyLineAllUnits');
    safeCall(()=>pieChart(fd), 'pieChart');
    safeCall(()=>geralHabBar(fd), 'geralHabBar');
    safeCall(()=>rankingCharts(fd), 'rankingCharts');
    setTimeout(()=>{
      safeCall(()=>renderItensSparkGeral('spark-geral', fi), 'renderItensSparkGeral');
      safeCall(()=>renderItensSparkUnit('spark-geral-brasilia','BRASÍLIA',fi), 'renderItensSparkUnit');
      safeCall(()=>renderItensSparkUnit('spark-geral-campinas','CAMPINAS',fi), 'renderItensSparkUnit');
      safeCall(()=>renderItensSparkUnit('spark-geral-consolacao','CONSOLAÇÃO',fi), 'renderItensSparkUnit');
      safeCall(()=>renderItensSparkUnit('spark-geral-online','ONLINE',fi), 'renderItensSparkUnit');
    }, 50);
  } else if (activeTab === 'onepage') {
    safeCall(()=>renderOnepage(), 'renderOnepage');
  } else if (activeTab === 'modulos') {
    safeCall(()=>renderModulosRanking(fd), 'renderModulosRanking');
  } else if (activeTab === 'turmas') {
    safeCall(()=>renderTurmasRanking(fd), 'renderTurmasRanking');
  } else if (activeTab === 'pacientes') {
    safeCall(()=>renderTriagemCruzamento(fd), 'renderTriagemCruzamento');
  } else if (activeTab === 'correlacoes') {
    safeCall(()=>renderCorrelacoesTab(fd), 'renderCorrelacoesTab');
  } else if (activeTab === 'brasilia') {
    safeCall(()=>renderCards('cards-brasilia','BRASÍLIA',fd,false), 'renderCards');
    safeCall(()=>monthlyLine('ch-bsb-m',['BRASÍLIA'],fd), 'monthlyLine');
    safeCall(()=>habBar('ch-bsb-h','BRASÍLIA',fd,false), 'habBar');
    setTimeout(()=>{
      safeCall(()=>evolHabChart('ch-evol-brasilia','BRASÍLIA',fd), 'evolHabChart');
      safeCall(()=>evolHabSemChart('ch-evol-sem-brasilia','BRASÍLIA',fd), 'evolHabSemChart');
      safeCall(()=>renderItensSparkUnit('spark-brasilia','BRASÍLIA',fi), 'renderItensSparkUnit');
      safeCall(()=>renderCrossAnalise('cross-analise-brasilia','BRASÍLIA',fd,fi), 'renderCrossAnalise');
      safeCall(()=>renderTurmasNeg('turmas-neg-brasilia','BRASÍLIA',fd), 'renderTurmasNeg');
    }, 50);
    
  } else if (activeTab === 'campinas') {
    safeCall(()=>renderCards('cards-campinas','CAMPINAS',fd,false), 'renderCards');
    safeCall(()=>monthlyLine('ch-cps-m',['CAMPINAS'],fd), 'monthlyLine');
    safeCall(()=>habBar('ch-cps-h','CAMPINAS',fd,false), 'habBar');
    setTimeout(()=>{
      safeCall(()=>evolHabChart('ch-evol-campinas','CAMPINAS',fd), 'evolHabChart');
      safeCall(()=>evolHabSemChart('ch-evol-sem-campinas','CAMPINAS',fd), 'evolHabSemChart');
      safeCall(()=>renderItensSparkUnit('spark-campinas','CAMPINAS',fi), 'renderItensSparkUnit');
      safeCall(()=>renderCrossAnalise('cross-analise-campinas','CAMPINAS',fd,fi), 'renderCrossAnalise');
      safeCall(()=>renderTurmasNeg('turmas-neg-campinas','CAMPINAS',fd), 'renderTurmasNeg');
    }, 50);
    
  } else if (activeTab === 'consolacao') {
    safeCall(()=>renderCards('cards-consolacao','CONSOLAÇÃO',fd,false), 'renderCards');
    safeCall(()=>monthlyLine('ch-con-m',['CONSOLAÇÃO'],fd), 'monthlyLine');
    safeCall(()=>habBar('ch-con-h','CONSOLAÇÃO',fd,false), 'habBar');
    setTimeout(()=>{
      safeCall(()=>evolHabChart('ch-evol-consolacao','CONSOLAÇÃO',fd), 'evolHabChart');
      safeCall(()=>evolHabSemChart('ch-evol-sem-consolacao','CONSOLAÇÃO',fd), 'evolHabSemChart');
      safeCall(()=>renderItensSparkUnit('spark-consolacao','CONSOLAÇÃO',fi), 'renderItensSparkUnit');
      safeCall(()=>renderCrossAnalise('cross-analise-consolacao','CONSOLAÇÃO',fd,fi), 'renderCrossAnalise');
      safeCall(()=>renderTurmasNeg('turmas-neg-consolacao','CONSOLAÇÃO',fd), 'renderTurmasNeg');
    }, 50);
    
  } else if (activeTab === 'online') {
    safeCall(()=>renderCards('cards-online','ONLINE',fd,true), 'renderCards');
    safeCall(()=>monthlyLine('ch-onl-m',['ONLINE'],fd), 'monthlyLine');
    safeCall(()=>habBar('ch-onl-h','ONLINE',fd,true), 'habBar');
    setTimeout(()=>{
      safeCall(()=>evolHabChart('ch-evol-online','ONLINE',fd), 'evolHabChart');
      safeCall(()=>evolHabSemChart('ch-evol-sem-online','ONLINE',fd), 'evolHabSemChart');
      safeCall(()=>renderItensSparkUnit('spark-online','ONLINE',fi), 'renderItensSparkUnit');
      safeCall(()=>renderCrossAnalise('cross-analise-online','ONLINE',fd,fi), 'renderCrossAnalise');
      safeCall(()=>renderTurmasNeg('turmas-neg-online','ONLINE',fd), 'renderTurmasNeg');
    }, 50);
    
  } else if (activeTab === 'comentarios') {
    safeCall(()=>renderComentariosTab(fd), 'renderComentariosTab');
  } else if (activeTab === 'analise') {
    safeCall(()=>renderAnaliseComentariosTab(fd), 'renderAnaliseComentariosTab');
  } else if (activeTab === 'consolidado') {
    safeCall(()=>renderConsolidadoTab(), 'renderConsolidadoTab');
  } else if (activeTab === 'nps') {
    safeCall(()=>renderNpsTab(), 'renderNpsTab');
  } else if (activeTab === 'resumo') {
    safeCall(()=>renderResumo(), 'renderResumo');
  } else if (activeTab === 'itens') {
    setTimeout(()=>{
      safeCall(()=>itensBar(fi), 'itensBar');
      safeCall(()=>renderItensTable(fi), 'renderItensTable');
      safeCall(()=>variacaoItensTable(fi), 'variacaoItensTable');
    }, 30);
  }
}

// ============ TABS ============
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelector(`[onclick="switchTab('${name}')"]`).classList.add('active');
  document.getElementById('tab-'+name).classList.add('active');
  // Small delay so the tab is visible before Chart.js measures canvas dimensions
  setTimeout(renderAll, 30);
}

// ============ FILTER WIRING ============
['f-unidade','f-ano','f-hab','f-diturma'].forEach(id => {
  document.getElementById(id).addEventListener('change', e => {
    const key = id.replace('f-','').replace('-','');
    const map = {'unidade':'unidade','ano':'ano','mes':'mes','hab':'hab','diturma':'diturma'};
    const fkey = {'funidade':'unidade','fano':'ano','fmes':'mes','fhab':'hab','fditurma':'diturma'}[id.replace('-','')];
    F[fkey||id.replace('f-','')] = e.target.value;
    renderAll();
  });
});

// Checkbox itens filter
document.querySelectorAll('.icheck input').forEach(cb => {
  cb.addEventListener('change', e => {
    const lbl = e.target.closest('label');
    if(e.target.checked){ F.itens.push(e.target.value); lbl.classList.add('active'); }
    else { F.itens = F.itens.filter(v=>v!==e.target.value); lbl.classList.remove('active'); }
    renderAll();
  });
});

// Fix filter key mapping
document.getElementById('f-unidade').addEventListener('change',e=>{F.unidade=e.target.value;renderAll();});
document.getElementById('f-ano').addEventListener('change',e=>{F.ano=e.target.value;renderAll();});
document.getElementById('f-hab').addEventListener('change',e=>{F.hab=e.target.value;renderAll();});
document.getElementById('f-diturma').addEventListener('change',e=>{F.diturma=e.target.value;renderAll();});



// ============ SEMANA KEY FROM DATE ============
function dateToSemanaKey(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts.map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  const dow = d.getDay(); // 0=Sun, 1=Mon...6=Sat (week = Mon..Sun)
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const monday = new Date(yyyy, mm - 1, dd - daysFromMon);
  const weekNum = Math.ceil(monday.getDate() / 7);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2,'0')}-W${weekNum}`;
}

// ============ MULTISELECT MES ============
function toggleMsDropdown() {
  const dd = document.getElementById('ms-mes-dropdown');
  dd.classList.toggle('open');
}
document.addEventListener('click', function(e) {
  const wrap = document.getElementById('ms-mes-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('ms-mes-dropdown').classList.remove('open');
  }
});
function onMesChange() {
  const checked = [...document.querySelectorAll('#ms-mes-items input:checked')].map(cb => cb.value);
  F.mes = checked;
  const allCb = document.getElementById('ms-all-cb');
  const total = document.querySelectorAll('#ms-mes-items input').length;
  allCb.checked = checked.length === total;
  allCb.indeterminate = checked.length > 0 && checked.length < total;
  updateMesBtn();
  renderAll();
}
function toggleAllMes(allCb) {
  document.querySelectorAll('#ms-mes-items input').forEach(cb => { cb.checked = allCb.checked; });
  if (allCb.checked) {
    F.mes = [...document.querySelectorAll('#ms-mes-items input')].map(cb => cb.value);
  } else {
    F.mes = [];
  }
  allCb.indeterminate = false;
  updateMesBtn();
  renderAll();
}
function updateMesBtn() {
  const btn = document.getElementById('ms-mes-btn');
  if (!btn) return;
  if (F.mes.length === 0) { btn.textContent = 'Todos'; }
  else if (F.mes.length === 1) { btn.textContent = F.mes[0]; }
  else { btn.textContent = F.mes.length + ' meses'; }
}
function resetMesDropdown() {
  document.querySelectorAll('#ms-mes-items input').forEach(cb => { cb.checked = false; });
  const allCb = document.getElementById('ms-all-cb');
  if (allCb) { allCb.checked = false; allCb.indeterminate = false; }
  updateMesBtn();
}

function resetFilters() {
  ['f-unidade','f-ano','f-hab','f-diturma'].forEach(id=>{ document.getElementById(id).value=''; });
  document.querySelectorAll('.icheck input').forEach(cb=>{ cb.checked=false; cb.closest('label').classList.remove('active'); });
  F.unidade=''; F.ano=''; F.mes=[]; F.hab=''; F.diturma=''; F.itens=[];
  resetMesDropdown();
  renderAll();
}

// ============ FEEDBACK ============



// ============ UPLOAD NEW BASE ============
async function loadNewBase(input) {
  const file = input.files[0];
  if (!file) return;
  const status = document.getElementById('upload-status');
  status.style.display = 'inline';
  status.textContent = '⏳ Carregando...';

  try {
    const buf = await file.arrayBuffer();
    // Use SheetJS from CDN
    if (typeof XLSX === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    }
    const wb = XLSX.read(buf, {type:'array', cellDates:true});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {defval:null});

    if (!rows.length) { status.textContent = '❌ Planilha vazia'; return; }

    // Check required columns
    const required = ['db-id','habilitacao','unidade','nota_geral','tipo_avaliacao','nota',
      'ano_resposta','nome_mes_resposta','codturma','feedback','nomedisciplina','data_resposta'];
    const cols = Object.keys(rows[0]);
    const missing = required.filter(c => !cols.includes(c));
    if (missing.length) { status.textContent = '❌ Colunas ausentes: ' + missing.join(', '); return; }

    // Process rows — same logic as Python
    const ONLINE_HABS = ['Psiquiatria Clínica', 'Endocrinologia Clínica'];
    const MES_LABEL = {9:'set/25',10:'out/25',11:'nov/25',12:'dez/25',
      1:'jan/26',2:'fev/26',3:'mar/26',4:'abr/26',5:'mai/26',6:'jun/26',
      7:'jul/26',8:'ago/26',13:'set/26'};

    function parseMes(r) {
      // Use data_resposta as source of truth (nome_mes_resposta can be stale)
      const raw = r.data_resposta;
      if (!raw) return null;
      const d = (raw instanceof Date) ? raw : new Date(raw);
      if (isNaN(d)) return null;
      const _mm = d.getMonth() + 1, _yy = d.getFullYear();
      return (_yy > 2026 || (_yy === 2026 && _mm >= 9)) ? 13 + ((_yy - 2026) * 12 + (_mm - 9)) : _mm;
    }
    function parseAno(r) {
      const raw = r.data_resposta;
      if (!raw) return r.ano_resposta || null;
      const d = (raw instanceof Date) ? raw : new Date(raw);
      return isNaN(d) ? (r.ano_resposta || null) : d.getFullYear();
    }

    function mapUnidade(row) {
      const hab = (row.habilitacao||'').trim();
      if (ONLINE_HABS.includes(hab)) return 'ONLINE';
      const u = (row.unidade||'').toUpperCase();
      if (u.includes('BRASILIA')) return 'BRASÍLIA';
      if (u.includes('CAMPINAS')) return 'CAMPINAS';
      if (u.includes('CONSOLA')) return 'CONSOLAÇÃO';
      return 'OUTROS';
    }
    function classify(n) { return n>=9?'Promotor':n>=7?'Neutro':'Detrator'; }

    // Semana = calendar week starting on Monday (Mon–Sun), same rule used
    // server-side. Previous version skipped Sundays entirely, so any
    // Sunday response (e.g. 28/06) got no semana_key and vanished from
    // weekly views/filters.
    function mondayOf(d) {
      const day = d.getDay(); // 0=Sun..6=Sat
      const diff = day === 0 ? 6 : day - 1; // days since Monday
      const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      m.setDate(m.getDate() - diff);
      return m;
    }

    function computeSemanaKey(d) {
      if (!d || isNaN(d)) return null;
      const monday = mondayOf(d);
      const wn = Math.floor((monday.getDate()-1)/7)+1;
      return `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-W${wn}`;
    }

    function computeSemanaLabel(d) {
      if (!d || isNaN(d)) return null;
      const monday = mondayOf(d);
      const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()+6);
      const fmt = dt => String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0');
      return `Seg ${fmt(monday)} – Dom ${fmt(sunday)}`;
    }

    // Build per-dbid pivot
    const byId = {};
    rows.forEach(r => {
      const id = r['db-id'];
      if (!id) return;
      const hab = (r.habilitacao||'').trim();
      const mes = parseMes(r);
      const ano = parseAno(r);
      if (!byId[id]) {
        // Compute semana_key and semana_label from data_resposta
        const rawDate = r.data_resposta instanceof Date ? r.data_resposta : new Date(r.data_resposta);
        const sk = computeSemanaKey(rawDate);
        const sl = computeSemanaLabel(rawDate);
        byId[id] = {
          'db-id': id,
          unidade_calc: mapUnidade(r),
          ano_resposta: ano,
          mes_order: mes,
          mes_label: MES_LABEL[mes] || '',
          semana_key: sk,
          semana_label: sl,
          habilitacao: hab,
          di_turma: diTurmaLabel(hab, r.codturma),
          nota_geral: r.nota_geral,
          classificacao: classify(r.nota_geral),
          nota_Aula_Online: null, 'nota_Aula_Prática': null,
          nota_Infraestrutura: null, nota_Plataforma_Avida: null,
          nota_Professor: null, nota_Triagem: null
        };
      }
      const tipo = r.tipo_avaliacao;
      const colMap = {
        'Aula Online':'nota_Aula_Online','Aula Prática':'nota_Aula_Prática',
        'Infraestrutura':'nota_Infraestrutura','Plataforma Avida':'nota_Plataforma_Avida',
        'Professor':'nota_Professor','Triagem':'nota_Triagem'
      };
      if (colMap[tipo] && r.nota !== null) byId[id][colMap[tipo]] = r.nota;
    });

    const newGeral = Object.values(byId).filter(r => ['BRASÍLIA','CAMPINAS','CONSOLAÇÃO','ONLINE'].includes(r.unidade_calc));

    // Build DATA_ITENS
    const newItens = rows
      .filter(r => r['db-id'] && ['BRASÍLIA','CAMPINAS','CONSOLAÇÃO','ONLINE'].includes(mapUnidade(r)))
      .map(r => ({'db-id': r['db-id'], tipo_avaliacao: r.tipo_avaliacao, nota: r.nota}));

    // Build DATA_FEEDBACK
    const seen = new Set();
    const newFeedback = [];
    rows.forEach(r => {
      const id = r['db-id'];
      if (!id || seen.has(id)) return;
      if (!r.feedback || String(r.feedback).trim() === '' || r.feedback === 'null') return;
      seen.add(id);
      const hab = (r.habilitacao||'').trim();
      const mes = parseMes(r);
      const dateRaw = r.data_resposta;
      let dateFmt = '';
      if (dateRaw) {
        const d = dateRaw instanceof Date ? dateRaw : new Date(dateRaw);
        if (!isNaN(d)) dateFmt = d.toLocaleDateString('pt-BR');
      }
      newFeedback.push({
        cod: String(r.codturma||''),
        turma: String(r.turma||''),
        hab: hab,
        data: dateFmt,
        unidade: mapUnidade(r),
        nota: r.nota_geral,
        disciplina: r.nomedisciplina||'',
        feedback: String(r.feedback).trim()
      });
    });

    // Swap global arrays in-place
    DATA_GERAL.length = 0; newGeral.forEach(r => DATA_GERAL.push(r));
    DATA_ITENS.length = 0; newItens.forEach(r => DATA_ITENS.push(r));
    DATA_FEEDBACK.length = 0; newFeedback.forEach(r => DATA_FEEDBACK.push(r));

    // Rebuild DATA_TURMAS
    const turmaAgg = {};
    newGeral.forEach(r => {
      const key = `${r.unidade_calc}||${r.habilitacao}||${r.di_turma}||${r.mes_order}`;
      if (!turmaAgg[key]) turmaAgg[key] = {
        unidade_calc:r.unidade_calc, habilitacao:r.habilitacao,
        di_turma:r.di_turma, mes_order:r.mes_order,
        mes_label:r.mes_label, sum:0, cnt:0, promotores:0, neutros:0, detratores:0
      };
      const t = turmaAgg[key];
      t.sum += r.nota_geral; t.cnt++;
      if (r.nota_geral >= 9) t.promotores++;
      else if (r.nota_geral >= 7) t.neutros++;
      else t.detratores++;
    });
    DATA_TURMAS.length = 0;
    Object.values(turmaAgg).forEach(t => {
      DATA_TURMAS.push({...t, media: t.sum/t.cnt, total: t.cnt});
    });

    // Rebuild IDX_GERAL
    Object.keys(IDX_GERAL).forEach(k => delete IDX_GERAL[k]);
    DATA_GERAL.forEach(r => { IDX_GERAL[r['db-id']] = r; });

    // Re-populate dropdowns
    populateFilters();
    resetFilters();

    // Save to localStorage for persistence across F5
    saveToLocalStorage();

    status.textContent = `✅ ${newGeral.length} respostas carregadas`;
    setTimeout(() => { status.style.display = 'none'; }, 4000);

  } catch(err) {
    console.error(err);
    status.textContent = '❌ Erro: ' + err.message;
  }
  input.value = '';
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}


// ============ RANKING DE HABILITAÇÕES ============
function rankingCharts(filteredData) {
  destroyChart('ch-rank-top');
  destroyChart('ch-rank-bot');
  const habMap = {};
  filteredData.forEach(r => {
    if (!habMap[r.habilitacao]) habMap[r.habilitacao] = {sum:0,cnt:0};
    habMap[r.habilitacao].sum += r.nota_geral;
    habMap[r.habilitacao].cnt++;
  });
  const ranked = Object.entries(habMap)
    .filter(([,v]) => v.cnt >= 3)
    .map(([h,v]) => ({hab:h, media:v.sum/v.cnt, total:v.cnt}))
    .sort((a,b) => b.media - a.media);

  const top5 = ranked.slice(0,5);
  const bot5 = ranked.slice(-5);

  function makeRankChart(canvasId, data, colorFn) {
    const ctx = document.getElementById(canvasId); if(!ctx) return;
    CHARTS[canvasId] = new Chart(ctx, {
      type:'bar',
      data:{
        labels: data.map(x=>x.hab),
        datasets:[{
          data: data.map(x=>x.media),
          backgroundColor: data.map(x=>colorFn(x.media)),
          borderRadius:5, borderSkipped:false
        }]
      },
      options:{
        indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label:c=>`${c.parsed.x.toFixed(2)} (${data[c.dataIndex].total} resp.)`}}
        },
        scales:{
          x:{suggestedMin:0,suggestedMax:10,ticks:{callback:v=>v.toFixed(1)},grid:{color:'#f0f0f0'}},
          y:{grid:{display:false},ticks:{font:{size:11}}}
        }
      }
    });
  }
  makeRankChart('ch-rank-top', top5, n => n>=8?'#16a34acc':'#d97706cc');
  makeRankChart('ch-rank-bot', bot5, n => n>=8?'#d97706cc':'#dc2626cc');
}

// ============ EVOLUÇÃO POR HABILITAÇÃO (por unidade) ============
const HAB_COLORS = [
  '#01559B','#7C3AED','#e67e22','#16a34a','#dc2626',
  '#0891b2','#be185d','#d97706','#4f46e5','#065f46','#7c2d12'
];

function evolHabChart(canvasId, unit, filteredData) {
  destroyChart(canvasId);
  const MES_ORDER_SEQ = [9,10,11,12,1,2,3,4,5,6,7,8,13];
  const MES_LABELS_MAP = {9:'set/25',10:'out/25',11:'nov/25',12:'dez/25',
    1:'jan/26',2:'fev/26',3:'mar/26',4:'abr/26',5:'mai/26',6:'jun/26',7:'jul/26',8:'ago/26',13:'set/26'};

  const uData = filteredData.filter(r => r.unidade_calc === unit);
  const presentMes = new Set(uData.map(r=>r.mes_order));
  const mesSeq = MES_ORDER_SEQ.filter(o=>presentMes.has(o));
  const labels = mesSeq.map(o=>MES_LABELS_MAP[o]);
  const habs = [...new Set(uData.map(r=>r.habilitacao))].sort();

  const datasets = habs.map((hab, i) => {
    const habData = uData.filter(r=>r.habilitacao===hab);
    const data = mesSeq.map(m => {
      const rows = habData.filter(r=>r.mes_order===m);
      return rows.length >= 1 ? avg(rows.map(r=>r.nota_geral)) : null;
    });
    return {
      label: hab, data,
      borderColor: HAB_COLORS[i % HAB_COLORS.length],
      backgroundColor: 'transparent',
      borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
      tension: 0.3, spanGaps: false
    };
  }).filter(ds => ds.data.some(v=>v!==null));

  const ctx = document.getElementById(canvasId); if(!ctx) return;
  CHARTS[canvasId] = new Chart(ctx, {
    type:'line',
    data:{labels, datasets},
    options:{
      responsive:true, maintainAspectRatio:false, clip:false,
      layout:{padding:{top:14,bottom:14}},
      plugins:{
        legend:{position:'bottom',labels:{font:{size:10},usePointStyle:true,pointStyle:'circle',boxWidth:8,boxHeight:8}},
        tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.parsed.y?c.parsed.y.toFixed(2):'-'}`}}
      },
      scales:{
        y:{
          suggestedMin:0, suggestedMax:10,
          ticks:{callback:v=>v.toFixed(1), stepSize:1},
          grid:{color:'#f0f0f0'}
        },
        x:{grid:{display:false},ticks:{font:{size:11}}}
      },
      layout:{padding:{top:14,bottom:14}},
      clip:false
    }
  });
}

// ============ VARIAÇÃO MÊS A MÊS — ITENS ============
function variacaoItensTable(filteredItens) {
  const MES_SEQ = [9,10,11,12,1,2,3,4,5,6,7,8,13];
  const MES_LABEL_MAP = {9:'set/25',10:'out/25',11:'nov/25',12:'dez/25',
    1:'jan/26',2:'fev/26',3:'mar/26',4:'abr/26',5:'mai/26',6:'jun/26',7:'jul/26',8:'ago/26',13:'set/26'};

  const selectedUnits = F.unidade ? [F.unidade] : ['BRASÍLIA','CAMPINAS','CONSOLAÇÃO','ONLINE'];
  const tipos = [...new Set(filteredItens.map(r=>r.tipo_avaliacao))].sort();
  if (!tipos.length) return;

  const cache = {};
  filteredItens.forEach(r => {
    const g = IDX_GERAL[r['db-id']];
    if (!g) return;
    const u = g.unidade_calc;
    const m = g.mes_order;
    const t = r.tipo_avaliacao;
    const key = `${u}||${t}||${m}`;
    if (!cache[key]) cache[key] = {sum:0,cnt:0};
    cache[key].sum += r.nota;
    cache[key].cnt++;
  });

  const presentMes = [...new Set(Object.keys(cache).map(k=>parseInt(k.split('||')[2])))];
  const last3 = MES_SEQ.filter(m=>presentMes.includes(m)).slice(-3);
  if (last3.length < 2) return;

  function getVal(u, t, m) {
    const key = `${u}||${t}||${m}`;
    return cache[key] ? cache[key].sum/cache[key].cnt : null;
  }

  function deltaArrow(curr, prev) {
    if (curr===null || prev===null) return '';
    const d = curr - prev;
    if (Math.abs(d) < 0.01) return `<span style="color:var(--muted)">—</span>`;
    const cls = d > 0 ? 'ng' : 'nb';
    const arrow = d > 0 ? '↑' : '↓';
    return `<span class="${cls}" style="font-size:11px">${arrow} ${Math.abs(d).toFixed(2)}</span>`;
  }

  const colHeaders = selectedUnits.flatMap(u => last3.map(m =>
    `<th style="padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.3px;text-align:center;white-space:nowrap">${u}<br><span style="font-weight:400;opacity:.8">${MES_LABEL_MAP[m]}</span></th>`
  ));

  const rows = tipos.map(t => {
    const cells = selectedUnits.flatMap(u => {
      return last3.map((m, mi) => {
        const curr = getVal(u,t,m);
        const prev = mi>0 ? getVal(u,t,last3[mi-1]) : null;
        if (curr === null) return `<td style="padding:7px 10px;border-bottom:1px solid var(--border);text-align:center;color:var(--muted)">—</td>`;
        const cls = curr>=4?'ng':curr>=3.5?'nw':'nb';
        const delta = mi>0 ? `<br>${deltaArrow(curr,prev)}` : '';
        return `<td style="padding:7px 10px;border-bottom:1px solid var(--border);text-align:center">
          <span class="${cls}" style="font-weight:700">${curr.toFixed(2)}</span>${delta}
        </td>`;
      });
    });
    return `<tr><td style="padding:7px 10px;border-bottom:1px solid var(--border);font-weight:600;white-space:nowrap">${t}</td>${cells.join('')}</tr>`;
  }).join('');

  document.getElementById('itens-variacao').innerHTML = `
    <div class="cbox full">
      <h3>Variação Mensal dos Itens (últimos 3 meses · escala 1–5)</h3>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:var(--navy);color:#fff">
            <th style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;text-align:left">Item</th>
            ${colHeaders.join('')}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:8px;font-size:11px;color:var(--muted);display:flex;gap:16px">
        <span><span class="ng">↑</span> Melhora vs mês anterior</span>
        <span><span class="nb">↓</span> Queda vs mês anterior</span>
      </div>
    </div>`;
}


// ============ TURMAS NEGATIVAS POR UNIDADE ============
function renderTurmasNeg(divId, unitName, filteredData) {
  const container = document.getElementById(divId);
  if (!container) return;

  const MES_SEQ = [9,10,11,12,1,2,3,4,5,6,7,8,13];

  // Determine last 2 months present in filteredData
  const presentMes = [...new Set(filteredData.filter(r=>r.unidade_calc===unitName).map(r=>r.mes_order))];
  const last2 = MES_SEQ.filter(m => presentMes.includes(m)).slice(-2);
  const curMes  = last2[last2.length - 1];
  const prevMes = last2.length >= 2 ? last2[last2.length - 2] : null;

  // If a mes filter is active, use that as curMes
  const _mesStr = F.mes && F.mes.length > 0 ? F.mes[F.mes.length-1] : null;
  const activeMes = _mesStr ? (Object.entries({9:'set/25',10:'out/25',11:'nov/25',12:'dez/25',
    1:'jan/26',2:'fev/26',3:'mar/26',4:'abr/26',5:'mai/26',6:'jun/26',7:'jul/26',8:'ago/26',13:'set/26'})
    .find(([,v])=>v===_mesStr)||[null])[0] : null;
  const effectiveCur = activeMes ? parseInt(activeMes) : curMes;
  const effectivePrev = activeMes
    ? MES_SEQ[MES_SEQ.indexOf(parseInt(activeMes)) - 1] ?? null
    : prevMes;

  // Get turmas data for this unit
  let turmasUnit = DATA_TURMAS.filter(r => r.unidade_calc === unitName);
  if (F.hab) turmasUnit = turmasUnit.filter(r => r.habilitacao === F.hab);

  // Build lookup: di_turma → {cur, prev}
  const turmaMap = {};
  turmasUnit.forEach(r => {
    if (!turmaMap[r.di_turma]) turmaMap[r.di_turma] = {hab: r.habilitacao};
    if (r.mes_order === effectiveCur)  turmaMap[r.di_turma].cur  = r;
    if (r.mes_order === effectivePrev) turmaMap[r.di_turma].prev = r;
  });

  // Filter: only turmas with cur media <= 6
  const negativas = Object.entries(turmaMap)
    .filter(([, v]) => v.cur && v.cur.media <= 6)
    .sort((a, b) => a[1].cur.media - b[1].cur.media);

  const MES_LABEL = {9:'set/25',10:'out/25',11:'nov/25',12:'dez/25',
    1:'jan/26',2:'fev/26',3:'mar/26',4:'abr/26',5:'mai/26',6:'jun/26',7:'jul/26',8:'ago/26',13:'set/26'};

  if (!negativas.length) {
    container.innerHTML = `
      <div class="cbox full" style="margin-top:0">
        <h3>⚠️ Turmas com Avaliação Negativa — ${unitName}</h3>
        <p style="color:var(--muted);font-size:13px;padding:8px 0">
          Nenhuma turma com nota média ≤ 6 em ${MES_LABEL[effectiveCur] || 'período selecionado'}.
        </p>
      </div>`;
    return;
  }

  // Group by habilitacao
  const byHab = {};
  negativas.forEach(([turma, v]) => {
    const hab = v.hab;
    if (!byHab[hab]) byHab[hab] = [];
    byHab[hab].push([turma, v]);
  });

  function deltaHtml(cur, prev) {
    if (!prev) return `<span style="font-size:11px;color:var(--muted)">sem ref.</span>`;
    const d = cur - prev;
    if (Math.abs(d) < 0.05) return `<span style="color:var(--muted);font-size:11px">= ${prev.toFixed(2)}</span>`;
    const cls = d > 0 ? 'ng' : 'nb';
    const arrow = d > 0 ? '↑' : '↓';
    return `<span class="${cls}" style="font-size:11px;font-weight:600">${arrow} ${Math.abs(d).toFixed(2)} <span style="opacity:.7;font-weight:400">(era ${prev.toFixed(2)})</span></span>`;
  }

  function notaBadge(n) {
    const cls = n >= 7 ? 'nw' : n >= 5 ? 'nb' : 'nb';
    const bg = n >= 7 ? '#fef3c7' : n >= 4 ? '#fee2e2' : '#fca5a5';
    return `<span style="background:${bg};color:#991b1b;font-weight:700;padding:2px 8px;border-radius:12px;font-size:13px">${n.toFixed(1)}</span>`;
  }

  const habSections = Object.entries(byHab).sort().map(([hab, turmas]) => {
    const rows = turmas.map(([turma, v]) => {
      const cur = v.cur;
      const prev = v.prev;
      const pnd = `<span style="font-size:11px;color:var(--muted)">`
        + `✅ ${cur.promotores} · `
        + `⚪ ${cur.neutros} · `
        + `🔴 ${cur.detratores}`
        + `</span>`;
      const prevDelta = prev ? deltaHtml(cur.media, prev.media) : deltaHtml(cur.media, null);
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px 10px;font-weight:600;font-size:13px">${turma}</td>
        <td style="padding:8px 10px;text-align:center">${notaBadge(cur.media)}</td>
        <td style="padding:8px 10px;text-align:center;font-size:12px;color:var(--muted)">${cur.total}</td>
        <td style="padding:8px 10px">${pnd}</td>
        <td style="padding:8px 10px">${prevDelta}</td>
      </tr>`;
    }).join('');

    return `<div style="margin-bottom:20px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;
        color:var(--navy);border-bottom:2px solid var(--navy);padding-bottom:4px;margin-bottom:8px">
        ${hab} <span style="font-weight:400;color:var(--muted)">(${turmas.length} turma${turmas.length>1?'s':''})</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#fef2f2;color:#991b1b">
          <th style="padding:7px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.3px">Turma</th>
          <th style="padding:7px 10px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap">Nota Atual</th>
          <th style="padding:7px 10px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:.3px">Respostas</th>
          <th style="padding:7px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.3px">P / N / D</th>
          <th style="padding:7px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap">vs ${MES_LABEL[effectivePrev] || 'mês ant.'}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');

  const curLabel = MES_LABEL[effectiveCur] || 'período';
  container.innerHTML = `
    <div class="cbox full" style="margin-top:0;border-left:4px solid #dc2626">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h3 style="margin:0">⚠️ Turmas com Avaliação Negativa — ${unitName}</h3>
        <span style="font-size:12px;color:var(--muted);background:#fef2f2;padding:3px 10px;border-radius:12px;border:1px solid #fca5a5">
          ${negativas.length} turma${negativas.length>1?'s':''} · nota ≤ 6 · ${curLabel}
        </span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:16px">
        P = Promotores (≥9) · N = Neutros (7–8) · D = Detratores (≤6)
      </div>
      ${habSections}
    </div>`;
}


// ============ SEMANA FILTER ============
function buildSemanaCheckboxes() {
  const container = document.getElementById('semana-checkboxes');
  if (!container) return;

  // Determine target month
  const MES_SEQ = [9,10,11,12,1,2,3,4,5,6,7,8,13];
  const MES_LABEL_MAP = {9:'set/25',10:'out/25',11:'nov/25',12:'dez/25',
    1:'jan/26',2:'fev/26',3:'mar/26',4:'abr/26',5:'mai/26',6:'jun/26',7:'jul/26',8:'ago/26',13:'set/26'};

  let targetMesLabel = F.mes.length === 1 ? F.mes[0] : '';
  if (!targetMesLabel) {
    const presentMes = new Set(DATA_GERAL.map(r=>r.mes_order).filter(Boolean));
    const sorted = MES_SEQ.filter(m=>presentMes.has(m));
    targetMesLabel = MES_LABEL_MAP[sorted[sorted.length-1]] || '';
  }

  // Collect unique semanas for that month, sorted by key
  const semanasMap = {};
  DATA_GERAL
    .filter(r => r.mes_label === targetMesLabel && r.semana_key && r.semana_label)
    .forEach(r => { semanasMap[r.semana_key] = r.semana_label; });
  const semanas = Object.entries(semanasMap).sort((a,b) => a[0].localeCompare(b[0]));

  // Only rebuild DOM if semanas changed (avoid flicker on every renderAll)
  const newKeys = semanas.map(s=>s[0]).join('|');
  if (container.dataset.built === newKeys) {
    // Just sync checked state
    container.querySelectorAll('input[type=checkbox]').forEach(cb => {
      const isActive = cb.value === F.semana;
      cb.checked = isActive;
      cb.closest('label').classList.toggle('active', isActive);
    });
    return;
  }
  container.dataset.built = newKeys;
  container.innerHTML = '';

  if (!semanas.length) {
    container.innerHTML = '<span style="font-size:12px;color:var(--muted)">—</span>';
    return;
  }

  semanas.forEach(([key, label]) => {
    const lbl = document.createElement('label');
    lbl.className = 'icheck';
    lbl.style.cssText = 'font-size:12px;white-space:nowrap';
    const isActive = F.semana === key;
    if (isActive) lbl.classList.add('active');
    const inp = document.createElement('input');
    inp.type = 'checkbox'; inp.value = key; if(isActive) inp.checked = true;
    lbl.appendChild(inp);
    lbl.appendChild(document.createTextNode(' ' + label));
    inp.addEventListener('change', e => {
      if (e.target.checked) {
        container.querySelectorAll('input[type=checkbox]').forEach(cb => {
          if (cb !== e.target) { cb.checked = false; cb.closest('label').classList.remove('active'); }
        });
        lbl.classList.add('active');
        F.semana = key;
      } else {
        lbl.classList.remove('active');
        F.semana = '';
      }
      renderAll();
    });
    container.appendChild(lbl);
  });
}

// ============ CRUZAMENTO TRIAGEM x CSAT (comentários sobre pacientes) ============
// Categorias específicas pedidas pelo usuário — independentes do TEMA_DICT/PROBLEMA_PATTERNS acima.
const PATTERNS_TRIAGEM_QUALIDADE = ["mal triado","mal triados","mal triada","mal triadas","triado errado","triagem ruim","triagem mal feita","triagem inadequada","triagem errada","paciente nao elegivel","paciente inadequado","paciente errado","fora do perfil","perfil errado","sem queixa","nao tinha a queixa","queixa errada","nao correspondia","nao se encaixava","sem indicacao","sem criterio","paciente sem indicacao","triagem descuidada","nao condizia com o modulo","paciente nao condizia"];

const PATTERNS_TRIAGEM_QUANTIDADE = ["poucos pacientes","pouco paciente","sem paciente","sem pacientes","faltou paciente","faltaram pacientes","nenhum paciente","agenda vazia","paciente nao veio","nao veio paciente","nao compareceu","cancelou","desmarcou","ociosidade","tempo ocioso","esperando paciente","sem agendamento","poucas vagas preenchidas","baixa demanda","falta de pacientes","poucos agendamentos","agenda descheia","muito tempo parado","pouco movimento","agenda fraca"];

// "Manifestação" = comentário toca no tema pacientes/triagem/agenda E usa linguagem de reclamação/insatisfação explícita
const PATTERNS_MANIFESTACAO_GATE = ["paciente","pacientes","triagem","agendamento","agenda"];
const PATTERNS_MANIFESTACAO_MARCADORES = ["reclamacao","reclamar","reclamo","insatisfeito","insatisfeita","revoltado","revoltada","um absurdo","inaceitavel","muito ruim","pessimo","pessima","nunca mais","sempre acontece","de novo isso","ninguem resolve","precisa melhorar urgente","urgente","grave problema","decepcionado","decepcionada","frustrado","frustrada","um caos"];

// Régua de RECLAMAÇÃO sobre qualidade da triagem (v49): dois portões — o comentário precisa FALAR de
// triagem/seleção/perfil de paciente E usar linguagem de problema. Assim "pacientes bem triados" (elogio)
// não conta. A lista estrita PATTERNS_TRIAGEM_QUALIDADE acima continua valendo por união, para não perder
// nada que já era detectado antes.
const PATTERNS_QUALTRI_GATE = ["triagem","triado","triados","triada","triadas","selecao de paciente","selecao dos paciente","perfil do paciente","perfil dos paciente","escolha dos paciente","encaminhamento dos paciente"];
const PATTERNS_QUALTRI_PROBLEMA = ["ruim","mal feita","mal feito","malfeita","mal ","pessima","pessimo","falha","falhou","deficiente","precaria","melhorar","melhoria","aprimorar","rever","nao funcionou","nao funciona","nao esta","nao tava","nao foi bem","errado","errados","errada","erradas","inadequad","incorret","sem criterio","sem queixa","nao tinha queixa","nao tinham queixa","fora do perfil","nao correspond","nao condiz","nao serviam","nao servia","descuidada","decepcion","frustr","absurdo","inaceitavel","problema","falta de triagem","faltou triagem","falta triagem","nao elegivel","incompativel","nao compativel","poderiam ser melhores","poderia ser melhor"];

function isReclQualidadeTriagem(feedbackText) {
  const norm = normPlano(feedbackText || '');
  const hitAny = (list) => list.some(kw => norm.includes(normPlano(kw)));
  return (hitAny(PATTERNS_QUALTRI_GATE) && hitAny(PATTERNS_QUALTRI_PROBLEMA)) || hitAny(PATTERNS_TRIAGEM_QUALIDADE);
}

function classificaTriagemComentario(feedbackText) {
  const norm = normPlano(feedbackText || '');
  const hitAny = (list) => list.some(kw => norm.includes(normPlano(kw)));
  const qualidade = isReclQualidadeTriagem(feedbackText);
  const quantidade = hitAny(PATTERNS_TRIAGEM_QUANTIDADE);
  const gate = hitAny(PATTERNS_MANIFESTACAO_GATE);
  const manifestacao = gate && hitAny(PATTERNS_MANIFESTACAO_MARCADORES);
  return { qualidade, quantidade, manifestacao, any: qualidade || quantidade || manifestacao };
}

// ============ RESUMO EXECUTIVO ============
const TEMA_DICT = {
  "plataforma":"Plataforma","avida":"Plataforma","avid":"Plataforma",
  "online":"Aula Online",
  "prática":"Aulas","aula":"Aulas","aulas":"Aulas","atividades":"Aulas","presenciais":"Aulas",
  "praticas":"Aulas","pratica":"Aulas","didatica":"Aulas","didática":"Aulas",
  "teorica":"Aulas","teórica":"Aulas","teoricas":"Aulas","teóricas":"Aulas",
  "ensino":"Aulas","curso":"Aulas","modulo":"Aulas","módulos":"Aulas","modulos":"Aulas",
  "materiais":"Aulas","conteúdo":"Aulas","conteudo":"Aulas","material":"Aulas",
  "aprendizado":"Aulas","teorico":"Aulas","teoricos":"Aulas",
  "procedimento":"Aulas","procedimentos":"Aulas","tratamento":"Aulas","tratamentos":"Aulas",
  "cafe":"Alimentacao","café":"Alimentacao","coffee":"Alimentacao","coffe":"Alimentacao",
  "lanche":"Alimentacao","pao":"Alimentacao","pão":"Alimentacao","almoco":"Alimentacao",
  "cafezinho":"Alimentacao","almoço":"Alimentacao","break":"Alimentacao","comida":"Alimentacao",
  "comidas":"Alimentacao","queijo":"Alimentacao","agua":"Alimentacao","água":"Alimentacao",
  "buffet":"Alimentacao","refeições":"Alimentacao","refeicoes":"Alimentacao",
  "refeição":"Alimentacao","restaurante":"Alimentacao","proteinas":"Alimentacao",
  "carboidratos":"Alimentacao","proteina":"Alimentacao","carboidrato":"Alimentacao","lanches":"Alimentacao",
  "laboratorio":"Estrutura","laboratorios":"Estrutura","laboratório":"Estrutura","laboratórios":"Estrutura",
  "clinica":"Estrutura","clinicas":"Estrutura","clínica":"Estrutura","clínicas":"Estrutura",
  "cadeira":"Estrutura","cadeiras":"Estrutura","motor":"Estrutura","motores":"Estrutura",
  "iluminacao":"Estrutura","iluminação":"Estrutura","luz":"Estrutura",
  "predio":"Estrutura","prédio":"Estrutura","espaco":"Estrutura","espaço":"Estrutura",
  "limpeza":"Estrutura","estrutura":"Estrutura","bancadas":"Estrutura","bancada":"Estrutura",
  "lixos":"Estrutura","lixo":"Estrutura","torneira":"Estrutura","torneiras":"Estrutura",
  "higienizacao":"Estrutura","higienização":"Estrutura","manutenção":"Estrutura","manutencao":"Estrutura",
  "descanso":"Estrutura","consultorio":"Estrutura","consultorios":"Estrutura","consultório":"Estrutura",
  "sala":"Estrutura","salas":"Estrutura","locais":"Estrutura","local":"Estrutura",
  "infraestrutura":"Estrutura","hospital":"Estrutura","banheiro":"Estrutura","banheiros":"Estrutura",
  "lab":"Estrutura","labs":"Estrutura","armários":"Estrutura","armário":"Estrutura",
  "armarios":"Estrutura","armario":"Estrutura","escadas":"Estrutura","escada":"Estrutura",
  "maleiro":"Estrutura","refeitório":"Estrutura","refeitorio":"Estrutura","campus":"Estrutura",
  "estacionamento":"Estrutura","ambulatorio":"Estrutura","ambulatorios":"Estrutura","maca":"Estrutura",
  "desconfortavel":"Estrutura","desconfortável":"Estrutura",
  "rx":"Equipamentos","radiografia":"Equipamentos","sensor":"Equipamentos","sensores":"Equipamentos",
  "notebook":"Equipamentos","raio":"Equipamentos","raios":"Equipamentos",
  "equipamento":"Equipamentos","equipamentos":"Equipamentos","radiografico":"Equipamentos",
  "luminaria":"Equipamentos","luminarias":"Equipamentos","luminárias":"Equipamentos","luminária":"Equipamentos",
  "alcool":"Equipamentos","álcool":"Equipamentos","borrifador":"Equipamentos",
  "aparelhos":"Equipamentos","aparelho":"Equipamentos","equipos":"Equipamentos",
  "sugador":"Equipamentos","sugadores":"Equipamentos","ferramentas":"Equipamentos","ferramenta":"Equipamentos",
  "laser":"Equipamentos","receituario":"Equipamentos","receituarios":"Equipamentos",
  "computador":"Equipamentos","computadores":"Equipamentos","kits":"Equipamentos","kit":"Equipamentos",
  "scanner":"Equipamentos","scanners":"Equipamentos","caneta":"Equipamentos","canetas":"Equipamentos",
  "secretaria":"Organizacao","organizacao":"Organizacao","cronograma":"Organizacao",
  "turmas":"Organizacao","turma":"Organizacao","organizar":"Organizacao",
  "horário":"Organizacao","horario":"Organizacao","horários":"Organizacao","horarios":"Organizacao",
  "atrasa":"Organizacao","atrasos":"Organizacao","atraso":"Organizacao","atrasando":"Organizacao",
  "caos":"Organizacao","agenda":"Organizacao","lotada":"Organizacao","lotadas":"Organizacao",
  "concierge":"Organizacao","atividade":"Organizacao",
  "professor":"Professores","professores":"Professores","docente":"Professores",
  "preceptor":"Professores","preceptores":"Professores","docentes":"Professores",
  "preceptora":"Professores","preceptoras":"Professores",
  "triagem":"Triagem","triagens":"Triagem","paciente":"Triagem","pacientes":"Triagem",
  "agendamento":"Triagem","agendamentos":"Triagem",
  "alunos":"Alunos","aluno":"Alunos","aluna":"Alunos","alunas":"Alunos",
  "precos":"Financeiro","preco":"Financeiro","preços":"Financeiro","preço":"Financeiro",
  "pagamento":"Financeiro","pagamentos":"Financeiro","valor":"Financeiro","valores":"Financeiro",
  "orçamentos":"Financeiro","orcamento":"Financeiro","orcamentos":"Financeiro","orçamento":"Financeiro",
  "fortuna":"Financeiro","mensalidade":"Financeiro","pagamos":"Financeiro"
};

// Build normalized lookup from TEMA_DICT
const TEMA_LOOKUP = {};
Object.entries(TEMA_DICT).forEach(([k,v]) => {
  TEMA_LOOKUP[k.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()] = v;
});

// Nº de palavras do dicionário por tema (ex.: "Aulas" tem ~30 palavras
// genéricas, "Aula Online" só tem "online") -- usado em analyzeComment() pra
// ponderar o tema dominante de um comentário: uma palavra de um tema com
// dicionário pequeno (mais específica/rara) pesa mais que uma palavra
// genérica repetida de um tema com dicionário grande. Sem isso, "Aulas"
// ganhava quase sempre de temas mais específicos só por ter mais sinônimos.
const TEMA_DICT_SIZE = {};
Object.values(TEMA_DICT).forEach(t => { TEMA_DICT_SIZE[t] = (TEMA_DICT_SIZE[t]||0) + 1; });


const TEMA_LABEL_MAP = {
  'Organizacao':'Organização','Alimentacao':'Alimentação','Aula Online':'Aula Online',
  'Plataforma':'Plataforma','Professores':'Professores','Aulas':'Aulas','Estrutura':'Estrutura',
  'Equipamentos':'Equipamentos','Triagem':'Triagem','Alunos':'Alunos','Financeiro':'Financeiro'
};

const TEMA_ICONS = {
  'Aulas':'📚','Professores':'👨‍🏫','Estrutura':'🏥','Equipamentos':'🔧','Triagem':'🩺',
  'Organizacao':'📋','Alimentacao':'🍽️','Plataforma':'💻','Aula Online':'🌐',
  'Alunos':'👥','Financeiro':'💰','Geral':'🔀'
};

// ── Problem detection patterns per tema ─────────────────────────────────────
const PROBLEMA_PATTERNS = {"Triagem": {"pacientes mal triados": ["triado", "triagem", "queixa", "encaminhado", "sem queixa", "elegivel", "elegibilidade"], "agendamento falho": ["agendamento", "agenda", "vaga", "prontuario", "confirma", "confirmacao", "duplicata"], "poucos pacientes": ["poucos pacientes", "pouco paciente", "faltou paciente", "sem paciente", "nao tinha paciente", "nenhum paciente"], "comunicação com paciente": ["comunicacao", "comunicar", "recepcao", "aviso", "informar", "nao responde", "nao atende"]}, "Estrutura": {"espaço insuficiente": ["espaco", "sala", "pequeno", "apertado", "lotado", "cabine", "espaco pequeno"], "limpeza e higiene": ["limpeza", "limpo", "sujo", "higiene", "higienizacao", "sujeira"], "manutenção": ["manutencao", "quebrado", "quebrada", "conserto", "nao funciona", "estrago"], "conforto": ["cadeira", "desconfortavel", "bancada", "ergonomia", "descanso", "cansativo"]}, "Equipamentos": {"equipamentos insuficientes": ["poucos equipamentos", "falta equipamento", "sem equipamento", "equipamento faltou", "nao tem equipamento"], "qualidade dos equipamentos": ["velho", "antigo", "obsoleto", "precario", "deteriorado", "ultrapassado"], "materiais consumíveis": ["material", "kit", "amostra", "produto", "cosmetico", "alcool", "borrifador", "luva"], "tecnologia": ["computador", "notebook", "scanner", "rx", "radiografia", "projetor", "tela"]}, "Aulas": {"carga prática insuficiente": ["pratica", "procedimento", "atendimento", "poucas praticas", "mais praticas", "mao na massa", "poucos pacientes"], "conteúdo repetitivo": ["repetitivo", "repetido", "mesmo conteudo", "igual", "repeticao", "mesma coisa", "ja vimos"], "material didático": ["material", "apostila", "slides", "nao disponibilizado", "nao foi disponibilizado", "nao tem material"], "organização do módulo": ["modulo", "cronograma", "planejamento", "organizacao", "sem ordem", "mal planejado"]}, "Professores": {"didática ruim": ["didatica", "explicacao", "clareza", "nao entendi", "dificil entender", "mal explicado", "nao consegui entender"], "desorganização": ["desorganizado", "despreparado", "improvisando", "sem preparacao", "perdido"], "disponibilidade": ["nao responde", "ausente", "nao atende", "dificil contato", "sumiu", "ignorou"], "quantidade de professores": ["poucos professores", "faltou professor", "professor faltou", "sem professor", "professor ausente"]}, "Organizacao": {"atrasos": ["atraso", "atrasado", "atrasando", "nao comecou", "comecar tarde", "nao terminou", "horario errado"], "comunicação interna": ["falta de comunicacao", "sem aviso", "nao avisou", "nao informou", "secretaria", "concierge", "nao comunicou"], "cronograma": ["cronograma", "planejamento", "mudanca", "alteracao", "sem cronograma", "nao sabia", "imprevisto"], "lotação": ["lotado", "lotada", "muitos alunos", "turma cheia", "superlotado", "turma grande"]}, "Alimentacao": {"qualidade da comida": ["ruim", "pessimo", "horrivel", "frio", "estragado", "vencido", "qualidade ruim"], "variedade insuficiente": ["variedade", "sem opcao", "mesma coisa", "repetido", "igual todo dia", "monotono"], "quantidade insuficiente": ["pouco", "acabou", "faltou comida", "sem comida", "vazio", "nao teve"], "horário do coffee": ["tarde", "nao teve coffee", "coffee atrasou", "sem coffee", "horario errado"]}, "Plataforma": {"materiais não disponibilizados": ["nao disponibilizou", "nao tem material", "nao foi colocado", "nao esta na plataforma", "sem acesso ao material", "nao encontrei"], "problemas técnicos": ["erro", "falha", "lento", "travando", "nao funciona", "bug", "fora do ar", "nao carrega", "caiu"], "usabilidade": ["dificil", "complicado", "confuso", "nao encontro", "nao sei usar", "perdido na plataforma"]}, "Aula Online": {"qualidade técnica": ["audio", "video", "conexao", "travando", "cortando", "sem som", "nao ve", "nao ouve", "qualidade ruim"], "materiais online": ["nao disponibilizou", "nao tem gravacao", "sem gravacao", "nao tem acesso", "link nao funciona"], "interatividade": ["interacao", "nao responde", "nao participa", "nao tira duvida", "sem feedback", "sem retorno"]}, "Financeiro": {"custo elevado": ["caro", "preco alto", "valor alto", "mensalidade alta", "muito caro", "cobrado demais"], "falta de transparência": ["transparencia", "nao informou", "cobrado sem aviso", "cobranca indevida", "sem explicacao", "nao avisou"]}, "Alunos": {"conflitos entre alunos": ["conflito", "briga", "desrespeito", "grosseria", "mal educado", "problema com colega"], "integração": ["nao se conhecem", "sem integracao", "sem grupo", "turma desunida", "sem comunicacao entre alunos"]}, "Geral": {"múltiplos problemas": ["varios problemas", "muitos problemas", "varios pontos", "varios aspectos", "tudo errado"], "expectativa não atendida": ["nao correspondeu", "frustrante", "decepcionante", "esperava mais", "abaixo do esperado", "nao valeu"], "comunicação geral": ["falta de comunicacao", "sem informacao", "ninguem informa", "nao sabe", "perdido"]}};

// ── Actions per detected problem ─────────────────────────────────────────────
const ACOES_POR_PROBLEMA = {"pacientes mal triados": ["Revisar protocolo de triagem com critérios específicos por especialidade", "Capacitar equipe sobre queixas elegíveis para cada módulo", "Implementar checklist de elegibilidade antes do agendamento"], "agendamento falho": ["Auditar sistema de agendamento para eliminar duplicatas e conflitos", "Criar confirmação automática via WhatsApp 24h antes da consulta", "Designar responsável exclusivo pelo agendamento durante o módulo"], "poucos pacientes": ["Antecipar captação de pacientes para 2 semanas antes do módulo", "Ampliar divulgação das consultas em canais locais e redes sociais", "Criar banco de pacientes recorrentes por especialidade para acionamento rápido"], "comunicação com paciente": ["Treinar recepção para comunicação clara sobre disponibilidade", "Criar canal direto de contato paciente–clínica durante o módulo", "Padronizar script de atendimento telefônico para reduzir informações incorretas"], "espaço insuficiente": ["Redistribuir turmas conforme capacidade real dos espaços", "Escalonar uso das salas por turno para evitar superlotação", "Avaliar expansão ou reforma dos espaços com maior demanda recorrente"], "limpeza e higiene": ["Implementar checklist de limpeza no início e fim de cada período", "Designar responsável pela higienização com registro diário", "Reforçar serviço de limpeza nos dias de maior fluxo de alunos"], "manutenção": ["Criar cronograma mensal de manutenção preventiva de salas e equipamentos", "Disponibilizar canal rápido para reporte de falhas com SLA de 24h", "Realizar vistoria técnica antes do início de cada módulo"], "conforto": ["Substituir cadeiras e bancadas com maior índice de reclamação", "Avaliar ergonomia dos postos de trabalho com suporte especializado", "Criar área de descanso adequada para intervalos entre procedimentos"], "equipamentos insuficientes": ["Levantar proporção equipamento/aluno e ampliar o estoque conforme demanda", "Criar sistema de rodízio estruturado para otimizar uso dos equipamentos", "Priorizar aquisição dos equipamentos mais citados nas reclamações"], "qualidade dos equipamentos": ["Substituir equipamentos com mais de 5 anos ou com reclamações recorrentes", "Firmar contrato de manutenção preventiva trimestral com fornecedor especializado", "Criar inventário com status de conservação atualizado mensalmente"], "materiais consumíveis": ["Mapear consumo médio por módulo e manter estoque mínimo com 30% de margem", "Criar processo de reposição emergencial com prazo máximo de 24h", "Estabelecer parcerias com fornecedores para disponibilidade contínua"], "tecnologia": ["Garantir que todos os equipamentos estejam atualizados antes do módulo", "Disponibilizar técnico de TI de suporte durante aulas que utilizam tecnologia", "Criar protocolo de backup para falhas tecnológicas (acesso offline, impressão local)"], "carga prática insuficiente": ["Aumentar proporção de aulas práticas para no mínimo 60% da carga horária", "Garantir mínimo de 3 atendimentos práticos por aluno por dia de módulo", "Reestruturar cronograma para que procedimentos sejam realizados desde o 1º dia"], "conteúdo repetitivo": ["Mapear sobreposições de conteúdo entre módulos e eliminar redundâncias", "Criar banco de casos clínicos variados com atualização semestral", "Orientar professores a diversificar abordagens e exemplos a cada edição"], "material didático": ["Garantir upload de materiais na plataforma até 24h antes de cada aula", "Padronizar formato dos materiais com identidade visual consistente", "Criar repositório centralizado e organizado por módulo e data"], "organização do módulo": ["Publicar cronograma completo com mínimo 7 dias de antecedência", "Realizar alinhamento com professores 48h antes do início do módulo", "Nomear coordenador responsável pela execução do cronograma"], "didática ruim": ["Implementar capacitação pedagógica semestral obrigatória para todos os docentes", "Criar avaliação de didática por aluno com resultado entregue individualmente ao professor", "Designar mentor pedagógico para professores com avaliações abaixo de 7"], "desorganização": ["Exigir plano de aula detalhado enviado à coordenação com 72h de antecedência", "Criar checklist de preparação para o professor antes de cada módulo", "Acompanhar professores com reclamações recorrentes em mais de 2 módulos"], "disponibilidade": ["Estabelecer SLA de resposta de 4h para mensagens de alunos durante o módulo", "Criar plantão de dúvidas obrigatório de 30 min após cada aula", "Registrar ausências e acionar substitutos em até 2h"], "quantidade de professores": ["Ampliar corpo docente com ao menos 1 preceptor adicional para módulos com mais de 10 alunos", "Criar banco de professores substitutos capacitados por especialidade", "Garantir proporção máxima de 1 professor para 6 alunos em aulas práticas"], "atrasos": ["Implementar política de início pontual com registro de horários", "Comunicar horários com antecedência mínima de 48h para todos os envolvidos", "Criar protocolo de comunicação imediata em caso de atrasos acima de 15 minutos"], "comunicação interna": ["Criar grupo exclusivo por módulo com coordenação, professores e alunos", "Designar monitor responsável por comunicados durante o módulo", "Enviar resumo do dia seguinte a todos os participantes até as 20h"], "cronograma": ["Congelar cronograma com mínimo 7 dias de antecedência sem alterações", "Criar versão digital acessível na plataforma em tempo real", "Realizar reunião de planejamento semanal com toda a equipe do módulo"], "lotação": ["Limitar número de alunos conforme capacidade real do espaço", "Criar lista de espera gerenciada para evitar excesso de inscrições", "Dividir turmas grandes em grupos rotativos para as práticas"], "qualidade da comida": ["Exigir cardápio de qualidade superior com aprovação prévia da coordenação", "Implementar avaliação mensal do serviço de alimentação com critérios mínimos", "Visitar e inspecionar o fornecedor trimestralmente"], "variedade insuficiente": ["Realizar pesquisa de preferências alimentares no início de cada módulo", "Garantir ao menos 4 opções diferentes de alimentos no buffet", "Alternar cardápio semanalmente para evitar repetição"], "quantidade insuficiente": ["Aumentar quantidade contratada em 20% acima do número de alunos confirmados", "Criar protocolo de reposição imediata quando o buffet estiver abaixo de 30%", "Designar responsável pelo monitoramento do buffet durante os intervalos"], "horário do coffee": ["Padronizar horários do coffee break (10h e 15h30) e comunicar com antecedência", "Garantir que o coffee seja servido no início do intervalo, não após", "Manter opções disponíveis por no mínimo 30 minutos após o início do intervalo"], "materiais não disponibilizados": ["Tornar obrigatório o upload de materiais até 24h antes de cada aula com notificação ao coordenador", "Criar checklist pré-módulo com verificação de todos os materiais na plataforma", "Designar responsável técnico para cobrar uploads pendentes diariamente"], "problemas técnicos": ["Realizar teste técnico da plataforma 24h antes de cada módulo", "Disponibilizar suporte técnico durante o horário de aulas para resolução imediata", "Criar plano de contingência com materiais em formato alternativo (PDF, Google Drive)"], "usabilidade": ["Enviar tutorial de uso da plataforma a todos os alunos no dia da matrícula", "Criar FAQ interativo dentro da plataforma com as dúvidas mais frequentes", "Coletar feedback de usabilidade semestralmente e repassar ao fornecedor"], "qualidade técnica": ["Padronizar configuração mínima de câmera, microfone e iluminação para professores", "Realizar teste técnico obrigatório 30 minutos antes de cada aula online", "Disponibilizar suporte técnico em tempo real durante as transmissões"], "materiais online": ["Garantir disponibilização da gravação em até 12h após o término da aula", "Manter gravações acessíveis por no mínimo 60 dias após o módulo", "Enviar notificação automática ao aluno quando a gravação for publicada"], "interatividade": ["Incluir ao menos 2 momentos de perguntas e respostas em cada aula online", "Criar fórum de dúvidas com resposta garantida em 24h", "Realizar plantão online semanal de 1h para revisão de conteúdo"], "custo elevado": ["Criar tabela de preços detalhada e acessível antes da matrícula", "Oferecer opções de parcelamento flexível para custos adicionais do módulo", "Revisar precificação com benchmark de mercado anualmente"], "falta de transparência": ["Detalhar todos os custos inclusos e não inclusos no ato da matrícula", "Criar política de reembolso clara disponível na plataforma", "Enviar extrato de cobranças mensalmente ao aluno por e-mail"], "conflitos entre alunos": ["Criar código de conduta assinado por todos os alunos na matrícula", "Designar coordenador para mediação de conflitos entre alunos", "Implementar canal anônimo de reporte de comportamentos inadequados"], "integração": ["Realizar dinâmica de integração no primeiro dia de cada módulo", "Criar grupo de comunicação entre alunos antes do início do módulo", "Promover atividade colaborativa entre alunos ao menos uma vez por módulo"], "múltiplos problemas": ["Realizar reunião de revisão do módulo com coordenação, professores e operações", "Criar plano de melhoria contínua com responsáveis e prazos definidos para cada ponto", "Implementar pesquisa de satisfação parcial na metade do módulo para ajustes em tempo real"], "expectativa não atendida": ["Revisar ementa e objetivos do módulo para maior aderência ao prometido", "Alinhar expectativas dos alunos com comunicação clara no ato da matrícula", "Coletar feedback intermediário e ajustar o módulo em tempo real"], "comunicação geral": ["Criar fluxo de comunicação centralizado com responsáveis definidos por área", "Implementar reunião diária de alinhamento operacional durante o módulo", "Designar ponto focal de comunicação acessível a alunos durante todo o módulo"]};

function normPlano(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

function detectProblemas(negRows, tema) {
  if (!negRows.length) return [];
  const patterns = PROBLEMA_PATTERNS[tema] || PROBLEMA_PATTERNS['Geral'] || {};
  const problemCounts = {};
  Object.entries(patterns).forEach(([problema, keywords]) => {
    let hits = 0;
    keywords.forEach(kw => {
      const normKw = normPlano(kw);
      negRows.forEach(r => { if (normPlano(r.feedback).includes(normKw)) hits++; });
    });
    if (hits > 0) problemCounts[problema] = hits;
  });
  return Object.entries(problemCounts)
    .sort((a,b) => b[1]-a[1])
    .map(([prob, count]) => ({ prob, count }));
}

function planoAcaoHtml(tema, negRows) {
  if (!negRows || !negRows.length) return '';
  const detected = detectProblemas(negRows, tema);
  let acoes = [];
  const problemasUsados = [];

  if (detected.length) {
    detected.slice(0, 3).forEach(({ prob, count }) => {
      const acts = ACOES_POR_PROBLEMA[prob];
      if (acts) {
        problemasUsados.push({ prob, count, acts });
        const take = detected.length === 1 ? 3 : detected.length === 2 ? 2 : 1;
        acts.slice(0, take).forEach(a => acoes.push({ acao: a, prob }));
      }
    });
  }

  if (!acoes.length) {
    const fallback = negRows.length >= 5
      ? ['Realizar reunião de revisão do módulo com coordenação e corpo docente',
         'Criar plano de melhoria com responsáveis e prazos definidos',
         'Implementar pesquisa de satisfação parcial na metade do próximo módulo']
      : ['Analisar individualmente os comentários negativos deste módulo',
         'Agendar feedback com os alunos detratores para entender a raiz do problema',
         'Definir 1 melhoria prioritária para implementar no próximo módulo'];
    fallback.forEach(a => acoes.push({ acao: a, prob: null }));
  }

  const problemaBadges = problemasUsados.length
    ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'
      + problemasUsados.map(p =>
          '<span style="background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px">'
          + p.prob + ' (' + p.count + (p.count > 1 ? ' menções' : ' menção') + ')'
          + '</span>'
        ).join('')
      + '</div>'
    : '';

  const acaoItems = acoes.map(a =>
    '<li style="margin-bottom:7px;line-height:1.5">'
    + (a.prob ? '<span style="font-size:10px;color:#6b7280;font-weight:600;display:block;margin-bottom:1px">' + a.prob + '</span>' : '')
    + a.acao
    + '</li>'
  ).join('');

  const negLabel = negRows.length === 1 ? '1 comentário negativo' : negRows.length + ' comentários negativos';

  return '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin-top:12px">'
    + '<div style="font-size:12px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">'
    + 'Plano de Ação — baseado em ' + negLabel
    + '</div>'
    + problemaBadges
    + '<ul style="margin:0;padding-left:18px;font-size:13px;color:#1e3a5f">' + acaoItems + '</ul>'
    + '</div>';
}


let _resumoUID = 0;
function makeUID() { return 'q' + (++_resumoUID); }

// ── Status de resposta dos comentários (aba Comentários, somente localStorage) ─────
const COMENTARIO_STATUS_KEY = 'csat_comentario_status';
const COMENTARIO_STATUS_DEFAULT = 'Pendente';

function getComentarioStatusMap() {
  try {
    const raw = localStorage.getItem(COMENTARIO_STATUS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('Falha ao ler status de comentários do localStorage:', e.message);
    return {};
  }
}

function getComentarioStatus(dbId) {
  const map = getComentarioStatusMap();
  return map[dbId] || COMENTARIO_STATUS_DEFAULT;
}

function setComentarioStatus(dbId, status) {
  try {
    const map = getComentarioStatusMap();
    map[dbId] = status;
    localStorage.setItem(COMENTARIO_STATUS_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('Falha ao salvar status de comentário no localStorage:', e.message);
  }
}

function comentarioStatusColor(status) {
  return status === 'Respondido' ? '#22c55e' : status === 'Em Avaliação' ? '#3b82f6' : '#f59e0b';
}

function onComentarioStatusChange(sel) {
  const dbId = sel.dataset.dbid;
  const status = sel.value;
  setComentarioStatus(dbId, status);
  const dot = document.getElementById(sel.dataset.dotid);
  if (dot) dot.style.background = comentarioStatusColor(status);
  if (typeof comentariosFilters !== 'undefined' && comentariosFilters.status && comentariosFilters.status !== status) {
    safeCall(()=>renderComentariosList(applyFilters(DATA_GERAL)), 'renderComentariosList');
  }
}

function quoteCard(r, type, opts) {
  opts = opts || {};
  const bg     = type==='pos' ? '#f0fdf4' : type==='neg' ? '#fef2f2' : '#f8fafc';
  const border = type==='pos' ? '#86efac' : type==='neg' ? '#fca5a5' : '#e2e8f0';
  const nota   = r.nota != null
    ? `<span style="font-size:10px;background:#e5e7eb;padding:1px 7px;border-radius:8px;margin-left:6px;font-weight:600">${r.nota.toFixed(1)}</span>` : '';
  const uid = makeUID();
  const unidade = r.unidade ? ` <span style="font-size:10px;color:var(--muted);font-weight:400">— ${r.unidade}</span>` : '';
  const turmaBadge = (opts.showTurma && r.di_turma)
    ? `<span style="font-size:10px;background:#dbeafe;color:#1e3a8a;padding:1px 7px;border-radius:8px;font-weight:600">${r.di_turma}</span>` : '';
  const nomeLine = (opts.showNome && r.nome)
    ? `<div style="font-weight:700;font-size:12px;color:var(--navy);margin-bottom:2px">${r.nome}</div>` : '';
  const hasMais = r.feedback.length > 200;
  let statusBlock = '';
  if (opts.showStatus && r.db_id != null) {
    const status = getComentarioStatus(r.db_id);
    const dotId = uid + '-dot';
    const statusOpts = ['Pendente','Em Avaliação','Respondido'].map(s =>
      `<option value="${s}"${s===status?' selected':''}>${s}</option>`).join('');
    statusBlock = `<div style="display:flex;align-items:center;gap:6px;margin-top:8px">
      <span id="${dotId}" style="width:9px;height:9px;border-radius:50%;background:${comentarioStatusColor(status)};display:inline-block;flex-shrink:0"></span>
      <select data-dbid="${r.db_id}" data-dotid="${dotId}" onchange="onComentarioStatusChange(this)" style="font-size:11px;padding:2px 6px;border:1px solid var(--border);border-radius:4px;background:#fff">${statusOpts}</select>
    </div>`;
  }
  // Store full text in data attribute to avoid escaping issues
  return `<div style="background:${bg};border:1px solid ${border};border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:13px;line-height:1.6"
    data-full="${r.feedback.replace(/"/g,'&quot;').replace(/'/g,'&#39;')}">
    ${nomeLine}
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
      <span style="font-size:11px;font-weight:700;color:var(--navy)">${r.hab}${unidade}</span>
      ${turmaBadge}
      ${nota}
      <span style="font-size:10px;color:var(--muted);margin-left:auto">${r.data||r.mes_label||''}</span>
    </div>
    <div id="${uid}-t" style="white-space:pre-line">${hasMais ? r.feedback.slice(0,200)+'…' : r.feedback}</div>
    ${hasMais ? `<button id="${uid}-b" data-open="0"
      onclick="(function(b){var card=b.closest('[data-full]');var t=document.getElementById('${uid}-t');if(b.dataset.open==='1'){t.textContent=card.dataset.full.slice(0,200)+'…';b.textContent='▼ Ver mais';b.dataset.open='0';}else{t.textContent=card.dataset.full;b.textContent='▲ Ver menos';b.dataset.open='1';}})(this)"
      style="background:none;border:none;color:var(--navy);font-size:11px;font-weight:600;cursor:pointer;padding:2px 0;text-decoration:underline">▼ Ver mais</button>` : ''}
    ${statusBlock}
  </div>`;
}

// ── Weighted sentiment lexicon ────────────────────────────────────────────────
const STRONG_POS = {
  'excelente':3,'excelentes':3,'otimo':3,'otima':3,'otimos':3,'otimas':3,
  'perfeito':3,'perfeita':3,'maravilhoso':3,'maravilhosa':3,'fantastico':3,'fantastica':3,
  'incrivel':3,'sensacional':3,'excepcional':3,'magnifico':3,'show':2,
  'adorei':2,'amei':2,'parabens':2,'excelencia':2,'recomendo':2,'top':2,
  'gostei':2,'satisfeito':1,'satisfeita':1,'satisfatorio':1,
  'bom':1,'boa':1,'bons':1,'boas':1,'bem':1,'legal':1,
  'organizado':1,'organizada':1,'atencioso':2,'atenciosa':2,'competente':2,
  'didatico':2,'didatica':2,'pontual':1,'eficiente':2,'qualidade':2,
  'conhecimento':1,'dedicado':2,'dedicada':2,'empenhado':2,'empenhada':2,
  'completo':1,'completa':1,'embasado':2,'embasada':2,'claro':1,'clara':1,
  'acolhedor':2,'acolhedora':2,'humanizado':2,'humanizada':2,
  'profissional':1,'profissionais':1,'comprometido':2,'comprometida':2,
  'preparado':1,'preparada':1,'dinamico':1,'dinamica':1
};
const STRONG_NEG = {
  'pessimo':-3,'pessima':-3,'horrivel':-3,'terrivel':-3,'absurdo':-3,
  'inadmissivel':-3,'lamentavel':-2,'negligencia':-2,'vergonha':-2,
  'ruim':-2,'ruins':-2,'problema':-2,'problemas':-2,'falha':-2,'falhas':-2,
  'decepcionante':-2,'decepcionei':-2,'insatisfeito':-2,'insatisfeita':-2,
  'falta':-1,'faltou':-1,'faltam':-1,'poucos':-1,'pouco':-1,'poucas':-1,
  'atraso':-1,'atrasos':-1,'demorado':-1,'demorada':-1,
  'dificuldade':-1,'dificuldades':-1,'dificil':-1,
  'melhorar':-1,'melhore':-1,'precisa':-1,'necessario':-1,'necessaria':-1,
  'infelizmente':-2,'pena':-1,'pior':-2,'piora':-2,'piorou':-2,
  'fraco':-2,'fraca':-2,'deficiente':-2,'inadequado':-2,'inadequada':-2,
  'desorganizado':-2,'desorganizada':-2,'confuso':-1,'confusa':-1,
  'insuficiente':-1,'escasso':-1,'limitado':-1,'restrito':-1,
  'caos':-2,'bagunca':-2,'critico':-2,'critica':-2,'grave':-2,
  'quebrado':-1,'velho':-1,'velha':-1,'antigo':-1,'antiga':-1,
  'sujo':-1,'suja':-1,'barulho':-1,'apertado':-1,'pequeno':-1,'pequena':-1
};
const NEGATION = new Set(['nao','nem','nunca','jamais','sequer','tampouco','nenhum','nenhuma']);

function normWord(w) {
  return w.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

function scoreText(text) {
  const words = text.replace(/[\s,.!?;:()\-\n\r"\/\\]+/g,' ').trim()
    .split(' ').filter(Boolean).map(normWord);
  let score = 0.0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (NEGATION.has(w) && i+1 < words.length) {
      const nw = words[i+1];
      if (nw in STRONG_POS) { score -= STRONG_POS[nw]; i++; continue; }
      else if (nw in STRONG_NEG) { score -= STRONG_NEG[nw]; i++; continue; }
      else { score -= 0.3; }
    } else if (w in STRONG_POS) {
      score += STRONG_POS[w];
    } else if (w in STRONG_NEG) {
      score += STRONG_NEG[w];
    }
  }
  return score;
}

function analyzeComment(r) {
  const words = normWord(r.feedback)
    .split(/[\s,.!?;:()\-\n\r"\/\\]+/).filter(w => w.length > 2);
  const temaHits = {};
  const temaWeight = {};
  const temaFirstPos = {};
  words.forEach((w, i) => {
    const t = TEMA_LOOKUP[w];
    if (!t) return;
    temaHits[t] = (temaHits[t]||0) + 1;
    // peso = 1 / tamanho do dicionário do tema -- ver TEMA_DICT_SIZE
    temaWeight[t] = (temaWeight[t]||0) + 1 / (TEMA_DICT_SIZE[t] || 1);
    if (temaFirstPos[t] === undefined) temaFirstPos[t] = i;
  });
  const temas = Object.keys(temaHits);
  // Tema dominante = maior peso (não maior contagem bruta -- uma palavra de
  // dicionário pequeno/específico, ex. "online", pesa mais que várias
  // palavras genéricas repetidas de um dicionário grande, ex. "aula"/"módulo"
  // em "Aulas"); empate desempatado pela palavra que apareceu primeiro no
  // texto (o que a pessoa menciona antes tende a ser o assunto principal).
  // Usado onde um comentário só pode contar em 1 lugar (ver
  // renderCrossAnalise) -- `temas` (todos os temas tocados) continua
  // disponível pra quem quiser contar em mais de um (Resumo Executivo / aba
  // Análise de Comentários).
  const temaDominante = temas.length
    ? temas.slice().sort((a,b) => (temaWeight[b]-temaWeight[a]) || (temaFirstPos[a]-temaFirstPos[b]))[0]
    : null;
  const score = scoreText(r.feedback);
  let sentiment;
  // Nota: 9-10 = Promotor, 7-8 = Neutro, 1-6 = Detrator
  if (r.nota >= 9)      sentiment = score < -3 ? 'neu' : 'pos';
  else if (r.nota <= 6) sentiment = score > 4  ? 'neu' : 'neg';
  else                  sentiment = 'neu'; // 7-8 always neutral
  return { temas, temaHits, temaDominante, sentiment, score };
}

function applyFiltersResumo() {
  const MES_SEQ = [9,10,11,12,1,2,3,4,5,6,7,8,13];
  const MES_LABEL_MAP = {9:'set/25',10:'out/25',11:'nov/25',12:'dez/25',
    1:'jan/26',2:'fev/26',3:'mar/26',4:'abr/26',5:'mai/26',6:'jun/26',7:'jul/26',8:'ago/26',13:'set/26'};
  let effectiveMes = null; // null = all months; array = selected months
  if (F.mes && F.mes.length > 0) {
    effectiveMes = F.mes; // array
  } else {
    const presentMes = new Set(DATA_FEEDBACK.map(r=>r.mes_order).filter(Boolean));
    const sorted = MES_SEQ.filter(m => presentMes.has(m));
    effectiveMes = [MES_LABEL_MAP[sorted[sorted.length-1]] || null].filter(Boolean);
  }
  return DATA_FEEDBACK.filter(r => {
    if (effectiveMes && effectiveMes.length > 0 && !effectiveMes.includes(r.mes_label)) return false;
    if (F.unidade && r.unidade !== F.unidade) return false;
    if (F.semana  && r.semana_key !== F.semana) return false;
    if (F.hab     && r.hab !== F.hab) return false;
    return true;
  });
}

function buildAllCommentsTable(rows) {
  const sorted = [...rows].sort((a,b) => (b.ts||0) - (a.ts||0));
  const trs = sorted.map(r => {
    const notaCls = r.nota>=9?'ng':r.nota>=7?'nw':'nb';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:7px 9px;white-space:nowrap;color:var(--muted);font-size:12px">${r.cod||'—'}</td>
      <td style="padding:7px 9px;font-weight:600;white-space:nowrap">${r.hab||'—'}</td>
      <td style="padding:7px 9px;white-space:nowrap;color:var(--muted);font-size:12px">${r.data||'—'}</td>
      <td style="padding:7px 9px;text-align:center"><span class="${notaCls}" style="font-weight:700">${r.nota!=null?r.nota.toFixed(0):'—'}</span></td>
      <td style="padding:7px 9px;font-size:12px;color:var(--muted)">${r.disciplina||'—'}</td>
      <td style="padding:7px 9px;max-width:460px;line-height:1.5;white-space:pre-line">${r.feedback||''}</td>
      <td style="padding:7px 9px;white-space:nowrap;font-size:12px;color:var(--muted)">${r.unidade||'—'}</td>
    </tr>`;
  }).join('');

  return `
    <h3 style="margin:24px 0 14px;font-size:15px;color:var(--navy);border-bottom:2px solid var(--border);padding-bottom:8px">
      📋 Todos os Comentários (${sorted.length})
    </h3>
    <div class="cbox" style="padding:0;overflow:hidden">
      <div style="overflow:auto;max-height:560px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="position:sticky;top:0;z-index:1">
            <tr style="background:var(--navy);color:#fff">
              <th style="padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">Cod Turma</th>
              <th style="padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">Habilitação</th>
              <th style="padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">Data</th>
              <th style="padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">Nota</th>
              <th style="padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px">Disciplina</th>
              <th style="padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px">Feedback Aluno</th>
              <th style="padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">Unidade</th>
            </tr>
          </thead>
          <tbody>${trs}</tbody>
        </table>
      </div>
    </div>`;
}

// ============ RANKING POR MODULO ============
let modulosSortState = { col: 'media', dir: 'desc' };
let modulosSearchTerm = '';
let modulosFilters = { curso: '', turma: '', mes: '' };

function clearModulosFilters() {
  modulosFilters = { curso: '', turma: '', mes: '' };
  ['modulos-f-curso','modulos-f-turma','modulos-f-mes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const s = document.getElementById('modulos-search');
  if (s) s.value = '';
  modulosSearchTerm = '';
  renderAll();
}

function populateModulosFilters() {
  const cursoSel = document.getElementById('modulos-f-curso');
  const turmaSel = document.getElementById('modulos-f-turma');
  const mesSel = document.getElementById('modulos-f-mes');
  if (!cursoSel || !turmaSel || !mesSel) return;

  const cursos = [...new Set(DATA_GERAL.map(r => r.habilitacao))].sort();
  const existingCursos = [...cursoSel.options].slice(1).map(o => o.value).join('|');
  if (existingCursos !== cursos.join('|')) {
    while (cursoSel.options.length > 1) cursoSel.remove(1);
    cursos.forEach(h => { const o = document.createElement('option'); o.value = h; o.textContent = h; cursoSel.appendChild(o); });
  }

  const turmas = [...new Set(DATA_GERAL.map(r => r.di_turma))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
  const existingTurmas = [...turmaSel.options].slice(1).map(o => o.value).join('|');
  if (existingTurmas !== turmas.join('|')) {
    while (turmaSel.options.length > 1) turmaSel.remove(1);
    turmas.forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; turmaSel.appendChild(o); });
  }

  const allMes = [
    {o:9,l:'set/25'},{o:10,l:'out/25'},{o:11,l:'nov/25'},{o:12,l:'dez/25'},
    {o:1,l:'jan/26'},{o:2,l:'fev/26'},{o:3,l:'mar/26'},{o:4,l:'abr/26'},{o:5,l:'mai/26'},{o:6,l:'jun/26'},{o:7,l:'jul/26'},{o:8,l:'ago/26'},{o:13,l:'set/26'}
  ];
  const presentMes = new Set(DATA_GERAL.map(r => r.mes_label));
  const mesLabels = allMes.filter(m => presentMes.has(m.l)).map(m => m.l);
  const existingMes = [...mesSel.options].slice(1).map(o => o.value).join('|');
  if (existingMes !== mesLabels.join('|')) {
    while (mesSel.options.length > 1) mesSel.remove(1);
    mesLabels.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; mesSel.appendChild(o); });
  }

  if (!cursoSel._wired) { cursoSel.addEventListener('change', e => { modulosFilters.curso = e.target.value; renderAll(); }); cursoSel._wired = true; }
  if (!turmaSel._wired) { turmaSel.addEventListener('change', e => { modulosFilters.turma = e.target.value; renderAll(); }); turmaSel._wired = true; }
  if (!mesSel._wired)  { mesSel.addEventListener('change', e => { modulosFilters.mes = e.target.value; renderAll(); }); mesSel._wired = true; }
}

function computeModulosRanking(filteredData) {
  const map = {};
  filteredData.forEach(r => {
    const mod = (r.disciplina || '').trim();
    if (!mod) return;
    const key = mod + '|||' + r.habilitacao;
    if (!map[key]) map[key] = { modulo: mod, curso: r.habilitacao, notas: [] };
    map[key].notas.push(r.nota_geral);
  });
  return Object.values(map).map(v => {
    const total = v.notas.length;
    const media = v.notas.reduce((a,b)=>a+b, 0) / total;
    const promotores = v.notas.filter(n => n >= 9).length;
    const aderencia = total ? (promotores / total * 100) : null;
    return { modulo: v.modulo, curso: v.curso, media, total, aderencia };
  });
}

function sortModulos(col) {
  if (modulosSortState.col === col) {
    modulosSortState.dir = modulosSortState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    modulosSortState = { col, dir: (col === 'modulo' || col === 'curso') ? 'asc' : 'desc' };
  }
  renderAll();
}

function renderModulosRanking(filteredData) {
  populateModulosFilters();
  let base = filteredData;
  if (modulosFilters.curso) base = base.filter(r => r.habilitacao === modulosFilters.curso);
  if (modulosFilters.turma) base = base.filter(r => r.di_turma === modulosFilters.turma);
  if (modulosFilters.mes)   base = base.filter(r => r.mes_label === modulosFilters.mes);
  let rows = computeModulosRanking(base);
  if (modulosSearchTerm) {
    const term = modulosSearchTerm.toLowerCase();
    rows = rows.filter(r => r.modulo.toLowerCase().includes(term) || r.curso.toLowerCase().includes(term));
  }
  const { col, dir } = modulosSortState;
  rows.sort((a,b) => {
    let av = a[col], bv = b[col];
    if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  const arrow = c => modulosSortState.col === c ? (modulosSortState.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const th = (label, colKey) => `<th onclick="sortModulos('${colKey}')" style="padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;cursor:pointer;user-select:none">${label}${arrow(colKey)}</th>`;

  const trs = rows.map(r => {
    const notaCls = r.media >= 8 ? 'ng' : r.media >= 6.5 ? 'nw' : 'nb';
    const aderCell = r.aderencia == null
      ? `<span style="color:var(--muted)">N/D</span>`
      : (() => { const cls = r.aderencia >= 60 ? 'ng' : r.aderencia >= 40 ? 'nw' : 'nb'; return `<span class="${cls}">${r.aderencia.toFixed(1)}%</span>`; })();
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:7px 9px;max-width:420px">${r.modulo}</td>
      <td style="padding:7px 9px;white-space:nowrap;color:var(--muted);font-size:12px">${r.curso}</td>
      <td style="padding:7px 9px;text-align:center"><span class="${notaCls}">${r.media.toFixed(2)}</span></td>
      <td style="padding:7px 9px;text-align:center;color:var(--muted)">${r.total}</td>
      <td style="padding:7px 9px;text-align:center">${aderCell}</td>
    </tr>`;
  }).join('');

  const bodyHtml = `
    <div style="overflow:auto;max-height:640px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead style="position:sticky;top:0;z-index:1">
          <tr style="background:var(--navy);color:#fff">
            ${th('Módulo','modulo')}
            ${th('Curso','curso')}
            ${th('Nota Média','media')}
            ${th('Total Respostas','total')}
            ${th('% Aderência','aderencia')}
          </tr>
        </thead>
        <tbody>${trs || '<tr><td colspan="5" style="padding:14px;text-align:center;color:var(--muted)">Nenhum módulo encontrado</td></tr>'}</tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px">${rows.length} módulo(s)</div>
  `;
  const wrap = document.getElementById('modulos-table-wrap');
  if (wrap) wrap.innerHTML = bodyHtml;
}

// ============ RANKING POR TURMA ============
let turmasSortState = { col: 'media', dir: 'desc' };
let turmasSearchTerm = '';
let turmasFilters = { curso: '', unidade: '', mes: '' };

function clearTurmasFilters() {
  turmasFilters = { curso: '', unidade: '', mes: '' };
  ['turmas-f-curso','turmas-f-unidade','turmas-f-mes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const s = document.getElementById('turmas-search');
  if (s) s.value = '';
  turmasSearchTerm = '';
  renderAll();
}

function populateTurmasFilters() {
  const cursoSel = document.getElementById('turmas-f-curso');
  const unidadeSel = document.getElementById('turmas-f-unidade');
  const mesSel = document.getElementById('turmas-f-mes');
  if (!cursoSel || !unidadeSel || !mesSel) return;

  const cursos = [...new Set(DATA_GERAL.map(r => r.habilitacao))].sort();
  const existingCursos = [...cursoSel.options].slice(1).map(o => o.value).join('|');
  if (existingCursos !== cursos.join('|')) {
    while (cursoSel.options.length > 1) cursoSel.remove(1);
    cursos.forEach(h => { const o = document.createElement('option'); o.value = h; o.textContent = h; cursoSel.appendChild(o); });
  }

  const unidades = [...new Set(DATA_GERAL.map(r => r.unidade_calc))].sort();
  const existingUnidades = [...unidadeSel.options].slice(1).map(o => o.value).join('|');
  if (existingUnidades !== unidades.join('|')) {
    while (unidadeSel.options.length > 1) unidadeSel.remove(1);
    unidades.forEach(u => { const o = document.createElement('option'); o.value = u; o.textContent = u; unidadeSel.appendChild(o); });
  }

  const allMes = [
    {o:9,l:'set/25'},{o:10,l:'out/25'},{o:11,l:'nov/25'},{o:12,l:'dez/25'},
    {o:1,l:'jan/26'},{o:2,l:'fev/26'},{o:3,l:'mar/26'},{o:4,l:'abr/26'},{o:5,l:'mai/26'},{o:6,l:'jun/26'},{o:7,l:'jul/26'},{o:8,l:'ago/26'},{o:13,l:'set/26'}
  ];
  const presentMes = new Set(DATA_GERAL.map(r => r.mes_label));
  const mesLabels = allMes.filter(m => presentMes.has(m.l)).map(m => m.l);
  const existingMes = [...mesSel.options].slice(1).map(o => o.value).join('|');
  if (existingMes !== mesLabels.join('|')) {
    while (mesSel.options.length > 1) mesSel.remove(1);
    mesLabels.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; mesSel.appendChild(o); });
  }

  if (!cursoSel._wired)   { cursoSel.addEventListener('change', e => { turmasFilters.curso = e.target.value; renderAll(); }); cursoSel._wired = true; }
  if (!unidadeSel._wired) { unidadeSel.addEventListener('change', e => { turmasFilters.unidade = e.target.value; renderAll(); }); unidadeSel._wired = true; }
  if (!mesSel._wired)     { mesSel.addEventListener('change', e => { turmasFilters.mes = e.target.value; renderAll(); }); mesSel._wired = true; }
}

function computeTurmasRanking(filteredData) {
  const map = {};
  filteredData.forEach(r => {
    const key = r.di_turma + '|||' + r.unidade_calc;
    if (!map[key]) map[key] = { turma: r.di_turma, curso: r.habilitacao, unidade: r.unidade_calc, notas: [] };
    map[key].notas.push(r.nota_geral);
  });
  return Object.values(map).map(v => {
    const total = v.notas.length;
    const media = v.notas.reduce((a,b)=>a+b, 0) / total;
    const promotores = v.notas.filter(n => n >= 9).length;
    const aderencia = total ? (promotores / total * 100) : null;
    return { turma: v.turma, curso: v.curso, unidade: v.unidade, media, total, aderencia };
  });
}

function sortTurmas(col) {
  if (turmasSortState.col === col) {
    turmasSortState.dir = turmasSortState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    turmasSortState = { col, dir: (col === 'turma' || col === 'curso' || col === 'unidade') ? 'asc' : 'desc' };
  }
  renderAll();
}

function renderTurmasRanking(filteredData) {
  populateTurmasFilters();
  let base = filteredData;
  if (turmasFilters.curso)   base = base.filter(r => r.habilitacao === turmasFilters.curso);
  if (turmasFilters.unidade) base = base.filter(r => r.unidade_calc === turmasFilters.unidade);
  if (turmasFilters.mes)     base = base.filter(r => r.mes_label === turmasFilters.mes);
  let rows = computeTurmasRanking(base);
  if (turmasSearchTerm) {
    const term = turmasSearchTerm.toLowerCase();
    rows = rows.filter(r => r.turma.toLowerCase().includes(term) || r.curso.toLowerCase().includes(term));
  }
  const { col, dir } = turmasSortState;
  rows.sort((a,b) => {
    let av = a[col], bv = b[col];
    if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  const arrow = c => turmasSortState.col === c ? (turmasSortState.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const th = (label, colKey) => `<th onclick="sortTurmas('${colKey}')" style="padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;cursor:pointer;user-select:none">${label}${arrow(colKey)}</th>`;

  const trs = rows.map(r => {
    const notaCls = r.media >= 8 ? 'ng' : r.media >= 6.5 ? 'nw' : 'nb';
    const aderCell = r.aderencia == null
      ? `<span style="color:var(--muted)">N/D</span>`
      : (() => { const cls = r.aderencia >= 60 ? 'ng' : r.aderencia >= 40 ? 'nw' : 'nb'; return `<span class="${cls}">${r.aderencia.toFixed(1)}%</span>`; })();
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:7px 9px;white-space:nowrap;font-weight:600">${r.turma}</td>
      <td style="padding:7px 9px;white-space:nowrap;color:var(--muted);font-size:12px">${r.curso}</td>
      <td style="padding:7px 9px;white-space:nowrap;color:var(--muted);font-size:12px">${r.unidade}</td>
      <td style="padding:7px 9px;text-align:center"><span class="${notaCls}">${r.media.toFixed(2)}</span></td>
      <td style="padding:7px 9px;text-align:center;color:var(--muted)">${r.total}</td>
      <td style="padding:7px 9px;text-align:center">${aderCell}</td>
    </tr>`;
  }).join('');

  const bodyHtml = `
    <div style="overflow:auto;max-height:640px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead style="position:sticky;top:0;z-index:1">
          <tr style="background:var(--navy);color:#fff">
            ${th('Turma','turma')}
            ${th('Curso','curso')}
            ${th('Unidade','unidade')}
            ${th('Nota Média','media')}
            ${th('Total Respostas','total')}
            ${th('% Aderência','aderencia')}
          </tr>
        </thead>
        <tbody>${trs || '<tr><td colspan="6" style="padding:14px;text-align:center;color:var(--muted)">Nenhuma turma encontrada</td></tr>'}</tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px">${rows.length} turma(s)</div>
  `;
  const wrap = document.getElementById('turmas-table-wrap');
  if (wrap) wrap.innerHTML = bodyHtml;
}

// ============ ABA TRIAGEM & PACIENTES (cruzamento comentários x CSAT) ============
let triagemSortState = { col: 'total_mencoes', dir: 'desc' };
let triagemFilters = { curso: '', unidade: '', mes: '' };
let triagemCatFilters = { qualidade: true, quantidade: true, manifestacao: true };
let triagemSearchTerm = '';

function clearTriagemFilters() {
  triagemFilters = { curso: '', unidade: '', mes: '' };
  ['triagem-f-curso','triagem-f-unidade','triagem-f-mes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  triagemCatFilters = { qualidade: true, quantidade: true, manifestacao: true };
  ['triagem-cat-qualidade','triagem-cat-quantidade','triagem-cat-manifestacao'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = true;
  });
  const s = document.getElementById('triagem-search');
  if (s) s.value = '';
  triagemSearchTerm = '';
  renderAll();
}

function populateTriagemFilters() {
  const cursoSel = document.getElementById('triagem-f-curso');
  const unidadeSel = document.getElementById('triagem-f-unidade');
  const mesSel = document.getElementById('triagem-f-mes');
  if (!cursoSel || !unidadeSel || !mesSel) return;

  const cursos = [...new Set(DATA_GERAL.map(r => r.habilitacao))].sort();
  const existingCursos = [...cursoSel.options].slice(1).map(o => o.value).join('|');
  if (existingCursos !== cursos.join('|')) {
    while (cursoSel.options.length > 1) cursoSel.remove(1);
    cursos.forEach(h => { const o = document.createElement('option'); o.value = h; o.textContent = h; cursoSel.appendChild(o); });
  }

  const unidades = [...new Set(DATA_GERAL.map(r => r.unidade_calc))].sort();
  const existingUnidades = [...unidadeSel.options].slice(1).map(o => o.value).join('|');
  if (existingUnidades !== unidades.join('|')) {
    while (unidadeSel.options.length > 1) unidadeSel.remove(1);
    unidades.forEach(u => { const o = document.createElement('option'); o.value = u; o.textContent = u; unidadeSel.appendChild(o); });
  }

  const allMes = [
    {o:9,l:'set/25'},{o:10,l:'out/25'},{o:11,l:'nov/25'},{o:12,l:'dez/25'},
    {o:1,l:'jan/26'},{o:2,l:'fev/26'},{o:3,l:'mar/26'},{o:4,l:'abr/26'},{o:5,l:'mai/26'},{o:6,l:'jun/26'},{o:7,l:'jul/26'},{o:8,l:'ago/26'},{o:13,l:'set/26'}
  ];
  const presentMes = new Set(DATA_GERAL.map(r => r.mes_label));
  const mesLabels = allMes.filter(m => presentMes.has(m.l)).map(m => m.l);
  const existingMes = [...mesSel.options].slice(1).map(o => o.value).join('|');
  if (existingMes !== mesLabels.join('|')) {
    while (mesSel.options.length > 1) mesSel.remove(1);
    mesLabels.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; mesSel.appendChild(o); });
  }

  if (!cursoSel._wired)   { cursoSel.addEventListener('change', e => { triagemFilters.curso = e.target.value; renderAll(); }); cursoSel._wired = true; }
  if (!unidadeSel._wired) { unidadeSel.addEventListener('change', e => { triagemFilters.unidade = e.target.value; renderAll(); }); unidadeSel._wired = true; }
  if (!mesSel._wired)     { mesSel.addEventListener('change', e => { triagemFilters.mes = e.target.value; renderAll(); }); mesSel._wired = true; }

  ['triagem-cat-qualidade','triagem-cat-quantidade','triagem-cat-manifestacao'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el._wired) {
      el.addEventListener('change', e => {
        const key = id.replace('triagem-cat-','');
        triagemCatFilters[key] = e.target.checked;
        renderAll();
      });
      el._wired = true;
    }
  });

  const search = document.getElementById('triagem-search');
  if (search && !search._wired) {
    search.addEventListener('input', e => { triagemSearchTerm = e.target.value; renderAll(); });
    search._wired = true;
  }
}

// Comentários (DATA_FEEDBACK) enriquecidos com nota_Triagem (join via db-id/db_id) e classificação
function computeTriagemComentarios() {
  return DATA_FEEDBACK.map(r => {
    const g = IDX_GERAL[r.db_id] || {};
    const cls = classificaTriagemComentario(r.feedback);
    return Object.assign({}, r, { nota_Triagem: g.nota_Triagem, qualidade: cls.qualidade, quantidade: cls.quantidade, manifestacao: cls.manifestacao, any: cls.any });
  }).filter(r => r.any);
}

// Agrega por turma: nota geral média e nota Triagem média vêm de TODAS as respostas da turma (filteredData),
// as contagens de comentários vêm apenas das respostas com feedback escrito (comentarios)
function computeTriagemRanking(filteredData, comentarios) {
  const map = {};
  filteredData.forEach(r => {
    const key = r.di_turma + '|||' + r.unidade_calc;
    if (!map[key]) map[key] = { turma: r.di_turma, curso: r.habilitacao, unidade: r.unidade_calc, notas: [], notasTriagem: [], qualidade: 0, quantidade: 0, manifestacao: 0 };
    map[key].notas.push(r.nota_geral);
    if (r.nota_Triagem != null) map[key].notasTriagem.push(r.nota_Triagem);
  });
  comentarios.forEach(r => {
    const key = r.di_turma + '|||' + r.unidade;
    if (!map[key]) map[key] = { turma: r.di_turma, curso: r.hab, unidade: r.unidade, notas: [], notasTriagem: [], qualidade: 0, quantidade: 0, manifestacao: 0 };
    if (r.qualidade) map[key].qualidade++;
    if (r.quantidade) map[key].quantidade++;
    if (r.manifestacao) map[key].manifestacao++;
  });
  return Object.values(map)
    .map(v => {
      const total = v.notas.length;
      const media = total ? v.notas.reduce((a,b)=>a+b, 0) / total : null;
      const mediaTriagem = v.notasTriagem.length ? v.notasTriagem.reduce((a,b)=>a+b, 0) / v.notasTriagem.length : null;
      return {
        turma: v.turma, curso: v.curso, unidade: v.unidade,
        media, mediaTriagem, total,
        qualidade: v.qualidade, quantidade: v.quantidade, manifestacao: v.manifestacao,
        total_mencoes: v.qualidade + v.quantidade + v.manifestacao
      };
    })
    .filter(v => v.total_mencoes > 0);
}

function sortTriagem(col) {
  if (triagemSortState.col === col) {
    triagemSortState.dir = triagemSortState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    triagemSortState = { col, dir: (col === 'turma' || col === 'curso' || col === 'unidade') ? 'asc' : 'desc' };
  }
  renderAll();
}

function triagemQuoteCard(r) {
  const badges = [];
  if (r.qualidade) badges.push('<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;white-space:nowrap">Qualidade da Triagem</span>');
  if (r.quantidade) badges.push('<span style="background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;white-space:nowrap">Quantidade/Agenda</span>');
  if (r.manifestacao) badges.push('<span style="background:#fee2e2;color:#b91c1c;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;white-space:nowrap">Manifestação</span>');
  const notaG = r.nota != null ? r.nota.toFixed(1) : '—';
  const notaT = r.nota_Triagem != null ? r.nota_Triagem.toFixed(1) : '—';
  const hasMais = r.feedback.length > 220;
  const uid = makeUID();
  return `<div style="background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:13px;line-height:1.6"
    data-full="${r.feedback.replace(/"/g,'&quot;').replace(/'/g,'&#39;')}">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
      <span style="font-size:11px;font-weight:700;color:var(--navy)">${r.di_turma||''}</span>
      <span style="font-size:10px;color:var(--muted)">— ${r.unidade||''}</span>
      <span style="font-size:10px;background:#e5e7eb;padding:1px 7px;border-radius:8px;font-weight:600">Geral ${notaG}</span>
      <span style="font-size:10px;background:#e5e7eb;padding:1px 7px;border-radius:8px;font-weight:600">Triagem ${notaT}</span>
      <span style="font-size:10px;color:var(--muted);margin-left:auto">${r.data||r.mes_label||''}</span>
    </div>
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px">${badges.join('')}</div>
    <div id="${uid}-t" style="white-space:pre-line">${hasMais ? r.feedback.slice(0,220)+'…' : r.feedback}</div>
    ${hasMais ? `<button id="${uid}-b" data-open="0"
      onclick="(function(b){var card=b.closest('[data-full]');var t=document.getElementById('${uid}-t');if(b.dataset.open==='1'){t.textContent=card.dataset.full.slice(0,220)+'…';b.textContent='▼ Ver mais';b.dataset.open='0';}else{t.textContent=card.dataset.full;b.textContent='▲ Ver menos';b.dataset.open='1';}})(this)"
      style="background:none;border:none;color:var(--navy);font-size:11px;font-weight:600;cursor:pointer;padding:2px 0;text-decoration:underline">▼ Ver mais</button>` : ''}
  </div>`;
}

// ── Correlação Nota Geral x Nota Triagem (Pearson) ───────────────────────────
function pearsonR(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a,b)=>a+b, 0) / n;
  const my = ys.reduce((a,b)=>a+b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? null : num / den;
}

function interpretaR(r) {
  if (r == null) return { label: 'Dados insuficientes', color: '#94a3b8' };
  const abs = Math.abs(r);
  const dir = r >= 0 ? 'positiva' : 'negativa';
  let forca, color;
  if (abs < 0.3)      { forca = 'fraca';    color = '#94a3b8'; }
  else if (abs < 0.6) { forca = 'moderada'; color = '#d97706'; }
  else                { forca = 'forte';    color = '#16a34a'; }
  return { label: `Correlação ${forca} ${dir}`, color };
}

// ── Correlação Nota Geral (0–10) × cada item avaliado (0–5) — aba Correlações ───
// Os itens específicos são avaliados em escala 0–5 (muito insatisfeito(1) a muito satisfeito(5));
// a Nota Geral do CSAT é 0–10. Por isso a correlação é sempre Nota Geral × item — não item × item
// (mesma unidade de medida em ambos os lados não faria sentido comparar aqui) — e o eixo do item
// no gráfico de dispersão usa 0–5, não 0–10.
const CORR_GERAL = { key: 'nota_geral', label: 'Nota Geral', max: 10 };
const CORR_ITEMS = [
  { key: 'nota_Aula_Online', label: 'Aula Online', max: 5 },
  { key: 'nota_Aula_Prática', label: 'Aula Prática', max: 5 },
  { key: 'nota_Infraestrutura', label: 'Infraestrutura', max: 5 },
  { key: 'nota_Plataforma_Avida', label: 'Plataforma Avida', max: 5 },
  { key: 'nota_Professor', label: 'Professor', max: 5 },
  { key: 'nota_Triagem', label: 'Triagem', max: 5 },
];

let correlacoesFilters = { curso: '', unidade: '', mes: '' };
let correlacoesGranularity = 'resposta';
let correlacoesItem = 'nota_Triagem';

function clearCorrelacoesFilters() {
  correlacoesFilters = { curso: '', unidade: '', mes: '' };
  ['correlacoes-f-curso','correlacoes-f-unidade','correlacoes-f-mes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderAll();
}

function populateCorrelacoesFilters() {
  const cursoSel = document.getElementById('correlacoes-f-curso');
  const unidadeSel = document.getElementById('correlacoes-f-unidade');
  const mesSel = document.getElementById('correlacoes-f-mes');
  const itemSel = document.getElementById('corr-item-sel');
  if (!cursoSel || !unidadeSel || !mesSel || !itemSel) return;

  const cursos = [...new Set(DATA_GERAL.map(r => r.habilitacao))].sort();
  const existingCursos = [...cursoSel.options].slice(1).map(o => o.value).join('|');
  if (existingCursos !== cursos.join('|')) {
    while (cursoSel.options.length > 1) cursoSel.remove(1);
    cursos.forEach(h => { const o = document.createElement('option'); o.value = h; o.textContent = h; cursoSel.appendChild(o); });
  }

  const unidades = [...new Set(DATA_GERAL.map(r => r.unidade_calc))].sort();
  const existingUnidades = [...unidadeSel.options].slice(1).map(o => o.value).join('|');
  if (existingUnidades !== unidades.join('|')) {
    while (unidadeSel.options.length > 1) unidadeSel.remove(1);
    unidades.forEach(u => { const o = document.createElement('option'); o.value = u; o.textContent = u; unidadeSel.appendChild(o); });
  }

  const allMes = [
    {o:9,l:'set/25'},{o:10,l:'out/25'},{o:11,l:'nov/25'},{o:12,l:'dez/25'},
    {o:1,l:'jan/26'},{o:2,l:'fev/26'},{o:3,l:'mar/26'},{o:4,l:'abr/26'},{o:5,l:'mai/26'},{o:6,l:'jun/26'},{o:7,l:'jul/26'},{o:8,l:'ago/26'},{o:13,l:'set/26'}
  ];
  const presentMes = new Set(DATA_GERAL.map(r => r.mes_label));
  const mesLabels = allMes.filter(m => presentMes.has(m.l)).map(m => m.l);
  const existingMes = [...mesSel.options].slice(1).map(o => o.value).join('|');
  if (existingMes !== mesLabels.join('|')) {
    while (mesSel.options.length > 1) mesSel.remove(1);
    mesLabels.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; mesSel.appendChild(o); });
  }

  if (!itemSel.options.length) {
    CORR_ITEMS.forEach(v => { const o = document.createElement('option'); o.value = v.key; o.textContent = v.label; itemSel.appendChild(o); });
    itemSel.value = correlacoesItem;
  }

  if (!cursoSel._wired)   { cursoSel.addEventListener('change', e => { correlacoesFilters.curso = e.target.value; renderAll(); }); cursoSel._wired = true; }
  if (!unidadeSel._wired) { unidadeSel.addEventListener('change', e => { correlacoesFilters.unidade = e.target.value; renderAll(); }); unidadeSel._wired = true; }
  if (!mesSel._wired)     { mesSel.addEventListener('change', e => { correlacoesFilters.mes = e.target.value; renderAll(); }); mesSel._wired = true; }
  if (!itemSel._wired)    { itemSel.addEventListener('change', e => { correlacoesItem = e.target.value; renderAll(); }); itemSel._wired = true; }
}

function setCorrGranularity(g) {
  correlacoesGranularity = g;
  const rb = document.getElementById('corr-gran-resposta');
  const tb = document.getElementById('corr-gran-turma');
  if (rb) rb.classList.toggle('active', g === 'resposta');
  if (tb) tb.classList.toggle('active', g === 'turma');
  renderAll();
}

function selectCorrItem(key) {
  correlacoesItem = key;
  const sel = document.getElementById('corr-item-sel');
  if (sel) sel.value = key;
  renderAll();
}

// Agrega DATA_GERAL por turma (di_turma+unidade_calc), média de cada variável (Nota Geral + itens) a partir dos valores não-nulos
function aggregateGeralByTurma(baseGeral) {
  const allVars = [CORR_GERAL, ...CORR_ITEMS];
  const map = {};
  baseGeral.forEach(r => {
    const key = r.di_turma + '|||' + r.unidade_calc;
    if (!map[key]) map[key] = {};
    allVars.forEach(v => {
      const val = r[v.key];
      if (val != null) {
        if (!map[key][v.key]) map[key][v.key] = [];
        map[key][v.key].push(val);
      }
    });
  });
  return Object.values(map).map(g => {
    const row = {};
    allVars.forEach(v => {
      const arr = g[v.key];
      row[v.key] = (arr && arr.length) ? arr.reduce((a,b)=>a+b, 0) / arr.length : null;
    });
    return row;
  });
}

// Correlação da Nota Geral (0–10) com cada um dos 6 itens (0–5) — nunca item × item
function computeCorrGeralItens(baseGeral, granularity) {
  const rows = granularity === 'turma' ? aggregateGeralByTurma(baseGeral) : baseGeral;
  return CORR_ITEMS.map(item => {
    const pairs = rows.filter(row => row[CORR_GERAL.key] != null && row[item.key] != null);
    const r = pairs.length >= 2 ? pearsonR(pairs.map(p => p[CORR_GERAL.key]), pairs.map(p => p[item.key])) : null;
    return { item, r, n: pairs.length };
  });
}

function corrColor(r) {
  if (r == null) return '#f1f5f9';
  const abs = Math.min(Math.abs(r), 1);
  if (r >= 0) {
    const g = Math.round(255 - abs * 30);
    const rb = Math.round(255 - abs * 205);
    return `rgb(${rb},${g},${rb})`;
  }
  const rb = Math.round(255 - abs * 30);
  const g = Math.round(255 - abs * 205);
  return `rgb(${rb},${g},${g})`;
}

function renderCorrHeatmap(containerId, results, onclickFn) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const fn = onclickFn || 'selectCorrItem';
  let html = '<div style="overflow:auto"><table style="border-collapse:collapse;font-size:12px;width:100%">';
  html += '<tr><th style="padding:6px 8px;text-align:left;color:var(--navy)">Nota Geral ×</th>' +
    results.map(res => `<th style="padding:6px 8px;font-size:11px;text-align:center;white-space:nowrap;color:var(--navy)">${res.item.label}</th>`).join('') + '</tr>';
  html += '<tr><th style="padding:6px 8px;font-size:11px;text-align:left;white-space:nowrap;color:var(--navy)">r de Pearson</th>';
  results.forEach(res => {
    const bg = corrColor(res.r);
    const txt = res.r == null ? '—' : res.r.toFixed(2);
    html += `<td title="n=${res.n}" style="padding:9px 11px;text-align:center;background:${bg};font-weight:700;border:1px solid #fff;cursor:pointer" onclick="${fn}('${res.item.key}')">${txt}</td>`;
  });
  html += '</tr></table></div>';
  container.innerHTML = html;
}

function drawScatterPair(canvasId, points, color, labelX, xMax, labelY, yMax) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  CHARTS[canvasId] = new Chart(ctx, {
    type: 'scatter',
    data: { datasets: [{ label: `${labelX} × ${labelY}`, data: points, backgroundColor: color + '99', borderColor: color, pointRadius: 4, pointHoverRadius: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${labelX} ${c.parsed.x.toFixed(1)} · ${labelY} ${c.parsed.y.toFixed(1)}` } }
      },
      scales: {
        x: { title: { display: true, text: `${labelX} (0–${xMax})` }, min: 0, max: xMax, grid: { color: '#f0f0f0' } },
        y: { title: { display: true, text: `${labelY} (0–${yMax})` }, min: 0, max: yMax, grid: { color: '#f0f0f0' } }
      }
    }
  });
}

function renderCorrelacoesTab(filteredData) {
  populateCorrelacoesFilters();

  const rb = document.getElementById('corr-gran-resposta');
  const tb = document.getElementById('corr-gran-turma');
  if (rb) rb.classList.toggle('active', correlacoesGranularity === 'resposta');
  if (tb) tb.classList.toggle('active', correlacoesGranularity === 'turma');

  let baseGeral = filteredData;
  if (correlacoesFilters.curso)   baseGeral = baseGeral.filter(r => r.habilitacao === correlacoesFilters.curso);
  if (correlacoesFilters.unidade) baseGeral = baseGeral.filter(r => r.unidade_calc === correlacoesFilters.unidade);
  if (correlacoesFilters.mes)     baseGeral = baseGeral.filter(r => r.mes_label === correlacoesFilters.mes);

  const results = computeCorrGeralItens(baseGeral, correlacoesGranularity);
  renderCorrHeatmap('correlacoes-heatmap-wrap', results);

  let best = null, worst = null;
  results.forEach(res => {
    if (res.r == null) return;
    if (!best || Math.abs(res.r) > Math.abs(best.r)) best = res;
    if (!worst || Math.abs(res.r) < Math.abs(worst.r)) worst = res;
  });
  const caption = document.getElementById('correlacoes-caption');
  if (caption) {
    caption.innerHTML = best
      ? `Item mais correlacionado com a Nota Geral: <b>${best.item.label}</b> (r = ${best.r.toFixed(2)}) &nbsp;·&nbsp; Menos correlacionado: <b>${worst.item.label}</b> (r = ${worst.r.toFixed(2)}) &nbsp;·&nbsp; Granularidade atual: <b>${correlacoesGranularity === 'turma' ? 'por turma' : 'por resposta'}</b>`
      : 'Sem dados suficientes para os filtros atuais.';
  }

  // Drill-down do item selecionado, na mesma granularidade escolhida acima
  const rowsForPair = correlacoesGranularity === 'turma' ? aggregateGeralByTurma(baseGeral) : baseGeral;
  const itemVar = CORR_ITEMS.find(v => v.key === correlacoesItem) || CORR_ITEMS[0];
  const pairRows = rowsForPair.filter(r => r[CORR_GERAL.key] != null && r[itemVar.key] != null);
  const r = pairRows.length >= 2 ? pearsonR(pairRows.map(p => p[CORR_GERAL.key]), pairRows.map(p => p[itemVar.key])) : null;
  const info = interpretaR(r);
  const drillWrap = document.getElementById('correlacoes-drill-wrap');
  if (drillWrap) {
    drillWrap.innerHTML = `
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px">
        <div class="cbox" style="flex:1;min-width:220px;text-align:center;border-top:4px solid ${info.color}">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Nota Geral × ${itemVar.label} (${correlacoesGranularity === 'turma' ? 'por turma' : 'por resposta'})</div>
          <div style="font-size:34px;font-weight:800;color:${info.color}">${r != null ? r.toFixed(2) : '—'}</div>
          <div style="font-size:12px;color:${info.color};font-weight:700">${info.label}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px">${pairRows.length} ${correlacoesGranularity === 'turma' ? 'turma(s)' : 'resposta(s)'}</div>
        </div>
        <div class="cbox" style="flex:2;min-width:280px;height:280px"><canvas id="ch-corr-drill"></canvas></div>
      </div>
      <div style="font-size:11px;color:var(--muted)">Eixo X = ${itemVar.label} (escala 0–5) · Eixo Y = Nota Geral (escala 0–10) · r de Pearson (−1 a 1): próximo de 0 = sem relação linear, próximo de ±1 = relação linear forte. Correlação mede associação, não causa.</div>
    `;
    drawScatterPair('ch-corr-drill', pairRows.map(p => ({ x: p[itemVar.key], y: p[CORR_GERAL.key] })), '#7c3aed', itemVar.label, itemVar.max, CORR_GERAL.label, CORR_GERAL.max);
  }

  renderCorrPorUnidade(baseGeral);
  renderCorrPorTurma(baseGeral, itemVar);
}

// ── Correlação por Unidade (mesma matriz, repetida por unidade) ──────────────
function renderCorrPorUnidade(baseGeral) {
  const wrap = document.getElementById('correlacoes-unidade-wrap');
  if (!wrap) return;
  const unidadesPresentes = UNITS.filter(u => baseGeral.some(r => r.unidade_calc === u));
  if (!unidadesPresentes.length) {
    wrap.innerHTML = '<div class="nodata">Sem dados para os filtros atuais.</div>';
    return;
  }
  wrap.innerHTML = unidadesPresentes.map(u => `
    <div class="cbox" style="padding:12px">
      <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px">${u}</div>
      <div id="correlacoes-unidade-${u.replace(/[^A-Za-z]/g,'')}"></div>
    </div>
  `).join('');
  unidadesPresentes.forEach(u => {
    const rows = baseGeral.filter(r => r.unidade_calc === u);
    const results = computeCorrGeralItens(rows, correlacoesGranularity);
    renderCorrHeatmap(`correlacoes-unidade-${u.replace(/[^A-Za-z]/g,'')}`, results);
  });
}

// ── Correlação por Turma (resposta a resposta, item selecionado no drill-down) ──
const CORR_TURMA_MIN_N = 5;
let corrTurmaSort = { col: 'r', dir: 'desc' };

function computeCorrPorTurma(baseGeral, itemKey) {
  const map = {};
  baseGeral.forEach(row => {
    const key = row.di_turma + '|||' + row.unidade_calc;
    if (!map[key]) map[key] = { turma: row.di_turma, curso: row.habilitacao, unidade: row.unidade_calc, xs: [], ys: [] };
    if (row[CORR_GERAL.key] != null && row[itemKey] != null) {
      map[key].xs.push(row[itemKey]);
      map[key].ys.push(row[CORR_GERAL.key]);
    }
  });
  return Object.values(map)
    .map(v => ({
      turma: v.turma, curso: v.curso, unidade: v.unidade, n: v.xs.length,
      r: v.xs.length >= CORR_TURMA_MIN_N ? pearsonR(v.xs, v.ys) : null
    }))
    .filter(v => v.r != null);
}

function sortCorrTurma(col) {
  if (corrTurmaSort.col === col) {
    corrTurmaSort.dir = corrTurmaSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    corrTurmaSort = { col, dir: (col === 'turma' || col === 'curso' || col === 'unidade') ? 'asc' : 'desc' };
  }
  renderAll();
}

function renderCorrPorTurma(baseGeral, itemVar) {
  const wrap = document.getElementById('correlacoes-turma-wrap');
  if (!wrap) return;
  let rows = computeCorrPorTurma(baseGeral, itemVar.key);

  const { col, dir } = corrTurmaSort;
  rows = [...rows].sort((a, b) => {
    let av = a[col], bv = b[col];
    if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  const arrow = c => corrTurmaSort.col === c ? (corrTurmaSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const th = (label, colKey) => `<th onclick="sortCorrTurma('${colKey}')" style="padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;cursor:pointer;user-select:none">${label}${arrow(colKey)}</th>`;

  const trs = rows.map(r => `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:7px 9px;white-space:nowrap;font-weight:600">${r.turma}</td>
      <td style="padding:7px 9px;white-space:nowrap;color:var(--muted);font-size:12px">${r.curso}</td>
      <td style="padding:7px 9px;white-space:nowrap;color:var(--muted);font-size:12px">${r.unidade}</td>
      <td style="padding:7px 9px;text-align:center;font-weight:700;color:${interpretaR(r.r).color}">${r.r.toFixed(2)}</td>
      <td style="padding:7px 9px;text-align:center;color:var(--muted)">${r.n}</td>
    </tr>`).join('');

  wrap.innerHTML = `
    <div style="overflow:auto;max-height:480px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead style="position:sticky;top:0;z-index:1">
          <tr style="background:var(--navy);color:#fff">
            ${th('Turma','turma')}
            ${th('Curso','curso')}
            ${th('Unidade','unidade')}
            ${th(`r (Nota Geral × ${itemVar.label})`,'r')}
            ${th('Respostas','n')}
          </tr>
        </thead>
        <tbody>${trs || `<tr><td colspan="5" style="padding:14px;text-align:center;color:var(--muted)">Nenhuma turma com pelo menos ${CORR_TURMA_MIN_N} respostas com ${itemVar.label} e Nota Geral preenchidos para os filtros atuais</td></tr>`}</tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px">${rows.length} turma(s) com pelo menos ${CORR_TURMA_MIN_N} respostas (correlação calculada resposta a resposta, independente da granularidade selecionada acima)</div>
  `;
}

// ── Correlação Nota Geral × Itens, duplicada na aba Triagem & Pacientes ──────
// Reaproveita CORR_GERAL/CORR_ITEMS/computeCorrGeralItens/aggregateGeralByTurma/corrColor/
// renderCorrHeatmap/drawScatterPair/interpretaR/pearsonR (definidos para a aba Correlações),
// só com estado e containers próprios para não colidir com aquela aba.
let pacCorrGranularity = 'resposta';
let pacCorrItem = 'nota_Triagem';

function setPacCorrGranularity(g) {
  pacCorrGranularity = g;
  const rb = document.getElementById('pac-corr-gran-resposta');
  const tb = document.getElementById('pac-corr-gran-turma');
  if (rb) rb.classList.toggle('active', g === 'resposta');
  if (tb) tb.classList.toggle('active', g === 'turma');
  renderAll();
}

function selectPacCorrItem(key) {
  pacCorrItem = key;
  const sel = document.getElementById('pac-corr-item-sel');
  if (sel) sel.value = key;
  renderAll();
}

function renderPacCorrelacao(baseGeral) {
  const rb = document.getElementById('pac-corr-gran-resposta');
  const tb = document.getElementById('pac-corr-gran-turma');
  if (rb) rb.classList.toggle('active', pacCorrGranularity === 'resposta');
  if (tb) tb.classList.toggle('active', pacCorrGranularity === 'turma');

  const itemSel = document.getElementById('pac-corr-item-sel');
  if (itemSel && !itemSel.options.length) {
    CORR_ITEMS.forEach(v => { const o = document.createElement('option'); o.value = v.key; o.textContent = v.label; itemSel.appendChild(o); });
    itemSel.value = pacCorrItem;
  }
  if (itemSel && !itemSel._wired) {
    itemSel.addEventListener('change', e => { pacCorrItem = e.target.value; renderAll(); });
    itemSel._wired = true;
  }

  const results = computeCorrGeralItens(baseGeral, pacCorrGranularity);
  renderCorrHeatmap('pac-corr-heatmap-wrap', results, 'selectPacCorrItem');

  let best = null, worst = null;
  results.forEach(res => {
    if (res.r == null) return;
    if (!best || Math.abs(res.r) > Math.abs(best.r)) best = res;
    if (!worst || Math.abs(res.r) < Math.abs(worst.r)) worst = res;
  });
  const caption = document.getElementById('pac-corr-caption');
  if (caption) {
    caption.innerHTML = best
      ? `Item mais correlacionado com a Nota Geral: <b>${best.item.label}</b> (r = ${best.r.toFixed(2)}) &nbsp;·&nbsp; Menos correlacionado: <b>${worst.item.label}</b> (r = ${worst.r.toFixed(2)}) &nbsp;·&nbsp; Granularidade atual: <b>${pacCorrGranularity === 'turma' ? 'por turma' : 'por resposta'}</b>`
      : 'Sem dados suficientes para os filtros atuais.';
  }

  const rowsForPair = pacCorrGranularity === 'turma' ? aggregateGeralByTurma(baseGeral) : baseGeral;
  const itemVar = CORR_ITEMS.find(v => v.key === pacCorrItem) || CORR_ITEMS[0];
  const pairRows = rowsForPair.filter(r => r[CORR_GERAL.key] != null && r[itemVar.key] != null);
  const r = pairRows.length >= 2 ? pearsonR(pairRows.map(p => p[CORR_GERAL.key]), pairRows.map(p => p[itemVar.key])) : null;
  const info = interpretaR(r);
  const drillWrap = document.getElementById('pac-corr-drill-wrap');
  if (drillWrap) {
    drillWrap.innerHTML = `
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px">
        <div class="cbox" style="flex:1;min-width:220px;text-align:center;border-top:4px solid ${info.color}">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Nota Geral × ${itemVar.label} (${pacCorrGranularity === 'turma' ? 'por turma' : 'por resposta'})</div>
          <div style="font-size:34px;font-weight:800;color:${info.color}">${r != null ? r.toFixed(2) : '—'}</div>
          <div style="font-size:12px;color:${info.color};font-weight:700">${info.label}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px">${pairRows.length} ${pacCorrGranularity === 'turma' ? 'turma(s)' : 'resposta(s)'}</div>
        </div>
        <div class="cbox" style="flex:2;min-width:280px;height:280px"><canvas id="pac-corr-drill-chart"></canvas></div>
      </div>
      <div style="font-size:11px;color:var(--muted)">Eixo X = ${itemVar.label} (escala 0–5) · Eixo Y = Nota Geral (escala 0–10) · r de Pearson (−1 a 1): próximo de 0 = sem relação linear, próximo de ±1 = relação linear forte. Correlação mede associação, não causa.</div>
    `;
    drawScatterPair('pac-corr-drill-chart', pairRows.map(p => ({ x: p[itemVar.key], y: p[CORR_GERAL.key] })), '#7c3aed', itemVar.label, itemVar.max, CORR_GERAL.label, CORR_GERAL.max);
  }
}

function computeReclQualidade(baseGeral) {
  const ids = new Set(baseGeral.map(r => r['db-id']));
  const coments = DATA_FEEDBACK.filter(r => ids.has(r.db_id));
  const recl = coments.filter(r => isReclQualidadeTriagem(r.feedback));
  // "Menção ao tema" = cita triagem/triado/seleção/perfil de paciente de qualquer forma (elogio, neutro ou crítica).
  // O OR com isReclQualidadeTriagem garante que toda reclamação esteja dentro do denominador — sem ele, os 2 casos
  // pegos só pela lista estrita antiga (ex.: "paciente fora do perfil", sem a palavra triagem) ficariam de fora
  // e o percentual poderia passar de 100%.
  const mencoes = coments.filter(r => {
    const n = normPlano(r.feedback || '');
    return PATTERNS_QUALTRI_GATE.some(kw => n.includes(normPlano(kw))) || isReclQualidadeTriagem(r.feedback);
  });
  const grupo = (rows, keyFn) => {
    const m = {};
    rows.forEach(r => { const k = keyFn(r); if (!m[k]) m[k] = { key: k, n: 0, recl: 0 }; m[k].n++; });
    recl.forEach(r => { const k = keyFn(r); if (m[k]) m[k].recl++; });
    return Object.values(m).map(g => Object.assign(g, { pct: g.n ? g.recl / g.n * 100 : null }));
  };
  return {
    totalRespostas: baseGeral.length,
    totalComentarios: coments.length,
    nRecl: recl.length,
    pctComentarios: coments.length ? recl.length / coments.length * 100 : null,
    pctRespostas: baseGeral.length ? recl.length / baseGeral.length * 100 : null,
    nMencoes: mencoes.length,
    pctMencoes: mencoes.length ? recl.length / mencoes.length * 100 : null,
    porUnidade: grupo(coments, r => r.unidade).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1)),
    porMes: grupo(coments, r => r.mes_label),
    mesOrder: coments.reduce((acc, r) => { acc[r.mes_label] = r.mes_order; return acc; }, {})
  };
}

function reclQualColor(p) {
  if (p == null) return 'var(--muted)';
  if (p >= 10) return 'var(--bad)';
  if (p >= 5) return 'var(--warn)';
  return 'var(--good)';
}

function renderReclQualidadeCard(baseGeral) {
  const wrap = document.getElementById('recl-qual-wrap');
  if (!wrap) return;
  const s = computeReclQualidade(baseGeral);
  if (!s.totalComentarios) {
    wrap.innerHTML = '<p style="font-size:12px;color:var(--muted);margin:0">Nenhum comentário no escopo dos filtros atuais.</p>';
    return;
  }
  const pctTxt = p => p == null ? '—' : p.toFixed(1).replace('.', ',') + '%';
  const unidLinhas = s.porUnidade.map(g => `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 9px;font-size:12px;font-weight:600">${g.key}</td>
      <td style="padding:6px 9px;font-size:12px;text-align:center;font-weight:700;color:${reclQualColor(g.pct)}">${pctTxt(g.pct)}</td>
      <td style="padding:6px 9px;font-size:12px;text-align:center">${g.recl}</td>
      <td style="padding:6px 9px;font-size:12px;text-align:center;color:var(--muted)">${g.n}</td>
    </tr>`).join('');
  wrap.innerHTML = `
    <div style="display:flex;gap:26px;flex-wrap:wrap;align-items:flex-start">
      <div style="text-align:center;padding-right:26px;border-right:1px solid var(--border);min-width:150px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Reclamações de qualidade da triagem</div>
        <div style="font-size:42px;font-weight:800;color:${reclQualColor(s.pctComentarios)};line-height:1.15">${pctTxt(s.pctComentarios)}</div>
        <div style="font-size:11px;color:var(--muted)">${s.nRecl} de ${s.totalComentarios} comentários escritos</div>
      </div>
      <div style="text-align:center;padding-right:26px;border-right:1px solid var(--border);min-width:150px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Sobre todas as respostas</div>
        <div style="font-size:30px;font-weight:800;color:var(--navy);line-height:1.2;margin-top:6px">${pctTxt(s.pctRespostas)}</div>
        <div style="font-size:11px;color:var(--muted)">${s.nRecl} de ${s.totalRespostas} respostas do CSAT</div>
      </div>
      <div style="text-align:center;padding-right:26px;border-right:1px solid var(--border);min-width:170px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Entre quem citou triagem</div>
        <div style="font-size:30px;font-weight:800;color:${reclQualColor(s.pctMencoes == null ? null : s.pctMencoes / 4)};line-height:1.2;margin-top:6px">${pctTxt(s.pctMencoes)}</div>
        <div style="font-size:11px;color:var(--muted)">${s.nRecl} de ${s.nMencoes} menções ao tema</div>
      </div>
      <div style="flex:1;min-width:280px">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="border-bottom:2px solid var(--border)">
            <th style="text-align:left;padding:5px 9px;font-size:10px;color:var(--muted);text-transform:uppercase">Unidade</th>
            <th style="padding:5px 9px;font-size:10px;color:var(--muted);text-transform:uppercase">% Reclamações</th>
            <th style="padding:5px 9px;font-size:10px;color:var(--muted);text-transform:uppercase">Recl.</th>
            <th style="padding:5px 9px;font-size:10px;color:var(--muted);text-transform:uppercase">Coment.</th>
          </tr></thead>
          <tbody>${unidLinhas}</tbody>
        </table>
      </div>
    </div>
    <div style="height:210px;margin-top:16px"><canvas id="ch-recl-qual-mes"></canvas></div>`;
  setTimeout(() => safeCall(() => reclQualMesChart('ch-recl-qual-mes', s), 'reclQualMesChart'), 30);
}

function reclQualMesChart(canvasId, s) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const SEQ = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
  const grupos = s.porMes.slice().sort((a, b) => SEQ.indexOf(s.mesOrder[a.key]) - SEQ.indexOf(s.mesOrder[b.key]));
  if (!grupos.length) return;
  const labels = grupos.map(g => g.key);
  const pcts = grupos.map(g => g.pct == null ? null : +g.pct.toFixed(1));
  const ns = grupos.map(g => g.recl);
  const labelsPlugin = {
    id: 'reclQualLabelsPlugin',
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      c.save();
      chart.getDatasetMeta(0).data.forEach((el, i) => {
        if (pcts[i] == null) return;
        c.font = '700 10px Segoe UI, sans-serif';
        c.fillStyle = '#1A2459';
        c.textAlign = 'center';
        c.fillText(pcts[i].toFixed(1).replace('.', ',') + '%', el.x, el.y - 7);
        c.font = '600 9px Segoe UI, sans-serif';
        c.fillStyle = '#fff';
        if (el.height > 18) c.fillText('n=' + ns[i], el.x, el.y + 13);
      });
      c.restore();
    }
  };
  CHARTS[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: '% de comentários com reclamação de qualidade da triagem', data: pcts, backgroundColor: pcts.map(p => p == null ? '#94a3b8' : p >= 10 ? '#dc2626cc' : p >= 5 ? '#d97706cc' : '#16a34acc'), borderRadius: 4, borderSkipped: false, maxBarThickness: 46 }] },
    options: {
      responsive: true, maintainAspectRatio: false, clip: false,
      layout: { padding: { top: 22 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${c.parsed.y == null ? '—' : c.parsed.y.toFixed(1).replace('.', ',') + '%'} (${ns[c.dataIndex]} de ${grupos[c.dataIndex].n} comentários)` } }
      },
      scales: {
        y: { suggestedMin: 0, ticks: { callback: v => v + '%', font: { size: 10 } }, grid: { color: '#f0f0f0' } },
        x: { grid: { display: false }, ticks: { font: { size: 10 } } }
      }
    },
    plugins: [labelsPlugin]
  });
}

function renderTriagemCruzamento(filteredData) {
  populateTriagemFilters();

  // Tabela: nota geral/triagem média da turma vem de TODAS as respostas (respeitando filtros globais + locais desta aba)
  let baseGeral = filteredData;
  if (triagemFilters.curso)   baseGeral = baseGeral.filter(r => r.habilitacao === triagemFilters.curso);
  if (triagemFilters.unidade) baseGeral = baseGeral.filter(r => r.unidade_calc === triagemFilters.unidade);
  if (triagemFilters.mes)     baseGeral = baseGeral.filter(r => r.mes_label === triagemFilters.mes);

  safeCall(()=>renderPacCorrelacao(baseGeral), 'renderPacCorrelacao');
  safeCall(()=>renderReclQualidadeCard(baseGeral), 'renderReclQualidadeCard');

  // Comentários: respeitam os mesmos filtros globais (via db-id) + filtros locais desta aba
  const filteredIds = new Set(filteredData.map(r => r['db-id']));
  let comentarios = computeTriagemComentarios().filter(r => filteredIds.has(r.db_id));
  if (triagemFilters.curso)   comentarios = comentarios.filter(r => r.hab === triagemFilters.curso);
  if (triagemFilters.unidade) comentarios = comentarios.filter(r => r.unidade === triagemFilters.unidade);
  if (triagemFilters.mes)     comentarios = comentarios.filter(r => r.mes_label === triagemFilters.mes);

  let rankingRows = computeTriagemRanking(baseGeral, comentarios);
  const { col, dir } = triagemSortState;
  rankingRows.sort((a,b) => {
    let av = a[col], bv = b[col];
    if (av == null) av = dir === 'asc' ? Infinity : -Infinity;
    if (bv == null) bv = dir === 'asc' ? Infinity : -Infinity;
    if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  const arrow = c => triagemSortState.col === c ? (triagemSortState.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const th = (label, colKey) => `<th onclick="sortTriagem('${colKey}')" style="padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;cursor:pointer;user-select:none">${label}${arrow(colKey)}</th>`;

  const trs = rankingRows.map(r => {
    const notaCls1 = r.media == null ? '' : (r.media >= 8 ? 'ng' : r.media >= 6.5 ? 'nw' : 'nb');
    const notaCls2 = r.mediaTriagem == null ? '' : (r.mediaTriagem >= 8 ? 'ng' : r.mediaTriagem >= 6.5 ? 'nw' : 'nb');
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:7px 9px;white-space:nowrap;font-weight:600">${r.turma}</td>
      <td style="padding:7px 9px;white-space:nowrap;color:var(--muted);font-size:12px">${r.curso}</td>
      <td style="padding:7px 9px;white-space:nowrap;color:var(--muted);font-size:12px">${r.unidade}</td>
      <td style="padding:7px 9px;text-align:center">${r.media != null ? `<span class="${notaCls1}">${r.media.toFixed(2)}</span>` : '—'}</td>
      <td style="padding:7px 9px;text-align:center">${r.mediaTriagem != null ? `<span class="${notaCls2}">${r.mediaTriagem.toFixed(2)}</span>` : '—'}</td>
      <td style="padding:7px 9px;text-align:center;color:var(--muted)">${r.total}</td>
      <td style="padding:7px 9px;text-align:center">${r.qualidade ? `<span style="font-weight:700;color:#b45309">${r.qualidade}</span>` : '0'}</td>
      <td style="padding:7px 9px;text-align:center">${r.quantidade ? `<span style="font-weight:700;color:#b45309">${r.quantidade}</span>` : '0'}</td>
      <td style="padding:7px 9px;text-align:center">${r.manifestacao ? `<span style="font-weight:700;color:#dc2626">${r.manifestacao}</span>` : '0'}</td>
    </tr>`;
  }).join('');

  const tableHtml = `
    <div style="overflow:auto;max-height:520px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead style="position:sticky;top:0;z-index:1">
          <tr style="background:var(--navy);color:#fff">
            ${th('Turma','turma')}
            ${th('Curso','curso')}
            ${th('Unidade','unidade')}
            ${th('Nota Geral','media')}
            ${th('Nota Triagem','mediaTriagem')}
            ${th('Total Respostas','total')}
            ${th('Qualidade Triagem','qualidade')}
            ${th('Quantidade/Agenda','quantidade')}
            ${th('Manifestações','manifestacao')}
          </tr>
        </thead>
        <tbody>${trs || '<tr><td colspan="9" style="padding:14px;text-align:center;color:var(--muted)">Nenhuma turma com comentários nessas categorias para os filtros atuais</td></tr>'}</tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px">${rankingRows.length} turma(s) com pelo menos 1 comentário classificado</div>
  `;
  const tableWrap = document.getElementById('triagem-table-wrap');
  if (tableWrap) tableWrap.innerHTML = tableHtml;

  // Lista detalhada: aplica os checkboxes de categoria + busca por texto
  let detalhe = comentarios.filter(r =>
    (triagemCatFilters.qualidade && r.qualidade) ||
    (triagemCatFilters.quantidade && r.quantidade) ||
    (triagemCatFilters.manifestacao && r.manifestacao)
  );
  if (triagemSearchTerm) {
    const term = triagemSearchTerm.toLowerCase();
    detalhe = detalhe.filter(r => r.feedback.toLowerCase().includes(term) || (r.di_turma||'').toLowerCase().includes(term));
  }
  detalhe = [...detalhe].sort((a,b) => (b.ts||0) - (a.ts||0));

  const listHtml = detalhe.length
    ? detalhe.map(r => triagemQuoteCard(r)).join('')
    : '<p style="color:var(--muted);font-size:12px;padding:8px 0">Nenhum comentário encontrado com os filtros atuais</p>';
  const listWrap = document.getElementById('triagem-list-wrap');
  if (listWrap) listWrap.innerHTML = `<div style="font-size:11px;color:var(--muted);margin-bottom:8px">${detalhe.length} comentário(s)</div><div style="max-height:640px;overflow:auto">${listHtml}</div>`;
}

// ============ ABA COMENTÁRIOS ============
let comentariosFilters = { unidade: '', classificacao: '', curso: '', mes: '', status: '' };
let comentariosSearchTerm = '';

function clearComentariosFilters() {
  comentariosFilters = { unidade: '', classificacao: '', curso: '', mes: '', status: '' };
  ['comentarios-f-unidade','comentarios-f-classificacao','comentarios-f-curso','comentarios-f-mes','comentarios-f-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const s = document.getElementById('comentarios-search');
  if (s) s.value = '';
  comentariosSearchTerm = '';
  renderAll();
}

function populateComentariosFilters() {
  const unidadeSel = document.getElementById('comentarios-f-unidade');
  const classSel = document.getElementById('comentarios-f-classificacao');
  const cursoSel = document.getElementById('comentarios-f-curso');
  const mesSel = document.getElementById('comentarios-f-mes');
  const statusSel = document.getElementById('comentarios-f-status');
  if (!unidadeSel || !classSel || !cursoSel || !mesSel || !statusSel) return;

  const unidades = [...new Set(DATA_GERAL.map(r => r.unidade_calc))].sort();
  const existingUnidades = [...unidadeSel.options].slice(1).map(o => o.value).join('|');
  if (existingUnidades !== unidades.join('|')) {
    while (unidadeSel.options.length > 1) unidadeSel.remove(1);
    unidades.forEach(u => { const o = document.createElement('option'); o.value = u; o.textContent = u; unidadeSel.appendChild(o); });
  }

  const cursos = [...new Set(DATA_GERAL.map(r => r.habilitacao))].sort();
  const existingCursos = [...cursoSel.options].slice(1).map(o => o.value).join('|');
  if (existingCursos !== cursos.join('|')) {
    while (cursoSel.options.length > 1) cursoSel.remove(1);
    cursos.forEach(h => { const o = document.createElement('option'); o.value = h; o.textContent = h; cursoSel.appendChild(o); });
  }

  const allMes = [
    {o:9,l:'set/25'},{o:10,l:'out/25'},{o:11,l:'nov/25'},{o:12,l:'dez/25'},
    {o:1,l:'jan/26'},{o:2,l:'fev/26'},{o:3,l:'mar/26'},{o:4,l:'abr/26'},{o:5,l:'mai/26'},{o:6,l:'jun/26'},{o:7,l:'jul/26'},{o:8,l:'ago/26'},{o:13,l:'set/26'}
  ];
  const presentMes = new Set(DATA_GERAL.map(r => r.mes_label));
  const mesLabels = allMes.filter(m => presentMes.has(m.l)).map(m => m.l);
  const existingMes = [...mesSel.options].slice(1).map(o => o.value).join('|');
  if (existingMes !== mesLabels.join('|')) {
    while (mesSel.options.length > 1) mesSel.remove(1);
    mesLabels.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; mesSel.appendChild(o); });
  }

  if (!unidadeSel._wired) { unidadeSel.addEventListener('change', e => { comentariosFilters.unidade = e.target.value; renderAll(); }); unidadeSel._wired = true; }
  if (!classSel._wired)   { classSel.addEventListener('change', e => { comentariosFilters.classificacao = e.target.value; renderAll(); }); classSel._wired = true; }
  if (!cursoSel._wired)   { cursoSel.addEventListener('change', e => { comentariosFilters.curso = e.target.value; renderAll(); }); cursoSel._wired = true; }
  if (!mesSel._wired)     { mesSel.addEventListener('change', e => { comentariosFilters.mes = e.target.value; renderAll(); }); mesSel._wired = true; }
  if (!statusSel._wired)  { statusSel.addEventListener('change', e => { comentariosFilters.status = e.target.value; renderAll(); }); statusSel._wired = true; }

  const search = document.getElementById('comentarios-search');
  if (search && !search._wired) {
    search.addEventListener('input', e => { comentariosSearchTerm = e.target.value; renderAll(); });
    search._wired = true;
  }
}

// Análise por unidade (Promotor/Neutro/Detrator + NPS) a partir de DATA_GERAL já filtrada (globais + locais desta aba)
function computeComentariosAnalise(baseGeral) {
  return UNITS.filter(u => baseGeral.some(r => r.unidade_calc === u)).map(u => {
    const data = baseGeral.filter(r => r.unidade_calc === u);
    const total = data.length;
    const prom = data.filter(r => r.classificacao === 'Promotor').length;
    const neut = data.filter(r => r.classificacao === 'Neutro').length;
    const detr = data.filter(r => r.classificacao === 'Detrator').length;
    const pProm = total ? prom / total * 100 : 0;
    const pNeut = total ? neut / total * 100 : 0;
    const pDetr = total ? detr / total * 100 : 0;
    const nps = Math.round(pProm - pDetr);
    return { unidade: u, total, prom, neut, detr, pProm, pNeut, pDetr, nps };
  });
}

function renderComentariosAnalise(baseGeral) {
  const wrap = document.getElementById('comentarios-analise-wrap');
  if (!wrap) return;
  const rows = computeComentariosAnalise(baseGeral);
  if (!rows.length) {
    wrap.innerHTML = '<div class="nodata">Sem dados para os filtros selecionados.</div>';
    return;
  }
  const trs = rows.map(r => {
    const npsCls = r.nps >= 50 ? 'ng' : r.nps >= 0 ? 'nw' : 'nb';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:7px 9px;white-space:nowrap;font-weight:600">${r.unidade}</td>
      <td style="padding:7px 9px;text-align:center;color:var(--muted)">${r.total}</td>
      <td style="padding:7px 9px;text-align:center;color:var(--good)">${r.pProm.toFixed(1)}%</td>
      <td style="padding:7px 9px;text-align:center;color:var(--warn)">${r.pNeut.toFixed(1)}%</td>
      <td style="padding:7px 9px;text-align:center;color:var(--bad)">${r.pDetr.toFixed(1)}%</td>
      <td style="padding:7px 9px;text-align:center"><span class="${npsCls}" style="font-weight:700">${r.nps}</span></td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `
    <div style="overflow:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--navy);color:#fff">
            <th style="padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">Unidade</th>
            <th style="padding:8px 9px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">Total Respostas</th>
            <th style="padding:8px 9px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">% Promotores</th>
            <th style="padding:8px 9px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">% Neutros</th>
            <th style="padding:8px 9px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">% Detratores</th>
            <th style="padding:8px 9px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">NPS</th>
          </tr>
        </thead>
        <tbody>${trs}</tbody>
      </table>
    </div>`;
}

// Comentários (DATA_FEEDBACK) enriquecidos com classificação NPS (join via db-id/db_id, mesmo padrão de computeTriagemComentarios)
function computeComentariosList() {
  return DATA_FEEDBACK.map(r => {
    const g = IDX_GERAL[r.db_id] || {};
    const classificacao = g.classificacao || (r.nota != null ? classifyNota(r.nota) : null);
    return Object.assign({}, r, { classificacao });
  }).filter(r => r.feedback && r.feedback.trim().length > 0);
}

function renderComentariosList(filteredData) {
  const filteredIds = new Set(filteredData.map(r => r['db-id']));
  let comentarios = computeComentariosList().filter(r => filteredIds.has(r.db_id));
  if (comentariosFilters.unidade)       comentarios = comentarios.filter(r => r.unidade === comentariosFilters.unidade);
  if (comentariosFilters.classificacao) comentarios = comentarios.filter(r => r.classificacao === comentariosFilters.classificacao);
  if (comentariosFilters.curso)         comentarios = comentarios.filter(r => r.hab === comentariosFilters.curso);
  if (comentariosFilters.mes)           comentarios = comentarios.filter(r => r.mes_label === comentariosFilters.mes);
  if (comentariosFilters.status) {
    const statusMap = getComentarioStatusMap();
    comentarios = comentarios.filter(r => (statusMap[r.db_id] || COMENTARIO_STATUS_DEFAULT) === comentariosFilters.status);
  }
  if (comentariosSearchTerm) {
    const term = comentariosSearchTerm.toLowerCase();
    comentarios = comentarios.filter(r => r.feedback.toLowerCase().includes(term) || (r.di_turma||'').toLowerCase().includes(term) || (r.nome||'').toLowerCase().includes(term));
  }
  comentarios = [...comentarios].sort((a,b) => (b.ts||0) - (a.ts||0));

  const typeFor = r => r.classificacao === 'Promotor' ? 'pos' : r.classificacao === 'Detrator' ? 'neg' : 'neu';
  const listHtml = comentarios.length
    ? comentarios.map(r => quoteCard(r, typeFor(r), {showTurma:true, showNome:true, showStatus:true})).join('')
    : '<p style="color:var(--muted);font-size:12px;padding:8px 0">Nenhum comentário encontrado com os filtros atuais</p>';
  const listWrap = document.getElementById('comentarios-list-wrap');
  if (listWrap) listWrap.innerHTML = `<div style="font-size:11px;color:var(--muted);margin-bottom:8px">${comentarios.length} comentário(s)</div><div style="max-height:640px;overflow:auto">${listHtml}</div>`;
}

function renderComentariosTab(filteredData) {
  populateComentariosFilters();
  let baseGeral = filteredData;
  if (comentariosFilters.unidade)       baseGeral = baseGeral.filter(r => r.unidade_calc === comentariosFilters.unidade);
  if (comentariosFilters.classificacao) baseGeral = baseGeral.filter(r => r.classificacao === comentariosFilters.classificacao);
  if (comentariosFilters.curso)         baseGeral = baseGeral.filter(r => r.habilitacao === comentariosFilters.curso);
  if (comentariosFilters.mes)           baseGeral = baseGeral.filter(r => r.mes_label === comentariosFilters.mes);

  safeCall(()=>renderComentariosAnalise(baseGeral), 'renderComentariosAnalise');
  safeCall(()=>renderComentariosList(filteredData), 'renderComentariosList');
}

// ============ ANÁLISE DE COMENTÁRIOS (aba dedicada — 4 seções) ============
// Reaproveita analyzeComment/TEMA_DICT/TEMA_LOOKUP/TEMA_LABEL_MAP/TEMA_ICONS/quoteCard/computeComentariosList
// já definidos acima. Não introduz nenhum novo blob de dados — tudo calculado em tempo de render
// a partir de DATA_FEEDBACK (via computeComentariosList(), mesmo join com IDX_GERAL já usado
// pela aba Comentários) cruzado com o filtro global (fd) + filtros locais desta aba.
let analiseFilters = { unidade: '', curso: '', mes: '' };
let analiseTemasSortState = { col: 'mencoes', dir: 'desc' };
let analiseCrossSortState = { col: 'mencoes', dir: 'desc' };
let analiseTurmasNegSortState = { col: 'neg', dir: 'desc' };
let analiseSentUnidade = '';
let analiseTemaSelecionado = '';
let analiseTurmaNegExpandido = null;
let _analiseTemaRowsCache = [];

const ANALISE_MES_SEQ = [9,10,11,12,1,2,3,4,5,6,7,8,13];
const ANALISE_MES_LABEL_MAP = {9:'set/25',10:'out/25',11:'nov/25',12:'dez/25',
  1:'jan/26',2:'fev/26',3:'mar/26',4:'abr/26',5:'mai/26',6:'jun/26',7:'jul/26',8:'ago/26',13:'set/26'};

function clearAnaliseFilters() {
  analiseFilters = { unidade: '', curso: '', mes: '' };
  ['analise-f-unidade','analise-f-curso','analise-f-mes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderAll();
}

function populateAnaliseFilters() {
  const unidadeSel = document.getElementById('analise-f-unidade');
  const cursoSel = document.getElementById('analise-f-curso');
  const mesSel = document.getElementById('analise-f-mes');
  if (!unidadeSel || !cursoSel || !mesSel) return;

  const unidades = [...new Set(DATA_GERAL.map(r => r.unidade_calc))].sort();
  const existingUnidades = [...unidadeSel.options].slice(1).map(o => o.value).join('|');
  if (existingUnidades !== unidades.join('|')) {
    while (unidadeSel.options.length > 1) unidadeSel.remove(1);
    unidades.forEach(u => { const o = document.createElement('option'); o.value = u; o.textContent = u; unidadeSel.appendChild(o); });
  }

  const cursos = [...new Set(DATA_GERAL.map(r => r.habilitacao))].sort();
  const existingCursos = [...cursoSel.options].slice(1).map(o => o.value).join('|');
  if (existingCursos !== cursos.join('|')) {
    while (cursoSel.options.length > 1) cursoSel.remove(1);
    cursos.forEach(h => { const o = document.createElement('option'); o.value = h; o.textContent = h; cursoSel.appendChild(o); });
  }

  const allMes = [
    {o:9,l:'set/25'},{o:10,l:'out/25'},{o:11,l:'nov/25'},{o:12,l:'dez/25'},
    {o:1,l:'jan/26'},{o:2,l:'fev/26'},{o:3,l:'mar/26'},{o:4,l:'abr/26'},{o:5,l:'mai/26'},{o:6,l:'jun/26'},{o:7,l:'jul/26'},{o:8,l:'ago/26'},{o:13,l:'set/26'}
  ];
  const presentMes = new Set(DATA_GERAL.map(r => r.mes_label));
  const mesLabels = allMes.filter(m => presentMes.has(m.l)).map(m => m.l);
  const existingMes = [...mesSel.options].slice(1).map(o => o.value).join('|');
  if (existingMes !== mesLabels.join('|')) {
    while (mesSel.options.length > 1) mesSel.remove(1);
    mesLabels.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; mesSel.appendChild(o); });
  }

  if (!unidadeSel._wired) { unidadeSel.addEventListener('change', e => { analiseFilters.unidade = e.target.value; renderAll(); }); unidadeSel._wired = true; }
  if (!cursoSel._wired)   { cursoSel.addEventListener('change', e => { analiseFilters.curso = e.target.value; renderAll(); }); cursoSel._wired = true; }
  if (!mesSel._wired)     { mesSel.addEventListener('change', e => { analiseFilters.mes = e.target.value; renderAll(); }); mesSel._wired = true; }
}

// Base de comentários (DATA_FEEDBACK enriquecido, mesmo join de computeComentariosList) respeitando
// filtros globais (barra superior, via interseção de ids com filteredData) + filtros locais desta aba.
function computeAnaliseBase(filteredData) {
  const filteredIds = new Set(filteredData.map(r => r['db-id']));
  let rows = computeComentariosList().filter(r => filteredIds.has(r.db_id));
  if (analiseFilters.unidade) rows = rows.filter(r => r.unidade === analiseFilters.unidade);
  if (analiseFilters.curso)   rows = rows.filter(r => r.hab === analiseFilters.curso);
  if (analiseFilters.mes)     rows = rows.filter(r => r.mes_label === analiseFilters.mes);
  return rows;
}

// ---- Seção 1: Ranking de Temas Recorrentes ----
function computeTemaRanking(analyzed) {
  const map = {};
  analyzed.forEach(r => {
    r.temas.forEach(t => {
      if (!map[t]) map[t] = { tema: t, mencoes: 0, somaNota: 0, pos: 0, neu: 0, neg: 0 };
      map[t].mencoes++;
      map[t].somaNota += (r.nota != null ? r.nota : 0);
      map[t][r.sentiment]++;
    });
  });
  return Object.values(map).map(v => ({
    tema: v.tema,
    label: TEMA_LABEL_MAP[v.tema] || v.tema,
    icon: TEMA_ICONS[v.tema] || '',
    mencoes: v.mencoes,
    notaMedia: v.mencoes ? v.somaNota / v.mencoes : 0,
    pPos: v.mencoes ? v.pos / v.mencoes * 100 : 0,
    pNeu: v.mencoes ? v.neu / v.mencoes * 100 : 0,
    pNeg: v.mencoes ? v.neg / v.mencoes * 100 : 0
  }));
}

function sortAnaliseTemas(col) {
  if (analiseTemasSortState.col === col) {
    analiseTemasSortState.dir = analiseTemasSortState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    analiseTemasSortState = { col, dir: col === 'label' ? 'asc' : 'desc' };
  }
  renderAll();
}

function renderAnaliseTemasChart(canvasId, analyzed, topTemas) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || !topTemas.length) return;

  const presentMes = new Set(analyzed.map(r => r.mes_order).filter(Boolean));
  const mesSeq = ANALISE_MES_SEQ.filter(m => presentMes.has(m));
  const labels = mesSeq.map(m => ANALISE_MES_LABEL_MAP[m]);
  const palette = ['#01559B', '#F5C518', '#16a34a', '#dc2626', '#7C3AED'];

  const datasets = topTemas.map((t, i) => ({
    label: t.label,
    data: mesSeq.map(m => analyzed.filter(r => r.mes_order === m && r.temas.includes(t.tema)).length),
    borderColor: palette[i % palette.length],
    backgroundColor: palette[i % palette.length] + '22',
    borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 6, tension: .3, spanGaps: false
  }));

  CHARTS[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, clip: false,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle', boxWidth: 10, boxHeight: 10 } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y} menção(ões)` } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f0f0f0' } },
        x: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

function renderAnaliseTemasTable(analyzed) {
  const rows = computeTemaRanking(analyzed);
  _analiseTemaRowsCache = rows;
  const sorted = [...rows];
  const { col, dir } = analiseTemasSortState;
  sorted.sort((a, b) => {
    let av = a[col], bv = b[col];
    if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  const arrow = c => analiseTemasSortState.col === c ? (analiseTemasSortState.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const th = (label, colKey) => `<th onclick="sortAnaliseTemas('${colKey}')" style="padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;cursor:pointer;user-select:none">${label}${arrow(colKey)}</th>`;

  const trs = sorted.map(r => {
    const notaCls = r.notaMedia >= 8 ? 'ng' : r.notaMedia >= 6.5 ? 'nw' : 'nb';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:7px 9px;white-space:nowrap;font-weight:600">${r.icon} ${r.label}</td>
      <td style="padding:7px 9px;text-align:center;color:var(--muted)">${r.mencoes}</td>
      <td style="padding:7px 9px;text-align:center"><span class="${notaCls}">${r.notaMedia.toFixed(2)}</span></td>
      <td style="padding:7px 9px;text-align:center;color:var(--good)">${r.pPos.toFixed(1)}%</td>
      <td style="padding:7px 9px;text-align:center;color:var(--warn)">${r.pNeu.toFixed(1)}%</td>
      <td style="padding:7px 9px;text-align:center;color:var(--bad)">${r.pNeg.toFixed(1)}%</td>
    </tr>`;
  }).join('');

  const bodyHtml = `
    <div style="overflow:auto;max-height:420px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead style="position:sticky;top:0;z-index:1">
          <tr style="background:var(--navy);color:#fff">
            ${th('Tema', 'label')}
            ${th('Menções', 'mencoes')}
            ${th('Nota Média', 'notaMedia')}
            ${th('% Positivo', 'pPos')}
            ${th('% Neutro', 'pNeu')}
            ${th('% Negativo', 'pNeg')}
          </tr>
        </thead>
        <tbody>${trs || '<tr><td colspan="6" style="padding:14px;text-align:center;color:var(--muted)">Nenhum tema identificado nos comentários filtrados</td></tr>'}</tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px">${sorted.length} tema(s) · um comentário pode contar em mais de um tema</div>
  `;
  const wrap = document.getElementById('analise-temas-table-wrap');
  if (wrap) wrap.innerHTML = bodyHtml;
}

// ---- Seção 2: Evolução do Sentimento ao Longo do Tempo ----
function computeSentimentoMensal(analyzed, unidade) {
  let rows = analyzed;
  if (unidade) rows = rows.filter(r => r.unidade === unidade);
  const presentMes = new Set(rows.map(r => r.mes_order).filter(Boolean));
  const mesSeq = ANALISE_MES_SEQ.filter(m => presentMes.has(m));
  return mesSeq.map(m => {
    const mrows = rows.filter(r => r.mes_order === m);
    const total = mrows.length;
    const pos = mrows.filter(r => r.sentiment === 'pos').length;
    const neu = mrows.filter(r => r.sentiment === 'neu').length;
    const neg = mrows.filter(r => r.sentiment === 'neg').length;
    return {
      mes: ANALISE_MES_LABEL_MAP[m], total,
      pPos: total ? pos / total * 100 : 0,
      pNeu: total ? neu / total * 100 : 0,
      pNeg: total ? neg / total * 100 : 0
    };
  });
}

function populateAnaliseSentUnidadeSelect() {
  const sel = document.getElementById('analise-sent-unidade');
  if (!sel) return;
  const unidades = [...new Set(DATA_GERAL.map(r => r.unidade_calc))].sort();
  const existing = [...sel.options].slice(1).map(o => o.value).join('|');
  if (existing !== unidades.join('|')) {
    while (sel.options.length > 1) sel.remove(1);
    unidades.forEach(u => { const o = document.createElement('option'); o.value = u; o.textContent = u; sel.appendChild(o); });
  }
  if (!sel._wired) {
    sel.addEventListener('change', e => { analiseSentUnidade = e.target.value; renderAll(); });
    sel._wired = true;
  }
  sel.value = analiseSentUnidade;
}

function renderAnaliseSentimentoChart(canvasId, analyzed) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const data = computeSentimentoMensal(analyzed, analiseSentUnidade);
  if (!data.length) return;

  const labels = data.map(d => d.mes);
  const dsPos = data.map(d => d.pPos);
  const dsNeu = data.map(d => d.pNeu);
  const dsNeg = data.map(d => d.pNeg);

  const sentLabelsPlugin = {
    id: 'sentLabelsPlugin_' + canvasId,
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      c.save();
      c.font = '700 10px Segoe UI, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      [0, 1, 2].forEach(dsIdx => {
        const meta = chart.getDatasetMeta(dsIdx);
        const vals = dsIdx === 0 ? dsPos : dsIdx === 1 ? dsNeu : dsNeg;
        meta.data.forEach((el, i) => {
          if (!vals[i] || vals[i] < 8) return;
          c.fillStyle = '#fff';
          c.fillText(vals[i].toFixed(0) + '%', el.x, el.y);
        });
      });
      c.restore();
    }
  };

  CHARTS[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Positivo', data: dsPos, backgroundColor: '#16a34a', stack: 's' },
        { label: 'Neutro',   data: dsNeu, backgroundColor: '#d97706', stack: 's' },
        { label: 'Negativo', data: dsNeg, backgroundColor: '#dc2626', stack: 's' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, clip: false,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle', boxWidth: 10, boxHeight: 10 } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } }
      },
      scales: {
        y: { stacked: true, min: 0, max: 100, ticks: { callback: v => v + '%' }, grid: { color: '#f0f0f0' } },
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    },
    plugins: [sentLabelsPlugin]
  });
}

// ---- Seção 3: Cruzamento Tema × Turma/Unidade ----
function computeTemasComMencoes(analyzed) {
  const temasSet = new Set();
  analyzed.forEach(r => r.temas.forEach(t => temasSet.add(t)));
  return [...new Set(Object.values(TEMA_DICT))].filter(t => temasSet.has(t));
}

function computeTemaTurmaCrossing(analyzed, tema) {
  const map = {};
  analyzed.forEach(r => {
    if (!r.temas.includes(tema)) return;
    const key = r.di_turma + '|||' + r.unidade;
    if (!map[key]) map[key] = { turma: r.di_turma, curso: r.hab, unidade: r.unidade, mencoes: 0 };
    map[key].mencoes++;
  });
  return Object.values(map).map(v => {
    const turmaRows = analyzed.filter(r => r.di_turma === v.turma && r.unidade === v.unidade);
    const total = turmaRows.length;
    const somaNota = turmaRows.reduce((a, r) => a + (r.nota != null ? r.nota : 0), 0);
    return Object.assign({}, v, { notaMedia: total ? somaNota / total : 0, totalComentarios: total });
  });
}

function sortAnaliseCross(col) {
  if (analiseCrossSortState.col === col) {
    analiseCrossSortState.dir = analiseCrossSortState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    analiseCrossSortState = { col, dir: (col === 'turma' || col === 'curso' || col === 'unidade') ? 'asc' : 'desc' };
  }
  renderAll();
}

function onAnaliseTemaSelect(sel) {
  analiseTemaSelecionado = sel.value;
  renderAll();
}

function renderAnaliseCross(analyzed) {
  const temas = computeTemasComMencoes(analyzed);

  if (!analiseTemaSelecionado || !temas.includes(analiseTemaSelecionado)) {
    const ranking = [..._analiseTemaRowsCache].sort((a, b) => b.mencoes - a.mencoes);
    analiseTemaSelecionado = ranking.length ? ranking[0].tema : '';
  }

  const selWrap = document.getElementById('analise-tema-select-wrap');
  if (selWrap) {
    const options = temas.map(t => `<option value="${t}"${t === analiseTemaSelecionado ? ' selected' : ''}>${TEMA_ICONS[t] || ''} ${TEMA_LABEL_MAP[t] || t}</option>`).join('');
    selWrap.innerHTML = `<select id="analise-tema-select" onchange="onAnaliseTemaSelect(this)" style="padding:6px 10px;border:1px solid var(--border);border-radius:4px;font-size:13px;min-width:240px">
      <option value="">Selecione um tema...</option>${options}
    </select>`;
  }

  const wrap = document.getElementById('analise-cross-table-wrap');
  if (!wrap) return;
  if (!analiseTemaSelecionado) {
    wrap.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:12px 0">Selecione um tema acima para ver o cruzamento com turmas/unidades.</p>';
    return;
  }

  let rows = computeTemaTurmaCrossing(analyzed, analiseTemaSelecionado);
  const { col, dir } = analiseCrossSortState;
  rows.sort((a, b) => {
    let av = a[col], bv = b[col];
    if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  const arrow = c => analiseCrossSortState.col === c ? (analiseCrossSortState.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const th = (label, colKey) => `<th onclick="sortAnaliseCross('${colKey}')" style="padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;cursor:pointer;user-select:none">${label}${arrow(colKey)}</th>`;

  const trs = rows.map(r => {
    const notaCls = r.notaMedia >= 8 ? 'ng' : r.notaMedia >= 6.5 ? 'nw' : 'nb';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:7px 9px;white-space:nowrap;font-weight:600">${r.turma}</td>
      <td style="padding:7px 9px;white-space:nowrap;color:var(--muted);font-size:12px">${r.curso}</td>
      <td style="padding:7px 9px;white-space:nowrap;color:var(--muted);font-size:12px">${r.unidade}</td>
      <td style="padding:7px 9px;text-align:center">${r.mencoes}</td>
      <td style="padding:7px 9px;text-align:center"><span class="${notaCls}">${r.notaMedia.toFixed(2)}</span></td>
      <td style="padding:7px 9px;text-align:center;color:var(--muted)">${r.totalComentarios}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div style="overflow:auto;max-height:420px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead style="position:sticky;top:0;z-index:1">
          <tr style="background:var(--navy);color:#fff">
            ${th('Turma', 'turma')}
            ${th('Curso', 'curso')}
            ${th('Unidade', 'unidade')}
            ${th('Menções deste tema', 'mencoes')}
            ${th('Nota Média da Turma', 'notaMedia')}
            ${th('Total de Comentários', 'totalComentarios')}
          </tr>
        </thead>
        <tbody>${trs || '<tr><td colspan="6" style="padding:14px;text-align:center;color:var(--muted)">Nenhuma turma encontrada para este tema</td></tr>'}</tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px">${rows.length} turma(s) com menção ao tema selecionado</div>
  `;
}

// ---- Seção 4: Ranking de Turmas por Comentários Negativos ----
function computeTurmaNegRanking(analyzed) {
  const map = {};
  analyzed.forEach(r => {
    const key = r.di_turma + '|||' + r.unidade;
    if (!map[key]) map[key] = { turma: r.di_turma, curso: r.hab, unidade: r.unidade, neg: 0, total: 0, negRows: [] };
    map[key].total++;
    if (r.sentiment === 'neg') { map[key].neg++; map[key].negRows.push(r); }
  });
  return Object.values(map).map(v => Object.assign({}, v, { pctNeg: v.total ? v.neg / v.total * 100 : 0 }));
}

function sortAnaliseTurmasNeg(col) {
  if (analiseTurmasNegSortState.col === col) {
    analiseTurmasNegSortState.dir = analiseTurmasNegSortState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    analiseTurmasNegSortState = { col, dir: (col === 'turma' || col === 'curso' || col === 'unidade') ? 'asc' : 'desc' };
  }
  renderAll();
}

function toggleAnaliseTurmaNeg(key) {
  analiseTurmaNegExpandido = analiseTurmaNegExpandido === key ? null : key;
  renderAll();
}

function renderAnaliseTurmasNeg(analyzed) {
  let rows = computeTurmaNegRanking(analyzed).filter(r => r.neg > 0);
  const { col, dir } = analiseTurmasNegSortState;
  rows.sort((a, b) => {
    let av = a[col], bv = b[col];
    if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  const arrow = c => analiseTurmasNegSortState.col === c ? (analiseTurmasNegSortState.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const th = (label, colKey) => `<th onclick="sortAnaliseTurmasNeg('${colKey}')" style="padding:8px 9px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;cursor:pointer;user-select:none">${label}${arrow(colKey)}</th>`;

  const trs = rows.map(r => {
    const key = r.turma + '|||' + r.unidade;
    const pctCls = r.pctNeg >= 40 ? 'nb' : r.pctNeg >= 20 ? 'nw' : 'ng';
    const expanded = analiseTurmaNegExpandido === key;
    const keyEsc = key.replace(/'/g, "\\'");
    const examplesRow = expanded ? `<tr style="border-bottom:1px solid var(--border)">
      <td colspan="6" style="padding:10px 14px;background:#fafafa">
        ${[...r.negRows].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,3).map(nr => quoteCard(nr, 'neg', {showTurma:true, showNome:true})).join('') || '<span style="color:var(--muted);font-size:12px">Sem exemplos disponíveis</span>'}
      </td>
    </tr>` : '';
    return `<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="toggleAnaliseTurmaNeg('${keyEsc}')">
      <td style="padding:7px 9px;white-space:nowrap;font-weight:600">${expanded ? '▾' : '▸'} ${r.turma}</td>
      <td style="padding:7px 9px;white-space:nowrap;color:var(--muted);font-size:12px">${r.curso}</td>
      <td style="padding:7px 9px;white-space:nowrap;color:var(--muted);font-size:12px">${r.unidade}</td>
      <td style="padding:7px 9px;text-align:center;color:var(--bad);font-weight:600">${r.neg}</td>
      <td style="padding:7px 9px;text-align:center;color:var(--muted)">${r.total}</td>
      <td style="padding:7px 9px;text-align:center"><span class="${pctCls}">${r.pctNeg.toFixed(1)}%</span></td>
    </tr>${examplesRow}`;
  }).join('');

  const bodyHtml = `
    <div style="overflow:auto;max-height:640px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead style="position:sticky;top:0;z-index:1">
          <tr style="background:var(--navy);color:#fff">
            ${th('Turma', 'turma')}
            ${th('Curso', 'curso')}
            ${th('Unidade', 'unidade')}
            ${th('Comentários Negativos', 'neg')}
            ${th('Total Comentários', 'total')}
            ${th('% Negativo', 'pctNeg')}
          </tr>
        </thead>
        <tbody>${trs || '<tr><td colspan="6" style="padding:14px;text-align:center;color:var(--muted)">Nenhuma turma com comentários negativos</td></tr>'}</tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px">${rows.length} turma(s) com ao menos 1 comentário negativo · clique em uma linha para ver exemplos</div>
  `;
  const wrap = document.getElementById('analise-turmasneg-table-wrap');
  if (wrap) wrap.innerHTML = bodyHtml;
}

// ---- Entry point da aba ----
function renderAnaliseComentariosTab(filteredData) {
  populateAnaliseFilters();
  populateAnaliseSentUnidadeSelect();
  const base = computeAnaliseBase(filteredData);
  const analyzed = base.map(r => Object.assign({}, r, analyzeComment(r)));

  safeCall(() => renderAnaliseTemasTable(analyzed), 'renderAnaliseTemasTable');
  safeCall(() => {
    const top5 = [..._analiseTemaRowsCache].sort((a, b) => b.mencoes - a.mencoes).slice(0, 5);
    renderAnaliseTemasChart('ch-analise-temas', analyzed, top5);
  }, 'renderAnaliseTemasChart');
  safeCall(() => renderAnaliseSentimentoChart('ch-analise-sentimento', analyzed), 'renderAnaliseSentimentoChart');
  safeCall(() => renderAnaliseCross(analyzed), 'renderAnaliseCross');
  safeCall(() => renderAnaliseTurmasNeg(analyzed), 'renderAnaliseTurmasNeg');
}


// ============ NPS PÓS-MÉDICA (pesquisa dedicada, dataset DATA_NPS) ============
let npsFilters = { unidade: '', curso: '', coordenador: '', classificacao: '' };
let _npsSearchTerm = '';
let _npsCommentsRows = [];

function npsFilterRows() {
  return DATA_NPS.filter(r =>
    (!npsFilters.unidade || r.unidade_calc === npsFilters.unidade) &&
    (!npsFilters.curso || r.curso === npsFilters.curso) &&
    (!npsFilters.coordenador || r.coordenador === npsFilters.coordenador) &&
    (!npsFilters.classificacao || r.classificacao === npsFilters.classificacao)
  );
}

function npsCalcStats(rows) {
  const total = rows.length;
  const prom = rows.filter(r => r.classificacao === 'Promotor').length;
  const neu  = rows.filter(r => r.classificacao === 'Neutro').length;
  const det  = rows.filter(r => r.classificacao === 'Detrator').length;
  const pProm = total ? prom / total * 100 : 0;
  const pNeu  = total ? neu / total * 100 : 0;
  const pDet  = total ? det / total * 100 : 0;
  const nps = total ? Math.round(pProm - pDet) : null;
  return { total, prom, neu, det, pProm, pNeu, pDet, nps };
}

function npsGroupStats(rows, keyFn) {
  const map = {};
  rows.forEach(r => {
    const k = keyFn(r);
    if (!map[k]) map[k] = [];
    map[k].push(r);
  });
  return Object.entries(map).map(([k, grp]) => Object.assign({ key: k }, npsCalcStats(grp)))
    .sort((a, b) => (b.nps ?? -999) - (a.nps ?? -999));
}

function onNpsFilterChange(sel, key) {
  npsFilters[key] = sel.value;
  renderNpsTab();
}

function clearNpsFilters() {
  npsFilters = { unidade: '', curso: '', coordenador: '', classificacao: '' };
  renderNpsTab();
}

function npsBreakdownTable(title, groups, label) {
  if (!groups.length) return `<div class="cbox" style="flex:1;min-width:280px"><h3>${title}</h3><p style="color:var(--muted);font-size:12px">Sem dados para os filtros selecionados.</p></div>`;
  const rowsHtml = groups.map(g => `
    <tr>
      <td style="padding:6px 8px;font-size:12px">${g.key}</td>
      <td style="padding:6px 8px;font-size:12px;text-align:center;font-weight:700;color:${g.nps>=50?'var(--good)':g.nps>=0?'var(--warn)':'var(--bad)'}">${g.nps}</td>
      <td style="padding:6px 8px;font-size:12px;text-align:center">${g.total}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:center;color:var(--good)">${g.pProm.toFixed(0)}%</td>
      <td style="padding:6px 8px;font-size:11px;text-align:center;color:var(--warn)">${g.pNeu.toFixed(0)}%</td>
      <td style="padding:6px 8px;font-size:11px;text-align:center;color:var(--bad)">${g.pDet.toFixed(0)}%</td>
    </tr>`).join('');
  return `<div class="cbox" style="flex:1;min-width:280px">
    <h3>${title}</h3>
    <table style="width:100%;border-collapse:collapse;margin-top:8px">
      <thead><tr style="border-bottom:2px solid var(--border)">
        <th style="text-align:left;padding:6px 8px;font-size:11px;color:var(--muted);text-transform:uppercase">${label}</th>
        <th style="padding:6px 8px;font-size:11px;color:var(--muted);text-transform:uppercase">NPS</th>
        <th style="padding:6px 8px;font-size:11px;color:var(--muted);text-transform:uppercase">Total</th>
        <th style="padding:6px 8px;font-size:11px;color:var(--muted);text-transform:uppercase">▲</th>
        <th style="padding:6px 8px;font-size:11px;color:var(--muted);text-transform:uppercase">●</th>
        <th style="padding:6px 8px;font-size:11px;color:var(--muted);text-transform:uppercase">▼</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>`;
}

function npsQuoteCard(r) {
  return `<div style="background:${r.classificacao==='Promotor'?'#f0fdf4':r.classificacao==='Detrator'?'#fef2f2':'#f8fafc'};border:1px solid ${r.classificacao==='Promotor'?'#86efac':r.classificacao==='Detrator'?'#fca5a5':'#e2e8f0'};border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:13px;line-height:1.6">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
      <span style="font-size:11px;font-weight:700;color:var(--navy)">${r.curso} <span style="font-weight:400;color:var(--muted)">— ${r.unidade_calc}</span></span>
      <span style="font-size:10px;background:#dbeafe;color:#1e3a8a;padding:1px 7px;border-radius:8px;font-weight:600">${r.coordenador}</span>
      <span style="font-size:10px;background:#e5e7eb;padding:1px 7px;border-radius:8px;font-weight:600">${r.nota.toFixed(1)}</span>
      <span style="font-size:10px;color:var(--muted);margin-left:auto">${r.data}</span>
    </div>
    <div style="white-space:pre-line">${r.feedback}</div>
  </div>`;
}

function renderNpsComments() {
  const wrap = document.getElementById('nps-comments-wrap');
  if (!wrap) return;
  const term = _npsSearchTerm.toLowerCase();
  const filtered = _npsCommentsRows.filter(r => !term || r.feedback.toLowerCase().includes(term) || r.curso.toLowerCase().includes(term) || r.coordenador.toLowerCase().includes(term));
  wrap.innerHTML = filtered.length
    ? filtered.slice(0, 60).map(npsQuoteCard).join('') + (filtered.length > 60 ? `<p style="color:var(--muted);font-size:11px;text-align:center;margin-top:8px">Mostrando 60 de ${filtered.length} comentários — refine os filtros para ver mais.</p>` : '')
    : '<p style="color:var(--muted);font-size:12px;padding:12px 0">Nenhum comentário encontrado.</p>';
}

function npsSearchInput(el) {
  _npsSearchTerm = el.value;
  renderNpsComments();
}

function npsSelectOptions(values, current) {
  return '<option value="">Todos</option>' + values.map(v => `<option value="${v}"${v===current?' selected':''}>${v}</option>`).join('');
}

function renderNpsTab() {
  const container = document.getElementById('nps-content');
  if (!container) return;

  const unidades = [...new Set(DATA_NPS.map(r => r.unidade_calc))].sort();
  const cursos = [...new Set(DATA_NPS.map(r => r.curso))].sort();
  const coordenadores = [...new Set(DATA_NPS.map(r => r.coordenador))].sort();

  const rows = npsFilterRows();
  const stats = npsCalcStats(rows);

  const headline = !rows.length ? '<p style="color:var(--muted);padding:20px">Nenhuma resposta para os filtros selecionados.</p>' : `
    <div class="cbox" style="margin-bottom:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:4px">
        <h2 style="margin:0;font-size:18px;color:var(--navy)">NPS — Pesquisa Pós-Médica</h2>
      </div>
      <p style="color:var(--muted);font-size:12px;margin:0 0 20px">${stats.total} resposta${stats.total!==1?'s':''} · 11/mai – 24/mai/2026</p>
      <div style="display:flex;gap:28px;flex-wrap:wrap;align-items:center;margin-bottom:22px">
        <div style="text-align:center;padding-right:28px;border-right:1px solid var(--border)">
          <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">NPS</div>
          <div style="font-size:44px;font-weight:800;color:var(--navy);line-height:1.1">${stats.nps}</div>
        </div>
        <div style="text-align:center;min-width:120px">
          <div style="font-size:12px;font-weight:700;color:var(--good);text-transform:uppercase;letter-spacing:.5px">▲ Promotores</div>
          <div style="font-size:30px;font-weight:800;color:var(--good);line-height:1.2">${stats.pProm.toFixed(1)}%</div>
          <div style="font-size:12px;color:var(--muted)">${stats.prom} respostas · nota ≥ 9</div>
        </div>
        <div style="text-align:center;min-width:120px">
          <div style="font-size:12px;font-weight:700;color:var(--warn);text-transform:uppercase;letter-spacing:.5px">● Neutros</div>
          <div style="font-size:30px;font-weight:800;color:var(--warn);line-height:1.2">${stats.pNeu.toFixed(1)}%</div>
          <div style="font-size:12px;color:var(--muted)">${stats.neu} respostas · nota 7-8</div>
        </div>
        <div style="text-align:center;min-width:120px">
          <div style="font-size:12px;font-weight:700;color:var(--bad);text-transform:uppercase;letter-spacing:.5px">▼ Detratores</div>
          <div style="font-size:30px;font-weight:800;color:var(--bad);line-height:1.2">${stats.pDet.toFixed(1)}%</div>
          <div style="font-size:12px;color:var(--muted)">${stats.det} respostas · nota ≤ 6</div>
        </div>
      </div>
      <div style="display:flex;width:100%;height:26px;border-radius:6px;overflow:hidden;font-size:11px;font-weight:700;color:#fff">
        <div style="width:${stats.pProm}%;background:var(--good);display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden">${stats.pProm>=8?stats.pProm.toFixed(0)+'%':''}</div>
        <div style="width:${stats.pNeu}%;background:var(--warn);display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden">${stats.pNeu>=8?stats.pNeu.toFixed(0)+'%':''}</div>
        <div style="width:${stats.pDet}%;background:var(--bad);display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden">${stats.pDet>=8?stats.pDet.toFixed(0)+'%':''}</div>
      </div>
    </div>`;

  const byUnidade = npsGroupStats(rows, r => r.unidade_calc);
  const byCurso = npsGroupStats(rows, r => r.curso);
  const byCoordenador = npsGroupStats(rows, r => r.coordenador);

  const commentsRows = rows.filter(r => r.feedback);
  _npsCommentsRows = commentsRows;

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:18px;background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 16px">
      <div class="fg"><label>Unidade</label><select onchange="onNpsFilterChange(this,'unidade')">${npsSelectOptions(unidades, npsFilters.unidade)}</select></div>
      <div class="fg"><label>Curso</label><select onchange="onNpsFilterChange(this,'curso')">${npsSelectOptions(cursos, npsFilters.curso)}</select></div>
      <div class="fg"><label>Coordenador</label><select onchange="onNpsFilterChange(this,'coordenador')">${npsSelectOptions(coordenadores, npsFilters.coordenador)}</select></div>
      <div class="fg"><label>Classificação</label><select onchange="onNpsFilterChange(this,'classificacao')">${npsSelectOptions(['Promotor','Neutro','Detrator'], npsFilters.classificacao)}</select></div>
      <button class="btn-reset" onclick="clearNpsFilters()">↺ Limpar filtros</button>
    </div>
    ${headline}
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px">
      ${npsBreakdownTable('NPS por Unidade', byUnidade, 'Unidade')}
      ${npsBreakdownTable('NPS por Curso', byCurso, 'Curso')}
    </div>
    <div class="cbox" style="margin-bottom:20px">
      <h3>NPS por Coordenador</h3>
      ${byCoordenador.length ? `<table style="width:100%;border-collapse:collapse;margin-top:8px">
        <thead><tr style="border-bottom:2px solid var(--border)">
          <th style="text-align:left;padding:6px 8px;font-size:11px;color:var(--muted);text-transform:uppercase">Coordenador</th>
          <th style="padding:6px 8px;font-size:11px;color:var(--muted);text-transform:uppercase">NPS</th>
          <th style="padding:6px 8px;font-size:11px;color:var(--muted);text-transform:uppercase">Total</th>
          <th style="padding:6px 8px;font-size:11px;color:var(--muted);text-transform:uppercase">▲</th>
          <th style="padding:6px 8px;font-size:11px;color:var(--muted);text-transform:uppercase">●</th>
          <th style="padding:6px 8px;font-size:11px;color:var(--muted);text-transform:uppercase">▼</th>
        </tr></thead>
        <tbody>${byCoordenador.map(g => `<tr>
          <td style="padding:6px 8px;font-size:12px">${g.key}</td>
          <td style="padding:6px 8px;font-size:12px;text-align:center;font-weight:700;color:${g.nps>=50?'var(--good)':g.nps>=0?'var(--warn)':'var(--bad)'}">${g.nps}</td>
          <td style="padding:6px 8px;font-size:12px;text-align:center">${g.total}</td>
          <td style="padding:6px 8px;font-size:11px;text-align:center;color:var(--good)">${g.pProm.toFixed(0)}%</td>
          <td style="padding:6px 8px;font-size:11px;text-align:center;color:var(--warn)">${g.pNeu.toFixed(0)}%</td>
          <td style="padding:6px 8px;font-size:11px;text-align:center;color:var(--bad)">${g.pDet.toFixed(0)}%</td>
        </tr>`).join('')}</tbody>
      </table>` : '<p style="color:var(--muted);font-size:12px">Sem dados para os filtros selecionados.</p>'}
    </div>
    <div class="cbox" style="margin-bottom:20px">
      <h3>Evolução Diária</h3>
      <div style="position:relative;height:280px"><canvas id="ch-nps-evolucao"></canvas></div>
    </div>
    <div class="cbox">
      <h3>Comentários (${commentsRows.length})</h3>
      <input type="text" placeholder="Buscar por palavra-chave, curso ou coordenador..." oninput="npsSearchInput(this)" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;margin:10px 0">
      <div id="nps-comments-wrap"></div>
    </div>
  `;

  npsEvolucaoChart('ch-nps-evolucao', rows);
  renderNpsComments();
}

function npsEvolucaoChart(canvasId, rows) {
  destroyChart(canvasId);
  const dayMap = {};
  rows.forEach(r => { if (!dayMap[r.dia_key]) dayMap[r.dia_key] = { label: r.dia_label, rows: [] }; dayMap[r.dia_key].rows.push(r); });
  const days = Object.keys(dayMap).sort();
  if (!days.length) return;
  const labels = days.map(k => dayMap[k].label);
  const totais = days.map(k => dayMap[k].rows.length);
  const npsPorDia = days.map(k => npsCalcStats(dayMap[k].rows).nps);

  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const labelsPlugin = {
    id: 'npsEvolucaoLabelsPlugin',
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      c.save();
      const barMeta = chart.getDatasetMeta(0);
      barMeta.data.forEach((el, i) => {
        if (totais[i] == null) return;
        c.font = '700 10px Segoe UI, sans-serif';
        c.fillStyle = '#fff';
        c.textAlign = 'center';
        c.fillText('n=' + totais[i], el.x, el.y + 14);
      });
      const lineMeta = chart.getDatasetMeta(1);
      lineMeta.data.forEach((el, i) => {
        if (npsPorDia[i] == null) return;
        c.font = '700 11px Segoe UI, sans-serif';
        c.fillStyle = '#1A2459';
        c.textAlign = 'center';
        c.fillText(npsPorDia[i], el.x, el.y - 13);
      });
      c.restore();
    }
  };

  CHARTS[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { type: 'bar', label: 'Respostas', data: totais, backgroundColor: '#01559Bcc', borderRadius: 4, borderSkipped: false, yAxisID: 'y1', order: 2, maxBarThickness: 32 },
        { type: 'line', label: 'NPS', data: npsPorDia, borderColor: '#F5C518', backgroundColor: '#F5C518', pointBackgroundColor: '#F5C518', pointBorderColor: '#1A2459', pointBorderWidth: 1.5, borderWidth: 3, pointRadius: 4, pointHoverRadius: 6, tension: .3, spanGaps: false, yAxisID: 'y', order: 1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, clip: false,
      layout: { padding: { top: 26, bottom: 6 } },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle', boxWidth: 10, boxHeight: 10 } },
        tooltip: { callbacks: { label: c => c.dataset.type === 'bar' ? `Respostas: ${c.parsed.y}` : `NPS: ${c.parsed.y}` } }
      },
      scales: {
        y: { position: 'left', suggestedMin: -100, suggestedMax: 100, ticks: { stepSize: 25 }, grid: { color: '#f0f0f0' }, title: { display: true, text: 'NPS', color: '#6b7280', font: { size: 10 } } },
        y1: { position: 'right', suggestedMin: 0, grid: { drawOnChartArea: false }, title: { display: true, text: 'respostas', color: '#6b7280', font: { size: 10 } } },
        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 60, minRotation: 0, autoSkip: true } }
      }
    },
    plugins: [labelsPlugin]
  });
}

// ============ RESUMO NPS (copiável para PPT) ============
function buildNpsSummaryBlock() {
  const fdAll = applyFilters(DATA_GERAL);
  const total = fdAll.length;
  if (!total) return '';

  const prom = fdAll.filter(r => r.nota_geral >= 9).length;
  const neu  = fdAll.filter(r => r.nota_geral >= 7 && r.nota_geral <= 8).length;
  const det  = fdAll.filter(r => r.nota_geral <= 6).length;
  const pProm = prom / total * 100;
  const pNeu  = neu  / total * 100;
  const pDet  = det  / total * 100;
  const nps = Math.round(pProm - pDet);

  const filterBits = [];
  if (F.unidade) filterBits.push(F.unidade);
  if (F.hab) filterBits.push(F.hab);
  if (F.diturma) filterBits.push(F.diturma);
  if (F.ano) filterBits.push(F.ano);
  if (F.mes && F.mes.length) filterBits.push(F.mes.join(', '));
  const scopeLabel = filterBits.length ? filterBits.join(' · ') : 'Todos os períodos e unidades';

  return `
    <div id="nps-summary-card" style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:24px 28px;margin-bottom:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:4px">
        <h2 style="margin:0;font-size:18px;color:var(--navy)">Promotores, Neutros e Detratores</h2>
        <button onclick="copyNpsSummaryToClipboard()" id="nps-copy-btn" style="padding:7px 14px;border:1px solid var(--blue);border-radius:5px;background:#fff;color:var(--blue);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">📋 Copiar para PPT</button>
      </div>
      <p style="color:var(--muted);font-size:12px;margin:0 0 20px">${scopeLabel} · ${total} resposta${total!==1?'s':''}</p>

      <div style="display:flex;gap:28px;flex-wrap:wrap;align-items:center;margin-bottom:22px">
        <div style="text-align:center;padding-right:28px;border-right:1px solid var(--border)">
          <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">NPS</div>
          <div style="font-size:44px;font-weight:800;color:var(--navy);line-height:1.1">${nps}</div>
        </div>
        <div style="text-align:center;min-width:120px">
          <div style="font-size:12px;font-weight:700;color:var(--good);text-transform:uppercase;letter-spacing:.5px">▲ Promotores</div>
          <div style="font-size:30px;font-weight:800;color:var(--good);line-height:1.2">${pProm.toFixed(1)}%</div>
          <div style="font-size:12px;color:var(--muted)">${prom} respostas · nota ≥ 9</div>
        </div>
        <div style="text-align:center;min-width:120px">
          <div style="font-size:12px;font-weight:700;color:var(--warn);text-transform:uppercase;letter-spacing:.5px">● Neutros</div>
          <div style="font-size:30px;font-weight:800;color:var(--warn);line-height:1.2">${pNeu.toFixed(1)}%</div>
          <div style="font-size:12px;color:var(--muted)">${neu} respostas · nota 7-8</div>
        </div>
        <div style="text-align:center;min-width:120px">
          <div style="font-size:12px;font-weight:700;color:var(--bad);text-transform:uppercase;letter-spacing:.5px">▼ Detratores</div>
          <div style="font-size:30px;font-weight:800;color:var(--bad);line-height:1.2">${pDet.toFixed(1)}%</div>
          <div style="font-size:12px;color:var(--muted)">${det} respostas · nota ≤ 6</div>
        </div>
      </div>

      <div style="display:flex;width:100%;height:26px;border-radius:6px;overflow:hidden;font-size:11px;font-weight:700;color:#fff">
        <div style="width:${pProm}%;background:var(--good);display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden">${pProm>=8?pProm.toFixed(0)+'%':''}</div>
        <div style="width:${pNeu}%;background:var(--warn);display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden">${pNeu>=8?pNeu.toFixed(0)+'%':''}</div>
        <div style="width:${pDet}%;background:var(--bad);display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden">${pDet>=8?pDet.toFixed(0)+'%':''}</div>
      </div>
    </div>`;
}

async function copyNpsSummaryToClipboard() {
  const btn = document.getElementById('nps-copy-btn');
  const el = document.getElementById('nps-summary-card');
  if (!el) return;
  const originalLabel = btn ? btn.textContent : '';
  if (btn) { btn.textContent = 'Gerando...'; btn.disabled = true; }
  try {
    if (typeof html2canvas === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    }
    // Hide the button itself while capturing so it doesn't appear in the image
    if (btn) btn.style.visibility = 'hidden';
    const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2 });
    if (btn) btn.style.visibility = 'visible';
    canvas.toBlob(async (blob) => {
      let copied = false;
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          copied = true;
        }
      } catch (e) { copied = false; }
      if (copied) {
        if (btn) { btn.textContent = '✅ Copiado! Ctrl+V no PPT'; setTimeout(() => { btn.textContent = originalLabel; btn.disabled = false; }, 2500); }
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'resumo_nps.png';
        a.click();
        if (btn) { btn.textContent = 'Imagem baixada'; setTimeout(() => { btn.textContent = originalLabel; btn.disabled = false; }, 2500); }
      }
    });
  } catch (err) {
    console.error('[copyNpsSummaryToClipboard] falhou:', err);
    if (btn) { btn.textContent = 'Erro — tente de novo'; btn.disabled = false; }
  }
}

// ============ RESUMO DOS COMENTÁRIOS POR CLASSIFICAÇÃO ============
function buildClassificacaoResumoBlock(rows) {
  const total = rows.length;
  if (!total) return '';

  const TEMA_LABEL_LOCAL = {
    'Organizacao':'Organização','Alimentacao':'Alimentação','Aula Online':'Aula Online',
    'Plataforma':'Plataforma','Professores':'Professores','Aulas':'Aulas','Estrutura':'Estrutura',
    'Equipamentos':'Equipamentos','Triagem':'Triagem','Alunos':'Alunos','Financeiro':'Financeiro',
    'Geral':'Geral'
  };

  const groups = [
    { label: 'Promotores', icon: '▲', color: '#16a34a', type: 'pos', rows: rows.filter(r => r.nota >= 9) },
    { label: 'Neutros',    icon: '●', color: '#d97706', type: 'neu', rows: rows.filter(r => r.nota >= 7 && r.nota <= 8) },
    { label: 'Detratores', icon: '▼', color: '#dc2626', type: 'neg', rows: rows.filter(r => r.nota <= 6) }
  ];

  const cards = groups.map(g => {
    const n = g.rows.length;
    const pct = Math.round(n / total * 100);

    const temaCount = {};
    g.rows.forEach(r => {
      const words = normWord(r.feedback || '').split(/[\s,.!?;:()\-\n\r"\/\\]+/).filter(w => w.length > 2);
      const seen = new Set();
      words.forEach(w => {
        const t = TEMA_LOOKUP[w];
        if (t && !seen.has(t)) { temaCount[t] = (temaCount[t] || 0) + 1; seen.add(t); }
      });
    });
    const topTemas = Object.entries(temaCount).sort((a,b) => b[1]-a[1]).slice(0, 5);
    const temasHtml = topTemas.length
      ? topTemas.map(([t,c]) => `<span style="display:inline-block;background:#f1f5f9;color:var(--navy);font-size:11px;font-weight:600;padding:3px 10px;border-radius:12px;margin:0 6px 6px 0">${TEMA_LABEL_LOCAL[t] || t} · ${c}</span>`).join('')
      : '<p style="color:var(--muted);font-size:12px;margin:0">Sem temas recorrentes identificados</p>';

    const sample = [...g.rows].sort((a,b) => (b.ts||0) - (a.ts||0)).slice(0, 3)
      .map(r => quoteCard(r, g.type)).join('')
      || '<p style="color:var(--muted);font-size:12px">Sem comentários neste grupo</p>';

    return `<div class="cbox" style="flex:1;min-width:300px;border-top:4px solid ${g.color}">
      <div style="font-size:19px;font-weight:800;color:${g.color};margin-bottom:2px">${g.icon} ${g.label}</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px">${n} coment${n!==1?'ários':'ário'} · ${pct}% do total</div>
      <div style="margin-bottom:12px">${temasHtml}</div>
      <div style="max-height:300px;overflow:auto">${sample}</div>
    </div>`;
  }).join('');

  return `
    <h3 style="margin:0 0 14px;font-size:15px;color:var(--navy);border-bottom:2px solid var(--border);padding-bottom:8px">Resumo dos Comentários por Classificação</h3>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:28px">${cards}</div>`;
}

function buildResumoBlock(rows) {
  const analyzed = rows.map(r => ({ ...r, ...analyzeComment(r) }));
  const temaData = {};
  const geralRows = [];

  analyzed.forEach(r => {
    if (r.temas.length > 1) {
      geralRows.push(r);
    } else if (r.temas.length === 1) {
      const t = r.temas[0];
      if (!temaData[t]) temaData[t] = { pos:[], neg:[], neu:[] };
      temaData[t][r.sentiment].push(r);
    } else {
      if (r.score !== 0) geralRows.push(r);
    }
  });

  if (geralRows.length) {
    temaData['Geral'] = {
      pos: geralRows.filter(r=>r.sentiment==='pos'),
      neg: geralRows.filter(r=>r.sentiment==='neg'),
      neu: geralRows.filter(r=>r.sentiment==='neu')
    };
  }

  const totalFb  = rows.length;
  const totalPos = analyzed.filter(r=>r.sentiment==='pos').length;
  const totalNeg = analyzed.filter(r=>r.sentiment==='neg').length;
  const totalNeu = totalFb - totalPos - totalNeg;
  // Labels reflect: 9-10 Promotor, 7-8 Neutro, 1-6 Detrator

  const summaryHtml = `
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:28px">
      <div class="cbox" style="flex:1;min-width:130px;text-align:center">
        <div style="font-size:32px;font-weight:800;color:var(--navy)">${totalFb}</div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Feedbacks analisados</div>
      </div>
      <div class="cbox" style="flex:1;min-width:130px;text-align:center;border-left:4px solid #16a34a">
        <div style="font-size:32px;font-weight:800;color:#16a34a">${totalPos}</div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Promotores (9–10)</div>
      </div>
      <div class="cbox" style="flex:1;min-width:130px;text-align:center;border-left:4px solid #d97706">
        <div style="font-size:32px;font-weight:800;color:#d97706">${totalNeu}</div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Neutros (7–8)</div>
      </div>
      <div class="cbox" style="flex:1;min-width:130px;text-align:center;border-left:4px solid #dc2626">
        <div style="font-size:32px;font-weight:800;color:#dc2626">${totalNeg}</div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Detratores (1–6)</div>
      </div>
    </div>`;

  const sortedTemas = Object.entries(temaData)
    .map(([tema,d]) => ({ tema, ...d, total: d.pos.length+d.neg.length+d.neu.length }))
    .filter(d => d.total > 0)
    .sort((a,b) => {
      if (a.tema==='Geral') return 1;
      if (b.tema==='Geral') return -1;
      return b.total - a.total;
    });

  const TEMA_LABEL_LOCAL = {
    'Organizacao':'Organização','Alimentacao':'Alimentação','Aula Online':'Aula Online',
    'Plataforma':'Plataforma','Professores':'Professores','Aulas':'Aulas','Estrutura':'Estrutura',
    'Equipamentos':'Equipamentos','Triagem':'Triagem','Alunos':'Alunos','Financeiro':'Financeiro',
    'Geral':'Geral (múltiplos temas)'
  };

  const temaCards = sortedTemas.map(d => {
    const label  = TEMA_LABEL_LOCAL[d.tema] || d.tema;
    const pPct   = Math.round(d.pos.length/d.total*100);
    const nPct   = Math.round(d.neu.length/d.total*100);
    const dPct   = 100 - pPct - nPct;
    const pct    = Math.round(d.total/totalFb*100);
    const posQ   = d.pos.slice(0,2).map(r=>quoteCard(r,'pos')).join('');
    const negQ   = d.neg.slice(0,2).map(r=>quoteCard(r,'neg')).join('');
    const neuQ   = d.neu.slice(0,1).map(r=>quoteCard(r,'neu')).join('');
    const leftCol  = posQ || '<p style="color:var(--muted);font-size:12px;padding:8px 0">Sem comentários positivos</p>';
    const rightCol = negQ || '<p style="color:var(--muted);font-size:12px;padding:8px 0">Sem comentários negativos</p>';
    const plano    = planoAcaoHtml(d.tema, d.neg);
    const isGeral  = d.tema === 'Geral';
    const borderColor = isGeral ? '#7c3aed' : (d.neg.length > d.pos.length ? '#dc2626' : '#16a34a');

    return `<div class="cbox" style="margin-bottom:18px;border-left:4px solid ${borderColor}">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <h3 style="margin:0;font-size:16px;color:var(--navy)">${label}</h3>
        <span style="font-size:12px;background:#f1f5f9;padding:3px 10px;border-radius:12px;color:var(--muted)">${d.total} ${d.total!==1?'menções':'menção'} · ${pct}% dos feedbacks</span>
        <div style="margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:8px">
          <button onclick="downloadTemaSheet('${d.tema}')"
            style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;background:#f8fafc;border:1px solid var(--border);border-radius:5px;font-size:11px;font-weight:600;color:var(--navy);cursor:pointer">
            ⬇ Baixar feedbacks
          </button>
          <div style="display:flex;gap:12px;font-size:12px;font-weight:600">
            ${d.pos.length ? `<span style="display:inline-flex;align-items:center;gap:4px;color:#16a34a"><span style="display:inline-block;width:10px;height:10px;background:#16a34a;border-radius:2px"></span>${d.pos.length} positivos</span>` : ''}
            ${d.neu.length ? `<span style="display:inline-flex;align-items:center;gap:4px;color:#64748b"><span style="display:inline-block;width:10px;height:10px;background:#94a3b8;border-radius:2px"></span>${d.neu.length} neutros</span>` : ''}
            ${d.neg.length ? `<span style="display:inline-flex;align-items:center;gap:4px;color:#dc2626"><span style="display:inline-block;width:10px;height:10px;background:#dc2626;border-radius:2px"></span>${d.neg.length} negativos</span>` : ''}
          </div>
        </div>
      </div>
      <div style="height:8px;border-radius:4px;background:#f1f5f9;overflow:hidden;margin-bottom:14px;display:flex">
        <div style="height:100%;width:${pPct}%;background:#16a34a;transition:width .4s"></div>
        <div style="height:100%;width:${nPct}%;background:#94a3b8;transition:width .4s"></div>
        <div style="height:100%;width:${dPct}%;background:#dc2626;transition:width .4s"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>${leftCol}${neuQ}</div>
        <div>${rightCol}</div>
      </div>
      ${plano}
    </div>`;
  }).join('');

  return summaryHtml + `<h3 style="margin:0 0 16px;font-size:15px;color:var(--navy);border-bottom:2px solid var(--border);padding-bottom:8px">Temas identificados</h3>${temaCards}` + buildAllCommentsTable(rows);
}

function renderResumo() {
  _resumoUID = 0;
  const container = document.getElementById('resumo-content');
  if (!container) return;

  const rows = applyFiltersResumo();
  if (!rows.length) {
    container.innerHTML = '<p style="color:var(--muted);padding:20px">Nenhum feedback para os filtros selecionados.</p>';
    return;
  }

  const curMesLabel = (function(){
    if (F.mes && F.mes.length > 0) return F.mes[F.mes.length-1];
    const MES_SEQ=[9,10,11,12,1,2,3,4,5,6,7,8,13];
    const ML={9:'set/25',10:'out/25',11:'nov/25',12:'dez/25',1:'jan/26',2:'fev/26',3:'mar/26',4:'abr/26',5:'mai/26',6:'jun/26',7:'jul/26',8:'ago/26',13:'set/26'};
    const pm=new Set(DATA_FEEDBACK.map(r=>r.mes_order).filter(Boolean));
    const s=MES_SEQ.filter(m=>pm.has(m));
    return ML[s[s.length-1]]||'';
  })();

  container.innerHTML = `
    ${buildNpsSummaryBlock()}
    ${buildClassificacaoResumoBlock(rows)}
    <h2 style="margin:0 0 6px;font-size:20px;color:var(--navy)">Resumo Executivo</h2>
    <p style="color:var(--muted);font-size:13px;margin-bottom:20px">
      Período: <strong>${curMesLabel}</strong> · Classificação: ≥9 Promotor · 7–8 Neutro · ≤6 Detrator, refinada por análise lexical.
      Feedbacks com múltiplos temas são agrupados em <strong>Geral</strong>.
      Sem filtro de mês ativo: exibe automaticamente o mês mais recente.
    </p>
    ${buildResumoBlock(rows)}`;
}

// ============ RESUMO EXECUTIVO POR UNIDADE (dentro da aba Feedbacks) ============

// ============ DOWNLOAD FEEDBACKS POR TEMA ============
async function downloadTemaSheet(tema) {
  if (typeof XLSX === 'undefined') {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  }
  const rows = applyFiltersResumo();
  if (!rows.length) { alert('Nenhum feedback para os filtros selecionados.'); return; }
  const analyzed = rows.map(r => ({ ...r, ...analyzeComment(r) }));
  const TEMA_LABEL_LOCAL = {
    'Organizacao':'Organização','Alimentacao':'Alimentação','Aula Online':'Aula Online',
    'Plataforma':'Plataforma','Professores':'Professores','Aulas':'Aulas','Estrutura':'Estrutura',
    'Equipamentos':'Equipamentos','Triagem':'Triagem','Alunos':'Alunos','Financeiro':'Financeiro',
    'Geral':'Geral'
  };
  const temaRows = analyzed.filter(r => {
    if (tema === 'Geral') return r.temas.length > 1 || (r.temas.length === 0 && r.score !== 0);
    return r.temas.length === 1 && r.temas[0] === tema;
  });
  if (!temaRows.length) { alert('Nenhum feedback encontrado para este tema.'); return; }
  const data = temaRows.map(r => ({
    'Habilitação': r.hab||'', 'Unidade': r.unidade||'', 'Nota': r.nota!=null?r.nota:'',
    'Classificação': r.sentiment==='pos'?'Positivo':r.sentiment==='neg'?'Negativo':'Neutro',
    'Mês': r.mes_label||'', 'DI & Turma': r.di_turma||'', 'Feedback': r.feedback||''
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{wch:30},{wch:14},{wch:7},{wch:13},{wch:10},{wch:20},{wch:90}];
  const sheetLabel = (TEMA_LABEL_LOCAL[tema]||tema).slice(0,31);
  XLSX.utils.book_append_sheet(wb, ws, sheetLabel);
  const parts = ['feedbacks', sheetLabel.toLowerCase().replace(/[^a-z0-9]/g,'_')];
  if (F.unidade) parts.push(F.unidade.toLowerCase().replace(/[^a-z0-9]/g,''));
  if (F.mes && F.mes.length > 0) parts.push(F.mes.join('-').replace(/\//g,''));
  parts.push(new Date().toISOString().slice(0,10));
  XLSX.writeFile(wb, parts.join('_') + '.xlsx');
}


// ============ EVOLUÇÃO SEMANAL ============
function evolHabSemChart(canvasId, unit, filteredData) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const uData = filteredData.filter(r => r.unidade_calc === unit && r.semana_key && r.semana_label);
  if (!uData.length) return;

  // Build sorted semana sequence
  const semSet = {};
  uData.forEach(r => { semSet[r.semana_key] = r.semana_label; });
  const semSeq = Object.keys(semSet).sort();
  const labels = semSeq.map(k => semSet[k]);

  // Single series: nota geral média da unidade por semana
  const data = semSeq.map(sk => {
    const rows = uData.filter(r => r.semana_key === sk);
    return rows.length ? avg(rows.map(r => r.nota_geral)) : null;
  });

  CHARTS[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: unit,
        data,
        borderColor: '#01559B',
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: '#fff',
        pointBorderColor: '#01559B',
        pointBorderWidth: 2,
        tension: 0.3,
        spanGaps: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, clip: false,
      layout: { padding: { top: 14, bottom: 14 } },
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8 } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y ? c.parsed.y.toFixed(2) : '-'}` } }
      },
      scales: {
        y: {
          suggestedMin: 0, suggestedMax: 10,
          ticks: { callback: v => v.toFixed(1), stepSize: 1 },
          grid: { color: '#f0f0f0' }
        },
        x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45, minRotation: 0, autoSkip: false } }
      }
    }
  });
}



// ============ ITENS SPARKLINES ============
function renderItensSparklines(filteredItens) {
  const container = document.getElementById('itens-sparklines');
  if (!container) return;

  const MES_SEQ = [9,10,11,12,1,2,3,4,5,6,7,8,13];
  const MES_LABEL_MAP = {9:'set/25',10:'out/25',11:'nov/25',12:'dez/25',
    1:'jan/26',2:'fev/26',3:'mar/26',4:'abr/26',5:'mai/26',6:'jun/26',7:'jul/26',8:'ago/26',13:'set/26'};

  const TIPOS = ['Aula Online','Aula Prática','Infraestrutura','Plataforma Avida','Professor','Triagem'];
  const UNITS = F.unidade ? [F.unidade] : ['BRASÍLIA','CAMPINAS','CONSOLAÇÃO','ONLINE'];

  // Filter active units based on active items filter
  const activeTypes = F.itens.length > 0 ? F.itens : TIPOS;

  // Build lookup from filteredItens: unidade × tipo × mes → {sum, cnt}
  const lookup = {};
  filteredItens.forEach(r => {
    const g = IDX_GERAL[r['db-id']];
    if (!g) return;
    if (F.unidade && g.unidade_calc !== F.unidade) return;
    if (F.mes && F.mes.length > 0 && !F.mes.includes(g.mes_label)) return;
    if (F.semana && g.semana_key !== F.semana) return;
    const u = g.unidade_calc;
    const t = r.tipo_avaliacao;
    const m = g.mes_order;
    const key = `${u}||${t}||${m}`;
    if (!lookup[key]) lookup[key] = {sum:0,cnt:0};
    lookup[key].sum += r.nota;
    lookup[key].cnt++;
  });

  // Determine which months are present
  const presentMes = new Set(Object.keys(lookup).map(k=>parseInt(k.split('||')[2])));
  const mesSeq = MES_SEQ.filter(m => presentMes.has(m));
  const mesLabels = mesSeq.map(m => MES_LABEL_MAP[m]);

  function getVal(u,t,m) {
    const k = `${u}||${t}||${m}`;
    return lookup[k] ? lookup[k].sum/lookup[k].cnt : null;
  }

  function colorVal(v) {
    if (v === null) return '#94a3b8';
    if (v >= 4.0) return '#16a34a';
    if (v >= 3.5) return '#d97706';
    return '#dc2626';
  }

  // One section per tipo, grid of unidades inside
  const TIPO_LABELS = {
    'Aula Online':'Aula Online','Aula Prática':'Aula Prática',
    'Infraestrutura':'Infraestrutura','Plataforma Avida':'Plataforma Avida',
    'Professor':'Professor','Triagem':'Triagem'
  };

  // Destroy old sparkline charts
  Object.keys(CHARTS).filter(k=>k.startsWith('spark-')).forEach(k=>{ if(CHARTS[k]){CHARTS[k].destroy();delete CHARTS[k];} });

  let html = '';

  // Summary cards (overall average per tipo across filtered units)
  const summaryCards = activeTypes.map(tipo => {
    let sum=0, cnt=0;
    UNITS.forEach(u => {
      mesSeq.forEach(m => {
        const k = `${u}||${tipo}||${m}`;
        if (lookup[k]) { sum += lookup[k].sum; cnt += lookup[k].cnt; }
      });
    });
    const avg = cnt > 0 ? sum/cnt : null;
    const cls = avg===null?'#94a3b8':avg>=4?'#16a34a':avg>=3.5?'#d97706':'#dc2626';
    return `<div class="cbox" style="flex:1;min-width:120px;text-align:center">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);margin-bottom:6px">${tipo}</div>
      <div style="font-size:28px;font-weight:800;color:${cls}">${avg!==null?avg.toFixed(2):'—'}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${cnt} respondentes</div>
    </div>`;
  }).join('');

  html += `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">${summaryCards}</div>`;

  // Sparkline grid: rows = tipos, cols = unidades
  html += `<div style="font-size:11px;color:var(--muted);margin-bottom:12px">
    Evolução mensal por item e unidade (escala 1–5) ·
    <span style="color:#16a34a;font-weight:600">■</span> ≥4.0 Bom &nbsp;
    <span style="color:#d97706;font-weight:600">■</span> 3.5–3.9 Atenção &nbsp;
    <span style="color:#dc2626;font-weight:600">■</span> &lt;3.5 Crítico
  </div>`;

  activeTypes.forEach(tipo => {
    const unitCells = UNITS.map(u => {
      const vals = mesSeq.map(m => getVal(u,t=tipo,m));
      const hasData = vals.some(v=>v!==null);
      if (!hasData) return '';
      const nonNullVals = vals.filter(v=>v!==null);
      const lastVal  = nonNullVals.length > 0 ? nonNullVals[nonNullVals.length-1] : null;
      const prevVal  = nonNullVals.length > 1 ? nonNullVals[nonNullVals.length-2] : null;
      const trend = lastVal!==null&&prevVal!==null ? (lastVal>prevVal?'↑':lastVal<prevVal?'↓':'→') : '';
      const trendColor = trend==='↑'?'#16a34a':trend==='↓'?'#dc2626':'#94a3b8';
      const cid = `spark-${u.replace(/[^a-z]/gi,'')}-${tipo.replace(/[^a-z]/gi,'')}`;

      return `<div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;background:#fff">
        <div style="font-size:10px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:.3px;margin-bottom:2px">${u}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:20px;font-weight:800;color:${colorVal(lastVal)}">${lastVal!==null?lastVal.toFixed(2):'—'}</span>
          <span style="font-size:16px;color:${trendColor};font-weight:700">${trend}</span>
        </div>
        <div style="height:50px"><canvas id="${cid}"></canvas></div>
        <div style="display:flex;justify-content:space-between;margin-top:3px;font-size:9px;color:var(--muted)">
          <span>${mesLabels[0]||''}</span><span>${mesLabels[mesLabels.length-1]||''}</span>
        </div>
      </div>`;
    }).filter(Boolean).join('');

    if (!unitCells) return;

    html += `<div style="margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;color:var(--navy);padding:6px 0;border-bottom:2px solid var(--border);margin-bottom:10px">${tipo}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
        ${unitCells}
      </div>
    </div>`;
  });

  container.innerHTML = `<div class="cbox full">${html}</div>`;

  // Now draw sparkline charts
  activeTypes.forEach(tipo => {
    UNITS.forEach(u => {
      const cid = `spark-${u.replace(/[^a-z]/gi,'')}-${tipo.replace(/[^a-z]/gi,'')}`;
      const ctx = document.getElementById(cid);
      if (!ctx) return;
      const vals = mesSeq.map(m => getVal(u,tipo,m));
      const lastVal = [...vals].reverse().find(v=>v!==null);
      const lineColor = colorVal(lastVal);

      CHARTS[cid] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: mesLabels,
          datasets: [{
            data: vals,
            borderColor: lineColor,
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 2.5,
            pointBackgroundColor: lineColor,
            tension: 0.3,
            spanGaps: false
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, clip: false,
          animation: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: c => c.parsed.y!==null ? c.parsed.y.toFixed(2) : '—' } }
          },
          scales: {
            y: { display: false, suggestedMin: 1, suggestedMax: 5 },
            x: { display: false }
          }
        }
      });
    });
  });
}


// Desenha o valor (2 casas) acima de cada ponto não-nulo de um mini-gráfico de sparkline.
// Sem plugin de datalabels no projeto — desenhado à mão no canvas, mesmo padrão do evolucaoGeralCombo.
function sparkValueLabelPlugin(color) {
  return {
    id: 'sparkVal_' + color.replace('#',''),
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      const data = chart.data.datasets[0].data;
      ctx.save();
      ctx.font = '700 9px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      meta.data.forEach((el, i) => {
        const v = data[i];
        if (v === null || v === undefined) return;
        ctx.fillText(v.toFixed(2), el.x, Math.max(el.y - 7, 9));
      });
      ctx.restore();
    }
  };
}

// ============ ITENS SPARKLINES POR UNIDADE ============
function renderItensSparkUnit(divId, unit, filteredItens) {
  const container = document.getElementById(divId);
  if (!container) return;

  // Jan/26 onwards only
  const MES_SEQ = [1,2,3,4,5,6,7,8,13];
  const MES_LABEL_MAP = {1:'jan/26',2:'fev/26',3:'mar/26',4:'abr/26',5:'mai/26',6:'jun/26',
    7:'jul/26',8:'ago/26',9:'set/26',10:'out/26',11:'nov/26',12:'dez/26',13:'set/26'};

  const TIPOS = ['Aula Online','Aula Prática','Infraestrutura','Plataforma Avida','Professor','Triagem'];
  const activeTypes = F.itens.length > 0 ? F.itens : TIPOS;

  // Build lookup: tipo × mes → {sum, cnt} for this unit
  const lookup = {};
  filteredItens.forEach(r => {
    const g = IDX_GERAL[r['db-id']];
    if (!g || g.unidade_calc !== unit) return;
    const m = g.mes_order;
    if (!MES_SEQ.includes(m)) return; // jan/26 onwards only
    if (F.mes && F.mes.length > 0) { if (!F.mes.includes(g.mes_label)) return; }
    if (F.semana && g.semana_key !== F.semana) return;
    const t = r.tipo_avaliacao;
    const key = `${t}||${m}`;
    if (!lookup[key]) lookup[key] = {sum:0, cnt:0};
    lookup[key].sum += r.nota;
    lookup[key].cnt++;
  });

  // Determine which months have data
  const presentMes = new Set(Object.keys(lookup).map(k => parseInt(k.split('||')[1])));
  const mesSeq = MES_SEQ.filter(m => presentMes.has(m));
  const mesLabels = mesSeq.map(m => MES_LABEL_MAP[m]);

  if (!mesSeq.length) { container.innerHTML = ''; return; }

  function getVal(t, m) {
    const k = `${t}||${m}`;
    return lookup[k] ? lookup[k].sum / lookup[k].cnt : null;
  }
  function colorVal(v) {
    if (v === null) return '#94a3b8';
    if (v >= 4.0) return '#16a34a';
    if (v >= 3.5) return '#d97706';
    return '#dc2626';
  }

  // Destroy old sparkline charts for this unit (prefixed by divId so multiple call sites for the
  // same unit — e.g. its own tab AND the consolidated Visão Geral breakdown — never collide on canvas id)
  Object.keys(CHARTS)
    .filter(k => k.startsWith(`${divId}-`))
    .forEach(k => { if (CHARTS[k]) { CHARTS[k].destroy(); delete CHARTS[k]; } });

  const cards = activeTypes.map(tipo => {
    const vals = mesSeq.map(m => getVal(tipo, m));
    if (!vals.some(v => v !== null)) return '';

    const lastVal  = [...vals].reverse().find(v => v !== null);
    const firstVal = vals.find(v => v !== null);
    const trend = (lastVal !== null && firstVal !== null)
      ? (lastVal > firstVal + 0.05 ? '↑' : lastVal < firstVal - 0.05 ? '↓' : '→') : '';
    const trendColor = trend==='↑'?'#16a34a':trend==='↓'?'#dc2626':'#94a3b8';
    const lineColor  = colorVal(lastVal);
    const cid = `${divId}-${tipo.replace(/[^a-z]/gi,'')}`;

    return `<div style="border:1px solid var(--border);border-radius:8px;padding:12px 14px;background:#fff;min-width:160px;flex:1">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--muted);margin-bottom:6px">${tipo}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:24px;font-weight:800;color:${lineColor}">${lastVal !== null ? lastVal.toFixed(2) : '—'}</span>
        <span style="font-size:18px;color:${trendColor};font-weight:700">${trend}</span>
      </div>
      <div style="height:70px"><canvas id="${cid}"></canvas></div>
    </div>`;
  }).filter(Boolean);

  if (!cards.length) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <div class="cbox full">
      <h3>Avaliação dos Itens Específicos — ${unit} <span style="font-size:12px;font-weight:400;color:var(--muted)">(escala 1–5)</span></h3>
      <div style="font-size:11px;color:var(--muted);margin-bottom:12px">
        <span style="color:#16a34a;font-weight:600">■</span> ≥4.0 Bom &nbsp;
        <span style="color:#d97706;font-weight:600">■</span> 3.5–3.9 Atenção &nbsp;
        <span style="color:#dc2626;font-weight:600">■</span> &lt;3.5 Crítico
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${cards.join('')}</div>
    </div>`;

  // Draw sparklines with all month labels on x axis
  setTimeout(() => {
    activeTypes.forEach(tipo => {
      const cid = `${divId}-${tipo.replace(/[^a-z]/gi,'')}`;
      const ctx = document.getElementById(cid);
      if (!ctx) return;
      const vals   = mesSeq.map(m => getVal(tipo, m));
      const lastVal = [...vals].reverse().find(v => v !== null);
      const lineColor = colorVal(lastVal);

      CHARTS[cid] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: mesLabels,
          datasets: [{
            data: vals,
            borderColor: lineColor,
            backgroundColor: lineColor + '18',
            fill: true,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: lineColor,
            tension: 0.3,
            spanGaps: false
          }]
        },
        plugins: [sparkValueLabelPlugin(lineColor)],
        options: {
          responsive: true, maintainAspectRatio: false, clip: false,
          animation: false,
          layout: { padding: { top: 12 } },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: c => c.parsed.y !== null ? c.parsed.y.toFixed(2) : '—' } }
          },
          scales: {
            y: { display: false, suggestedMin: 1, suggestedMax: 5 },
            x: {
              display: true,
              grid: { display: false },
              ticks: {
                font: { size: 9 },
                maxRotation: 0,
                autoSkip: false,
                color: '#94a3b8'
              },
              border: { display: false }
            }
          }
        }
      });
    });
  }, 30);
}



// ============ CONSOLIDATED ITENS SPARKLINE — ALL UNITS ============
function renderItensSparkGeral(divId, filteredItens) {
  const container = document.getElementById(divId);
  if (!container) return;

  const MES_SEQ = [1,2,3,4,5,6,7,8,13];
  const MES_LABEL_MAP = {1:'jan/26',2:'fev/26',3:'mar/26',4:'abr/26',5:'mai/26',6:'jun/26',
    7:'jul/26',8:'ago/26',9:'set/26',10:'out/26',11:'nov/26',12:'dez/26',13:'set/26'};

  const TIPOS = ['Aula Online','Aula Prática','Infraestrutura','Plataforma Avida','Professor','Triagem'];
  const activeTypes = F.itens.length > 0 ? F.itens : TIPOS;

  // Build lookup: tipo × mes → {sum, cnt} across ALL units
  const lookup = {};
  filteredItens.forEach(r => {
    const g = IDX_GERAL[r['db-id']];
    if (!g) return;
    const m = g.mes_order;
    if (!MES_SEQ.includes(m)) return;
    if (F.mes && F.mes.length > 0) { if (!F.mes.includes(g.mes_label)) return; }
    if (F.semana && g.semana_key !== F.semana) return;
    const t = r.tipo_avaliacao;
    const key = `${t}||${m}`;
    if (!lookup[key]) lookup[key] = {sum:0, cnt:0};
    lookup[key].sum += r.nota;
    lookup[key].cnt++;
  });

  const presentMes = new Set(Object.keys(lookup).map(k => parseInt(k.split('||')[1])));
  const mesSeq = MES_SEQ.filter(m => presentMes.has(m));
  const mesLabels = mesSeq.map(m => MES_LABEL_MAP[m]);

  if (!mesSeq.length) { container.innerHTML = ''; return; }

  function getVal(t, m) {
    const k = `${t}||${m}`;
    return lookup[k] ? lookup[k].sum / lookup[k].cnt : null;
  }
  function colorVal(v) {
    if (v === null) return '#94a3b8';
    if (v >= 4.0) return '#16a34a';
    if (v >= 3.5) return '#d97706';
    return '#dc2626';
  }

  // Destroy old sparkline charts
  Object.keys(CHARTS)
    .filter(k => k.startsWith('sparkG-'))
    .forEach(k => { if (CHARTS[k]) { CHARTS[k].destroy(); delete CHARTS[k]; } });

  const cards = activeTypes.map(tipo => {
    const vals = mesSeq.map(m => getVal(tipo, m));
    if (!vals.some(v => v !== null)) return '';

    const nonNull = vals.filter(v => v !== null);
    const lastVal  = nonNull.length > 0 ? nonNull[nonNull.length - 1] : null;
    const prevVal  = nonNull.length > 1 ? nonNull[nonNull.length - 2] : null;
    const trend = lastVal !== null && prevVal !== null
      ? (lastVal > prevVal + 0.05 ? '↑' : lastVal < prevVal - 0.05 ? '↓' : '→') : '';
    const trendColor = trend==='↑'?'#16a34a':trend==='↓'?'#dc2626':'#94a3b8';
    const lineColor  = colorVal(lastVal);
    const cid = `sparkG-${tipo.replace(/[^a-z]/gi,'')}`;

    // Total respondents for this item
    const totalResp = mesSeq.reduce((acc, m) => {
      const k = `${tipo}||${m}`;
      return acc + (lookup[k] ? lookup[k].cnt : 0);
    }, 0);

    return `<div style="border:1px solid var(--border);border-radius:8px;padding:12px 14px;background:#fff;min-width:160px;flex:1">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--muted);margin-bottom:6px">${tipo}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:24px;font-weight:800;color:${lineColor}">${lastVal !== null ? lastVal.toFixed(2) : '—'}</span>
        <span style="font-size:18px;color:${trendColor};font-weight:700">${trend}</span>
      </div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:6px">${totalResp} avaliações · todas unidades</div>
      <div style="height:70px"><canvas id="${cid}"></canvas></div>
    </div>`;
  }).filter(Boolean);

  if (!cards.length) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <div class="cbox full">
      <h3>📋 Avaliação Consolidada dos Itens Específicos <span style="font-size:12px;font-weight:400;color:var(--muted)">(escala 1–5 · todas as unidades)</span></h3>
      <div style="font-size:11px;color:var(--muted);margin-bottom:12px">
        <span style="color:#16a34a;font-weight:600">■</span> ≥4.0 Bom &nbsp;
        <span style="color:#d97706;font-weight:600">■</span> 3.5–3.9 Atenção &nbsp;
        <span style="color:#dc2626;font-weight:600">■</span> &lt;3.5 Crítico &nbsp;&nbsp;
        <span style="color:var(--muted)">Seta = mês atual vs mês anterior</span>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${cards.join('')}</div>
    </div>`;

  setTimeout(() => {
    activeTypes.forEach(tipo => {
      const cid = `sparkG-${tipo.replace(/[^a-z]/gi,'')}`;
      const ctx = document.getElementById(cid);
      if (!ctx) return;
      const vals = mesSeq.map(m => getVal(tipo, m));
      const nonNull = vals.filter(v => v !== null);
      const lastVal = nonNull.length > 0 ? nonNull[nonNull.length - 1] : null;
      const lineColor = colorVal(lastVal);

      CHARTS[cid] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: mesLabels,
          datasets: [{
            data: vals,
            borderColor: lineColor,
            backgroundColor: lineColor + '18',
            fill: true,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: lineColor,
            tension: 0.3,
            spanGaps: false
          }]
        },
        plugins: [sparkValueLabelPlugin(lineColor)],
        options: {
          responsive: true, maintainAspectRatio: false, clip: false,
          animation: false,
          layout: { padding: { top: 12 } },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: c => c.parsed.y !== null ? c.parsed.y.toFixed(2) : '—' } }
          },
          scales: {
            y: { display: false, suggestedMin: 1, suggestedMax: 5 },
            x: {
              display: true,
              grid: { display: false },
              ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, color: '#94a3b8' },
              border: { display: false }
            }
          }
        }
      });
    });
  }, 30);
}


// ============ LOCALSTORAGE PERSISTENCE ============
const LS_KEY = 'csat_posmed_base_v1';
const LS_MAX_MB = 4.5; // stay under 5MB limit

function saveToLocalStorage() {
  try {
    const payload = {
      savedAt: new Date().toISOString(),
      signature: EMBEDDED_SIGNATURE,
      geral:    DATA_GERAL,
      itens:    DATA_ITENS,
      feedback: DATA_FEEDBACK,
      feedbackFull: DATA_FEEDBACK_FULL,
      turmas:   DATA_TURMAS,
    };
    const json = JSON.stringify(payload);
    const mb   = json.length / 1024 / 1024;
    if (mb > LS_MAX_MB) {
      console.warn(`Payload ${mb.toFixed(1)}MB > ${LS_MAX_MB}MB limit — skipping save`);
      return false;
    }
    localStorage.setItem(LS_KEY, json);
    console.log(`Base salva no localStorage (${mb.toFixed(2)}MB)`);
    return true;
  } catch(e) {
    console.warn('localStorage save failed:', e.message);
    return false;
  }
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;

    const payload = JSON.parse(raw);
    if (!payload.geral || !payload.geral.length) return false;

    // A snapshot saved from a different dashboard file (e.g. an older/newer
    // export) must never silently override the data embedded in this file.
    if (payload.signature !== EMBEDDED_SIGNATURE) {
      console.warn('Base salva no localStorage pertence a outro arquivo (assinatura diferente) — ignorando e mantendo os dados deste arquivo.');
      localStorage.removeItem(LS_KEY);
      return false;
    }

    // Swap arrays in-place
    DATA_GERAL.length = 0;         payload.geral.forEach(r => DATA_GERAL.push(r));
    DATA_ITENS.length = 0;         payload.itens.forEach(r => DATA_ITENS.push(r));
    DATA_FEEDBACK.length = 0;      payload.feedback.forEach(r => DATA_FEEDBACK.push(r));
    DATA_FEEDBACK_FULL.length = 0; payload.feedbackFull.forEach(r => DATA_FEEDBACK_FULL.push(r));
    DATA_TURMAS.length = 0;        payload.turmas.forEach(r => DATA_TURMAS.push(r));

    // Rebuild IDX_GERAL
    Object.keys(IDX_GERAL).forEach(k => delete IDX_GERAL[k]);
    DATA_GERAL.forEach(r => { IDX_GERAL[r['db-id']] = r; });

    const d = new Date(payload.savedAt);
    const label = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
    console.log(`Base restaurada do localStorage (salva em ${label})`);

    // Show indicator
    showSavedBadge(label);
    return true;
  } catch(e) {
    console.warn('localStorage load failed:', e.message);
    return false;
  }
}

function showSavedBadge(label) {
  const badge = document.getElementById('ls-badge');
  if (badge) {
    badge.textContent = '💾 Base: ' + label;
    badge.style.display = 'inline-flex';
  }
  const clearBtn = document.getElementById('ls-clear-btn');
  if (clearBtn) clearBtn.style.display = 'inline';
}

function clearLocalStorage() {
  localStorage.removeItem(LS_KEY);
  const badge = document.getElementById('ls-badge');
  if (badge) badge.style.display = 'none';
  alert('Base removida do armazenamento local. Recarregando com dados originais...');
  location.reload();
}

const _modulosSearchEl = document.getElementById('modulos-search');
if (_modulosSearchEl) {
  _modulosSearchEl.addEventListener('input', e => {
    modulosSearchTerm = e.target.value;
    renderModulosRanking(applyFilters(DATA_GERAL));
  });
}

const _turmasSearchEl = document.getElementById('turmas-search');
if (_turmasSearchEl) {
  _turmasSearchEl.addEventListener('input', e => {
    turmasSearchTerm = e.target.value;
    renderTurmasRanking(applyFilters(DATA_GERAL));
  });
}


// ============ ABA CONSOLIDADO ============
// Visão consolidada por especialidade / turma(s) / mês, com quantificação de problemas,
// classificação de recorrência e sugestão de plano de ação proporcional à recorrência.
// Reaproveita TEMA_LOOKUP / TEMA_LABEL_MAP / TEMA_ICONS / PROBLEMA_PATTERNS /
// ACOES_POR_PROBLEMA / analyzeComment / computeComentariosList / quoteCard já definidos acima.
// Não introduz nenhum blob de dados novo — tudo é calculado em tempo de render.
// Filtros próprios: esta aba NÃO usa a barra global (F), justamente para permitir
// multi-seleção de turmas (comparar N turmas da mesma especialidade).

const CONS_MES_SEQ = [9,10,11,12,1,2,3,4,5,6,7,8,13];
const CONS_MES_LABEL = {9:'set/25',10:'out/25',11:'nov/25',12:'dez/25',
  1:'jan/26',2:'fev/26',3:'mar/26',4:'abr/26',5:'mai/26',6:'jun/26',7:'jul/26',8:'ago/26',13:'set/26'};
const CONS_MES_IDX = {};
CONS_MES_SEQ.forEach((m,i) => { CONS_MES_IDX[CONS_MES_LABEL[m]] = i; });

const CONS_PALETTE = ['#01559B','#dc2626','#16a34a','#d97706','#7C3AED','#0891b2','#db2777','#65a30d','#475569','#b45309'];

// Linguagem de problema — gate para capturar crítica embutida em comentário de nota alta
const CONS_PROBLEMA_LANG = /(falta|faltou|faltand|faltam|insuficient|ruim|pessim|horrivel|precari|deficient|desorganiz|inexistent|nao tem|nao teve|nao havia|nao tinha|nao funciona|nao consegu|nao foi|sem paciente|sem material|sem professor|poucos|poucas|pouca |pouco |escass|demora|atras|reclama|problema|prejudic|piorou|piora|inadequad|melhorar|melhoria|melhorias|poderia|deveria|seria interessante|sugiro|sugestao|sugestoes|dificuldade|dificil|caro|quebrad|vencid|frustr|decepcion|nao correspond|abaixo do esperado|deixa a desejar|deixou a desejar|nao entrega|limitad|porcaria|absurdo|lament|insatisfeit|aquem|longe do que|nao valeu|revoltante)/;

// Reaproveita o léxico negativo já usado no motor de sentimento do dashboard
const CONS_NEG_RX = new RegExp('(^|[^a-z])(' + Object.keys(STRONG_NEG).join('|') + ')([^a-z]|$)');

// Janela de proximidade (em caracteres) entre a palavra-chave do problema e a linguagem
// de problema. Sem isso, palavras muito comuns nos padrões herdados ("pratica", "modulo",
// "material") disparam em qualquer comentário que por acaso tenha um "melhorar" no fim.
const CONS_GATE_WIN = 90;

function consNorm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
}

function consGate(win) {
  return CONS_PROBLEMA_LANG.test(win) || CONS_NEG_RX.test(win);
}

// Palavras-chave suplementares, usadas SOMENTE nesta aba. Não alteram PROBLEMA_PATTERNS,
// então o Resumo Executivo e a aba Análise de Comentários continuam com o comportamento antigo.
const CONS_PATTERNS_EXTRA = {
  'Triagem': {
    'poucos pacientes': ['paciente suficiente','pacientes suficientes','quantidade de paciente','quantidade insuficiente de paciente',
      'numero de paciente','volume de atendimento','alto volume de atendimentos','agenda vazia','poucos atendimentos',
      'sem atendimento','paciente por aluno','pacientes por aluno','dividir paciente','dividindo o rosto','fila de aluno'],
    'pacientes mal triados': ['fora do contexto do modulo','fora do tema','sem saber o motivo','nao sabiam','sem indicacao','sem perfil']
  },
  'Equipamentos': {
    'materiais consumiveis': [],
    'materiais consumíveis': ['insumo','insumos','toxina','preenchedor','bioestimulador','peeling','hialuronidase','iodo','anestesico','fio de tracao']
  },
  'Financeiro': {
    'custo elevado': ['matricula','multa','contrato','rescisao','cancelamento','investimento'],
    'falta de transparência': ['prometido','prometeu','promete','foi apresentado','no momento da matricula']
  },
  'Geral': {
    'expectativa não atendida': ['prometido','promete','nao entrega','distante do que foi','no momento da matricula','nao correspondeu']
  }
};

function consKeywords(tema, prob) {
  const base = (PROBLEMA_PATTERNS[tema] && PROBLEMA_PATTERNS[tema][prob]) || [];
  const extra = (CONS_PATTERNS_EXTRA[tema] && CONS_PATTERNS_EXTRA[tema][prob]) || [];
  return extra.length ? base.concat(extra) : base;
}

let consolidadoFilters = { unidade:'', hab:'', turmas:[], meses:[], recWindow:'full' };
let consProbSort = { col:'mAll', dir:'desc' };
let consProbExpandido = null;
let _consPlanoTexto = '';

// ---- classificação de recorrência (1 mês = pontual · 2-3 = recorrente · 4+ = crônico) ----
function consClassifyRec(nMeses) {
  if (nMeses >= 4) return { key:'cronico',    ord:3, label:'Crônico',    cor:'#dc2626', bg:'#fee2e2', acao:'Projeto estruturado' };
  if (nMeses >= 2) return { key:'recorrente', ord:2, label:'Recorrente', cor:'#b45309', bg:'#fef3c7', acao:'Plano de curto prazo' };
  return              { key:'pontual',    ord:1, label:'Pontual',    cor:'#0369a1', bg:'#e0f2fe', acao:'Ação corretiva pontual' };
}

// ---- detecção de (tema · problema) em um comentário ----
function consDetectProblemas(r) {
  const txt = consNorm(r.feedback);
  const a = analyzeComment(r);
  const hasLang = CONS_PROBLEMA_LANG.test(txt);
  const out = [];
  const seen = new Set();
  // um problema só é atribuído se a linguagem de problema estiver PERTO da palavra-chave
  const casa = (tema, prob) => consKeywords(tema, prob).some(kw => {
    const k = consNorm(kw);
    let i = txt.indexOf(k);
    while (i !== -1) {
      const win = txt.slice(Math.max(0, i - CONS_GATE_WIN), i + k.length + CONS_GATE_WIN);
      if (consGate(win)) return true;
      i = txt.indexOf(k, i + 1);
    }
    return false;
  });

  const temas = a.temas.length ? a.temas.slice() : [];
  temas.forEach(tema => {
    const pats = PROBLEMA_PATTERNS[tema];
    if (!pats) return;
    Object.keys(pats).forEach(prob => {
      if (!casa(tema, prob)) return;
      const key = tema + '||' + prob;
      if (!seen.has(key)) { seen.add(key); out.push({ tema:tema, prob:prob, key:key }); }
    });
  });
  // fallback: comentário com linguagem de problema que não casou em nenhum tema mapeado
  if (!out.length && hasLang) {
    const pats = PROBLEMA_PATTERNS['Geral'] || {};
    Object.keys(pats).forEach(prob => {
      if (!casa('Geral', prob)) return;
      const key = 'Geral||' + prob;
      if (!seen.has(key)) { seen.add(key); out.push({ tema:'Geral', prob:prob, key:key }); }
    });
  }
  return { problemas: out, sentiment: a.sentiment, hasLang: hasLang };
}

// ---- bases filtradas ----
function consBaseGeral(ignoreMes) {
  let g = DATA_GERAL;
  if (consolidadoFilters.unidade) g = g.filter(r => r.unidade_calc === consolidadoFilters.unidade);
  if (consolidadoFilters.hab)     g = g.filter(r => r.habilitacao === consolidadoFilters.hab);
  if (consolidadoFilters.turmas.length) g = g.filter(r => consolidadoFilters.turmas.indexOf(r.di_turma) !== -1);
  if (!ignoreMes && consolidadoFilters.meses.length) g = g.filter(r => consolidadoFilters.meses.indexOf(r.mes_label) !== -1);
  return g;
}

function consBaseComentarios(ignoreMes) {
  let c = computeComentariosList();
  if (consolidadoFilters.unidade) c = c.filter(r => r.unidade === consolidadoFilters.unidade);
  if (consolidadoFilters.hab)     c = c.filter(r => r.hab === consolidadoFilters.hab);
  if (consolidadoFilters.turmas.length) c = c.filter(r => consolidadoFilters.turmas.indexOf(r.di_turma) !== -1);
  if (!ignoreMes && consolidadoFilters.meses.length) c = c.filter(r => consolidadoFilters.meses.indexOf(r.mes_label) !== -1);
  return c;
}

// ---- mapa de problemas ----
// mNeg = menções em comentários nota <= 6 (reclamação formal)
// mEmb = menções em comentários nota >= 7 com linguagem de problema (crítica embutida)
// mAll = mNeg + mEmb  (conjuntos disjuntos, então a soma é o total real)
function consProblemMap(rows) {
  const map = {};
  rows.forEach(r => {
    const isNeg = (r.nota != null && r.nota <= 6);
    const d = consDetectProblemas(r);
    const isEmb = !isNeg && d.hasLang;
    if (!isNeg && !isEmb) return;
    if (!d.problemas.length) return;
    d.problemas.forEach(p => {
      if (!map[p.key]) map[p.key] = {
        key:p.key, tema:p.tema, prob:p.prob, mNeg:0, mEmb:0,
        meses:{}, turmas:{}, unidades:{}, rows:[]
      };
      const e = map[p.key];
      if (isNeg) e.mNeg++; else e.mEmb++;
      if (r.mes_label) e.meses[r.mes_label] = (e.meses[r.mes_label] || 0) + 1;
      if (r.di_turma)  e.turmas[r.di_turma] = true;
      if (r.unidade)   e.unidades[r.unidade] = true;
      e.rows.push(r);
    });
  });
  return Object.keys(map).map(k => {
    const e = map[k];
    const mesesArr = Object.keys(e.meses).sort((a,b) => (CONS_MES_IDX[a] == null ? 99 : CONS_MES_IDX[a]) - (CONS_MES_IDX[b] == null ? 99 : CONS_MES_IDX[b]));
    const rec = consClassifyRec(mesesArr.length);
    return {
      key:e.key, tema:e.tema, prob:e.prob,
      temaLabel: TEMA_LABEL_MAP[e.tema] || e.tema,
      icon: TEMA_ICONS[e.tema] || '•',
      mNeg:e.mNeg, mEmb:e.mEmb, mAll:e.mNeg + e.mEmb,
      mesesCount:e.meses, mesesArr:mesesArr, nMeses:mesesArr.length,
      turmasArr:Object.keys(e.turmas).sort(), nTurmas:Object.keys(e.turmas).length,
      unidadesArr:Object.keys(e.unidades).sort(),
      rows:e.rows, rec:rec
    };
  });
}

// ---- filtros: montagem e eventos ----
function consToggleDd(which) {
  const dd = document.getElementById('cons-ms-' + which + '-dropdown');
  const other = document.getElementById('cons-ms-' + (which === 'mes' ? 'turmas' : 'mes') + '-dropdown');
  if (other) other.classList.remove('open');
  if (dd) dd.classList.toggle('open');
}
document.addEventListener('click', function(e) {
  ['turmas','mes'].forEach(w => {
    const wrap = document.getElementById('cons-ms-' + w + '-wrap');
    const dd = document.getElementById('cons-ms-' + w + '-dropdown');
    if (wrap && dd && !wrap.contains(e.target)) dd.classList.remove('open');
  });
});

function consUpdateBtns() {
  const tb = document.getElementById('cons-ms-turmas-btn');
  if (tb) {
    const n = consolidadoFilters.turmas.length;
    tb.textContent = n === 0 ? 'Todas' : (n === 1 ? consolidadoFilters.turmas[0] : n + ' turmas');
    tb.title = n ? consolidadoFilters.turmas.join(' · ') : 'Todas as turmas do recorte';
  }
  const mb = document.getElementById('cons-ms-mes-btn');
  if (mb) {
    const n = consolidadoFilters.meses.length;
    mb.textContent = n === 0 ? 'Todos' : (n === 1 ? consolidadoFilters.meses[0] : n + ' meses');
  }
}

function consToggleAll(which, allCb) {
  const sel = '#cons-ms-' + which + '-items input';
  document.querySelectorAll(sel).forEach(cb => { cb.checked = allCb.checked; });
  const vals = allCb.checked ? [...document.querySelectorAll(sel)].map(cb => cb.value) : [];
  if (which === 'turmas') consolidadoFilters.turmas = vals; else consolidadoFilters.meses = vals;
  allCb.indeterminate = false;
  consUpdateBtns();
  if (which === 'turmas') consBuildMesItems();
  renderConsolidadoTab();
}

function consOnMsChange(which) {
  const sel = '#cons-ms-' + which + '-items input';
  const checked = [...document.querySelectorAll(sel + ':checked')].map(cb => cb.value);
  if (which === 'turmas') consolidadoFilters.turmas = checked; else consolidadoFilters.meses = checked;
  const allCb = document.getElementById('cons-' + which + '-all-cb');
  const total = document.querySelectorAll(sel).length;
  if (allCb) {
    allCb.checked = total > 0 && checked.length === total;
    allCb.indeterminate = checked.length > 0 && checked.length < total;
  }
  consUpdateBtns();
  if (which === 'turmas') consBuildMesItems();
  renderConsolidadoTab();
}

function consBuildTurmaItems() {
  const box = document.getElementById('cons-ms-turmas-items');
  if (!box) return;
  let g = DATA_GERAL;
  if (consolidadoFilters.unidade) g = g.filter(r => r.unidade_calc === consolidadoFilters.unidade);
  if (consolidadoFilters.hab)     g = g.filter(r => r.habilitacao === consolidadoFilters.hab);
  const counts = {};
  g.forEach(r => { counts[r.di_turma] = (counts[r.di_turma] || 0) + 1; });
  const turmas = Object.keys(counts).sort((a,b) => a.localeCompare(b,'pt-BR',{numeric:true}));
  // mantém apenas as seleções que ainda existem no recorte
  consolidadoFilters.turmas = consolidadoFilters.turmas.filter(t => counts[t] != null);
  box.innerHTML = turmas.map(t =>
    '<label class="ms-item"><input type="checkbox" value="' + t.replace(/"/g,'&quot;') + '"' +
    (consolidadoFilters.turmas.indexOf(t) !== -1 ? ' checked' : '') + '> ' +
    t + ' <span style="color:var(--muted);font-size:11px">(' + counts[t] + ')</span></label>'
  ).join('') || '<div style="padding:8px 14px;font-size:12px;color:var(--muted)">Nenhuma turma no recorte</div>';
  box.querySelectorAll('input').forEach(cb => cb.addEventListener('change', () => consOnMsChange('turmas')));
  const allCb = document.getElementById('cons-turmas-all-cb');
  if (allCb) {
    allCb.checked = turmas.length > 0 && consolidadoFilters.turmas.length === turmas.length;
    allCb.indeterminate = consolidadoFilters.turmas.length > 0 && consolidadoFilters.turmas.length < turmas.length;
  }
}

function consBuildMesItems() {
  const box = document.getElementById('cons-ms-mes-items');
  if (!box) return;
  const g = consBaseGeral(true);
  const present = new Set(g.map(r => r.mes_label));
  const meses = CONS_MES_SEQ.map(m => CONS_MES_LABEL[m]).filter(l => present.has(l));
  consolidadoFilters.meses = consolidadoFilters.meses.filter(m => present.has(m));
  box.innerHTML = meses.map(m =>
    '<label class="ms-item"><input type="checkbox" value="' + m + '"' +
    (consolidadoFilters.meses.indexOf(m) !== -1 ? ' checked' : '') + '> ' + m + '</label>'
  ).join('') || '<div style="padding:8px 14px;font-size:12px;color:var(--muted)">Sem meses no recorte</div>';
  box.querySelectorAll('input').forEach(cb => cb.addEventListener('change', () => consOnMsChange('mes')));
  const allCb = document.getElementById('cons-mes-all-cb');
  if (allCb) {
    allCb.checked = meses.length > 0 && consolidadoFilters.meses.length === meses.length;
    allCb.indeterminate = consolidadoFilters.meses.length > 0 && consolidadoFilters.meses.length < meses.length;
  }
  consUpdateBtns();
}

function populateConsolidadoFilters() {
  const uSel = document.getElementById('cons-f-unidade');
  const hSel = document.getElementById('cons-f-hab');
  if (!uSel || !hSel) return;
  const unidades = [...new Set(DATA_GERAL.map(r => r.unidade_calc))].filter(Boolean).sort();
  const habs = [...new Set(DATA_GERAL.map(r => r.habilitacao))].filter(Boolean).sort();
  uSel.innerHTML = '<option value="">Todas</option>' + unidades.map(u => '<option value="' + u + '">' + u + '</option>').join('');
  hSel.innerHTML = '<option value="">Todas</option>' + habs.map(h => '<option value="' + h + '">' + h + '</option>').join('');
  uSel.value = consolidadoFilters.unidade;
  hSel.value = consolidadoFilters.hab;
  uSel.onchange = e => { consolidadoFilters.unidade = e.target.value; consBuildTurmaItems(); consBuildMesItems(); renderConsolidadoTab(); };
  hSel.onchange = e => { consolidadoFilters.hab = e.target.value; consBuildTurmaItems(); consBuildMesItems(); renderConsolidadoTab(); };
  const rw = document.getElementById('cons-f-recwindow');
  if (rw) { rw.value = consolidadoFilters.recWindow; rw.onchange = e => { consolidadoFilters.recWindow = e.target.value; renderConsolidadoTab(); }; }
  consBuildTurmaItems();
  consBuildMesItems();
}

function consClearFilters() {
  consolidadoFilters = { unidade:'', hab:'', turmas:[], meses:[], recWindow:'full' };
  consProbExpandido = null;
  const u = document.getElementById('cons-f-unidade'); if (u) u.value = '';
  const h = document.getElementById('cons-f-hab'); if (h) h.value = '';
  const rw = document.getElementById('cons-f-recwindow'); if (rw) rw.value = 'full';
  consBuildTurmaItems();
  consBuildMesItems();
  renderConsolidadoTab();
}

function sortConsProb(col) {
  if (consProbSort.col === col) consProbSort.dir = consProbSort.dir === 'asc' ? 'desc' : 'asc';
  else consProbSort = { col:col, dir: (col === 'prob' || col === 'temaLabel') ? 'asc' : 'desc' };
  renderConsolidadoTab();
}

function toggleConsProb(key) {
  consProbExpandido = (consProbExpandido === key) ? null : key;
  renderConsolidadoTab();
}

// ---- SEÇÃO 1: KPIs do recorte ----
function consRenderKpis(fd, coms, probsFiltrados) {
  const box = document.getElementById('cons-kpis');
  if (!box) return;
  const n = fd.length;
  const media = n ? fd.reduce((a,b) => a + b.nota_geral, 0) / n : 0;
  const det = fd.filter(r => r.nota_geral < 7).length;
  const prom = fd.filter(r => r.nota_geral >= 9).length;
  const nTurmas = new Set(fd.map(r => r.di_turma)).size;
  const nMeses = new Set(fd.map(r => r.mes_label)).size;
  const cronicos = probsFiltrados.filter(p => p.rec.key === 'cronico').length;
  const recorrentes = probsFiltrados.filter(p => p.rec.key === 'recorrente').length;
  const card = (lbl, val, sub, cls) =>
    '<div class="card' + (cls ? ' ' + cls : '') + '"><div class="card-lbl">' + lbl + '</div>' +
    '<div class="card-val">' + val + '</div><div class="card-sub">' + sub + '</div></div>';
  box.innerHTML = '<div class="cards-row">' +
    card('Respostas', n, nTurmas + ' turma(s) · ' + nMeses + ' mês(es)') +
    card('Nota média', n ? fmt(media) : '—', 'escala 0–10', media >= 8 ? 'c-good' : media >= 7 ? 'c-warn' : 'c-bad') +
    card('Detratores', det, n ? fmtPct(det, n) + ' das respostas' : '—', det && n && det / n > 0.2 ? 'c-bad' : '') +
    card('Promotores', prom, n ? fmtPct(prom, n) + ' das respostas' : '—', 'c-good') +
    card('Comentários', coms.length, n ? fmtPct(coms.length, n) + ' das respostas' : '—') +
    card('Problemas crônicos', cronicos, recorrentes + ' recorrente(s) além destes', cronicos ? 'c-bad' : 'c-good') +
    '</div>';
}

// ---- SEÇÃO 2: comparativo entre turmas selecionadas ----
function consRenderTurmas(fd, comsRec) {
  const box = document.getElementById('cons-turmas');
  if (!box) return;
  destroyChart('ch-cons-turmas');
  const byTurma = {};
  fd.forEach(r => {
    if (!byTurma[r.di_turma]) byTurma[r.di_turma] = { turma:r.di_turma, unidade:r.unidade_calc, hab:r.habilitacao, notas:[], det:0, meses:{} };
    const t = byTurma[r.di_turma];
    t.notas.push(r.nota_geral);
    if (r.nota_geral < 7) t.det++;
    if (!t.meses[r.mes_label]) t.meses[r.mes_label] = [];
    t.meses[r.mes_label].push(r.nota_geral);
  });
  // recorrência POR TURMA: um problema é crônico para a turma se se repete 4+ meses NAQUELA turma
  const comsPorTurma = {};
  comsRec.forEach(r => { (comsPorTurma[r.di_turma] = comsPorTurma[r.di_turma] || []).push(r); });
  const turmas = Object.keys(byTurma).map(k => {
    const t = byTurma[k];
    const probs = consProblemMap(comsPorTurma[k] || []);
    return {
      turma:t.turma, unidade:t.unidade, hab:t.hab,
      n:t.notas.length, media:t.notas.reduce((a,b)=>a+b,0)/t.notas.length,
      det:t.det, nMeses:Object.keys(t.meses).length, meses:t.meses,
      nProb:probs.length,
      nCron:probs.filter(p => p.rec.key === 'cronico').length,
      nRec:probs.filter(p => p.rec.key === 'recorrente').length
    };
  }).sort((a,b) => a.media - b.media);

  if (!turmas.length) { box.innerHTML = '<div class="cbox full" style="margin-bottom:14px"><div class="cons-empty">Nenhuma resposta no recorte selecionado.</div></div>'; return; }

  const mesesPresentes = CONS_MES_SEQ.map(m => CONS_MES_LABEL[m]).filter(l => fd.some(r => r.mes_label === l));
  const MAX_ROWS = 20;
  const visiveis = turmas.slice(0, MAX_ROWS);
  const rows = visiveis.map(t =>
    '<tr><td style="font-weight:600">' + t.turma + '</td>' +
    '<td>' + t.unidade + '</td>' +
    '<td style="text-align:center">' + t.n + '</td>' +
    '<td style="text-align:center" class="' + notaCls(t.media) + '">' + fmt(t.media) + '</td>' +
    '<td style="text-align:center">' + t.det + ' <span style="color:var(--muted);font-size:11px">(' + fmtPct(t.det, t.n) + ')</span></td>' +
    '<td style="text-align:center">' + t.nMeses + '</td>' +
    '<td style="text-align:center">' + t.nProb + '</td>' +
    '<td style="text-align:center">' + (t.nRec ? '<span class="cons-badge" style="background:#fef3c7;color:#b45309">' + t.nRec + '</span>' : '<span style="color:var(--muted)">0</span>') + '</td>' +
    '<td style="text-align:center">' + (t.nCron ? '<span class="cons-badge" style="background:#fee2e2;color:#dc2626">' + t.nCron + '</span>' : '<span style="color:var(--muted)">0</span>') + '</td></tr>'
  ).join('');

  const chartNote = turmas.length > 10 ? ' · o gráfico mostra as 10 turmas com menor nota média' : '';
  const tableNote = turmas.length > MAX_ROWS
    ? '<div style="font-size:11px;color:var(--muted);margin-top:8px">Mostrando as ' + MAX_ROWS + ' piores de ' + turmas.length + ' turmas do recorte — filtre por especialidade ou selecione turmas específicas para ver todas.</div>' : '';
  box.innerHTML =
    '<div class="cbox full" style="margin-bottom:14px">' +
      '<h3 style="margin:0 0 4px">🏫 Comparativo entre Turmas do Recorte</h3>' +
      '<p style="font-size:11px;color:var(--muted);margin:0 0 14px;line-height:1.6">' +
        'Uma linha por turma, da pior para a melhor nota média. "Problemas" conta pares tema·problema distintos nos comentários daquela turma; ' +
        '"Recorrentes" e "Crônicos" usam a recorrência <b>dentro da própria turma</b> (2–3 meses e 4+ meses), não a recorrência do recorte inteiro' + chartNote + '.' +
      '</p>' +
      '<div style="display:grid;grid-template-columns:1.1fr 1fr;gap:20px;align-items:start">' +
        '<div class="tbl-wrap"><table><thead><tr>' +
          '<th>Turma</th><th>Unidade</th><th style="text-align:center">Resp.</th><th style="text-align:center">Nota</th>' +
          '<th style="text-align:center">Detratores</th><th style="text-align:center">Meses</th>' +
          '<th style="text-align:center">Problemas</th><th style="text-align:center" title="Problemas que se repetem em 2 ou 3 meses nesta turma">Recorr.</th>' +
          '<th style="text-align:center" title="Problemas que se repetem em 4 meses ou mais nesta turma">Crônicos</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' + tableNote + '</div>' +
        '<div><div style="font-size:11px;color:var(--muted);margin-bottom:6px">Evolução da nota média por mês</div>' +
        '<div class="cwrap" style="height:300px"><canvas id="ch-cons-turmas"></canvas></div></div>' +
      '</div>' +
    '</div>';

  const ctx = document.getElementById('ch-cons-turmas');
  if (!ctx || typeof Chart === 'undefined' || !mesesPresentes.length) return;
  const plot = visiveis.slice(0, 10);
  CHARTS['ch-cons-turmas'] = new Chart(ctx, {
    type:'line',
    data:{
      labels: mesesPresentes,
      datasets: plot.map((t,i) => ({
        label: t.turma.length > 34 ? t.turma.slice(0,32) + '…' : t.turma,
        data: mesesPresentes.map(m => t.meses[m] ? (t.meses[m].reduce((a,b)=>a+b,0)/t.meses[m].length) : null),
        borderColor: CONS_PALETTE[i % CONS_PALETTE.length],
        backgroundColor: CONS_PALETTE[i % CONS_PALETTE.length],
        borderWidth:2, tension:.25, spanGaps:true, pointRadius:3
      }))
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      scales:{ y:{ min:0, max:10, ticks:{ stepSize:2, font:{size:10} } }, x:{ ticks:{ font:{size:10} } } },
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, font:{size:9.5}, padding:7 } } }
    }
  });
}

// ---- SEÇÃO 3: quantificação de problemas ----
function consRenderProblemas(probs, janelaTxt) {
  const box = document.getElementById('cons-problemas');
  if (!box) return;
  if (!probs.length) {
    box.innerHTML = '<div class="cbox full" style="margin-bottom:14px"><h3 style="margin:0 0 10px">🔎 Problemas Identificados</h3>' +
      '<div class="cons-empty">Nenhum problema detectado nos comentários deste recorte. Isso pode significar que não há comentários com linguagem de problema, ou que o recorte é pequeno demais.</div></div>';
    return;
  }
  const dir = consProbSort.dir === 'asc' ? 1 : -1;
  const col = consProbSort.col;
  const sorted = probs.slice().sort((a,b) => {
    let va, vb;
    if (col === 'prob' || col === 'temaLabel') { va = a[col]; vb = b[col]; return va.localeCompare(vb,'pt-BR') * dir; }
    if (col === 'rec') { va = a.rec.ord; vb = b.rec.ord; }
    else { va = a[col]; vb = b[col]; }
    if (va === vb) return b.mAll - a.mAll;
    return (va - vb) * dir;
  });
  const arrow = c => consProbSort.col === c ? (consProbSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const th = (c, lbl, extra) => '<th class="cons-th"' + (extra||'') + ' onclick="sortConsProb(\'' + c + '\')">' + lbl + arrow(c) + '</th>';

  const bodyRows = sorted.map(p => {
    const chips = p.mesesArr.map(m => '<span class="cons-chip' + (p.mesesCount[m] >= 3 ? ' hot' : '') + '">' + m + ' · ' + p.mesesCount[m] + '</span>').join('');
    const main =
      '<tr class="cons-rowclick" onclick="toggleConsProb(\'' + p.key.replace(/'/g,"\\'") + '\')">' +
        '<td style="white-space:nowrap">' + p.icon + ' <span style="font-size:11px;color:var(--muted);font-weight:600">' + p.temaLabel + '</span></td>' +
        '<td style="font-weight:600">' + p.prob + '</td>' +
        '<td style="text-align:center;font-weight:700;color:#dc2626">' + p.mNeg + '</td>' +
        '<td style="text-align:center;font-weight:700;color:#b45309">' + p.mEmb + '</td>' +
        '<td style="text-align:center;font-weight:800">' + p.mAll + '</td>' +
        '<td style="text-align:center;font-weight:700">' + p.nMeses + '</td>' +
        '<td style="line-height:1.9">' + chips + '</td>' +
        '<td style="text-align:center">' + p.nTurmas + '</td>' +
        '<td style="text-align:center"><span class="cons-badge" style="background:' + p.rec.bg + ';color:' + p.rec.cor + '">' + p.rec.label + '</span></td>' +
      '</tr>';
    if (consProbExpandido !== p.key) return main;
    const ex = p.rows.slice().sort((a,b) => (b.ts||0) - (a.ts||0)).slice(0, 12)
      .map(r => quoteCard(r, (r.nota != null && r.nota <= 6) ? 'neg' : 'neu', { showTurma:true })).join('');
    const maisTxt = p.rows.length > 12 ? '<div style="font-size:11px;color:var(--muted);margin-top:6px">Mostrando 12 de ' + p.rows.length + ' menções.</div>' : '';
    return main + '<tr><td colspan="9" style="background:#f8fafc;padding:14px 16px">' +
      '<div style="font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Comentários que originaram "' + p.prob + '" (' + p.temaLabel + ')</div>' +
      '<div style="max-height:420px;overflow:auto">' + ex + '</div>' + maisTxt + '</td></tr>';
  }).join('');

  const totNeg = probs.reduce((a,b) => a + b.mNeg, 0);
  const totEmb = probs.reduce((a,b) => a + b.mEmb, 0);
  box.innerHTML =
    '<div class="cbox full" style="margin-bottom:14px">' +
      '<h3 style="margin:0 0 4px">🔎 Problemas Identificados e Quantificados</h3>' +
      '<p style="font-size:11px;color:var(--muted);margin:0 0 12px;line-height:1.6">' +
        '<b>Reclamação formal</b> = menção em comentário de nota ≤ 6. <b>Crítica embutida</b> = menção em comentário de nota ≥ 7 que ainda assim traz linguagem de problema ' +
        '(ex.: "professores ótimos, mas faltou insumo"). As duas contagens são exclusivas entre si, então o total é a soma. ' +
        'No recorte atual: <b>' + totNeg + '</b> menções em reclamação formal e <b>' + totEmb + '</b> embutidas em nota alta. ' +
        'Recorrência apurada sobre ' + janelaTxt + '. Clique em uma linha para ler os comentários de origem.' +
      '</p>' +
      '<div class="tbl-wrap"><table><thead><tr>' +
        th('temaLabel','Tema') + th('prob','Problema') +
        th('mNeg','Nota ≤6','title="Menções em comentários de nota 6 ou menos" style="text-align:center"') +
        th('mEmb','Nota ≥7','title="Menções embutidas em comentários de nota 7 ou mais" style="text-align:center"') +
        th('mAll','Total','style="text-align:center"') +
        th('nMeses','Meses','style="text-align:center"') +
        '<th>Distribuição mensal</th>' +
        th('nTurmas','Turmas','style="text-align:center"') +
        th('rec','Recorrência','style="text-align:center"') +
      '</tr></thead><tbody>' + bodyRows + '</tbody></table></div>' +
    '</div>';
}

// ---- SEÇÃO 4: heatmap problema × mês ----
function consRenderHeatmap(probs, janelaMeses) {
  const box = document.getElementById('cons-heatmap');
  if (!box) return;
  if (!probs.length || !janelaMeses.length) { box.innerHTML = ''; return; }
  const top = probs.slice().sort((a,b) => b.mAll - a.mAll).slice(0, 14);
  let max = 0;
  top.forEach(p => janelaMeses.forEach(m => { const v = p.mesesCount[m] || 0; if (v > max) max = v; }));
  const cell = v => {
    if (!v) return '<td style="background:#f8fafc;color:#cbd5e1">·</td>';
    const t = max ? v / max : 0;
    const bg = t > .75 ? '#b91c1c' : t > .5 ? '#dc2626' : t > .3 ? '#f87171' : t > .15 ? '#fca5a5' : '#fee2e2';
    const fg = t > .3 ? '#fff' : '#7f1d1d';
    return '<td style="background:' + bg + ';color:' + fg + '">' + v + '</td>';
  };
  const rows = top.map(p =>
    '<tr><td class="lbl">' + p.icon + ' ' + p.prob +
    ' <span style="color:var(--muted);font-size:10px;font-weight:500">— ' + p.temaLabel + '</span>' +
    ' <span class="cons-badge" style="background:' + p.rec.bg + ';color:' + p.rec.cor + ';margin-left:4px">' + p.rec.label + '</span></td>' +
    janelaMeses.map(m => cell(p.mesesCount[m] || 0)).join('') + '</tr>'
  ).join('');
  box.innerHTML =
    '<div class="cbox full" style="margin-bottom:14px">' +
      '<h3 style="margin:0 0 4px">🗓️ Recorrência Mês a Mês</h3>' +
      '<p style="font-size:11px;color:var(--muted);margin:0 0 14px;line-height:1.6">' +
        'Número de menções de cada problema por mês — quanto mais escura a célula, maior o volume. Uma linha com células preenchidas em vários meses é um problema que a operação não resolveu; uma linha com uma célula só é um evento isolado. Top ' + top.length + ' problemas por volume total.' +
      '</p>' +
      '<div class="tbl-wrap"><table class="cons-hm"><thead><tr><th class="lbl">Problema</th>' +
        janelaMeses.map(m => '<th>' + m + '</th>').join('') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</div>';
}

// ---- SEÇÃO 5: plano de ação ----
function consProjetoScaffold(p) {
  const turmasTxt = p.nTurmas > 3 ? p.nTurmas + ' turmas' : p.turmasArr.join(', ');
  return '<div class="cons-proj">' +
    '<b>Por que virou projeto:</b> o problema aparece em ' + p.nMeses + ' meses distintos (' + p.mesesArr.join(' · ') + '), somando ' + p.mAll + ' menções em ' + turmasTxt + '. Ação pontual já foi tentada e não sustentou.<br>' +
    '<b>Objetivo sugerido:</b> eliminar a recorrência de "' + p.prob + '" em ' + (p.unidadesArr.length > 1 ? p.unidadesArr.join(' / ') : (p.unidadesArr[0] || 'todas as unidades')) + ', não apenas mitigar o caso do mês.<br>' +
    '<b>Escopo mínimo:</b> dono nomeado · diagnóstico de causa raiz com a operação · redesenho do processo · piloto em 1 turma · rollout.<br>' +
    '<b>Indicador de sucesso:</b> zero menções a "' + p.prob + '" por 2 meses consecutivos e nota do tema ' + p.temaLabel + ' acima da média da unidade.<br>' +
    '<b>Horizonte sugerido:</b> 60 a 90 dias, com checkpoint mensal no CSAT.' +
  '</div>';
}

function consRenderPlano(probs, janelaTxt) {
  const box = document.getElementById('cons-plano');
  if (!box) return;
  const grupos = [
    { key:'cronico', titulo:'🔴 Projeto Estruturado', sub:'Problemas presentes em 4 meses ou mais. Ação isolada já se mostrou insuficiente — precisa de projeto com dono, prazo e indicador.', cor:'#dc2626', bg:'#fef2f2', bd:'#fecaca' },
    { key:'recorrente', titulo:'🟠 Plano de Ação de Curto Prazo', sub:'Problemas presentes em 2 ou 3 meses. Ainda dá para resolver dentro da rotina, mas exige acompanhamento formal para não virar crônico.', cor:'#b45309', bg:'#fffbeb', bd:'#fde68a' },
    { key:'pontual', titulo:'🟡 Ação Corretiva Pontual', sub:'Problemas que apareceram em um único mês. O objetivo aqui é corrigir e garantir que não se repita — se voltar no próximo mês, sobe para curto prazo.', cor:'#0369a1', bg:'#f0f9ff', bd:'#bae6fd' }
  ];
  let html =
    '<div class="cbox full" style="margin-bottom:14px">' +
      '<h3 style="margin:0 0 4px">🛠️ Plano de Ação Sugerido</h3>' +
      '<p style="font-size:11px;color:var(--muted);margin:0 0 14px;line-height:1.6">' +
        'Sugestões geradas automaticamente a partir dos problemas detectados, com o nível de resposta proporcional à recorrência (apurada sobre ' + janelaTxt + '). ' +
        'São um ponto de partida para a discussão com a coordenação — não substituem a validação de quem opera a turma.' +
      '</p>';

  let vazio = true;
  const txtLines = [];
  grupos.forEach(g => {
    const lista = probs.filter(p => p.rec.key === g.key).sort((a,b) => b.mAll - a.mAll);
    if (!lista.length) return;
    vazio = false;
    txtLines.push('== ' + g.titulo.replace(/^\S+\s*/,'').toUpperCase() + ' ==');
    const itens = lista.map(p => {
      const acoes = ACOES_POR_PROBLEMA[p.prob] || [];
      const take = g.key === 'cronico' ? 3 : g.key === 'recorrente' ? 2 : 1;
      const usadas = acoes.slice(0, take);
      const turmasTxt = p.turmasArr.length > 4
        ? p.turmasArr.slice(0,4).join(' · ') + ' +' + (p.turmasArr.length - 4)
        : p.turmasArr.join(' · ');
      txtLines.push('- [' + p.temaLabel + '] ' + p.prob + ' — ' + p.mAll + ' menções em ' + p.nMeses + ' mês(es): ' + p.mesesArr.join(', '));
      txtLines.push('  Turmas: ' + (turmasTxt || '—'));
      usadas.forEach(a => txtLines.push('  • ' + a));
      if (g.key === 'cronico') txtLines.push('  • Escopo: dono nomeado, causa raiz, redesenho de processo, piloto, rollout (60–90 dias)');
      txtLines.push('');
      return '<div class="cons-item">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
          '<span class="t">' + p.icon + ' ' + p.prob + '</span>' +
          '<span class="cons-badge" style="background:' + p.rec.bg + ';color:' + p.rec.cor + '">' + p.nMeses + ' mês(es) · ' + p.mAll + ' menções</span>' +
          '<span style="font-size:11px;color:var(--muted)">' + p.temaLabel + '</span>' +
        '</div>' +
        '<div class="m">Meses: ' + p.mesesArr.map(m => '<span class="cons-chip">' + m + '</span>').join('') +
          '<br>Turmas afetadas: ' + (turmasTxt || '—') +
          ' &nbsp;·&nbsp; ' + p.mNeg + ' em nota ≤6, ' + p.mEmb + ' embutidas em nota ≥7</div>' +
        (usadas.length ? '<ul>' + usadas.map(a => '<li>' + a + '</li>').join('') + '</ul>' : '') +
        (g.key === 'cronico' ? consProjetoScaffold(p) : '') +
      '</div>';
    }).join('');
    html += '<div class="cons-plan" style="background:' + g.bg + ';border-color:' + g.bd + '">' +
      '<h4 style="color:' + g.cor + '">' + g.titulo + ' — ' + lista.length + ' problema(s)</h4>' +
      '<p class="sub" style="color:' + g.cor + '">' + g.sub + '</p>' + itens + '</div>';
  });

  if (vazio) html += '<div class="cons-empty">Nenhum problema detectado no recorte — não há plano de ação a sugerir.</div>';
  html += '</div>';
  box.innerHTML = html;
  _consPlanoTexto = consPlanoHeader() + '\n' + txtLines.join('\n');
}

function consPlanoHeader() {
  const f = consolidadoFilters;
  const partes = [];
  partes.push('PLANO DE AÇÃO CSAT — CONSOLIDADO');
  partes.push('Unidade: ' + (f.unidade || 'todas'));
  partes.push('Especialidade: ' + (f.hab || 'todas'));
  partes.push('Turmas: ' + (f.turmas.length ? f.turmas.join(' · ') : 'todas do recorte'));
  partes.push('Meses exibidos: ' + (f.meses.length ? f.meses.join(' · ') : 'todos'));
  partes.push('Janela de recorrência: ' + (f.recWindow === 'full' ? 'histórico completo das turmas' : 'apenas os meses filtrados'));
  partes.push('Critério: 1 mês = pontual · 2-3 meses = recorrente · 4+ meses = crônico (projeto)');
  partes.push('');
  return partes.join('\n');
}

function consCopiarPlano() {
  const txt = _consPlanoTexto || 'Nenhum plano gerado.';
  const done = () => alert('Plano de ação copiado para a área de transferência.');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done).catch(() => consCopiarFallback(txt, done));
  } else consCopiarFallback(txt, done);
}
function consCopiarFallback(txt, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); done();
  } catch (e) { alert('Não foi possível copiar automaticamente. Selecione o texto do plano na tela.'); }
}

// ---- SEÇÃO 6: comentários do recorte ----
function consRenderComentarios(coms) {
  const box = document.getElementById('cons-comentarios');
  if (!box) return;
  const ordenados = coms.slice().sort((a,b) => (b.ts||0) - (a.ts||0));
  const lista = ordenados.slice(0, 60).map(r => {
    const d = consDetectProblemas(r);
    const tags = d.problemas.slice(0,4).map(p =>
      '<span class="cons-chip">' + (TEMA_ICONS[p.tema] || '•') + ' ' + p.prob + '</span>').join('');
    const tipo = (r.nota != null && r.nota <= 6) ? 'neg' : (r.nota != null && r.nota >= 9) ? 'pos' : 'neu';
    return '<div style="margin-bottom:2px">' + quoteCard(r, tipo, { showTurma:true }) +
      (tags ? '<div style="margin:-4px 0 10px 4px">' + tags + '</div>' : '') + '</div>';
  }).join('');
  box.innerHTML =
    '<div class="cbox full">' +
      '<h3 style="margin:0 0 4px">💬 Comentários do Recorte</h3>' +
      '<p style="font-size:11px;color:var(--muted);margin:0 0 14px;line-height:1.6">' +
        'Evidência bruta por trás dos números acima, do mais recente para o mais antigo, com os problemas detectados em cada comentário. ' +
        (ordenados.length > 60 ? 'Mostrando 60 de ' + ordenados.length + ' comentários — use os filtros para estreitar o recorte.' : ordenados.length + ' comentário(s).') +
      '</p>' +
      (lista ? '<div style="max-height:640px;overflow:auto">' + lista + '</div>' : '<div class="cons-empty">Nenhum comentário no recorte.</div>') +
    '</div>';
}

// ---- orquestrador da aba ----
function renderConsolidadoTab() {
  const ignoreMesParaRec = (consolidadoFilters.recWindow === 'full');
  const comsRec = consBaseComentarios(ignoreMesParaRec);   // base da recorrência
  const comsView = consBaseComentarios(false);             // base exibida (respeita o filtro de mês)
  const fd = consBaseGeral(false);
  const fdRec = consBaseGeral(ignoreMesParaRec);

  const probs = consProblemMap(comsRec);
  const janelaMeses = CONS_MES_SEQ.map(m => CONS_MES_LABEL[m]).filter(l => fdRec.some(r => r.mes_label === l));
  const janelaTxt = ignoreMesParaRec
    ? 'todo o histórico das turmas do recorte (' + (janelaMeses.length ? janelaMeses[0] + ' a ' + janelaMeses[janelaMeses.length-1] : '—') + ', ' + janelaMeses.length + ' mês(es))'
    : 'apenas os meses filtrados (' + (janelaMeses.length ? janelaMeses.join(', ') : '—') + ')';

  safeCall(() => consRenderKpis(fd, comsView, probs), 'consRenderKpis');
  safeCall(() => consRenderTurmas(fd, comsRec), 'consRenderTurmas');
  safeCall(() => consRenderProblemas(probs, janelaTxt), 'consRenderProblemas');
  safeCall(() => consRenderHeatmap(probs, janelaMeses), 'consRenderHeatmap');
  safeCall(() => consRenderPlano(probs, janelaTxt), 'consRenderPlano');
  safeCall(() => consRenderComentarios(comsView), 'consRenderComentarios');
}

// ============ INIT ============
// Try to restore saved base from localStorage
const _restored = loadFromLocalStorage();
populateFilters();
populateConsolidadoFilters();
renderAll();
monthlyLine('ch-monthly', UNITS, DATA_GERAL);
evolucaoGeralCombo('ch-evolucao-geral', DATA_GERAL);
evolucaoSemanalCombo('ch-evolucao-semanal', DATA_GERAL);
weeklyLineAllUnits('ch-weekly-units', DATA_GERAL);
pieChart(DATA_GERAL);
geralHabBar(DATA_GERAL);
rankingCharts(DATA_GERAL);
buildSemanaCheckboxes();
