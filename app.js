/* ==========================================================================
   Leads - Treinamento Gestão Financeira e Fluxo de Caixa — aplicação (front-end)
   ========================================================================== */
(function () {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const DEMO = !CFG.API_URL;
  const $app = document.getElementById('app');
  const $sheet = document.getElementById('sheet-root');
  const $toast = document.getElementById('toast-root');

  const STATUS_INFO = {
    novo: { rot: 'Contatos', sing: 'Novo', cor: '#0369B1' },
    tratativa: { rot: 'Tratativas', sing: 'Em tratativa', cor: '#F8B90C' },
    ganho: { rot: 'Negócio ganho', sing: 'Ganho', cor: '#12A150' },
    perdido: { rot: 'Negócio perdido', sing: 'Perdido', cor: '#D93B3B' },
    reembolso: { rot: 'Reembolso', sing: 'Reembolso', cor: '#7A4CC2' }
  };
  const MOTIVOS_PERDA = ['Sem interesse', 'Sem dinheiro agora', 'Não respondeu', 'Já é cliente', 'Achou caro', 'Vai pensar / depois do evento', 'Comprou outro'];
  const FORMAS = ['Pix', 'Cartão de crédito', 'Boleto', 'Recorrência', 'Misto', 'Outro'];

  const S = {
    token: null, user: null, modo: 'usuario', view: 'novo',
    leads: [], vendas: [], produtos: [], mensagens: [], usuarios: [], historico: [], config: {}, fases: [], links: {},
    modoSistema: 'evento', marcosAtivos: null, podeGerenciar: false, nomeSistema: '',
    busca: '', filtro: 'todos', limite: 60, ordem: 'ranking',
    adm: { status: 'todos', resp: 'todos', tipo: 'todos', cliente: 'todos', origem: 'todos', classe: 'todos', cargo: 'todos', porte: 'todos' },
    painel: { resp: 'todos', tipo: 'todos', origem: 'todos' },
    catalogo: 'fases', funilLista: false,
    carregado: false, sync: false
  };

  /* ------------------------------------------------------------------ utils */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    let s = String(v).replace(/[R$\s]/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return isNaN(n) ? 0 : n;
  };
  const brl = (v) => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const brlCurto = (v) => {
    const n = num(v);
    if (n >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
    if (n >= 1e4) return 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return brl(n);
  };
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0).toLocaleString('pt-BR') + '%';
  const data = (s) => { if (!s) return null; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? null : d; };
  const fmtData = (s, hora = true) => {
    const d = data(s); if (!d) return '—';
    const o = { day: '2-digit', month: '2-digit' };
    if (hora) { o.hour = '2-digit'; o.minute = '2-digit'; }
    return d.toLocaleString('pt-BR', o);
  };
  const rel = (s) => {
    const d = data(s); if (!d) return '';
    const m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return 'há ' + m + ' min';
    const h = Math.round(m / 60);
    if (h < 24) return 'há ' + h + ' h';
    const dd = Math.round(h / 24);
    return 'há ' + dd + (dd === 1 ? ' dia' : ' dias');
  };
  const horasDesde = (s) => { const d = data(s); return d ? (Date.now() - d.getTime()) / 3600000 : 0; };
  const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  const iniciais = (n) => { const p = String(n || '?').trim().split(/\s+/); return ((p[0] || '')[0] || '?').toUpperCase() + ((p.length > 1 ? p[p.length - 1][0] : '') || '').toUpperCase(); };
  const corDe = (s) => { const cores = ['#0369B1', '#0B7A9E', '#7A4CC2', '#C2410C', '#0F766E', '#B45309', '#1D4ED8', '#9D174D']; let h = 0; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return cores[h % cores.length]; };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const soDig = (s) => String(s || '').replace(/\.0$/, '').replace(/\D/g, '');
  const telFmt = (t) => {
    let d = soDig(t);
    if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return t || '—';
  };
  const waNumero = (t) => {
    let d = soDig(t);
    if (!d) return '';
    if (d.length === 10 || d.length === 11) d = '55' + d;
    return d;
  };
  const agoraLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 19); };
  const abrirUrl = (u) => { if (window.LW_ABRIR_URL) window.LW_ABRIR_URL(u); else window.location.href = u; };
  const ehMobile = () =>/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  const eventosDe = (l) => { if (!l.eventos) return []; try { const a = JSON.parse(l.eventos); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const ehMdlAtivo = (l) => /ativ/i.test(l.cliente_mdl || '');
  const ehCliente = (l) => !!(l.cliente_mdl || l.cliente_ilu);
  const vendasDoLead = (id) => S.vendas.filter((v) => v.lead_id === id);
  const faseDe = (l) => S.fases.find((f) => f.id === l.fase_id) || null;
  const usaVip = () => true;
  const PROG = () => (S.links && S.links.programa) || 'ILU';
  /* ----------- Ranking do lead (mesma leitura da planilha do comercial) ----- */
  const CLASSIF = {
    quente:   { rot: 'Quente',          ico: '🔥', cls: 'c-quente',  ordem: 6, ajuda: 'Dono de empresa com porte e sinal de interesse. Prioridade máxima.' },
    mql_mais: { rot: 'MQL+',            ico: '⚡', cls: 'c-mqlmais', ordem: 5, ajuda: 'Bom perfil e bom porte. Vale o contato logo.' },
    mql:      { rot: 'MQL',             ico: '✅', cls: 'c-mql',     ordem: 4, ajuda: 'Dentro do perfil, precisa de qualificação.' },
    viavel:   { rot: 'Viável',          ico: '🔵', cls: 'c-viavel',  ordem: 3, ajuda: 'Pode virar cliente, mas não é prioridade agora.' },
    baixo:    { rot: 'Baixo potencial', ico: '⚪', cls: 'c-baixo',   ordem: 2, ajuda: 'Porte ou cargo fora do ideal.' },
    fora:     { rot: 'Fora do perfil',  ico: '❌', cls: 'c-fora',    ordem: 1, ajuda: 'Não é público do programa ofertado.' }
  };
  const classifDe = (l) => CLASSIF[l.classificacao] || null;
  const ehDono = (l) => /dono|s[óo]cio|propriet|ceo|fundador/i.test(String(l.cargo || ''));
  const fatNum = (l) => {
    const t = String(l.faturamento || '');
    if (/acima de 500|mais de 500|1\s*mi|milh/i.test(t)) return 500;
    if (/300 a 500/i.test(t)) return 300;
    if (/100 a 300/i.test(t)) return 100;
    if (/60 a 100/i.test(t)) return 60;
    if (/30 a 60/i.test(t)) return 30;
    if (/ate 30|até 30/i.test(t)) return 10;
    return 0;
  };
  const usaInteresse = () => marcosDoSistema().indexOf('interesse') >= 0;
  function indiceDiag(l) {
    if (!l.diagnostico_respostas) return '';
    try {
      const o = JSON.parse(l.diagnostico_respostas);
      return o['Índice geral'] || o['indice_geral'] || '';
    } catch (e) { return ''; }
  }
  const marcosDoSistema = () => (S.marcosAtivos && S.marcosAtivos.length ? S.marcosAtivos.filter((k) => MARCOS_INFO[k]) : Object.keys(MARCOS_INFO));
  const fasesAtivas = () => S.fases.filter((f) => f.ativo !== 'NAO');
  const MARCOS_INFO = {
    boas_vindas: { rot: 'Boas-vindas', vals: { enviada: ['Boas-vindas enviada', 'evento'], respondeu: ['Respondeu', 'ok'], sem_resposta: ['Sem resposta', 'alerta'] } },
    acesso: { rot: 'Acesso ao produto', vals: { sim: ['Acessou o produto', 'ok'], nao: ['Ainda não acessou', 'alerta'] } },
    confirmado: { rot: 'Presença', ic: 'check', vals: { sim: ['Confirmou presença', 'ok'], nao: ['Não vai participar', 'alerta'] } },
    upgrade: { rot: 'Upgrade VIP', ic: 'estrela', vals: { enviado: ['Upgrade enviado', 'evento'], feito: ['Fez upgrade VIP', 'vip'], nao_quer: ['Recusou o upgrade', ''] } },
    interesse: { rot: 'Lista de interesse', ic: 'estrela', vals: { sim: ['Interessado', 'interesse'], nao: ['Sem interesse', ''] } },
    diagnostico: { rot: 'Diagnóstico', ic: 'leads', vals: { enviado: ['Diagnóstico enviado', 'evento'], feito: ['Diagnóstico feito', 'ok'] } },
    reuniao: { rot: 'Reunião', ic: 'chat', vals: { agendada: ['Reunião agendada', 'evento'], feita: ['Reunião feita', 'ok'], nao_compareceu: ['Faltou na reunião', 'alerta'] } },
    checkin: { rot: 'Participou', ic: 'trofeu', vals: { sim: ['Participou do Treinamento', 'ok'], nao: ['Não participou', 'alerta'] } },
    presentes: { rot: 'Presentes do Treinamento', ic: 'download', vals: { sim: ['Baixou os presentes', 'presentes'], nao: ['Não baixou os presentes', ''] } }
  };
  /** Rótulo claro de cliente: separa quem está ativo de quem já saiu. */
  function rotuloCliente(txt, produto) {
    const t = String(txt || '');
    if (!t) return null;
    const st = t.split('·')[0].trim();
    const ativo = /ativ/i.test(st) && !/ex |cancel|reembols|suspens|congel/i.test(st);
    return { ativo, cls: ativo ? (produto === 'MDL' ? 'mdl' : 'ilu') : 'exmdl', curto: (ativo ? produto + ' ativo' : 'Ex-' + produto) , titulo: produto + ': ' + t, detalhe: st };
  }
  const souCoord = () => S.user && S.user.perfil === 'coordenador';
  const usuarioPorId = (id) => S.usuarios.find((u) => u.id === id);

  /* -------------------------------------------------------------- ícones */
  const I = {
    whats: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z"/></svg>',
    contatos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    trofeu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
    xcirc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>',
    volta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    painel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
    leads: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    equipe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
    caixa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>',
    ajustes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
    mais: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    busca: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    troca: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/></svg>',
    editar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    estrela: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3 6.3 6.9.9-5 4.8 1.2 6.9L12 17.6 5.9 20.9 7.1 14l-5-4.8 6.9-.9z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    relogio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    sair: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
    funil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18l-7 8v7l-4 2v-9z"/></svg>',
    copiar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
    seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    lixo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>'
  };

  /* ----------------------------------------------------------------- API */
  async function api(action, payload = {}) {
    const body = Object.assign({ action, token: S.token }, payload);
    let res;
    if (DEMO) {
      res = await window.DemoAPI.call(body);
    } else {
      let r;
      try {
        r = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
      } catch (e) { throw new Error('Sem conexão com o servidor. Verifique sua internet.'); }
      try { res = await r.json(); } catch (e) { throw new Error('Resposta inválida do servidor (confira a URL e a publicação do Apps Script).'); }
    }
    if (!res.ok) {
      if (res.auth) { sairLocal(); throw new Error('Sua sessão expirou. Entre novamente.'); }
      throw new Error(res.error || 'Erro desconhecido');
    }
    return res.data;
  }

  function toast(msg, tipo = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + tipo;
    el.textContent = msg;
    $toast.appendChild(el);
    setTimeout(() => el.remove(), tipo === 'erro' ? 4500 : 2600);
  }

  async function comBotao(btn, fn) {
    if (btn && btn.disabled) return;
    const html = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + (btn.dataset.loading || ''); }
    try { return await fn(); }
    catch (e) { toast(e.message, 'erro'); }
    finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = html; } }
  }

  /* ------------------------------------------------------------ sessão */
  function sairLocal() {
    S.token = null; S.user = null; S.carregado = false;
    store.del('lw_sessao');
    fecharSheet();
    renderLogin();
  }

  async function carregar(silencioso) {
    if (!S.token) return;
    if (S.sync) return;
    S.sync = true;
    const ref = document.querySelector('.topbar .ref');
    if (ref) ref.classList.add('girando');
    try {
      const d = await api(souCoord() ? 'admin.painel' : 'bootstrap');
      S.user = d.usuario;
      S.leads = d.leads || [];
      S.vendas = d.vendas || [];
      S.produtos = d.produtos || [];
      S.mensagens = d.mensagens || [];
      S.fases = d.fases || [];
      S.links = d.links || {};
      S.modoSistema = d.modo || 'evento';
      S.marcosAtivos = d.marcos || null;
      S.podeGerenciar = !!d.pode_gerenciar;
      if (d.sistema) { S.nomeSistema = d.sistema; document.title = d.sistema; }
      if (d.usuarios) S.usuarios = d.usuarios;
      if (d.historico) S.historico = d.historico;
      if (d.config) S.config = d.config;
      if (!souCoord()) { S.modo = 'usuario'; S.usuarios = [S.user]; }
      store.set('lw_sessao', { token: S.token, user: S.user, modo: S.modo, view: S.view });
      S.carregado = true;
      renderMain();
    } catch (e) {
      if (!silencioso) toast(e.message, 'erro');
    } finally {
      S.sync = false;
      const r2 = document.querySelector('.topbar .ref');
      if (r2) r2.classList.remove('girando');
    }
  }

  /* ------------------------------------------------------------- login */
  function renderLogin() {
    $app.innerHTML = `
      <div class="login-wrap">
        <form class="login-card" id="f-login" autocomplete="on">
          <div class="login-logo">
            <div class="logo-mark"><span></span></div>
            <div><h1>${esc(CFG.NOME || 'Leads')}</h1><p>Atendimento e upsell</p></div>
          </div>
          <div class="field"><label for="l-email">E-mail</label>
            <input class="input" id="l-email" type="email" autocomplete="username" inputmode="email" required></div>
          <div class="field"><label for="l-senha">Senha</label>
            <input class="input" id="l-senha" type="password" autocomplete="current-password" required></div>
          <button class="btn amarelo block" type="submit" data-loading=" Entrando...">Entrar</button>
          ${DEMO ? `<div class="demo-hint"><b>Modo demonstração.</b> Coordenador: <code>coord@demo.com</code> · Usuário: <code>ana@demo.com</code> — senha <code>123456</code></div>` : ''}
        </form>
      </div>`;
    const f = document.getElementById('f-login');
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const btn = f.querySelector('button');
      comBotao(btn, async () => {
        const d = await api('login', { email: f.querySelector('#l-email').value, senha: f.querySelector('#l-senha').value });
        S.token = d.token; S.user = d.usuario;
        S.modo = d.usuario.perfil === 'coordenador' ? 'coord' : 'usuario';
        S.view = S.modo === 'coord' ? 'painel' : 'novo';
        renderShell();
        await carregar();
      });
    });
  }

  /* ------------------------------------------------------------- shell */
  function navItens() {
    if (S.modo === 'coord') {
      return [
        { id: 'painel', rot: 'Painel', ic: I.painel },
        { id: 'leads', rot: 'Leads', ic: I.leads, n: S.leads.length },
        { id: 'equipe', rot: 'Equipe', ic: I.equipe },
        { id: 'catalogo', rot: 'Produtos e msgs', ic: I.caixa },
        { id: 'ajustes', rot: 'Ajustes', ic: I.ajustes }
      ];
    }
    const meu = (st) => S.leads.filter((l) => l.status === st && (st === 'novo' || l.responsavel_id === S.user.id)).length;
    const itens = [
      { id: 'novo', rot: 'Contatos', ic: I.contatos, n: meu('novo') },
      { id: 'funil', rot: 'Funil', ic: I.funil, n: meu('tratativa') },
      { id: 'ganho', rot: 'Ganhos', ic: I.trofeu, n: meu('ganho') },
      { id: 'perdido', rot: 'Perdidos', ic: I.xcirc, n: meu('perdido') },
      { id: 'reembolso', rot: 'Reembolso', ic: I.volta, n: meu('reembolso') }
    ];
    if (S.podeGerenciar) itens.push({ id: 'catalogo', rot: 'Fases', ic: I.caixa });
    return itens;
  }

  function avatarHtml(u, cls = '') {
    if (u && u.foto) return `<img class="avatar ${cls}" src="${esc(u.foto)}" alt="">`;
    const nome = u ? u.nome : '?';
    return `<div class="avatar ${cls}" style="background:${corDe(nome)}">${esc(iniciais(nome))}</div>`;
  }

  function renderShell() {
    $app.innerHTML = `
      <div class="shell">
        <nav class="nav" id="nav"></nav>
        <div>
          ${DEMO ? '<div class="demo-bar">MODO DEMONSTRAÇÃO — dados fictícios, nada é salvo</div>' : ''}
          <header class="topbar" id="topbar"></header>
          <main id="main"><div class="carregando"><div class="spin"></div>Carregando…</div></main>
        </div>
      </div>`;
    document.getElementById('nav').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-view]');
      if (!b) return;
      S.view = b.dataset.view; S.busca = ''; S.filtro = 'todos'; S.limite = 60;
      renderMain();
      window.scrollTo({ top: 0 });
    });
    document.getElementById('topbar').addEventListener('click', (ev) => {
      if (ev.target.closest('.avatar')) abrirPerfil();
      else if (ev.target.closest('.ref')) carregar();
      else if (ev.target.closest('.modo')) {
        S.modo = S.modo === 'coord' ? 'usuario' : 'coord';
        S.view = S.modo === 'coord' ? 'painel' : 'novo';
        S.busca = ''; S.filtro = 'todos';
        renderMain();
      }
    });
  }

  function renderTop() {
    const tb = document.getElementById('topbar');
    if (!tb) return;
    const sub = S.modo === 'coord' ? 'Área do coordenador' : 'Olá, ' + esc(primeiroNome(S.user.nome));
    tb.innerHTML = `
      <div class="titulo"><h1>${esc(S.nomeSistema || CFG.NOME || 'Leads')}</h1><div class="sub">${sub}</div></div>
      ${souCoord() ? `<button class="modo" title="Alternar área">${I.troca}${S.modo === 'coord' ? 'Atender' : 'Coordenar'}</button>` : ''}
      <button class="ref" title="Atualizar" aria-label="Atualizar">${I.refresh}</button>
      ${avatarHtml(S.user)}`;
  }

  function renderNav() {
    const nav = document.getElementById('nav');
    if (!nav) return;
    nav.classList.toggle('n6', navItens().length > 5);
    nav.innerHTML = `<div class="nav-brand"><div class="logo-mark"><span></span></div><b>${esc(S.nomeSistema || CFG.NOME || '')}</b></div>` +
      navItens().map((n) => `<button data-view="${n.id}" class="${S.view === n.id ? 'on' : ''}">${n.ic}<span class="lbl">${n.rot}</span>${n.n ? `<span class="cnt">${n.n > 999 ? '999+' : n.n}</span>` : ''}</button>`).join('');
  }

  function renderMain() {
    if (!S.user) return;
    if (!document.getElementById('main')) renderShell();
    renderTop();
    renderNav();
    const m = document.getElementById('main');
    if (!S.carregado) return;
    const v = S.view;
    if (S.modo === 'coord') {
      if (v === 'painel') m.innerHTML = viewPainel();
      else if (v === 'leads') m.innerHTML = viewLeadsAdmin();
      else if (v === 'equipe') m.innerHTML = viewEquipe();
      else if (v === 'catalogo') m.innerHTML = viewCatalogo();
      else if (v === 'ajustes') m.innerHTML = viewAjustes();
    } else if (v === 'funil') {
      m.innerHTML = viewFunil();
    } else if (v === 'catalogo') {
      m.innerHTML = viewCatalogo();
    } else {
      m.innerHTML = viewLista(v);
    }
    const busca = m.querySelector('input[data-busca]');
    if (busca && S._focoBusca) { busca.focus(); busca.setSelectionRange(busca.value.length, busca.value.length); S._focoBusca = false; }
  }

  /* ------------------------------------------------------- filtros */
  function aplicaBusca(lista) {
    const q = norm(S.busca).trim();
    if (!q) return lista;
    const qd = soDig(q);
    return lista.filter((l) => norm(l.nome).includes(q) || norm(l.email).includes(q) || norm(l.cidade).includes(q) || (qd.length >= 4 && soDig(l.telefone).includes(qd)));
  }
  function aplicaFiltroChip(lista, f) {
    if (f === 'interesse') return lista.filter((l) => l.interesse === 'sim');
    if (f === 'quentes') return lista.filter((l) => l.classificacao === 'quente' || l.classificacao === 'mql_mais');
    if (f === 'participou') return lista.filter((l) => l.checkin === 'sim');
    if (f === 'donos') return lista.filter((l) => ehDono(l) && fatNum(l) >= 60);
    if (f === 'vip') return lista.filter((l) => l.tipo_ingresso === 'vip');
    if (f === 'padrao') return lista.filter((l) => l.tipo_ingresso !== 'vip');
    if (f === 'clientes') return lista.filter(ehCliente);
    if (f === 'eventos') return lista.filter((l) => eventosDe(l).length);
    if (f === 'parados') return lista.filter((l) => horasDesde(l.ultima_acao || l.inicio_tratativa) > 48);
    return lista;
  }

  /* ---------------------------------------------------- área do usuário */
  function viewLista(st) {
    const uid = S.user.id;
    const meus = S.leads.filter((l) => l.responsavel_id === uid);
    const base = S.leads.filter((l) => l.status === st && (st === 'novo' || l.responsavel_id === uid));
    // A lista de interesse é transversal: na aba de contatos ela mostra TODOS os
    // interessados da concierge, mesmo os que já estão em tratativa, ganhos ou perdidos.
    const baseInteresse = S.leads.filter((l) => l.interesse === 'sim' && (l.responsavel_id === uid || !l.responsavel_id));
    const baseDe = (f) => (f === 'interesse' && st === 'novo' ? baseInteresse : base);
    const ord = S.ordem === 'ranking'
      ? (a, b) => (b.score || 0) - (a.score || 0) || String(b.criado_em).localeCompare(String(a.criado_em))
      : {
        novo: (a, b) => String(b.criado_em).localeCompare(String(a.criado_em)),
        tratativa: (a, b) => String(a.ultima_acao || a.inicio_tratativa).localeCompare(String(b.ultima_acao || b.inicio_tratativa)),
      }[st] || ((a, b) => String(b.fechado_em || b.atualizado_em).localeCompare(String(a.fechado_em || a.atualizado_em)));
    let lista = aplicaFiltroChip(aplicaBusca(baseDe(S.filtro)), S.filtro).sort(ord);

    const minhasVendas = S.vendas.filter((v) => v.usuario_id === uid && v.status === 'ativa');
    const resumo = `
      <div class="resumo">
        <div><b class="num">${meus.filter((l) => l.status === 'tratativa').length}</b><span>Em tratativa</span></div>
        <div><b class="num">${meus.filter((l) => l.status === 'ganho').length}</b><span>Ganhos</span></div>
        <div><b class="num">${brlCurto(minhasVendas.reduce((s, v) => s + num(v.valor_total), 0))}</b><span>Vendido</span></div>
      </div>`;

    const chipsDef = [['todos', 'Todos']].concat(usaInteresse() && st === 'novo' ? [['interesse', 'Interessados - ' + PROG()]] : [])
      .concat([['quentes', '🔥 Quentes e MQL+'], ['donos', 'Donos +60k'], ['participou', 'Participou do Treinamento']])
      .concat(usaVip() ? [['vip', 'VIP'], ['padrao', 'Padrão']] : [])
      .concat([['clientes', 'Clientes'], ['eventos', 'Já foi a eventos']]);
    if (st === 'tratativa') chipsDef.push(['parados', 'Parados +48h']);
    const chips = chipsDef.map(([k, r]) => `<button class="chip ${S.filtro === k ? 'on' : ''}" data-chip="${k}">${r}<span class="n">${aplicaFiltroChip(aplicaBusca(baseDe(k)), k).length}</span></button>`).join('');

    const titulos = { novo: 'Lista de contatos', tratativa: 'Minhas tratativas', ganho: 'Negócio ganho', perdido: 'Negócio perdido', reembolso: 'Reembolsos' };
    const aviso = S.filtro === 'interesse' && st === 'novo'
      ? `<p class="hint" style="margin:-4px 0 10px">Mostrando <b>todos</b> os seus interessados no ${esc(PROG())}, em qualquer etapa — por isso alguns já aparecem como em tratativa ou fechados.</p>` : '';
    const visiveis = lista.slice(0, S.limite);
    return `
      ${resumo}
      <div class="page-head"><h2>${titulos[st]}</h2>
        <div class="acoes"><button class="btn sm amarelo" data-act="novo-lead">${I.mais}Lead</button></div></div>
      <div class="busca">${I.busca}<input class="input" data-busca placeholder="Buscar nome, telefone, e-mail, cidade" value="${esc(S.busca)}" enterkeyhint="search"></div>
      <div class="chips">${chips}</div>
      <div class="ordem-linha">
        <button class="btn line sm ${S.ordem === 'ranking' ? 'on' : ''}" data-act="ordem" data-ordem="ranking">${I.estrela}Melhor ranking</button>
        <button class="btn line sm ${S.ordem !== 'ranking' ? 'on' : ''}" data-act="ordem" data-ordem="data">${I.relogio}Mais recentes</button>
      </div>
      ${aviso}
      ${lista.length ? `<div class="lista">${visiveis.map(cardLead).join('')}</div>
        ${lista.length > S.limite ? `<div class="mais"><button class="btn line" data-act="mais">Mostrar mais (${lista.length - S.limite})</button></div>` : ''}`
        : vazio(st)}`;
  }

  function viewFunil() {
    const uid = S.user.id;
    const base = S.leads.filter((l) => l.status === 'tratativa' && (S.modo === 'coord' || l.responsavel_id === uid));
    const lista = aplicaFiltroChip(aplicaBusca(base), S.filtro);
    const fases = fasesAtivas();
    const semFase = lista.filter((l) => !faseDe(l));
    const ord = (a, b) => String(a.ultima_acao || a.inicio_tratativa).localeCompare(String(b.ultima_acao || b.inicio_tratativa));
    const cabecalho = `
      <div class="page-head"><h2>Funil</h2>
        <div class="acoes">
          <button class="btn sm line" data-act="ver-funil">${S.funilLista ? I.funil : I.leads}${S.funilLista ? 'Funil' : 'Lista'}</button>
          <button class="btn sm amarelo" data-act="novo-lead">${I.mais}Lead</button>
        </div></div>
      <div class="busca">${I.busca}<input class="input" data-busca placeholder="Buscar nome, telefone, e-mail, cidade" value="${esc(S.busca)}"></div>
      <div class="chips">${[['todos', 'Todos']].concat(usaInteresse() ? [['interesse', 'Interessados - ' + PROG()]] : []).concat(usaVip() ? [['vip', 'VIP'], ['padrao', 'Padrão']] : []).concat([['clientes', 'Clientes'], ['parados', 'Parados +48h']])
        .map(([k, r]) => `<button class="chip ${S.filtro === k ? 'on' : ''}" data-chip="${k}">${r}<span class="n">${aplicaFiltroChip(aplicaBusca(base), k).length}</span></button>`).join('')}</div>`;
    if (!lista.length) return cabecalho + vazio('tratativa');
    if (S.funilLista) {
      return cabecalho + `<div class="lista">${lista.sort(ord).map(cardLead).join('')}</div>`;
    }
    const col = (f, leads) => `
      <section class="kcol">
        <header class="kcol-head" style="border-top-color:${f ? esc(f.cor) : '#C7D0DB'}">
          <div class="kcol-tit"><b>${f ? esc(f.nome) : 'Sem fase'}</b><span class="kcol-n">${leads.length}</span></div>
          ${f && f.instrucoes ? `<details class="kcol-inst"><summary>O que fazer nesta fase</summary><ul>${String(f.instrucoes).split('\n').filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
        </header>
        <div class="kcol-body">${leads.length ? leads.sort(ord).map(cardLead).join('') : '<p class="muted small" style="padding:8px 2px">Nenhum lead aqui.</p>'}</div>
      </section>`;
    return cabecalho + `<div class="kanban">
      ${fases.map((f) => col(f, lista.filter((l) => l.fase_id === f.id))).join('')}
      ${semFase.length ? col(null, semFase) : ''}
    </div>`;
  }

  function vazio(st) {
    const t = {
      novo: ['Nenhum contato novo', 'Quando alguém comprar o ingresso (Hotmart ou Kiwify), o lead aparece aqui.'],
      tratativa: ['Nenhuma tratativa aberta', 'Inicie uma conversa pela Lista de contatos.'],
      ganho: ['Nenhum negócio ganho ainda', 'As vendas que você registrar aparecem aqui.'],
      perdido: ['Nenhum negócio perdido', ''],
      reembolso: ['Nenhum reembolso', '']
    }[st] || ['Nada por aqui', ''];
    return `<div class="vazio">${I.leads}<h3>${t[0]}</h3><p>${t[1]}</p></div>`;
  }

  function tagsLead(l, completo) {
    const t = [];
    const cl = classifDe(l);
    if (cl) t.push(`<span class="tag ${cl.cls}" title="Ranking ${l.score} · ${esc(cl.ajuda)}">${cl.ico} ${cl.rot} <b>${l.score}</b></span>`);
    if (ehDono(l)) t.push('<span class="tag dono">Dono / Sócio</span>');
    if (l.faturamento) t.push(`<span class="tag fat" title="Faturamento declarado">${esc(l.faturamento)}</span>`);
    if (usaVip()) t.push(l.tipo_ingresso === 'vip' ? `<span class="tag vip">${I.estrela}VIP</span>` : '<span class="tag padrao">Padrão</span>');
    marcosDoSistema().forEach((k) => {
      const v = MARCOS_INFO[k].vals[l[k]];
      if (v) t.push(`<span class="tag ${v[1]}" title="${esc(MARCOS_INFO[k].rot)}">${esc(v[0])}</span>`);
    });
    const mdl = rotuloCliente(l.cliente_mdl, 'MDL');
    if (mdl) t.push(`<span class="tag ${mdl.cls}" title="${esc(mdl.titulo)}">${esc(mdl.curto)}</span>`);
    const ilu = rotuloCliente(l.cliente_ilu, 'ILU');
    if (ilu) t.push(`<span class="tag ${ilu.cls}" title="${esc(ilu.titulo)}">${esc(ilu.curto)}</span>`);
    if (l.origem_evento) {
      const o = String(l.origem_evento).split('—')[0].trim();
      t.push(`<span class="tag origem" title="${esc(l.origem_evento)}">${esc(o.length > 30 ? o.slice(0, 29) + '…' : o)}</span>`);
    }
    const ind = indiceDiag(l);
    if (ind) t.push(`<span class="tag ok" title="Índice do diagnóstico">Índice ${esc(ind)}</span>`);
    const ev = eventosDe(l);
    if (ev.length) t.push(`<span class="tag evento">${ev.length} evento${ev.length > 1 ? 's' : ''}</span>`);
    if (l.status === 'tratativa' && horasDesde(l.ultima_acao || l.inicio_tratativa) > 48) t.push(`<span class="tag alerta">${I.relogio}Parado ${rel(l.ultima_acao || l.inicio_tratativa).replace('há ', '')}</span>`);
    if (completo && l.faturamento) t.push(`<span class="tag">${esc(l.faturamento)}</span>`);
    return t.join('');
  }

  function cardLead(l) {
    const meta = [telFmt(l.telefone), l.cidade].filter((x) => x && x !== '—').join(' · ');
    let rodape = '';
    if (l.status === 'novo') {
      rodape = `<div class="lead-actions">
        <button class="btn whats" data-act="wa" data-id="${l.id}">${I.whats}Iniciar conversa</button>
        <button class="btn line icon" data-act="abrir" data-id="${l.id}" aria-label="Detalhes">${I.leads}</button></div>`;
    } else if (l.status === 'tratativa') {
      const f = faseDe(l);
      rodape = `<div class="lead-actions">
        <button class="btn whats icon" data-act="wa" data-id="${l.id}" aria-label="WhatsApp">${I.whats}</button>
        <button class="btn line sm" data-act="fase" data-id="${l.id}" style="border-color:${f ? esc(f.cor) : 'var(--borda)'}">${I.seta}${f ? esc(f.nome) : 'Escolher fase'}</button>
        <button class="btn verde sm icon" data-act="ganho" data-id="${l.id}" aria-label="Negócio ganho">${I.trofeu}</button></div>`;
    } else if (l.status === 'ganho') {
      const vs = vendasDoLead(l.id).filter((v) => v.status === 'ativa');
      rodape = vs.map((v) => `<div class="venda-mini"><span>${esc(v.produto_nome)}</span><span class="nowrap">${num(v.valor_entrada) ? `<span class="muted">Entr.</span> <b>${brl(v.valor_entrada)}</b> · ` : ''}<b>${brl(v.valor_total)}</b></span></div>`).join('');
    } else if (l.motivo) {
      rodape = `<div class="venda-mini"><span class="muted">Motivo</span><span>${esc(l.motivo)}</span></div>`;
    }
    const quando = l.status === 'novo' ? 'Entrou ' + rel(l.criado_em)
      : l.status === 'tratativa' ? 'Última ação ' + rel(l.ultima_acao || l.inicio_tratativa)
        : fmtData(l.fechado_em || l.atualizado_em);
    return `
      <article class="card lead ${l.tipo_ingresso === 'vip' ? 'vip' : ''} ${l.interesse === 'sim' ? 'interessado' : ''} ${l.status === 'ganho' ? 'fechado' : ''} ${(l.classificacao === 'quente' && l.status !== 'ganho') ? 'quente' : ''}">
        ${l.status === 'ganho' ? `<div class="faixa-ouro"><span class="brilho"></span>${I.trofeu}<b>Cliente fechado</b><span class="ouro-sub">fechado por ${esc(l.responsavel_nome || 'nós')}</span></div>` : ''}
        ${l.interesse === 'sim' && l.status !== 'ganho' ? `<div class="faixa-mdl"><span class="pulso"></span>Levantou a mão para o ${esc(PROG())}</div>` : ''}
        <div class="lead-top" data-act="abrir" data-id="${l.id}">
          <div class="avatar" style="background:${corDe(l.nome)}">${esc(iniciais(l.nome))}</div>
          <div class="lead-main"><h3>${esc(l.nome || '(sem nome)')}</h3><div class="meta">${esc(meta || l.email || '')}</div>
          <div class="meta">${esc(quando)}${S.modo === 'coord' && l.responsavel_nome ? ' · ' + esc(l.responsavel_nome) : ''}</div></div>
          ${S.modo === 'coord' || (S.filtro === 'interesse' && S.view === 'novo') ? `<span class="status-pill st-${l.status}">${STATUS_INFO[l.status] ? STATUS_INFO[l.status].sing : esc(l.status)}</span>` : ''}
        </div>
        <div class="tags">${tagsLead(l)}</div>
        ${rodape}
      </article>`;
  }

  /* -------------------------------------------------------- bottom sheet */
  function abrirSheet({ titulo, corpo, rodape = '', largo = false, onMount }) {
    $sheet.innerHTML = `
      <div class="sheet-bg" data-fechar>
        <div class="sheet ${largo ? 'largo' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
          <div class="grabber"></div>
          <div class="sheet-head"><h2>${esc(titulo)}</h2><button class="x" data-x aria-label="Fechar">${I.x}</button></div>
          <div class="sheet-body">${corpo}</div>
          ${rodape ? `<div class="sheet-foot">${rodape}</div>` : ''}
        </div>
      </div>`;
    document.body.style.overflow = 'hidden';
    const bg = $sheet.firstElementChild;
    bg.addEventListener('click', (ev) => { if (ev.target === bg || ev.target.closest('[data-x]')) fecharSheet(); });
    if (onMount) onMount(bg.querySelector('.sheet'));
    return bg.querySelector('.sheet');
  }
  function fecharSheet() { $sheet.innerHTML = ''; document.body.style.overflow = ''; }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharSheet(); });

  function atualizaLead(novo) {
    if (!novo) return;
    const i = S.leads.findIndex((l) => l.id === novo.id);
    if (i >= 0) S.leads[i] = novo; else S.leads.unshift(novo);
  }

  /* ----------------------------------------------------- WhatsApp */
  const VARIAVEIS = [
    ['{primeiro_nome}', 'Primeiro nome'], ['{nome}', 'Nome completo'], ['{usuario}', 'Nome do concierge'],
    ['{cidade}', 'Cidade'], ['{link_upgrade}', 'Link do upgrade VIP'], ['{link_diagnostico}', 'Link do diagnóstico'],
    ['{valor_upgrade}', 'Valor do upgrade'], ['{data_evento}', 'Data do evento']
  ];
  function textoMensagem(tpl, l) {
    const ev = S.links.evento ? String(S.links.evento).split('-').reverse().join('/') : '';
    return String(tpl || '')
      .replace(/\{primeiro_nome\}/g, primeiroNome(l.nome))
      .replace(/\{nome\}/g, l.nome || '')
      .replace(/\{usuario\}/g, primeiroNome(S.user.nome))
      .replace(/\{cidade\}/g, l.cidade || '')
      .replace(/\{link_upgrade\}/g, S.links.upgrade || '')
      .replace(/\{link_diagnostico\}/g, S.links.diagnostico || '')
      .replace(/\{valor_upgrade\}/g, 'R$ ' + (S.links.upgrade_valor || '50'))
      .replace(/\{data_evento\}/g, ev);
  }

  function abrirWhats(id) {
    const l = S.leads.find((x) => x.id === id);
    if (!l) return;
    const numero = waNumero(l.telefone);
    if (!numero) { toast('Este lead não tem telefone. Edite o lead para incluir.', 'erro'); return; }
    const f = faseDe(l);
    const doTipo = S.mensagens.filter((m) => m.ativo !== 'NAO' && (m.tipo_ingresso === 'todos' || !m.tipo_ingresso || m.tipo_ingresso === (l.tipo_ingresso || 'padrao')));
    const daFase = f ? doTipo.filter((m) => m.fase_id === f.id) : [];
    const outras = doTipo.filter((m) => daFase.indexOf(m) < 0);
    const msgs = daFase.concat(outras);
    let sel = msgs.length ? msgs[0].id : '';
    const opcoes = msgs.map((m, i) => `
      ${i === 0 && daFase.length ? `<div class="label" style="margin:2px 0 6px">Mensagens da fase "${esc(f.nome)}"</div>` : ''}
      ${i === daFase.length && daFase.length && outras.length ? '<div class="label" style="margin:10px 0 6px">Outras mensagens</div>' : ''}
      <label class="msg-opcao ${m.id === sel ? 'on' : ''}" data-msg="${m.id}">
        <b>${esc(m.titulo)}</b><p>${esc(textoMensagem(m.texto, l))}</p></label>`).join('') +
      `<label class="msg-opcao ${sel ? '' : 'on'}" data-msg=""><b>Sem mensagem pronta</b><p>Abre a conversa em branco</p></label>`;
    const novo = l.status === 'novo';
    abrirSheet({
      titulo: novo ? 'Iniciar conversa' : 'Abrir WhatsApp',
      corpo: `
        <div class="det-head"><div class="avatar" style="background:${corDe(l.nome)}">${esc(iniciais(l.nome))}</div>
          <div><h3>${esc(l.nome)}</h3><div class="muted small">${esc(telFmt(l.telefone))}</div></div></div>
        ${novo ? '<p class="small muted" style="margin:0 0 12px">Ao abrir o WhatsApp, este lead passa para as <b>suas tratativas</b>.</p>' : ''}
        <div class="label" style="margin-bottom:8px">Escolha a mensagem</div>
        <div id="wa-opcoes">${opcoes}</div>
        <div class="field" style="margin-top:12px"><label for="wa-texto">Texto que será enviado (pode editar)</label>
          <textarea class="input" id="wa-texto" rows="5">${esc(sel ? textoMensagem(msgs[0].texto, l) : '')}</textarea></div>`,
      rodape: `<button class="btn whats block" id="wa-ir">${I.whats}Abrir WhatsApp</button>`,
      onMount: (sh) => {
        const ta = sh.querySelector('#wa-texto');
        sh.querySelector('#wa-opcoes').addEventListener('click', (ev) => {
          const op = ev.target.closest('.msg-opcao');
          if (!op) return;
          sel = op.dataset.msg;
          sh.querySelectorAll('.msg-opcao').forEach((o) => o.classList.toggle('on', o === op));
          const m = msgs.find((x) => x.id === sel);
          ta.value = m ? textoMensagem(m.texto, l) : '';
        });
        sh.querySelector('#wa-ir').addEventListener('click', (ev) => {
          const texto = ta.value.trim();
          const m = msgs.find((x) => x.id === sel);
          const titulo = m ? m.titulo : '';
          const urlWeb = `https://wa.me/${numero}${texto ? '?text=' + encodeURIComponent(texto) : ''}`;
          const urlApp = `whatsapp://send?phone=${numero}${texto ? '&text=' + encodeURIComponent(texto) : ''}`;
          // Registra a tratativa e abre o WhatsApp no mesmo clique
          // (celulares bloqueiam a abertura se esperarmos a resposta do servidor).
          const reg = api('lead.iniciar', { id: l.id, mensagem: titulo });
          if (novo) {
            // atualização otimista: o lead já aparece nas suas tratativas
            atualizaLead(Object.assign({}, l, { status: 'tratativa', responsavel_id: S.user.id, responsavel_nome: S.user.nome, inicio_tratativa: agoraLocal(), ultima_acao: agoraLocal() }));
          }
          if (ehMobile()) abrirUrl(urlApp);
          else if (!window.open(urlWeb, '_blank')) abrirUrl(urlWeb);
          fecharSheet();
          if (novo) { toast('Tratativa iniciada — lead movido para Tratativas', 'ok'); renderMain(); }
          reg.then((atualizado) => { atualizaLead(atualizado); renderMain(); })
            .catch((e) => {
              toast('ATENÇÃO: ' + e.message + ' Não continue essa conversa.', 'erro');
              carregar(true);
            });
        });
      }
    });
  }

  /* ----------------------------------------------------- detalhe do lead */
  function abrirLead(id) {
    const l = S.leads.find((x) => x.id === id);
    if (!l) return;
    const meu = l.responsavel_id === S.user.id;
    const pode = meu || souCoord();
    const vs = vendasDoLead(l.id);
    const ev = eventosDe(l);
    const st = l.status;

    const acoes = [];
    if (st === 'novo' || pode) acoes.push(`<button class="btn whats ${st === 'novo' ? 'full' : ''}" data-act="wa" data-id="${l.id}">${I.whats}${st === 'novo' ? 'Iniciar conversa' : 'WhatsApp'}</button>`);
    if (pode && st !== 'novo') {
      if (st === 'tratativa') {
        acoes.push(`<button class="btn verde" data-act="ganho" data-id="${l.id}">${I.trofeu}Negócio ganho</button>`);
        acoes.push(`<button class="btn vermelho" data-act="perdido" data-id="${l.id}">${I.xcirc}Negócio perdido</button>`);
      }
      if (st === 'ganho') acoes.push(`<button class="btn verde" data-act="ganho" data-id="${l.id}">${I.mais}Outra venda</button>`);
      if (st !== 'reembolso') acoes.push(`<button class="btn roxo" data-act="reembolso" data-id="${l.id}">${I.volta}Reembolso</button>`);
      if (st !== 'tratativa') acoes.push(`<button class="btn line" data-act="reabrir" data-id="${l.id}">${I.chat}Voltar p/ tratativa</button>`);
    }

    const info = [
      ['Telefone', telFmt(l.telefone)], ['E-mail', l.email || '—'],
      ['Cidade', l.cidade || '—'], ['Empresa', l.empresa || '—'],
      ['Cargo', l.cargo || '—'], ['Faturamento', l.faturamento || '—'],
      ['Status', STATUS_INFO[st] ? STATUS_INFO[st].sing : st], ['Responsável', l.responsavel_nome || '—'],
      ['Entrou em', fmtData(l.criado_em)], ['Origem', ({ hotmart: 'Hotmart', kiwify: 'Kiwify', manual: 'Manual', importacao: 'Importação', interesse: 'Lista de interesse', planilha: 'Planilha' }[l.origem] || l.origem || '—') + (l.criado_por && ['hotmart', 'kiwify'].indexOf(l.origem) < 0 ? ' · ' + l.criado_por : '')],
    ];
    if (l.inicio_tratativa) info.push(['Início tratativa', fmtData(l.inicio_tratativa)]);
    if (l.fechado_em && st !== 'tratativa') info.push(['Fechado em', fmtData(l.fechado_em)]);
    if (l.origem_evento) info.push(['Produto / origem', l.origem_evento, 'full']);
    if (l.transacao) info.push(['Transação' + (l.plataforma ? ' (' + (l.plataforma === 'kiwify' ? 'Kiwify' : 'Hotmart') + ')' : ''), l.transacao]);
    if (l.valor_ingresso) info.push(['Valor ingresso', brl(l.valor_ingresso)]);
    if (l.motivo) info.push(['Motivo', l.motivo, 'full']);
    if (l.obs) info.push(['Observações', l.obs, 'full']);

    let admin = '';
    if (souCoord()) {
      const ops = S.usuarios.filter((u) => u.ativo !== 'NAO').map((u) => `<option value="${u.id}" ${u.id === l.responsavel_id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('');
      admin = `
        <div class="secao">Coordenação</div>
        <div class="row" style="align-items:flex-end;margin-bottom:10px">
          <div class="field" style="margin:0"><label>Responsável</label><select class="input" id="adm-resp"><option value="">— sem responsável —</option>${ops}</select></div>
          <button class="btn navy" style="flex:none" data-act="atribuir" data-id="${l.id}">Atribuir</button>
        </div>
        <div class="row">
          ${st !== 'novo' ? `<button class="btn line sm" data-act="liberar" data-id="${l.id}">Devolver p/ contatos</button>` : ''}
          <button class="btn line sm" style="color:var(--vermelho)" data-act="excluir-lead" data-id="${l.id}">${I.lixo}Excluir lead</button>
        </div>`;
    }

    abrirSheet({
      titulo: 'Lead',
      largo: true,
      corpo: `
        <div class="det-head">
          <div class="avatar lg" style="background:${corDe(l.nome)};width:56px;height:56px;font-size:20px">${esc(iniciais(l.nome))}</div>
          <div style="flex:1;min-width:0"><h3>${esc(l.nome)}</h3><div class="tags" style="margin-top:6px">${tagsLead(l, true)}</div></div>
          ${(st === 'novo' || pode) ? `<button class="btn line sm icon" data-act="editar" data-id="${l.id}" aria-label="Editar">${I.editar}</button>` : ''}
        </div>
        ${!pode && st !== 'novo' ? `<p class="muted small">Este lead está com ${esc(l.responsavel_nome)}.</p>` : ''}
        ${acoes.length ? `<div class="acoes-grid">${acoes.join('')}</div>` : ''}

        ${(pode && st === 'tratativa') || (st === 'tratativa' && souCoord()) ? blocoFase(l) : ''}
        ${pode && st !== 'novo' ? blocoMarcos(l) : ''}

        ${blocoPerfil(l)}

        <div class="info">${info.map(([k, v, c]) => `<div class="${c || ''}"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>

        ${vs.length ? `<div class="secao">Vendas</div>${vs.map((v) => `
          <div class="venda-item ${v.status !== 'ativa' ? 'reemb' : ''}">
            <div class="vt"><b>${esc(v.produto_nome)}</b>${v.status !== 'ativa' ? '<span class="status-pill st-reembolso">Reembolsada</span>' : (pode ? `<button class="btn ghost sm icon" data-act="excluir-venda" data-id="${v.id}" aria-label="Excluir venda">${I.lixo}</button>` : '')}</div>
            <div class="valores"><div><span class="muted small">Entrada</span><b>${brl(v.valor_entrada)}</b></div><div><span class="muted small">Total</span><b>${brl(v.valor_total)}</b></div>${v.parcelas ? `<div><span class="muted small">Parcelas</span><b>${esc(v.parcelas)}</b></div>` : ''}</div>
            <div class="muted small" style="margin-top:6px">${esc([v.forma_pagamento, v.usuario_nome, fmtData(v.data)].filter(Boolean).join(' · '))}${v.produto_fora_lista ? ' · produto fora da lista' : ''}</div>
            ${v.obs ? `<div class="small" style="margin-top:4px">${esc(v.obs)}</div>` : ''}
          </div>`).join('')}` : ''}

        ${l.diagnostico_respostas ? blocoRespostas('Respostas do diagnóstico', l.diagnostico_respostas, l.diagnostico_em) : ''}
        ${l.dados_extra ? blocoRespostas('Dados do cadastro / página de obrigado', l.dados_extra, '') : ''}
        ${l.reuniao_obs ? `<div class="secao">Anotações da reunião</div><div class="cliente-box exmdl">${esc(l.reuniao_obs)}</div>` : ''}

        ${(l.cliente_mdl || l.cliente_ilu) ? `<div class="secao">Relacionamento com a 4blue</div>
          ${(() => { const c = rotuloCliente(l.cliente_mdl, 'MDL'); return c ? `<div class="cliente-box ${c.cls}"><b>Máquina de Lucros — ${c.ativo ? 'cliente ativo' : 'não é mais cliente'}</b>${esc(l.cliente_mdl)}</div>` : ''; })()}
          ${(() => { const c = rotuloCliente(l.cliente_ilu, 'ILU'); return c ? `<div class="cliente-box ${c.cls}"><b>Iluminismo — ${c.ativo ? 'cliente ativo' : 'não é mais cliente'}</b>${esc(l.cliente_ilu)}</div>` : ''; })()}` : ''}

        ${ev.length ? `<div class="secao">Eventos anteriores (${ev.length})</div>
          <div class="card" style="padding:4px 12px;box-shadow:none;border:1.5px solid var(--borda)">${ev.map((e) => `
            <div class="evento-linha"><div><b>${esc(e.e)}</b> <span class="muted small">${esc(e.t)}</span>${e.c ? `<div class="small" style="color:#0B7A3B">Comprou: ${esc(e.c)}</div>` : ''}</div>
            <div class="nowrap">${/sim/i.test(e.f) ? '<span class="tag ok">Foi</span>' : e.f ? `<span class="tag">${esc(e.f)}</span>` : '<span class="tag">—</span>'}</div></div>`).join('')}</div>` : ''}

        ${admin}

        <div class="secao">Anotações e histórico</div>
        <div class="row" style="margin-bottom:8px">
          <input class="input" id="nota-txt" placeholder="Escreva uma anotação…">
          <button class="btn navy" style="flex:none" data-act="nota" data-id="${l.id}">Salvar</button>
        </div>
        <div id="hist"><div class="muted small">Carregando histórico…</div></div>`,
      onMount: (sh) => {
        sh.addEventListener('click', acoesGlobais);
        carregarHistorico(l.id, sh);
      }
    });
  }

  /** Perfil comercial do lead + por que ele tem esse ranking. */
  function blocoPerfil(l) {
    const cl = classifDe(l);
    const campos = [
      ['Cargo', l.cargo], ['Empresa', l.empresa], ['Ramo', l.ramo],
      ['Faturamento', l.faturamento], ['Funcionários', l.funcionarios],
      ['Estado', l.estado], ['Conhece a 4blue', l.conhece_4blue], ['Programa 4blue', l.programa_4blue]
    ].filter(([, v]) => v);
    if (!cl && !campos.length) return '';
    const motivos = String(l.score_motivos || '').split(' · ').filter(Boolean);
    const compras = String(l.compras || '').split('\n').filter(Boolean).map((x) => {
      const p2 = x.split('|');
      return `${p2[1] || p2[0]}${p2[2] ? ' · ' + (p2[2] === 'vip' ? 'VIP' : 'Padrão') : ''}${num(p2[3]) ? ' · ' + brl(p2[3]) : ''}${p2[6] ? ' · ' + (p2[6] === 'kiwify' ? 'Kiwify' : 'Hotmart') : ''}`;
    });
    return `
      <div class="secao">Perfil e ranking</div>
      ${cl ? `<div class="rank-box ${cl.cls}">
        <div class="rank-top"><span class="rank-ico">${cl.ico}</span>
          <div><b>${cl.rot}</b><div class="small muted">${esc(cl.ajuda)}</div></div>
          <span class="rank-pts">${l.score}</span></div>
        ${motivos.length ? `<details class="rank-por"><summary>Por que esse ranking</summary>
          <ul>${motivos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></details>` : ''}
      </div>` : ''}
      ${campos.length ? `<div class="info">${campos.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
      ${l.desafio ? `<div class="cliente-box exmdl" style="margin-top:8px"><span class="small muted">Principal desafio</span><div>${esc(l.desafio)}</div></div>` : ''}
      ${compras.length > 1 ? `<div class="cliente-box exmdl" style="margin-top:8px"><span class="small muted">Compras desta pessoa</span>${compras.map((c) => `<div>• ${esc(c)}</div>`).join('')}</div>` : ''}`;
  }

  function blocoFase(l) {
    const f = faseDe(l);
    return `
      <div class="secao">Fase do funil</div>
      <div class="card" style="box-shadow:none;border:1.5px solid var(--borda);border-left:4px solid ${f ? esc(f.cor) : 'var(--borda)'};padding:12px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:10px"><b style="flex:1">${f ? esc(f.nome) : 'Sem fase definida'}</b>
          <button class="btn line sm" data-act="fase" data-id="${l.id}">${I.seta}Mover</button></div>
        ${f && f.instrucoes ? `<ul class="inst">${String(f.instrucoes).split('\n').filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${f && f.fase_em ? '' : ''}
      </div>`;
  }

  function blocoMarcos(l) {
    const linhas = marcosDoSistema().map((k) => {
      const info = MARCOS_INFO[k];
      const v = info.vals[l[k]];
      return `<button class="marco ${v ? 'on' : ''}" data-act="marco" data-id="${l.id}" data-campo="${k}">
        <span class="mk-ic">${v ? I.check : I.mais}</span>
        <span class="mk-txt"><b>${info.rot}</b><span>${v ? esc(v[0]) + (l[k + '_em'] ? ' · ' + fmtData(l[k + '_em'], false) : '') : 'marcar'}</span></span></button>`;
    }).join('');
    const links = [];
    if (S.links.upgrade && marcosDoSistema().indexOf('upgrade') >= 0) links.push(`<button class="btn line sm wrap" data-act="copiar-upgrade">${I.copiar}Copiar link do upgrade VIP (R$ ${esc(S.links.upgrade_valor || '50')})</button>`);
    if (S.links.diagnostico) links.push(`<button class="btn line sm wrap" data-act="copiar-diag">${I.copiar}Copiar link do diagnóstico</button>`);
    return `<div class="secao">Marcos do lead</div><div class="marcos">${linhas}</div>
      ${links.length ? `<div class="links-marco">${links.join('')}</div>` : ''}`;
  }

  function blocoRespostas(titulo, json, quando) {
    let o;
    try { o = JSON.parse(json); } catch (e) { return ''; }
    if (!o || typeof o !== 'object') return '';
    const itens = Object.keys(o).filter((k) => String(o[k]).trim());
    if (!itens.length) return '';
    return `<div class="secao">${esc(titulo)}${quando ? ' · ' + fmtData(quando) : ''}</div>
      <div class="info">${itens.map((k) => `<div class="full"><span>${esc(k)}</span><b>${esc(o[k])}</b></div>`).join('')}</div>`;
  }

  const ROT_ACAO = {
    criado: 'Lead criado', editado: 'Lead editado', tratativa_iniciada: 'Tratativa iniciada', whatsapp: 'WhatsApp aberto',
    ganho: 'Negócio ganho', perdido: 'Negócio perdido', reembolso: 'Reembolso', reaberto: 'Reaberto', nota: 'Anotação',
    atribuido: 'Atribuído', liberado: 'Devolvido', venda_excluida: 'Venda excluída', importacao: 'Importação', excluido: 'Excluído',
    fase: 'Mudou de fase', marco: 'Marco', distribuicao: 'Distribuição de leads'
  };

  async function carregarHistorico(id, sh) {
    const box = sh.querySelector('#hist');
    try {
      const h = await api('lead.historico', { id });
      if (!box.isConnected) return;
      box.innerHTML = h.length ? h.map((x) => `
        <div class="hist-item ${x.acao === 'nota' ? 'nota' : ''}">
          <div><b>${esc(ROT_ACAO[x.acao] || x.acao)}</b>${x.detalhe ? ' — ' + esc(x.detalhe) : ''}</div>
          <div class="q">${esc(x.usuario_nome)} · ${fmtData(x.data)}</div></div>`).join('') : '<div class="muted small">Sem registros.</div>';
    } catch (e) { if (box.isConnected) box.innerHTML = `<div class="muted small">${esc(e.message)}</div>`; }
  }

  /* ----------------------------------------------------- formulários de lead */
  function abrirFormLead(id) {
    const l = id ? S.leads.find((x) => x.id === id) : { tipo_ingresso: 'padrao' };
    if (!l) return;
    let tipo = l.tipo_ingresso === 'vip' ? 'vip' : 'padrao';
    const campo = (k, rot, attrs = '') => `<div class="field"><label>${rot}</label><input class="input" name="${k}" value="${esc(l[k] || '')}" ${attrs}></div>`;
    abrirSheet({
      titulo: id ? 'Editar lead' : 'Novo lead',
      corpo: `
        <form id="f-lead" autocomplete="off">
          ${campo('nome', 'Nome *', 'required')}
          <div class="row">${campo('telefone', 'WhatsApp', 'inputmode="tel" placeholder="(11) 99999-9999"')}${campo('email', 'E-mail', 'type="email" inputmode="email"')}</div>
          <div class="field ${usaVip() ? '' : 'hidden'}"><label>Ingresso</label>
            <div class="seg" id="seg-tipo"><button type="button" data-v="padrao" class="${tipo === 'padrao' ? 'on' : ''}">Padrão</button><button type="button" data-v="vip" class="${tipo === 'vip' ? 'on' : ''}">VIP</button></div></div>
          <div class="row">${campo('cidade', 'Cidade')}${campo('empresa', 'Empresa')}</div>
          <div class="row">${campo('cargo', 'Cargo')}${campo('faturamento', 'Faturamento')}</div>
          <div class="field"><label>Observações</label><textarea class="input" name="obs" rows="3">${esc(l.obs || '')}</textarea></div>
          ${!id ? `<label class="check"><input type="checkbox" name="assumir"><span>Já vou atender este lead (vai direto para <b>minhas tratativas</b>)</span></label>` : ''}
        </form>`,
      rodape: `<button class="btn line" data-x>Cancelar</button><button class="btn amarelo" id="salvar-lead" data-loading=" Salvando...">Salvar</button>`,
      onMount: (sh) => {
        sh.querySelector('#seg-tipo').addEventListener('click', (ev) => {
          const b = ev.target.closest('button'); if (!b) return;
          tipo = b.dataset.v;
          sh.querySelectorAll('#seg-tipo button').forEach((x) => x.classList.toggle('on', x === b));
        });
        sh.querySelector('#salvar-lead').addEventListener('click', (ev) => {
          const f = sh.querySelector('#f-lead');
          const dados = { tipo_ingresso: tipo };
          ['nome', 'telefone', 'email', 'cidade', 'empresa', 'cargo', 'faturamento', 'obs'].forEach((k) => { dados[k] = f.elements[k].value.trim(); });
          if (!id) dados.assumir = f.elements.assumir && f.elements.assumir.checked;
          comBotao(ev.currentTarget, async () => {
            if (!dados.nome) throw new Error('Informe o nome.');
            const r = await api(id ? 'lead.editar' : 'lead.criar', { id, lead: dados });
            atualizaLead(r);
            toast(id ? 'Lead atualizado' : 'Lead cadastrado', 'ok');
            if (id) abrirLead(id); else fecharSheet();
            renderMain();
          });
        });
      }
    });
  }

  function abrirFase(id) {
    const l = S.leads.find((x) => x.id === id);
    if (!l) return;
    const fases = fasesAtivas();
    abrirSheet({
      titulo: 'Mover de fase',
      corpo: `
        <p class="muted small" style="margin:0 0 12px">${esc(l.nome)}</p>
        ${fases.map((f) => `
          <button class="fase-opcao ${f.id === l.fase_id ? 'on' : ''}" data-fase="${f.id}" style="border-left-color:${esc(f.cor)}">
            <b>${esc(f.nome)}</b>${f.id === l.fase_id ? '<span class="tag ok">Fase atual</span>' : ''}
            ${f.instrucoes ? `<ul>${String(f.instrucoes).split('\n').filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          </button>`).join('') || '<p class="muted">Nenhuma fase cadastrada. O coordenador cria as fases em Produtos e msgs.</p>'}`,
      onMount: (sh) => {
        sh.querySelectorAll('[data-fase]').forEach((b) => b.addEventListener('click', (ev) => comBotao(ev.currentTarget, async () => {
          atualizaLead(await api('lead.fase', { id, fase_id: b.dataset.fase }));
          fecharSheet();
          toast('Lead movido de fase', 'ok');
          renderMain();
        })));
      }
    });
  }

  function abrirMarco(id, campo) {
    const l = S.leads.find((x) => x.id === id);
    if (!l) return;
    const info = MARCOS_INFO[campo];
    const opcoes = Object.keys(info.vals);
    const ehReuniao = campo === 'reuniao';
    abrirSheet({
      titulo: info.rot,
      corpo: `
        <p class="muted small" style="margin:0 0 12px">${esc(l.nome)}</p>
        <div class="motivos">${opcoes.map((v) => `<button class="chip ${l[campo] === v ? 'on' : ''}" data-v="${v}">${esc(info.vals[v][0])}</button>`).join('')}
          ${l[campo] ? '<button class="chip" data-v="">Limpar</button>' : ''}</div>
        ${ehReuniao ? `<div class="field"><label>Anotações da reunião</label><textarea class="input" id="mk-obs" rows="3">${esc(l.reuniao_obs || '')}</textarea></div>` : ''}
        ${campo === 'upgrade' && S.links.upgrade ? `<div class="secao">Link do upgrade (R$ ${esc(S.links.upgrade_valor || '50')})</div>
          <div class="copiar"><input class="input" readonly value="${esc(S.links.upgrade)}" id="mk-link"><button class="btn navy" data-copiar="mk-link">${I.copiar}</button></div>` : ''}
        ${campo === 'diagnostico' && S.links.diagnostico ? `<div class="secao">Link do diagnóstico</div>
          <div class="copiar"><input class="input" readonly value="${esc(S.links.diagnostico)}" id="mk-link2"><button class="btn navy" data-copiar="mk-link2">${I.copiar}</button></div>` : ''}`,
      onMount: (sh) => {
        sh.querySelectorAll('[data-copiar]').forEach((b) => b.addEventListener('click', () => copiarTexto(sh.querySelector('#' + b.dataset.copiar).value)));
        sh.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', (ev) => comBotao(ev.currentTarget, async () => {
          const obs = sh.querySelector('#mk-obs');
          atualizaLead(await api('lead.marco', { id, campo, valor: b.dataset.v, obs: obs ? obs.value : undefined }));
          fecharSheet();
          toast(info.rot + ' atualizado', 'ok');
          renderMain();
        })));
      }
    });
  }

  function copiarTexto(txt) {
    const fim = () => toast('Copiado!', 'ok');
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(fim).catch(() => fim());
    else {
      const ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) { /* ignora */ }
      ta.remove(); fim();
    }
  }

  function abrirGanho(id) {
    const l = S.leads.find((x) => x.id === id);
    if (!l) return;
    const prods = S.produtos.filter((p) => p.ativo !== 'NAO');
    const ops = prods.map((p) => `<option value="${p.id}">${esc(p.nome)} — ${brl(p.valor_total)}${num(p.valor_entrada) ? ' (entrada ' + brl(p.valor_entrada) + ')' : ''}</option>`).join('');
    abrirSheet({
      titulo: 'Negócio ganho',
      corpo: `
        <p class="muted small" style="margin:0 0 12px">${esc(l.nome)}</p>
        <div class="field"><label>Produto vendido</label>
          <select class="input" id="g-prod"><option value="">Selecione…</option>${ops}<option value="__novo">+ Produto não listado</option></select></div>
        <div id="g-novo" class="hidden">
          <div class="field"><label>Nome do produto</label><input class="input" id="g-nome" placeholder="Ex.: Mentoria individual"></div>
        </div>
        <div class="row">
          <div class="field"><label>Valor da entrada</label><input class="input" id="g-entrada" inputmode="decimal" placeholder="0,00"></div>
          <div class="field"><label>Valor total da venda *</label><input class="input" id="g-total" inputmode="decimal" placeholder="0,00"></div>
        </div>
        <p class="hint">Sem entrada? Deixe em branco. Pagamento à vista: entrada = total.</p>
        <div class="row">
          <div class="field"><label>Parcelas</label><input class="input" id="g-parc" placeholder="Ex.: 12x"></div>
          <div class="field"><label>Pagamento</label><select class="input" id="g-forma"><option value="">—</option>${FORMAS.map((f) => `<option>${f}</option>`).join('')}</select></div>
        </div>
        <div class="total-box"><div><span>Entrada</span><b id="g-v-ent">R$ 0,00</b></div><div style="text-align:right"><span>Total da venda</span><b id="g-v-tot">R$ 0,00</b></div></div>
        <div class="field"><label>Observação</label><textarea class="input" id="g-obs" rows="2"></textarea></div>`,
      rodape: `<button class="btn line" data-x>Cancelar</button><button class="btn verde" id="g-salvar" data-loading=" Salvando...">${I.check}Confirmar venda</button>`,
      onMount: (sh) => {
        const $ = (s) => sh.querySelector(s);
        const atualizaTot = () => { $('#g-v-ent').textContent = brl($('#g-entrada').value); $('#g-v-tot').textContent = brl($('#g-total').value); };
        const fmt = (v) => (num(v) ? num(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
        $('#g-prod').addEventListener('change', (e) => {
          const v = e.target.value;
          $('#g-novo').classList.toggle('hidden', v !== '__novo');
          const p = prods.find((x) => x.id === v);
          if (p) { $('#g-entrada').value = fmt(p.valor_entrada); $('#g-total').value = fmt(p.valor_total); $('#g-parc').value = p.parcelas || ''; }
          else if (v === '__novo') { $('#g-nome').focus(); }
          atualizaTot();
        });
        ['#g-entrada', '#g-total'].forEach((s) => $(s).addEventListener('input', atualizaTot));
        $('#g-salvar').addEventListener('click', (ev) => {
          const pv = $('#g-prod').value;
          comBotao(ev.currentTarget, async () => {
            if (!pv) throw new Error('Selecione o produto vendido.');
            if (pv === '__novo' && !$('#g-nome').value.trim()) throw new Error('Informe o nome do produto.');
            if (!(num($('#g-total').value) > 0)) throw new Error('Informe o valor total da venda.');
            if (num($('#g-entrada').value) > num($('#g-total').value)) throw new Error('A entrada não pode ser maior que o total.');
            const venda = {
              produto_id: pv === '__novo' ? '' : pv, produto_nome: pv === '__novo' ? $('#g-nome').value.trim() : '',
              valor_entrada: num($('#g-entrada').value), valor_total: num($('#g-total').value),
              parcelas: $('#g-parc').value.trim(), forma_pagamento: $('#g-forma').value, obs: $('#g-obs').value.trim()
            };
            const r = await api('lead.ganho', { id, venda });
            atualizaLead(r.lead);
            S.vendas.push(r.venda);
            if (r.produto && !S.produtos.some((p) => p.id === r.produto.id)) S.produtos.push(r.produto);
            fecharSheet();
            toast('Negócio ganho registrado!', 'ok');
            renderMain();
          });
        });
      }
    });
  }

  function abrirMotivo(id, tipo) {
    const l = S.leads.find((x) => x.id === id);
    if (!l) return;
    const perdido = tipo === 'perdido';
    const temVendas = vendasDoLead(id).some((v) => v.status === 'ativa');
    abrirSheet({
      titulo: perdido ? 'Negócio perdido' : 'Reembolso',
      corpo: `
        <p class="muted small" style="margin:0 0 12px">${esc(l.nome)}</p>
        ${perdido ? `<div class="label" style="margin-bottom:8px">Motivo rápido</div><div class="motivos">${MOTIVOS_PERDA.map((m) => `<button class="chip" data-m="${esc(m)}">${esc(m)}</button>`).join('')}</div>` : ''}
        <div class="field"><label>${perdido ? 'Motivo / detalhes *' : 'Motivo do reembolso *'}</label><textarea class="input" id="m-txt" rows="3"></textarea></div>
        ${!perdido && temVendas ? '<label class="check"><input type="checkbox" id="m-vendas" checked><span>Marcar as vendas deste lead como reembolsadas (saem da receita)</span></label>' : ''}`,
      rodape: `<button class="btn line" data-x>Cancelar</button><button class="btn ${perdido ? 'vermelho' : 'roxo'}" id="m-ok" data-loading=" Salvando...">Confirmar</button>`,
      onMount: (sh) => {
        const ta = sh.querySelector('#m-txt');
        sh.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
          sh.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x === b));
          ta.value = b.dataset.m + (ta.value && !MOTIVOS_PERDA.includes(ta.value) ? ' — ' + ta.value : '');
        }));
        sh.querySelector('#m-ok').addEventListener('click', (ev) => comBotao(ev.currentTarget, async () => {
          const motivo = ta.value.trim();
          if (!motivo) throw new Error('Informe o motivo.');
          const cb = sh.querySelector('#m-vendas');
          const r = await api(perdido ? 'lead.perdido' : 'lead.reembolso', { id, motivo, reembolsar_vendas: cb ? cb.checked : false });
          atualizaLead(r);
          if (!perdido && cb && cb.checked) S.vendas.forEach((v) => { if (v.lead_id === id && v.status === 'ativa') v.status = 'reembolsada'; });
          fecharSheet();
          toast(perdido ? 'Movido para Negócio perdido' : 'Movido para Reembolso', 'ok');
          renderMain();
        }));
      }
    });
  }

  /* ----------------------------------------------------------- perfil */
  function abrirPerfil() {
    const u = S.user;
    let foto = u.foto || '';
    abrirSheet({
      titulo: 'Meu perfil',
      corpo: `
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:16px">
          <div id="p-av">${avatarHtml(Object.assign({}, u, { foto }), 'lg')}</div>
          <div class="row" style="width:auto">
            <label class="btn line sm">${I.upload}Trocar foto<input type="file" accept="image/*" id="p-foto" class="hidden"></label>
            <button class="btn ghost sm" id="p-rem">Remover</button>
          </div>
        </div>
        <div class="field"><label>Nome</label><input class="input" id="p-nome" value="${esc(u.nome)}"></div>
        <div class="field"><label>E-mail</label><input class="input" value="${esc(u.email)}" readonly></div>
        <p class="hint">E-mail e senha só podem ser alterados pelo coordenador.</p>
        <div class="field"><label>Perfil</label><input class="input" value="${u.perfil === 'coordenador' ? 'Coordenador' : 'Usuário'}" readonly></div>
        <button class="btn line block" id="p-sair" style="color:var(--vermelho);margin-top:6px">${I.sair}Sair</button>`,
      rodape: `<button class="btn line" data-x>Fechar</button><button class="btn amarelo" id="p-salvar" data-loading=" Salvando...">Salvar</button>`,
      onMount: (sh) => {
        const pintar = () => { sh.querySelector('#p-av').innerHTML = avatarHtml(Object.assign({}, u, { foto }), 'lg'); };
        sh.querySelector('#p-foto').addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          try { foto = await reduzirImagem(file, 200); pintar(); } catch (err) { toast('Não foi possível ler a imagem.', 'erro'); }
        });
        sh.querySelector('#p-rem').addEventListener('click', () => { foto = ''; pintar(); });
        sh.querySelector('#p-sair').addEventListener('click', () => { api('logout').catch(() => {}); sairLocal(); });
        sh.querySelector('#p-salvar').addEventListener('click', (ev) => comBotao(ev.currentTarget, async () => {
          const r = await api('perfil.salvar', { nome: sh.querySelector('#p-nome').value, foto });
          S.user = r;
          const iu = S.usuarios.findIndex((x) => x.id === r.id);
          if (iu >= 0) S.usuarios[iu] = r;
          S.leads.forEach((l) => { if (l.responsavel_id === r.id) l.responsavel_nome = r.nome; });
          store.set('lw_sessao', { token: S.token, user: S.user, modo: S.modo, view: S.view });
          fecharSheet();
          toast('Perfil atualizado', 'ok');
          renderMain();
        }));
      }
    });
  }

  function reduzirImagem(file, lado) {
    return new Promise((ok, erro) => {
      const fr = new FileReader();
      fr.onerror = erro;
      fr.onload = () => {
        const img = new Image();
        img.onerror = erro;
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = lado; c.height = lado;
          const ctx = c.getContext('2d');
          const s = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, lado, lado);
          let q = 0.85, out = c.toDataURL('image/jpeg', q);
          while (out.length > 40000 && q > 0.3) { q -= 0.15; out = c.toDataURL('image/jpeg', q); }
          ok(out);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ======================================================= COORDENADOR */
  function statsDe(leads, vendas) {
    const c = { total: leads.length, novo: 0, tratativa: 0, ganho: 0, perdido: 0, reembolso: 0 };
    leads.forEach((l) => { if (c[l.status] !== undefined) c[l.status]++; });
    const ativas = vendas.filter((v) => v.status === 'ativa');
    c.receita = ativas.reduce((s, v) => s + num(v.valor_total), 0);
    c.entradas = ativas.reduce((s, v) => s + num(v.valor_entrada), 0);
    c.nVendas = ativas.length;
    c.trabalhados = c.total - c.novo;
    c.fechados = c.ganho + c.perdido + c.reembolso;
    c.conv = c.trabalhados ? c.ganho / c.trabalhados : 0;
    return c;
  }

  function barra(rot, valor, max, dir, cor, sec) {
    const w = max ? Math.max(0, Math.min(100, (valor / max) * 100)) : 0;
    const w2 = sec && max ? Math.max(0, Math.min(100, (sec / max) * 100)) : 0;
    return `<div class="barra"><div class="barra-top"><span>${rot}</span><span class="num nowrap">${dir}</span></div>
      <div class="barra-track"><div class="barra-fill" style="width:${w}%;${cor ? 'background:' + cor : ''}"></div>${w2 ? `<div class="barra-fill sec" style="width:${w2}%"></div>` : ''}</div></div>`;
  }

  function viewPainel() {
    const P = S.painel;
    let leads = S.leads, vendas = S.vendas;
    if (P.resp !== 'todos') { leads = leads.filter((l) => l.responsavel_id === P.resp); vendas = vendas.filter((v) => v.usuario_id === P.resp); }
    if (P.origem !== 'todos') {
      leads = leads.filter((l) => (l.origem_evento || '(sem origem)') === P.origem);
      const ids0 = new Set(leads.map((l) => l.id));
      vendas = vendas.filter((v) => ids0.has(v.lead_id));
    }
    if (P.tipo !== 'todos') {
      leads = leads.filter((l) => (l.tipo_ingresso === 'vip' ? 'vip' : 'padrao') === P.tipo);
      const ids = new Set(leads.map((l) => l.id));
      vendas = vendas.filter((v) => ids.has(v.lead_id));
    }
    const c = statsDe(leads, vendas);
    const parados = leads.filter((l) => l.status === 'tratativa' && horasDesde(l.ultima_acao || l.inicio_tratativa) > 48);

    // equipe
    const equipe = S.usuarios.filter((u) => u.ativo !== 'NAO' || S.leads.some((l) => l.responsavel_id === u.id)).map((u) => {
      const ls = S.leads.filter((l) => l.responsavel_id === u.id);
      const s = statsDe(ls, S.vendas.filter((v) => v.usuario_id === u.id));
      const ult = ls.map((l) => l.ultima_acao || l.inicio_tratativa || '').sort().pop();
      s.parados = ls.filter((l) => l.status === 'tratativa' && horasDesde(l.ultima_acao || l.inicio_tratativa) > 48).length;
      return { u, s, ult };
    }).filter((x) => x.s.total || x.u.perfil !== 'coordenador').sort((a, b) => b.s.receita - a.s.receita || b.s.ganho - a.s.ganho);

    // produtos
    const porProd = {};
    vendas.filter((v) => v.status === 'ativa').forEach((v) => {
      const k = v.produto_nome || '—';
      porProd[k] = porProd[k] || { n: 0, total: 0, ent: 0 };
      porProd[k].n++; porProd[k].total += num(v.valor_total); porProd[k].ent += num(v.valor_entrada);
    });
    const prods = Object.entries(porProd).sort((a, b) => b[1].total - a[1].total);
    const maxProd = prods.length ? prods[0][1].total : 0;

    // padrão x vip
    const tipos = ['padrao', 'vip'].map((t) => {
      const ls = S.leads.filter((l) => (l.tipo_ingresso === 'vip' ? 'vip' : 'padrao') === t && (P.resp === 'todos' || l.responsavel_id === P.resp));
      const ids = new Set(ls.map((l) => l.id));
      return { t, s: statsDe(ls, S.vendas.filter((v) => ids.has(v.lead_id))) };
    });

    // base de clientes
    const seg = [
      ['Cliente MDL ativo', leads.filter(ehMdlAtivo)],
      ['Ex-cliente MDL', leads.filter((l) => l.cliente_mdl && !ehMdlAtivo(l))],
      ['Base Iluminismo', leads.filter((l) => l.cliente_ilu)],
      ['Já foi a eventos', leads.filter((l) => eventosDe(l).length)],
      ['Sem histórico', leads.filter((l) => !ehCliente(l) && !eventosDe(l).length)]
    ];

    // últimos 14 dias
    const dias = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); dias.push(d); }
    const chave = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const cont = (arr, campo) => { const m = {}; arr.forEach((x) => { const k = String(x[campo] || '').slice(0, 10); if (k) m[k] = (m[k] || 0) + 1; }); return m; };
    const mEntr = cont(leads, 'criado_em'), mTrat = cont(leads, 'inicio_tratativa'), mVend = cont(vendas.filter((v) => v.status === 'ativa'), 'data');
    const serie = dias.map((d) => ({ d, e: mEntr[chave(d)] || 0, t: mTrat[chave(d)] || 0, v: mVend[chave(d)] || 0 }));
    const maxS = Math.max(1, ...serie.map((x) => Math.max(x.e, x.t + x.v)));

    const opsResp = S.usuarios.map((u) => `<option value="${u.id}" ${P.resp === u.id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('');
    const funil = ['novo', 'tratativa', 'ganho', 'perdido', 'reembolso'];

    return `
      <div class="page-head"><h2>Painel</h2></div>
      <div class="filtros-linha">
        <select class="input" data-painel="resp"><option value="todos">Toda a equipe</option>${opsResp}</select>
        <select class="input" data-painel="origem"><option value="todos">Todas as origens</option>${origensLeads().map((o) => `<option value="${esc(o)}" ${P.origem === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
        ${usaVip() ? `<select class="input" data-painel="tipo"><option value="todos" ${P.tipo === 'todos' ? 'selected' : ''}>Padrão + VIP</option><option value="padrao" ${P.tipo === 'padrao' ? 'selected' : ''}>Só Padrão</option><option value="vip" ${P.tipo === 'vip' ? 'selected' : ''}>Só VIP</option></select>` : ''}
      </div>
      <div class="kpis">
        <div class="card kpi destaque span2"><div class="k-lbl">Receita total vendida</div><div class="k-val">${brl(c.receita)}</div><div class="k-sub">Entradas: <b style="color:#fff">${brl(c.entradas)}</b> · ${c.nVendas} venda${c.nVendas === 1 ? '' : 's'} · ticket médio ${brl(c.nVendas ? c.receita / c.nVendas : 0)}</div></div>
        <div class="card kpi"><div class="k-lbl">Conversão</div><div class="k-val">${pct(c.ganho, c.trabalhados)}</div><div class="k-sub">ganhos / leads trabalhados</div></div>
        <div class="card kpi"><div class="k-lbl">Leads</div><div class="k-val">${c.total}</div><div class="k-sub">${c.novo} sem responsável</div></div>
        <div class="card kpi"><div class="k-lbl">Em tratativa</div><div class="k-val">${c.tratativa}</div><div class="k-sub" style="${parados.length ? 'color:var(--vermelho)' : ''}">${parados.length} parados +48h</div></div>
        <div class="card kpi"><div class="k-lbl">Negócios ganhos</div><div class="k-val" style="color:var(--verde)">${c.ganho}</div><div class="k-sub">${pct(c.ganho, c.fechados)} dos fechados</div></div>
        <div class="card kpi"><div class="k-lbl">Perdidos</div><div class="k-val" style="color:var(--vermelho)">${c.perdido}</div><div class="k-sub">&nbsp;</div></div>
        <div class="card kpi"><div class="k-lbl">Reembolsos</div><div class="k-val" style="color:var(--roxo)">${c.reembolso}</div><div class="k-sub">${S.vendas.filter((v) => v.status !== 'ativa').length} vendas reembolsadas</div></div>
      </div>

      <div class="grid-painel">
        <section class="card bloco full">
          <h3>Desempenho da equipe <span class="muted">${equipe.length} pessoas</span></h3>
          <div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Usuário</th><th class="r">Tratativas</th><th class="r">Ganhos</th><th class="r">Perdidos</th><th class="r">Reemb.</th><th class="r">Conversão</th><th class="r">Entradas</th><th class="r">Total vendido</th><th>Última ação</th></tr></thead>
            <tbody>${equipe.map(({ u, s, ult }) => `<tr>
              <td><div class="pessoa">${avatarHtml(u, 'sm')}<div><b>${esc(u.nome)}</b>${s.parados ? `<span class="tag alerta">${s.parados} parados</span>` : ''}</div></div></td>
              <td class="r num">${s.tratativa}</td><td class="r num" style="color:var(--verde);font-weight:700">${s.ganho}</td>
              <td class="r num">${s.perdido}</td><td class="r num">${s.reembolso}</td><td class="r num">${pct(s.ganho, s.trabalhados)}</td>
              <td class="r num">${brl(s.entradas)}</td><td class="r num"><b>${brl(s.receita)}</b></td>
              <td class="nowrap muted">${ult ? rel(ult) : '—'}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Cadastre usuários na aba Equipe.</td></tr>'}</tbody>
          </table></div>
        </section>

        <section class="card bloco">
          <h3>Funil de leads</h3>
          ${funil.map((st) => barra(STATUS_INFO[st].sing, c[st], c.total, `${c[st]} · ${pct(c[st], c.total)}`, STATUS_INFO[st].cor)).join('')}
        </section>

        <section class="card bloco">
          <h3>Funil por fase <span class="muted">leads em tratativa</span></h3>
          ${(() => {
            const emTrat = leads.filter((l) => l.status === 'tratativa');
            const fs = fasesAtivas();
            const semFase = emTrat.filter((l) => !l.fase_id).length;
            const maxF = Math.max(1, ...fs.map((f) => emTrat.filter((l) => l.fase_id === f.id).length), semFase);
            return fs.map((f) => {
              const n = emTrat.filter((l) => l.fase_id === f.id).length;
              const parados = emTrat.filter((l) => l.fase_id === f.id && horasDesde(l.ultima_acao || l.inicio_tratativa) > 48).length;
              return barra(esc(f.nome), n, maxF, n + (parados ? ` · <span style="color:var(--vermelho)">${parados} parados</span>` : ''), f.cor);
            }).join('') + (semFase ? barra('Sem fase', semFase, maxF, String(semFase), '#C7D0DB') : '')
              + (fs.length ? '' : '<p class="muted small">Cadastre as fases em Produtos e msgs.</p>');
          })()}
        </section>

        <section class="card bloco">
          <h3>Marcos da jornada</h3>
          ${(() => {
            const total = leads.length || 1;
            const todos = {
              boas_vindas: [['Responderam as boas-vindas', 'respondeu', '#0369B1'], ['Sem resposta nas boas-vindas', 'sem_resposta', '#C7D0DB']],
              acesso: [['Acessaram o produto', 'sim', '#0B7A9E']],
              confirmado: [['Confirmaram presença', 'sim', '#F8B90C']],
              upgrade: [['Fizeram upgrade VIP', 'feito', '#7A4CC2'], ['Link do upgrade enviado', 'enviado', '#B39DDB']],
              interesse: [['Levantaram a mão para o ' + PROG(), 'sim', '#E0531F']],
              diagnostico: [['Diagnóstico respondido', 'feito', '#0B7A9E']],
              reuniao: [['Reunião realizada', 'feita', '#C2410C']],
              checkin: [['Participaram do evento', 'sim', '#12A150']],
              presentes: [['Baixaram os presentes', 'sim', '#0B7A9E']]
            };
            const itens = [];
            marcosDoSistema().forEach((k) => (todos[k] || []).forEach(([rot, val, cor]) => itens.push([rot, leads.filter((l) => l[k] === val).length, cor])));
            return itens.map(([r, n, cor]) => barra(r, n, total, `${n} · ${pct(n, total)}`, cor)).join('');
          })()}
        </section>

        <section class="card bloco">
          <h3>Ranking dos leads</h3>
          <p class="small muted" style="margin-top:-6px">Mesma leitura da planilha do comercial: cargo, porte da empresa, relação com a 4blue e o que a pessoa fez na campanha.</p>
          ${(() => {
            const tot = leads.length || 1;
            return Object.entries(CLASSIF).sort((a, b) => b[1].ordem - a[1].ordem).map(([k, v]) => {
              const n = leads.filter((l) => l.classificacao === k).length;
              const cor = { quente: '#D93025', mql_mais: '#E08A00', mql: '#12A150', viavel: '#0369B1', baixo: '#8A939B', fora: '#C7D0DB' }[k];
              return barra(v.ico + ' ' + v.rot, n, tot, `${n} · ${pct(n, tot)}`, cor);
            }).join('');
          })()}
          <div class="secao">Quem vale o contato agora</div>
          ${(() => {
            const donos = leads.filter(ehDono);
            const itens = [
              ['Donos / sócios', donos.length],
              ['Donos com +60mil/mês', donos.filter((l) => fatNum(l) >= 60).length],
              ['Donos com +100mil/mês', donos.filter((l) => fatNum(l) >= 100).length],
              ['Quentes (todos)', leads.filter((l) => l.classificacao === 'quente').length],
              ['Levantaram a mão e participaram', leads.filter((l) => l.interesse === 'sim' && l.checkin === 'sim').length]
            ];
            const mx = Math.max(1, ...itens.map((i) => i[1]));
            return itens.map(([r, n]) => barra(r, n, mx, String(n), '#011527')).join('');
          })()}
        </section>

        <section class="card bloco">
          <h3>Vendas por produto</h3>
          <div class="legenda"><span><i style="background:var(--azul)"></i>Total</span><span><i style="background:var(--amarelo)"></i>Entrada</span></div>
          ${prods.length ? prods.map(([n, p]) => barra(esc(n) + ` <span class="muted">(${p.n})</span>`, p.total - p.ent, maxProd, `${brlCurto(p.ent)} / <b>${brlCurto(p.total)}</b>`, null, p.ent)).join('') : '<p class="muted small">Nenhuma venda ainda.</p>'}
        </section>

        <section class="card bloco">
          <h3>Leads por origem</h3>
          ${(() => {
            const grupos = {};
            (P.origem === 'todos' ? S.leads : leads).forEach((l) => {
              const k = l.origem_evento || '(sem origem)';
              grupos[k] = grupos[k] || { n: 0, ganhos: 0, receita: 0 };
              grupos[k].n++;
              if (l.status === 'ganho') grupos[k].ganhos++;
              S.vendas.filter((v) => v.lead_id === l.id && v.status === 'ativa').forEach((v) => { grupos[k].receita += num(v.valor_total); });
            });
            const lista = Object.entries(grupos).sort((a, b) => b[1].n - a[1].n);
            const max = lista.length ? lista[0][1].n : 1;
            return lista.length ? lista.map(([k, g]) => barra(esc(k), g.n, max, `${g.n} · ${g.ganhos} ganho${g.ganhos === 1 ? '' : 's'} · ${brlCurto(g.receita)}`, '#0369B1')).join('')
              : '<p class="muted small">Sem leads ainda.</p>';
          })()}
        </section>

        ${!usaVip() ? '' : `<section class="card bloco">
          <h3>Padrão x VIP</h3>
          <div class="tabela-wrap"><table class="tabela" style="min-width:0">
            <thead><tr><th></th><th class="r">Leads</th><th class="r">Ganhos</th><th class="r">Conv.</th><th class="r">Vendido</th></tr></thead>
            <tbody>${tipos.map(({ t, s }) => `<tr><td>${t === 'vip' ? `<span class="tag vip">${I.estrela}VIP</span>` : '<span class="tag padrao">Padrão</span>'}</td>
              <td class="r num">${s.total}</td><td class="r num">${s.ganho}</td><td class="r num">${pct(s.ganho, s.trabalhados)}</td><td class="r num"><b>${brlCurto(s.receita)}</b></td></tr>`).join('')}</tbody>
          </table></div>
        </section>`}

        <section class="card bloco">
          <h3>Leads x base de clientes</h3>
          ${seg.map(([n, ls]) => { const g = ls.filter((l) => l.status === 'ganho').length; return barra(n, ls.length, c.total || 1, `${ls.length} · ${g} ganho${g === 1 ? '' : 's'}`, '#0369B1'); }).join('')}
          <p class="muted small" style="margin:6px 0 0">Última sincronização: ${S.config.ultima_sincronizacao ? fmtData(S.config.ultima_sincronizacao) : '—'}</p>
        </section>

        <section class="card bloco full">
          <h3>Últimos 14 dias</h3>
          <div class="legenda"><span><i style="background:#C7D0DB"></i>Leads que entraram</span><span><i style="background:var(--amarelo)"></i>Tratativas iniciadas</span><span><i style="background:var(--verde)"></i>Vendas</span></div>
          <div class="colunas">${serie.map((x) => `<div class="col" title="${x.d.toLocaleDateString('pt-BR')}: ${x.e} leads · ${x.t} tratativas · ${x.v} vendas">
            <div style="display:flex;gap:2px;align-items:flex-end;height:100%;width:100%;justify-content:center">
              <div style="width:40%;max-width:12px;background:#C7D0DB;border-radius:3px;height:${(x.e / maxS) * 100}%"></div>
              <div class="pilha" style="width:40%;max-width:12px;height:${((x.t + x.v) / maxS) * 100}%">
                <div style="background:var(--amarelo);flex:${x.t}"></div><div style="background:var(--verde);flex:${x.v}"></div></div>
            </div><div class="d">${x.d.getDate()}/${x.d.getMonth() + 1}</div></div>`).join('')}</div>
        </section>

        ${parados.length ? `<section class="card bloco">
          <h3>Tratativas paradas há +48h <span class="muted">${parados.length}</span></h3>
          <div class="feed">${parados.slice(0, 12).map((l) => `<div class="feed-item" data-act="abrir" data-id="${l.id}" style="cursor:pointer"><span class="feed-dot" style="background:var(--vermelho)"></span>
            <div style="flex:1"><b>${esc(l.nome)}</b><div class="quando">${esc(l.responsavel_nome)} · ${rel(l.ultima_acao || l.inicio_tratativa)}</div></div></div>`).join('')}</div>
        </section>` : ''}

        <section class="card bloco ${parados.length ? '' : 'full'}">
          <h3>Atividade recente</h3>
          <div class="feed">${S.historico.slice(0, 15).map((h) => {
            const l = S.leads.find((x) => x.id === h.lead_id);
            const cor = { ganho: 'var(--verde)', perdido: 'var(--vermelho)', reembolso: 'var(--roxo)', tratativa_iniciada: 'var(--amarelo)' }[h.acao] || 'var(--azul)';
            return `<div class="feed-item" ${l ? `data-act="abrir" data-id="${l.id}" style="cursor:pointer"` : ''}><span class="feed-dot" style="background:${cor}"></span>
              <div style="flex:1;min-width:0"><div><b>${esc(h.usuario_nome)}</b> · ${esc(ROT_ACAO[h.acao] || h.acao)}${l ? ' — ' + esc(l.nome) : ''}</div>
              ${h.detalhe ? `<div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(h.detalhe)}</div>` : ''}
              <div class="quando">${rel(h.data)}</div></div></div>`;
          }).join('') || '<p class="muted small">Sem atividade ainda.</p>'}</div>
        </section>
      </div>`;
  }

  function leadsFiltradosAdmin() {
    const A = S.adm;
    let ls = aplicaBusca(S.leads);
    if (A.status === 'interesse') ls = ls.filter((l) => l.interesse === 'sim');
    else if (A.status !== 'todos') ls = ls.filter((l) => l.status === A.status);
    if (A.resp !== 'todos') ls = ls.filter((l) => (A.resp === '__sem' ? !l.responsavel_id : l.responsavel_id === A.resp));
    if (A.tipo !== 'todos') ls = ls.filter((l) => (l.tipo_ingresso === 'vip' ? 'vip' : 'padrao') === A.tipo);
    if (A.origem !== 'todos') ls = ls.filter((l) => (l.origem_evento || '(sem origem)') === A.origem);
    if (A.classe !== 'todos') ls = ls.filter((l) => l.classificacao === A.classe);
    if (A.cargo === 'dono') ls = ls.filter(ehDono);
    else if (A.cargo === 'outros') ls = ls.filter((l) => l.cargo && !ehDono(l));
    if (A.porte !== 'todos') ls = ls.filter((l) => fatNum(l) >= Number(A.porte));
    if (A.cliente === 'mdl') ls = ls.filter(ehMdlAtivo);
    else if (A.cliente === 'exmdl') ls = ls.filter((l) => l.cliente_mdl && !ehMdlAtivo(l));
    else if (A.cliente === 'ilu') ls = ls.filter((l) => l.cliente_ilu);
    else if (A.cliente === 'eventos') ls = ls.filter((l) => eventosDe(l).length);
    else if (A.cliente === 'nenhum') ls = ls.filter((l) => !ehCliente(l));
    return ls.sort(S.ordem === 'ranking'
      ? (a, b) => (b.score || 0) - (a.score || 0) || String(b.criado_em).localeCompare(String(a.criado_em))
      : (a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
  }

  function viewLeadsAdmin() {
    const A = S.adm;
    const ls = leadsFiltradosAdmin();
    const base = aplicaBusca(S.leads);
    const chips = [['todos', 'Todos', base.length]].concat(usaInteresse() ? [['interesse', 'Interessados - ' + PROG(), base.filter((l) => l.interesse === 'sim').length]] : [])
      .concat(Object.keys(STATUS_INFO).map((k) => [k, STATUS_INFO[k].sing, base.filter((l) => l.status === k).length]))
      .map(([k, r, n]) => `<button class="chip ${A.status === k ? 'on' : ''}" data-adm-status="${k}">${r}<span class="n">${n}</span></button>`).join('');
    const opsResp = S.usuarios.map((u) => `<option value="${u.id}" ${A.resp === u.id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('');
    const sel = (k, v, r) => `<option value="${v}" ${A[k] === v ? 'selected' : ''}>${r}</option>`;
    return `
      <div class="page-head"><h2>Leads</h2>
        <div class="acoes">
          <button class="btn sm line" data-act="importar">${I.upload}<span>Importar</span></button>
          <button class="btn sm line" data-act="exportar">${I.download}<span>CSV</span></button>
          <button class="btn sm amarelo" data-act="novo-lead">${I.mais}Lead</button>
        </div></div>
      <div class="busca">${I.busca}<input class="input" data-busca placeholder="Buscar nome, telefone, e-mail, cidade" value="${esc(S.busca)}"></div>
      <div class="chips">${chips}</div>
      <div class="filtros-linha">
        <select class="input" data-adm="resp"><option value="todos">Todos os responsáveis</option><option value="__sem" ${A.resp === '__sem' ? 'selected' : ''}>Sem responsável</option>${opsResp}</select>
        ${usaVip() ? `<select class="input" data-adm="tipo">${sel('tipo', 'todos', 'Padrão + VIP')}${sel('tipo', 'padrao', 'Padrão')}${sel('tipo', 'vip', 'VIP')}</select>` : ''}
        <select class="input" data-adm="origem"><option value="todos">Todas as origens</option>${origensLeads().map((o) => `<option value="${esc(o)}" ${A.origem === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
        <select class="input" data-adm="cliente">${sel('cliente', 'todos', 'Base: todos')}${sel('cliente', 'mdl', 'Cliente MDL ativo')}${sel('cliente', 'exmdl', 'Ex-MDL')}${sel('cliente', 'ilu', 'Base ILU')}${sel('cliente', 'eventos', 'Já foi a eventos')}${sel('cliente', 'nenhum', 'Não é cliente')}</select>
        <select class="input" data-adm="classe">${sel('classe', 'todos', 'Ranking: todos')}${Object.entries(CLASSIF).map(([k, v]) => sel('classe', k, v.ico + ' ' + v.rot)).join('')}</select>
        <select class="input" data-adm="cargo">${sel('cargo', 'todos', 'Cargo: todos')}${sel('cargo', 'dono', 'Só donos / sócios')}${sel('cargo', 'outros', 'Só não-donos')}</select>
        <select class="input" data-adm="porte">${sel('porte', 'todos', 'Porte: todos')}${sel('porte', '60', 'Faturam +60mil/mês')}${sel('porte', '100', 'Faturam +100mil/mês')}${sel('porte', '300', 'Faturam +300mil/mês')}</select>
      </div>
      <div class="ordem-linha">
        <button class="btn line sm ${S.ordem === 'ranking' ? 'on' : ''}" data-act="ordem" data-ordem="ranking">${I.estrela}Melhor ranking</button>
        <button class="btn line sm ${S.ordem !== 'ranking' ? 'on' : ''}" data-act="ordem" data-ordem="data">${I.relogio}Mais recentes</button>
      </div>
      <p class="muted small" style="margin:0 0 10px">${ls.length} lead${ls.length === 1 ? '' : 's'} · o CSV exporta a lista filtrada</p>
      ${ls.length ? `<div class="lista">${ls.slice(0, S.limite).map(cardLead).join('')}</div>
        ${ls.length > S.limite ? `<div class="mais"><button class="btn line" data-act="mais">Mostrar mais (${ls.length - S.limite})</button></div>` : ''}` : '<div class="vazio"><h3>Nenhum lead encontrado</h3></div>'}`;
  }

  function origensLeads() {
    const m = {};
    S.leads.forEach((l) => { const k = l.origem_evento || '(sem origem)'; m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).sort((a, b) => m[b] - m[a]);
  }

  function viewEquipe() {
    const us = S.usuarios.slice().sort((a, b) => (a.ativo === 'NAO') - (b.ativo === 'NAO') || a.nome.localeCompare(b.nome));
    return `
      <div class="page-head"><h2>Equipe de concierges</h2>
        <div class="acoes">
          <button class="btn sm line" data-act="distribuir">${I.troca}Distribuir</button>
          <button class="btn sm amarelo" data-act="novo-usuario">${I.mais}Concierge</button>
        </div></div>
      <p class="small muted" style="margin:-6px 0 12px">${S.leads.filter((l) => l.status === 'novo' && !l.responsavel_id).length} leads sem concierge · distribuição automática ${S.config.distribuicao_auto ? '<b style="color:var(--verde)">ligada</b>' : 'desligada (ligue em Ajustes)'}</p>
      <div class="card lista-simples">${us.map((u) => {
        const ls = S.leads.filter((l) => l.responsavel_id === u.id);
        const s = statsDe(ls, S.vendas.filter((v) => v.usuario_id === u.id));
        return `<div class="item-linha" data-act="editar-usuario" data-id="${u.id}" style="cursor:pointer;${u.ativo === 'NAO' ? 'opacity:.5' : ''}">
          ${avatarHtml(u)}
          <div class="grow"><b>${esc(u.nome)}</b><span>${esc(u.email)}</span>
            <div class="tags" style="margin-top:4px">${u.perfil === 'coordenador' ? '<span class="tag vip">Coordenador</span>' : '<span class="tag padrao">Concierge</span>'}${u.ativo === 'NAO' ? '<span class="tag alerta">Inativo</span>' : ''}${u.perfil === 'coordenador' && u.recebe_leads === 'SIM' ? '<span class="tag ok">Recebe leads</span>' : ''}
            <span class="tag">${s.tratativa} em tratativa</span><span class="tag ok">${s.ganho} ganhos · ${brlCurto(s.receita)}</span></div></div>
          <span class="muted">${I.editar.replace('<svg', '<svg width="18" height="18"')}</span></div>`;
      }).join('')}</div>`;
  }

  function abrirFormUsuario(id) {
    const u = id ? S.usuarios.find((x) => x.id === id) : { perfil: 'usuario', ativo: 'SIM' };
    if (!u) return;
    abrirSheet({
      titulo: id ? 'Editar usuário' : 'Novo usuário',
      corpo: `
        <form id="f-u" autocomplete="off">
          <div class="field"><label>Nome *</label><input class="input" name="nome" value="${esc(u.nome || '')}"></div>
          <div class="field"><label>E-mail (login) *</label><input class="input" name="email" type="email" value="${esc(u.email || '')}" autocomplete="off"></div>
          <div class="field"><label>${id ? 'Nova senha (deixe em branco para manter)' : 'Senha *'}</label><input class="input" name="senha" type="text" autocomplete="new-password" placeholder="mínimo 6 caracteres"></div>
          <div class="row">
            <div class="field"><label>Perfil</label><select class="input" name="perfil"><option value="usuario">Usuário</option><option value="coordenador" ${u.perfil === 'coordenador' ? 'selected' : ''}>Coordenador</option></select></div>
            <div class="field"><label>Acesso</label><select class="input" name="ativo"><option value="SIM">Ativo</option><option value="NAO" ${u.ativo === 'NAO' ? 'selected' : ''}>Bloqueado</option></select></div>
          </div>
          <label class="check"><input type="checkbox" name="recebe_leads" ${u.recebe_leads === 'SIM' ? 'checked' : ''}><span>Entra na divisão de leads (concierges entram sempre; marque só se o coordenador também for atender)</span></label>
          <p class="hint">Envie o e-mail e a senha para a pessoa. Ela poderá trocar nome e foto, mas não e-mail e senha.</p>
        </form>`,
      rodape: `<button class="btn line" data-x>Cancelar</button><button class="btn amarelo" id="u-salvar" data-loading=" Salvando...">Salvar</button>`,
      onMount: (sh) => {
        sh.querySelector('#u-salvar').addEventListener('click', (ev) => comBotao(ev.currentTarget, async () => {
          const f = sh.querySelector('#f-u');
          const dados = {
            id: id || '', nome: f.elements.nome.value, email: f.elements.email.value, senha: f.elements.senha.value,
            perfil: f.elements.perfil.value, ativo: f.elements.ativo.value,
            recebe_leads: (f.elements.perfil.value !== 'coordenador' || f.elements.recebe_leads.checked) ? 'SIM' : 'NAO'
          };
          const r = await api('admin.usuario.salvar', { usuario: dados });
          const i = S.usuarios.findIndex((x) => x.id === r.id);
          if (i >= 0) S.usuarios[i] = r; else S.usuarios.push(r);
          if (r.id === S.user.id) S.user = r;
          fecharSheet();
          toast(id ? 'Usuário atualizado' : 'Usuário criado', 'ok');
          renderMain();
        }));
      }
    });
  }

  function viewCatalogo() {
    const aba = S.catalogo;
    let corpo;
    if (aba === 'fases') {
      const fs = S.fases.slice().sort((a, b) => num(a.ordem) - num(b.ordem));
      corpo = fs.length ? `<div class="card lista-simples">${fs.map((f) => `
        <div class="item-linha" data-act="editar-fase" data-id="${f.id}" style="cursor:pointer;${f.ativo === 'NAO' ? 'opacity:.5' : ''};border-left:4px solid ${esc(f.cor)}">
          <div class="grow"><b>${num(f.ordem)}. ${esc(f.nome)}</b>
            <span>${esc(String(f.instrucoes || '').split('\n').filter(Boolean).join(' · ') || 'sem lembretes')}</span>
            <div class="tags" style="margin-top:4px">
              <span class="tag">${S.leads.filter((l) => l.fase_id === f.id).length} leads</span>
              <span class="tag">${S.mensagens.filter((m) => m.fase_id === f.id).length} mensagens</span>
              ${f.ativo === 'NAO' ? '<span class="tag alerta">Inativa</span>' : ''}</div></div>
          <span class="muted">${I.editar.replace('<svg', '<svg width="18" height="18"')}</span></div>`).join('')}</div>`
        : '<div class="vazio"><h3>Nenhuma fase</h3><p>Crie as fases do funil que os concierges vão seguir.</p></div>';
    } else if (aba === 'produtos') {
      const ps = S.produtos.slice().sort((a, b) => (a.ativo === 'NAO') - (b.ativo === 'NAO') || a.nome.localeCompare(b.nome));
      corpo = ps.length ? `<div class="card lista-simples">${ps.map((p) => `
        <div class="item-linha" data-act="editar-produto" data-id="${p.id}" style="cursor:pointer;${p.ativo === 'NAO' ? 'opacity:.5' : ''}">
          <div class="grow"><b>${esc(p.nome)}</b>
            <span>${num(p.valor_entrada) ? 'Entrada ' + brl(p.valor_entrada) + ' · ' : ''}Total ${brl(p.valor_total)}${p.parcelas ? ' · ' + esc(p.parcelas) : ''}</span>
            <div class="tags" style="margin-top:4px">${p.origem === 'usuario' ? `<span class="tag evento">Incluído por ${esc(p.criado_por)}</span>` : ''}${p.ativo === 'NAO' ? '<span class="tag alerta">Inativo</span>' : ''}
            <span class="tag">${S.vendas.filter((v) => v.produto_id === p.id && v.status === 'ativa').length} vendas</span></div></div>
          <span class="muted">${I.editar.replace('<svg', '<svg width="18" height="18"')}</span></div>`).join('')}</div>`
        : '<div class="vazio"><h3>Nenhum produto</h3><p>Cadastre os produtos que a equipe vai oferecer.</p></div>';
    } else {
      const ms = S.mensagens.slice().sort((a, b) => num(a.ordem) - num(b.ordem));
      const exemplo = { nome: 'Maria Souza', cidade: 'São Paulo' };
      corpo = ms.length ? `<div class="lista">${ms.map((m) => `
        <div class="card lead" data-act="editar-mensagem" data-id="${m.id}" style="cursor:pointer;${m.ativo === 'NAO' ? 'opacity:.5' : ''}">
          <div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(m.titulo)}</b>
          <span class="tag ${m.tipo_ingresso === 'vip' ? 'vip' : m.tipo_ingresso === 'padrao' ? 'padrao' : ''}">${{ vip: 'Só VIP', padrao: 'Só Padrão' }[m.tipo_ingresso] || 'Todos'}</span></div>
          <div class="preview-msg" style="margin:0">${esc(textoMensagem(m.texto, exemplo))}</div>
          ${m.ativo === 'NAO' ? '<span class="tag alerta">Inativa</span>' : ''}
        </div>`).join('')}</div>`
        : '<div class="vazio"><h3>Nenhuma mensagem</h3><p>Crie mensagens prontas para a equipe iniciar as conversas.</p></div>';
    }
    return `
      <div class="page-head"><h2>${{ fases: 'Fases do funil', produtos: 'Produtos', mensagens: 'Mensagens prontas' }[aba]}</h2>
        <div class="acoes"><button class="btn sm amarelo" data-act="${{ fases: 'nova-fase', produtos: 'novo-produto', mensagens: 'nova-mensagem' }[aba]}">${I.mais}${{ fases: 'Fase', produtos: 'Produto', mensagens: 'Mensagem' }[aba]}</button></div></div>
      <div class="seg" style="margin-bottom:14px"><button data-cat="fases" class="${aba === 'fases' ? 'on' : ''}">Fases (${S.fases.length})</button><button data-cat="produtos" class="${aba === 'produtos' ? 'on' : ''}">Produtos (${S.produtos.length})</button><button data-cat="mensagens" class="${aba === 'mensagens' ? 'on' : ''}">Mensagens (${S.mensagens.length})</button></div>
      ${corpo}`;
  }

  function abrirFormFase(id) {
    const f = id ? S.fases.find((x) => x.id === id) : { cor: '#0369B1', ativo: 'SIM', ordem: String(S.fases.length + 1) };
    if (!f) return;
    const cores = ['#0369B1', '#F8B90C', '#7A4CC2', '#0B7A9E', '#C2410C', '#12A150', '#D93B3B', '#011527'];
    abrirSheet({
      titulo: id ? 'Editar fase' : 'Nova fase',
      corpo: `
        <form id="f-f">
          <div class="field"><label>Nome da fase *</label><input class="input" name="nome" value="${esc(f.nome || '')}"></div>
          <div class="field"><label>Lembretes: o que o concierge deve fazer nesta fase (um por linha)</label>
            <textarea class="input" name="instrucoes" rows="5" placeholder="Confirmar presença&#10;Enviar o link do diagnóstico">${esc(f.instrucoes || '')}</textarea></div>
          <div class="field"><label>Cor</label><div class="cores" id="f-cores">${cores.map((c) => `<button type="button" data-cor="${c}" class="${(f.cor || '').toLowerCase() === c.toLowerCase() ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></div>
          <div class="row">
            <div class="field" style="max-width:110px"><label>Ordem</label><input class="input" name="ordem" inputmode="numeric" value="${esc(f.ordem || '')}"></div>
            <div class="field"><label>Status</label><select class="input" name="ativo"><option value="SIM">Ativa</option><option value="NAO" ${f.ativo === 'NAO' ? 'selected' : ''}>Inativa</option></select></div>
          </div>
          ${id ? `<button type="button" class="btn line sm" id="f-del" style="color:var(--vermelho)">${I.lixo}Excluir fase</button>` : ''}
        </form>`,
      rodape: `<button class="btn line" data-x>Cancelar</button><button class="btn amarelo" id="f-ok" data-loading=" Salvando...">Salvar</button>`,
      onMount: (sh) => {
        let cor = f.cor || '#0369B1';
        sh.querySelectorAll('[data-cor]').forEach((b) => b.addEventListener('click', () => {
          cor = b.dataset.cor;
          sh.querySelectorAll('[data-cor]').forEach((x) => x.classList.toggle('on', x === b));
        }));
        const del = sh.querySelector('#f-del');
        if (del) del.addEventListener('click', (ev) => {
          if (!confirm('Excluir esta fase? Os leads precisam estar em outras fases.')) return;
          comBotao(ev.currentTarget, async () => {
            await api('fase.excluir', { id });
            S.fases = S.fases.filter((x) => x.id !== id);
            fecharSheet(); toast('Fase excluída', 'ok'); renderMain();
          });
        });
        sh.querySelector('#f-ok').addEventListener('click', (ev) => comBotao(ev.currentTarget, async () => {
          const fo = sh.querySelector('#f-f');
          const dados = { id: id || '', cor: cor };
          ['nome', 'instrucoes', 'ordem', 'ativo'].forEach((k) => { dados[k] = fo.elements[k].value; });
          const r = await api('fase.salvar', { fase: dados });
          const i = S.fases.findIndex((x) => x.id === r.id);
          if (i >= 0) S.fases[i] = Object.assign({}, S.fases[i], r); else S.fases.push(r);
          fecharSheet(); toast('Fase salva', 'ok'); renderMain();
        }));
      }
    });
  }

  function abrirFormProduto(id) {
    const p = id ? S.produtos.find((x) => x.id === id) : { ativo: 'SIM' };
    if (!p) return;
    const f2 = (v) => (num(v) ? num(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
    abrirSheet({
      titulo: id ? 'Editar produto' : 'Novo produto',
      corpo: `
        <form id="f-p">
          <div class="field"><label>Nome do produto *</label><input class="input" name="nome" value="${esc(p.nome || '')}"></div>
          <div class="row">
            <div class="field"><label>Valor da entrada</label><input class="input" name="valor_entrada" inputmode="decimal" value="${f2(p.valor_entrada)}" placeholder="0,00"></div>
            <div class="field"><label>Valor total *</label><input class="input" name="valor_total" inputmode="decimal" value="${f2(p.valor_total)}" placeholder="0,00"></div>
          </div>
          <p class="hint">Produtos com entrada ou parcelados aparecem no painel com os dois valores: entrada e total.</p>
          <div class="row">
            <div class="field"><label>Parcelamento</label><input class="input" name="parcelas" value="${esc(p.parcelas || '')}" placeholder="Ex.: entrada + 11x"></div>
            <div class="field"><label>Status</label><select class="input" name="ativo"><option value="SIM">Ativo</option><option value="NAO" ${p.ativo === 'NAO' ? 'selected' : ''}>Inativo</option></select></div>
          </div>
          <div class="field"><label>Descrição (interna)</label><textarea class="input" name="descricao" rows="2">${esc(p.descricao || '')}</textarea></div>
        </form>`,
      rodape: `<button class="btn line" data-x>Cancelar</button><button class="btn amarelo" id="p-ok" data-loading=" Salvando...">Salvar</button>`,
      onMount: (sh) => {
        sh.querySelector('#p-ok').addEventListener('click', (ev) => comBotao(ev.currentTarget, async () => {
          const f = sh.querySelector('#f-p');
          const dados = { id: id || '' };
          ['nome', 'parcelas', 'ativo', 'descricao'].forEach((k) => { dados[k] = f.elements[k].value; });
          dados.valor_total = num(f.elements.valor_total.value);
          dados.valor_entrada = f.elements.valor_entrada.value ? num(f.elements.valor_entrada.value) : '';
          if (num(dados.valor_entrada) > dados.valor_total) throw new Error('A entrada não pode ser maior que o total.');
          const r = await api('produto.salvar', { produto: dados });
          const i = S.produtos.findIndex((x) => x.id === r.id);
          if (i >= 0) S.produtos[i] = Object.assign({}, S.produtos[i], r); else S.produtos.push(r);
          fecharSheet(); toast('Produto salvo', 'ok'); renderMain();
        }));
      }
    });
  }

  function abrirFormMensagem(id) {
    const m = id ? S.mensagens.find((x) => x.id === id) : { ativo: 'SIM', tipo_ingresso: 'todos', ordem: String(S.mensagens.length + 1) };
    if (!m) return;
    const exemplo = { nome: 'Maria Souza', cidade: 'São Paulo' };
    abrirSheet({
      titulo: id ? 'Editar mensagem' : 'Nova mensagem',
      corpo: `
        <form id="f-m">
          <div class="field"><label>Título (a equipe vê este nome) *</label><input class="input" name="titulo" value="${esc(m.titulo || '')}"></div>
          <div class="field"><label>Texto *</label><textarea class="input" name="texto" rows="6">${esc(m.texto || '')}</textarea></div>
          <div class="var-chips"><span class="small muted">Inserir:</span>
            ${VARIAVEIS.map(([v, r]) => `<button type="button" data-var="${v}">${r}</button>`).join('')}</div>
          <div class="label" style="margin-bottom:6px">Pré-visualização</div>
          <div class="preview-msg" id="m-prev"></div>
          <div class="field"><label>Fase do funil</label><select class="input" name="fase_id">
            <option value="">Qualquer fase</option>${fasesAtivas().map((f) => `<option value="${f.id}" ${m.fase_id === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></div>
          <p class="hint">A mensagem da fase aparece primeiro no botão do WhatsApp quando o lead está nela.</p>
          <div class="row">
            <div class="field"><label>Usar para</label><select class="input" name="tipo_ingresso">
              <option value="todos">Todos os leads</option><option value="padrao" ${m.tipo_ingresso === 'padrao' ? 'selected' : ''}>Só ingresso Padrão</option><option value="vip" ${m.tipo_ingresso === 'vip' ? 'selected' : ''}>Só ingresso VIP</option></select></div>
            <div class="field" style="max-width:90px"><label>Ordem</label><input class="input" name="ordem" inputmode="numeric" value="${esc(m.ordem || '')}"></div>
          </div>
          <div class="field"><label>Status</label><select class="input" name="ativo"><option value="SIM">Ativa</option><option value="NAO" ${m.ativo === 'NAO' ? 'selected' : ''}>Inativa</option></select></div>
          ${id ? `<button type="button" class="btn line sm" id="m-del" style="color:var(--vermelho)">${I.lixo}Excluir mensagem</button>` : ''}
        </form>`,
      rodape: `<button class="btn line" data-x>Cancelar</button><button class="btn amarelo" id="m-ok" data-loading=" Salvando...">Salvar</button>`,
      onMount: (sh) => {
        const f = sh.querySelector('#f-m');
        const ta = f.elements.texto;
        const prev = () => { sh.querySelector('#m-prev').textContent = textoMensagem(ta.value, exemplo) || '…'; };
        prev();
        ta.addEventListener('input', prev);
        sh.querySelectorAll('[data-var]').forEach((b) => b.addEventListener('click', () => {
          const v = b.dataset.var, s = ta.selectionStart || ta.value.length, e = ta.selectionEnd || ta.value.length;
          ta.value = ta.value.slice(0, s) + v + ta.value.slice(e);
          ta.focus(); ta.setSelectionRange(s + v.length, s + v.length); prev();
        }));
        const del = sh.querySelector('#m-del');
        if (del) del.addEventListener('click', (ev) => {
          if (!confirm('Excluir esta mensagem?')) return;
          comBotao(ev.currentTarget, async () => {
            await api('mensagem.excluir', { id });
            S.mensagens = S.mensagens.filter((x) => x.id !== id);
            fecharSheet(); toast('Mensagem excluída', 'ok'); renderMain();
          });
        });
        sh.querySelector('#m-ok').addEventListener('click', (ev) => comBotao(ev.currentTarget, async () => {
          const dados = { id: id || '' };
          ['titulo', 'texto', 'tipo_ingresso', 'fase_id', 'ordem', 'ativo'].forEach((k) => { dados[k] = f.elements[k].value; });
          const r = await api('mensagem.salvar', { mensagem: dados });
          const i = S.mensagens.findIndex((x) => x.id === r.id);
          if (i >= 0) S.mensagens[i] = Object.assign({}, S.mensagens[i], r); else S.mensagens.push(r);
          fecharSheet(); toast('Mensagem salva', 'ok'); renderMain();
        }));
      }
    });
  }

  function linhaProduto(pr) {
    return `<div class="prod-linha">
       <input class="input" data-p="id" placeholder="ID do produto" value="${esc(pr.id || '')}">
      <input class="input" data-p="nome" placeholder="Nome (ex.: Treinamento Gestão Financeira — Padrão)" value="${esc(pr.nome || '')}">
      <select class="input" data-p="tipo"><option value="padrao">Padrão</option><option value="vip" ${pr.tipo === 'vip' ? 'selected' : ''}>VIP</option></select>
      <select class="input" data-p="plat"><option value="hotmart">Hotmart</option><option value="kiwify" ${pr.plataforma === 'kiwify' ? 'selected' : ''}>Kiwify</option></select>
      <button class="btn ghost icon" data-act="del-produto-hot" aria-label="Remover">${I.lixo}</button>
    </div>`;
  }

  function viewAjustes() {
    const c = S.config || {};
    return `
      <div class="page-head"><h2>Ajustes</h2></div>
      <div class="grid-painel">
        <section class="card bloco">
          <h3>Webhook da Hotmart</h3>
          <p class="small muted" style="margin-top:-6px">Cadastre esta URL na Hotmart (<b>Ferramentas → Webhook (API e notificações)</b>) para os produtos Hotmart abaixo, com os eventos de compra aprovada, completa, reembolso e chargeback.</p>
          <div class="copiar" style="margin-bottom:12px"><input class="input" readonly value="${esc(c.webhook || '')}" id="wh-url"><button class="btn navy" data-act="copiar">Copiar</button></div>
          <div class="secao">Produtos que viram leads</div>
          <p class="small muted" style="margin-top:-4px">Cada produto (Hotmart ou Kiwify) que deve entrar no sistema. O <b>nome</b> aparece como origem no card do lead e nos filtros. O <b>tipo</b> define se o lead entra como Padrão ou VIP.</p>
          <div id="cfg-produtos">${(c.produtos || []).map((pr) => linhaProduto(pr)).join('')}</div>
          <button class="btn line sm" data-act="add-produto-hot">${I.mais}Adicionar produto</button>
          <label class="check" style="margin-top:14px"><input type="checkbox" id="cfg-teste" ${c.modo_teste ? 'checked' : ''}><span><b>Modo teste:</b> aceitar compras de teste (Hotmart ID 0 e produtos Kiwify fora da lista) como ingresso Padrão. Desligue depois de testar.</span></label>
          <button class="btn line sm" data-act="salvar-config" data-loading=" Salvando...">Salvar</button>
        </section>

        <section class="card bloco">
          <h3>Webhook da Kiwify</h3>
          <p class="small muted" style="margin-top:-6px">Cadastre esta URL na Kiwify (<b>Apps → Webhooks → Criar webhook</b>), escolha o produto do Treinamento e marque os eventos <b>Compra aprovada</b>, <b>Reembolso</b> e <b>Chargeback</b>. Cadastre o produto acima com a plataforma <b>Kiwify</b> e o ID do produto da Kiwify.</p>
          <div class="copiar" style="margin-bottom:12px"><input class="input" readonly value="${esc(c.webhook_kiwify || '')}" id="wh-kiwi"><button class="btn navy" data-act="copiar-campo" data-alvo="wh-kiwi">Copiar</button></div>
          <div class="field"><label>Token do webhook (opcional — a Kiwify mostra ao criar o webhook)</label><input class="input" id="cfg-kiwi-token" type="password" autocomplete="new-password" placeholder="${c.kiwify_token ? 'token salvo — preencha só para trocar' : 'cole o token aqui'}"></div>
          <p class="hint">Com o token salvo, o sistema também aceita o aviso pela assinatura da Kiwify, mesmo se a URL perder a chave.</p>
          <button class="btn line sm" data-act="salvar-config" data-loading=" Salvando...">Salvar</button>
        </section>

        <section class="card bloco">
          <h3>Últimos webhooks recebidos <span class="muted">${(c.webhooks || []).length}</span></h3>
          <p class="small muted" style="margin-top:-6px">A Hotmart e a Kiwify recebem resposta na hora e o evento é processado em até 1 minuto (ou ao abrir o sistema).</p>
          ${(c.webhooks || []).length ? `<div class="feed">${c.webhooks.map((w) => {
            const cor = { ok: 'var(--verde)', ignorado: 'var(--texto-3)', erro: 'var(--vermelho)', pendente: 'var(--amarelo)' }[w.status] || 'var(--azul)';
            return `<div class="feed-item"><span class="feed-dot" style="background:${cor}"></span>
              <div style="flex:1;min-width:0"><div><b>${esc(w.evento || '—')}</b> · produto ${esc(w.produto || '—')} · <b style="color:${cor}">${esc(w.status)}</b></div>
              <div class="small muted" style="overflow-wrap:anywhere">${esc(w.resultado || w.email || '')}</div>
              <div class="quando">${fmtData(w.recebido_em)}${w.transacao ? ' · ' + esc(w.transacao) : ''}</div></div></div>`;
          }).join('')}</div>` : '<p class="small muted">Nenhum webhook recebido ainda.</p>'}
          <button class="btn line sm" data-act="processar-fila" data-loading=" Processando...">${I.refresh}Processar agora</button>
        </section>

        <section class="card bloco">
          <h3>Base de clientes (MDL / ILU / eventos)</h3>
          <p class="small muted" style="margin-top:-6px">Cruza os leads com as abas <b>Dados_pipe_mdl</b>, <b>dados_pipe_ilu</b> e as abas de eventos da planilha de inscritos. Roda sozinho a cada hora.</p>
          <div class="field"><label>ID da planilha de base</label><input class="input" id="cfg-base" value="${esc(c.base_id || '')}"></div>
          <p class="small muted">Última sincronização: <b>${c.ultima_sincronizacao ? fmtData(c.ultima_sincronizacao) : 'nunca'}</b></p>
          <div class="row"><button class="btn line sm" data-act="salvar-config" data-loading=" Salvando...">Salvar ID</button>
          <button class="btn navy sm" data-act="sincronizar" data-loading=" Sincronizando...">${I.refresh}Sincronizar agora</button></div>
        </section>

        <section class="card bloco">
          <h3>Este sistema</h3>
          <div class="field"><label>Nome que aparece no topo</label><input class="input" id="cfg-nome" value="${esc(c.nome_sistema || '')}"></div>
          ${c.tag_evento ? `<p class="hint">Tag dos fluxos: <b>${esc(c.tag_evento)}</b></p>` : ''}
          <div class="field"><label>Programa da lista de interesse (aparece nas tags e muda o ranking)</label>
            <select class="input" id="cfg-prog"><option value="ILU" ${c.programa_oferta !== 'MDL' ? 'selected' : ''}>ILU — Iluminismo Financeiro</option><option value="MDL" ${c.programa_oferta === 'MDL' ? 'selected' : ''}>MDL — Máquina de Lucros</option></select></div>
          <div class="field"><label>Quem cria fases, produtos e mensagens</label>
            <select class="input" id="cfg-gerencia">
              <option value="coordenador" ${c.quem_gerencia !== 'todos' ? 'selected' : ''}>Só o coordenador</option>
              <option value="todos" ${c.quem_gerencia === 'todos' ? 'selected' : ''}>Coordenador e concierges</option>
            </select></div>
          <div class="label" style="margin-bottom:8px">Marcos que a equipe pode marcar em cada lead</div>
          <div class="marcos-cfg">${Object.entries(MARCOS_INFO).map(([k, info]) => `
            <label class="check" style="margin:0"><input type="checkbox" data-marco="${k}" ${(c.marcos_ativos || []).indexOf(k) >= 0 ? 'checked' : ''}><span>${esc(info.rot)}</span></label>`).join('')}</div>
          <button class="btn line sm" data-act="salvar-config" data-loading=" Salvando...">Salvar</button>
        </section>

        <section class="card bloco">
          <h3>Links e funil</h3>
          <p class="small muted" style="margin-top:-6px">Estes links aparecem nos botões de copiar e nas variáveis das mensagens (<code>{link_upgrade}</code>, <code>{link_diagnostico}</code>).</p>
          ${(c.marcos_ativos || []).indexOf('upgrade') >= 0 ? `<div class="row">
            <div class="field"><label>Link do upgrade para VIP</label><input class="input" id="cfg-upg" value="${esc(c.upgrade_url || '')}" placeholder="https://pay.hotmart.com/..."></div>
            <div class="field" style="max-width:120px"><label>Valor (R$)</label><input class="input" id="cfg-upg-val" inputmode="decimal" value="${esc(c.upgrade_valor || '50')}"></div>
          </div>` : ''}
          <div class="row">
            <div class="field"><label>Link do diagnóstico</label><input class="input" id="cfg-diag" value="${esc(c.diagnostico_url || '')}"></div>
            <div class="field" style="max-width:170px"><label>Data do evento (se houver)</label><input class="input" id="cfg-evento" type="date" value="${esc(c.evento_data || '')}"></div>
          </div>
          <label class="check"><input type="checkbox" id="cfg-dist" ${c.distribuicao_auto ? 'checked' : ''}><span><b>Distribuir automaticamente:</b> todo lead novo já entra para um concierge (o que tem menos leads em aberto). O coordenador só entra na fila se estiver marcado em Equipe.</span></label>
          <button class="btn line sm" data-act="salvar-config" data-loading=" Salvando...">Salvar</button>
        </section>

        <section class="card bloco">
          <h3>Leads duplicados</h3>
          <p class="small muted" style="margin-top:-6px">A mesma pessoa não pode virar dois leads — isso coloca duas concierges falando com ela. Quando alguém compra dois produtos (Padrão + VIP, ou Hotmart + Kiwify), o sistema já junta tudo num lead só. Use isto para limpar o que entrou antes dessa correção.</p>
          <div class="row" style="flex-wrap:wrap;margin-bottom:10px">
            <button class="btn line sm" data-act="dup-ver" data-loading=" Procurando...">${I.busca}Procurar duplicados</button>
            <button class="btn navy sm" data-act="dup-juntar" data-loading=" Juntando...">Juntar automaticamente</button>
          </div>
          <div id="dup-res"></div>
        </section>

        <section class="card bloco">
          <h3>Dados de fora (webhooks do ActiveCampaign e de formulários)</h3>
          <p class="small muted" style="margin-top:-6px">Cada automação tem a sua URL pronta abaixo. Cole no passo <b>Webhook</b> da automação do Active (ou no Zapier, Make, formulário). O sistema casa a pessoa por <b>e-mail ou telefone</b>. Use sempre o endereço terminado em <code>/exec</code> — o <code>/dev</code> do editor pede login e não funciona para ferramentas de fora.</p>
          ${(c.webhooks_dados || []).map((w) => `
            <div class="url-bloco">
              <div class="url-tit"><b>${esc(w.nome)}</b><span class="tag">tipo=${esc(w.tipo)}</span></div>
              <p class="small muted">${esc(w.ajuda)}</p>
              <div class="copiar"><input class="input" readonly value="${esc(w.url)}" id="wu-${esc(w.tipo)}"><button class="btn navy" data-act="copiar-campo" data-alvo="wu-${esc(w.tipo)}">Copiar</button></div>
              <details class="url-alt"><summary>Se o Active não conseguir enviar o corpo do webhook</summary>
                <p class="small muted">Esta versão leva os dados na própria URL (funciona por POST e por GET). As tags <code>%EMAIL%</code>, <code>%PHONE%</code> e <code>%FIRSTNAME%</code> são preenchidas pelo Active.</p>
                <div class="copiar"><input class="input" readonly value="${esc(w.url_get)}" id="wug-${esc(w.tipo)}"><button class="btn line" data-act="copiar-campo" data-alvo="wug-${esc(w.tipo)}">Copiar</button></div>
              </details>
            </div>`).join('')}
          <div class="secao">Diagnóstico: planilha de respostas</div>
          <p class="small muted" style="margin-top:-4px">O sistema lê essa planilha sozinho a cada 15 minutos e preenche o diagnóstico de <b>quem já é lead aqui</b> (casando por e-mail ou telefone). Quem respondeu e não comprou é ignorado.</p>
          <div class="row">
            <div class="field"><label>ID da planilha</label><input class="input" id="cfg-diag-id" value="${esc(c.diag_planilha_id || '')}" placeholder="1XZ1PF..."></div>
            <div class="field" style="max-width:180px"><label>Aba</label><input class="input" id="cfg-diag-aba" value="${esc(c.diag_aba || '')}" placeholder="Diagnosticos"></div>
          </div>
          <p class="small muted">Última leitura: <b>${c.diag_ultima_sinc ? fmtData(c.diag_ultima_sinc) : 'nunca'}</b></p>
          <div class="row" style="flex-wrap:wrap;margin-bottom:14px">
            <button class="btn line sm" data-act="salvar-config" data-loading=" Salvando...">Salvar planilha</button>
            <button class="btn navy sm" data-act="sincronizar-diag" data-loading=" Lendo...">${I.refresh}Ler respostas agora</button>
          </div>
          <div id="diag-res"></div>

          ${(c.marcos_ativos || []).indexOf('interesse') >= 0 && c.ac_tag_interesse ? `<p class="hint">Tag do Active que dispara a lista de interesse: <b>${esc(c.ac_tag_interesse)}</b></p>` : ''}

          <div class="secao">Importar por planilha</div>
          <div class="row" style="flex-wrap:wrap">
            <button class="btn navy sm" data-act="imp-perfil">${I.upload}Perfil dos participantes</button>
            ${(c.marcos_ativos || []).indexOf('interesse') >= 0 ? `<button class="btn line sm" data-act="imp-interesse">${I.upload}Lista de interesse (${esc(PROG())})</button>` : ''}
            ${(c.marcos_ativos || []).indexOf('checkin') >= 0 ? `<button class="btn line sm" data-act="imp-checkin">${I.upload}Presença no Treinamento</button>` : ''}
            ${(c.marcos_ativos || []).indexOf('presentes') >= 0 ? `<button class="btn line sm" data-act="imp-presentes">${I.upload}Baixou os presentes</button>` : ''}
            ${(c.marcos_ativos || []).indexOf('confirmado') >= 0 ? `<button class="btn line sm" data-act="imp-confirmacao">${I.upload}Confirmações</button>` : ''}
            <button class="btn line sm" data-act="imp-diagnostico">${I.upload}Diagnóstico</button>
            <button class="btn line sm" data-act="imp-obrigado">${I.upload}Página de obrigado</button>
          </div>
        </section>

        <section class="card bloco">
          <h3>Compras antigas (antes do sistema)</h3>
          <p class="small muted" style="margin-top:-6px">Traga quem comprou o ingresso antes do webhook estar ligado. Quem já está no sistema é ignorado.</p>
          <div class="row" style="flex-wrap:wrap;margin-bottom:10px">
            <button class="btn navy sm" data-act="hotmart-api">${I.download}Puxar da Hotmart (API)</button>
            <button class="btn line sm" data-act="importar">${I.upload}Importar planilha (CSV/Excel)</button>
          </div>
          <div class="secao">Exportar</div>
          <div class="row" style="flex-wrap:wrap">
            <button class="btn line sm" data-act="exportar">${I.download}Leads (CSV)</button>
            <button class="btn line sm" data-act="exportar-vendas">${I.download}Vendas (CSV)</button>
          </div>
        </section>

        <section class="card bloco">
          <h3>Sessão</h3>
          <p class="small muted" style="margin-top:-6px">Conectado como ${esc(S.user.email)}${DEMO ? ' (demonstração)' : ''}.</p>
          <button class="btn line sm" data-act="sair" style="color:var(--vermelho)">${I.sair}Sair</button>
        </section>
      </div>`;
  }

  /* ------------------------------------------------- leads duplicados */
  function caixaDup(d, titulo) {
    const box = document.getElementById('dup-res');
    if (!box) return;
    if (!d.grupos || !d.grupos.length) {
      if (!d.grupos) { box.innerHTML = '<div class="cliente-box mdl">Nenhum lead duplicado. Está tudo certo.</div>'; return; }
    }
    const gs = d.grupos || [];
    box.innerHTML = `<div class="cliente-box ${gs.length ? 'exmdl' : 'mdl'}"><b>${titulo}</b>
      ${gs.length ? gs.map((g) => `<div class="dup-grupo">${g.leads.map((l) => `
        <div class="dup-lead ${l.principal ? 'fica' : ''}">
          <span class="dup-tag">${l.principal ? 'FICA' : 'junta'}</span>
          <b>${esc(l.nome)}</b>
          <span class="muted small">${esc(l.responsavel_nome || 'sem responsável')} · ${esc(l.origem_evento || l.status)} · ${l.acoes} ações</span>
        </div>`).join('')}</div>`).join('') : '<div>Nenhum duplicado encontrado.</div>'}</div>`;
  }
  async function verDuplicados() {
    const d = await api('admin.duplicados', {});
    caixaDup(d, d.grupos.length ? `${d.grupos.length} pessoa(s) com mais de um lead` : 'Nenhum duplicado encontrado');
  }
  async function juntarDuplicados() {
    const sim = await api('admin.duplicados.juntar', { simular: true });
    if (!sim.grupos) { caixaDup({ grupos: [] }, 'Nenhum duplicado encontrado'); return; }
    const txt = sim.detalhes.map((d) => `• ${d.nome} → fica com ${d.responsavel}`).join('\n');
    if (!confirm(`Vou juntar ${sim.juntados} lead(s) duplicado(s) em ${sim.grupos} pessoa(s):\n\n${txt}\n\nO histórico e as vendas vão para o lead que fica. Confirmar?`)) return;
    const r = await api('admin.duplicados.juntar', {});
    await carregar();
    caixaDup({ grupos: r.detalhes.map((d) => ({ leads: [{ nome: d.nome, responsavel_nome: d.responsavel, origem_evento: d.removidos.length + ' duplicado(s) removido(s)', status: '', acoes: 0, principal: true }] })) },
      `${r.juntados} lead(s) juntados em ${r.grupos} pessoa(s)`);
    toast(`${r.juntados} duplicados juntados`, 'ok');
  }

  /* ----------------------------------------------------------- CSV */
  function baixarCsv(nome, cab, linhas) {
    const cel = (v) => { const s = String(v == null ? '' : v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const txt = '﻿' + [cab.map((c) => c[1])].concat(linhas.map((l) => cab.map((c) => (typeof c[0] === 'function' ? c[0](l) : l[c[0]])))).map((r) => r.map(cel).join(';')).join('\r\n');
    const blob = new Blob([txt], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const dec = (v) => (v === '' || v == null ? '' : num(v).toFixed(2).replace('.', ','));

  function exportarLeads() {
    const ls = S.view === 'leads' ? leadsFiltradosAdmin() : S.leads;
    const vendasPor = {};
    S.vendas.filter((v) => v.status === 'ativa').forEach((v) => { (vendasPor[v.lead_id] = vendasPor[v.lead_id] || []).push(v); });
    const cab = [
      ['id', 'ID'], ['nome', 'Nome'], ['email', 'E-mail'], [(l) => soDig(l.telefone), 'Telefone'],
      [(l) => (l.tipo_ingresso === 'vip' ? 'VIP' : 'Padrão'), 'Ingresso'], ['cidade', 'Cidade'], ['empresa', 'Empresa'], ['cargo', 'Cargo'], ['faturamento', 'Faturamento'],
      [(l) => (STATUS_INFO[l.status] ? STATUS_INFO[l.status].sing : l.status), 'Status'], ['responsavel_nome', 'Responsável'],
      ['criado_em', 'Entrou em'], ['inicio_tratativa', 'Início tratativa'], ['ultima_acao', 'Última ação'], ['fechado_em', 'Fechado em'], ['motivo', 'Motivo'],
      [(l) => (vendasPor[l.id] || []).map((v) => v.produto_nome).join(' + '), 'Produtos vendidos'],
      [(l) => dec((vendasPor[l.id] || []).reduce((s, v) => s + num(v.valor_entrada), 0) || ''), 'Valor entrada'],
      [(l) => dec((vendasPor[l.id] || []).reduce((s, v) => s + num(v.valor_total), 0) || ''), 'Valor total'],
      ['score', 'Ranking (pts)'], [(l) => (classifDe(l) ? classifDe(l).ico + ' ' + classifDe(l).rot : ''), 'Classificação'],
      ['funcionarios', 'Nº Funcionários'], ['ramo', 'Ramo'], ['estado', 'Estado'],
      ['conhece_4blue', 'Conhece a 4blue'], ['programa_4blue', 'Programa 4blue'], ['desafio', 'Principal desafio'],
      [(l) => (l.interesse === 'sim' ? 'SIM' : ''), 'Levantou a mão (' + PROG() + ')'],
      [(l) => (l.checkin === 'sim' ? 'SIM' : ''), 'Participou do Treinamento'],
      [(l) => (l.presentes === 'sim' ? 'SIM' : ''), 'Baixou os presentes'],
      ['cliente_mdl', 'Cliente MDL'], ['cliente_ilu', 'Cliente ILU'],
      [(l) => eventosDe(l).map((e) => e.e + ' ' + e.t + (/sim/i.test(e.f) ? ' (foi)' : '')).join(' | '), 'Eventos anteriores'],
      ['origem_evento', 'Produto / origem'], ['origem', 'Entrada no sistema'], ['plataforma', 'Plataforma'], ['transacao', 'Transação'], [(l) => dec(l.valor_ingresso), 'Valor ingresso'], ['obs', 'Observações']
    ];
    baixarCsv(`leads-treinamento-gf-${new Date().toISOString().slice(0, 10)}.csv`, cab, ls);
    toast(ls.length + ' leads exportados', 'ok');
  }

  function exportarVendas() {
    const cab = [['data', 'Data'], ['lead_nome', 'Lead'], [(v) => { const l = S.leads.find((x) => x.id === v.lead_id); return l ? (l.tipo_ingresso === 'vip' ? 'VIP' : 'Padrão') : ''; }, 'Ingresso'],
      ['usuario_nome', 'Vendedor'], ['produto_nome', 'Produto'], [(v) => dec(v.valor_entrada), 'Valor entrada'], [(v) => dec(v.valor_total), 'Valor total'],
      ['parcelas', 'Parcelas'], ['forma_pagamento', 'Pagamento'], ['status', 'Status'], ['produto_fora_lista', 'Fora da lista'], ['obs', 'Obs']];
    baixarCsv(`vendas-treinamento-gf-${new Date().toISOString().slice(0, 10)}.csv`, cab, S.vendas);
  }

  function parseCsv(txt) {
    txt = txt.replace(/^﻿/, '');
    const primeira = txt.split(/\r?\n/)[0] || '';
    const sep = [';', ',', '\t'].sort((a, b) => primeira.split(b).length - primeira.split(a).length)[0];
    const linhas = []; let row = [], cur = '', q = false;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (q) {
        if (ch === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cur); linhas.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); linhas.push(row); }
    return linhas.filter((r) => r.some((c) => String(c).trim()));
  }

  /* ---------------- importação de planilha (CSV / Excel) com mapeamento */
  const CAMPOS_IMP = [
    ['nome', 'Nome do comprador *'], ['email', 'E-mail'], ['telefone', 'Telefone / WhatsApp'], ['ddd', 'DDD (se vier separado)'],
    ['cidade', 'Cidade'], ['transacao', 'Transação'], ['produto', 'Produto / ID do produto'], ['status', 'Status da compra'], ['data', 'Data da compra']
  ];
  const RUIM_NOME = /produto|afiliad|produtor|oferta|plano|coprodu|cupom|moeda|pagamento|parcela|origem|src|sck/;
  function pontuaColuna(campo, h) {
    const c = h.includes('comprador') || h.includes('cliente') || h.includes('buyer') ? 3 : 0;
    switch (campo) {
      case 'nome':
        if (RUIM_NOME.test(h) || h.includes('mail') || h.includes('telefone')) return 0;
        if (h === 'nome' || h === 'name' || h === 'nome completo') return 8 + c;
        if (h.includes('nome') || h.includes('name')) return 5 + c;
        return h === 'comprador' ? 6 : 0;
      case 'email':
        if (/afiliad|produtor/.test(h)) return 0;
        return h.includes('email') || h.includes('e-mail') ? 5 + c : 0;
      case 'telefone':
        if (/afiliad|produtor/.test(h) || h === 'ddd') return 0;
        return /telefone|celular|phone|whats|fone/.test(h) ? 5 + c + (h.includes('final') || h.includes('complet') ? 2 : 0) : 0;
      case 'ddd': return /(^|\W)ddd(\W|$)/.test(h) && !/telefone.*ddd.*\d/.test(h) && h.length < 30 ? 5 + c : 0;
      case 'cidade': return /cidade|city|municipio/.test(h) ? 5 + c : 0;
      case 'transacao':
        if (/data|status|valor|tipo|moeda|produto/.test(h)) return 0;
        if (h.includes('transa')) return h === 'transacao' || h.includes('codigo') ? 8 : 5;
        return /id da venda|id do pedido|pedido|order id|order_id|venda id/.test(h) ? 6 : 0;
      case 'produto':
        if (/valor|preco|price|moeda|produtor|nome do produtor/.test(h)) return 0;
        if (/(codigo|id|cod)\.? ?(do )?produto|product ?id/.test(h)) return 9;
        return /produto|product|ingresso|oferta/.test(h) ? 5 : 0;
      case 'status':
        if (!h.includes('status') && !h.includes('situacao')) return 0;
        return 5 + (/transa|venda|compra|pagamento/.test(h) ? 3 : 0);
      case 'data':
        if (!/data|date/.test(h) || /nasc|venc|garant|cancel|reembol/.test(h)) return 0;
        return 3 + (/aprova|compra|venda|pedido|transa/.test(h) ? 3 : 0);
      default: return 0;
    }
  }
  function detectarColunas(cab) {
    const h = cab.map(norm);
    const map = {};
    const usados = new Set();
    CAMPOS_IMP.forEach(([campo]) => {
      let melhor = -1, pts = 0;
      h.forEach((x, i) => { const p = pontuaColuna(campo, x.trim()); if (p > pts && !usados.has(i)) { pts = p; melhor = i; } });
      map[campo] = melhor;
      if (melhor >= 0) usados.add(melhor);
    });
    return map;
  }
  function acharCabecalho(linhas) {
    // primeira linha (entre as 15 primeiras) que parece cabeçalho
    for (let i = 0; i < Math.min(15, linhas.length); i++) {
      const h = linhas[i].map(norm).join(' | ');
      if (/(nome|name|comprador)/.test(h) && /(mail|telefone|phone|transa)/.test(h)) return i;
    }
    return 0;
  }
  const STATUS_OK = /aprovad|approved|complet|conclu|pago|paid/;
  const STATUS_FORA = /reembols|refund|chargeback|estorn|cancel|expir|recus|protest|disput|aguard|pendent|waiting|delayed|atras|bloq|devol/;

  function carregarSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((ok, erro) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      sc.onload = () => ok(window.XLSX);
      sc.onerror = () => erro(new Error('Não consegui carregar o leitor de Excel. Salve a planilha como CSV e tente de novo.'));
      document.head.appendChild(sc);
    });
  }

  async function lerArquivoTabela(f) {
    const nome = f.name.toLowerCase();
    if (/\.(xlsx|xls|ods)$/.test(nome)) {
      const XLSX = await carregarSheetJS();
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).map((r) => r.map((c) => String(c == null ? '' : c)))
        .filter((r) => r.some((c) => c.trim()));
    }
    const buf = await f.arrayBuffer();
    let txt = new TextDecoder('utf-8').decode(buf);
    if (txt.includes('�')) txt = new TextDecoder('iso-8859-1').decode(buf);
    return parseCsv(txt);
  }

  function abrirImportar() {
    let dados = null, iCab = 0, cab = [], mapa = {}, linhas = [], resumo = {};
    const listaProds = () => (S.config.produtos || []);
    abrirSheet({
      titulo: 'Importar planilha de compras',
      largo: true,
      corpo: `
        <p class="small muted" style="margin-top:0">Na Hotmart: <b>Vendas → Relatório de vendas</b> → filtre e <b>Exportar</b>. Na Kiwify: <b>Vendas</b> → filtre pelo produto → <b>Exportar</b> (CSV). Produtos do sistema: ${listaProds().map((pr) => '<b>' + esc(pr.nome) + '</b>').join(', ') || '<b>nenhum cadastrado</b>'}. Envie o arquivo aqui (CSV ou Excel). Leads que já existem são ignorados.</p>
        <div class="field"><label>Arquivo (.csv, .xlsx, .xls)</label><input class="input" type="file" accept=".csv,.xlsx,.xls,.ods,text/csv" id="imp-arq"></div>
        <div id="imp-map"></div>
        <div id="imp-prev" class="small"></div>`,
      rodape: `<button class="btn line" data-x>Cancelar</button><button class="btn line" id="imp-sim" disabled data-loading=" Conferindo...">Simular</button><button class="btn amarelo" id="imp-ok" disabled data-loading=" Importando...">Importar</button>`,
      onMount: (sh) => {
        const $map = sh.querySelector('#imp-map');
        const prev = sh.querySelector('#imp-prev');
        const ok = sh.querySelector('#imp-ok');
        const sim = sh.querySelector('#imp-sim');

        const pintarMapa = () => {
          const ops = (sel) => `<option value="-1">— não usar —</option>` + cab.map((c, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(c || '(coluna ' + (i + 1) + ')')}</option>`).join('');
          $map.innerHTML = `
            <div class="secao" style="margin-top:4px">Confira as colunas</div>
            <div class="row" style="flex-wrap:wrap">${CAMPOS_IMP.map(([k, r]) => `<div class="field" style="min-width:210px"><label>${r}</label><select class="input" data-map="${k}">${ops(mapa[k])}</select></div>`).join('')}</div>
            <div class="row" style="flex-wrap:wrap">
              <div class="field" style="min-width:230px"><label>Produto quando não der para identificar</label><select class="input" id="imp-tipo">
              ${(S.config.produtos || []).map((pr) => `<option value="${esc(pr.id)}">${esc(pr.nome)}</option>`).join('')}
              <option value="padrao">Outro — entra como Padrão</option><option value="vip">Outro — entra como VIP</option></select></div>
              <label class="check" style="min-width:210px;align-self:center"><input type="checkbox" id="imp-so-aprov" checked><span>Importar só compras <b>aprovadas/completas</b> (ignora reembolsadas, canceladas, aguardando pagamento)</span></label>
            </div>`;
          $map.querySelectorAll('select[data-map]').forEach((s2) => s2.addEventListener('change', () => { mapa[s2.dataset.map] = Number(s2.value); montar(); }));
          $map.querySelector('#imp-tipo').addEventListener('change', montar);
          $map.querySelector('#imp-so-aprov').addEventListener('change', montar);
        };

        const montar = () => {
          const padrao = $map.querySelector('#imp-tipo').value;
          const soAprov = $map.querySelector('#imp-so-aprov').checked;
          const v = (r, k) => (mapa[k] >= 0 ? String(r[mapa[k]] || '').trim() : '');
          resumo = { total: 0, fora: 0, semNome: 0, outros: 0, porStatus: {} };
          linhas = [];
          dados.slice(iCab + 1).forEach((r) => {
            resumo.total++;
            const st = v(r, 'status');
            if (st) resumo.porStatus[st] = (resumo.porStatus[st] || 0) + 1;
            const stn = norm(st);
            if (soAprov && st && (STATUS_FORA.test(stn) || !STATUS_OK.test(stn))) { resumo.fora++; return; }
            const prod = v(r, 'produto');
            const cfgProds = S.config.produtos || [];
            const padraoCfg = cfgProds.find((x) => x.id === padrao);
            let tipo = padraoCfg ? padraoCfg.tipo : padrao;
            let origem = padraoCfg ? padraoCfg.nome : '';
            let achadoPlat = '';
            if (prod) {
              const achado = cfgProds.find((x) => prod.includes(x.id)) || cfgProds.find((x) => norm(prod).includes(norm(x.nome)));
              if (achado) { tipo = achado.tipo; origem = achado.nome; achadoPlat = achado.plataforma || ''; }
              else if (/vip/i.test(prod)) tipo = 'vip';
              else if (/^\d{5,}$/.test(prod) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(prod)) { resumo.outros++; return; } // produto que não está na lista
            }
            let tel = v(r, 'telefone');
            const ddd = v(r, 'ddd').replace(/\D/g, '');
            if (ddd && tel && soDig(tel).length < 10) tel = ddd + soDig(tel);
            const nome = v(r, 'nome');
            if (!nome) { resumo.semNome++; return; }
            const dt = v(r, 'data');
            let criado = '';
            const m = dt.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
            if (m) criado = `${m[3]}-${m[2]}-${m[1]}T${m[4] || '12'}:${m[5] || '00'}:00`;
            else if (/^\d{4}-\d{2}-\d{2}/.test(dt)) criado = dt.slice(0, 19).replace(' ', 'T');
            linhas.push({ nome, email: v(r, 'email'), telefone: tel, cidade: v(r, 'cidade'), transacao: v(r, 'transacao'), tipo_ingresso: tipo, origem_evento: origem, status_hotmart: st, criado_em: criado, plataforma: achadoPlat || (padraoCfg ? padraoCfg.plataforma : '') });
          });
          const vip = linhas.filter((l) => l.tipo_ingresso === 'vip').length;
          const semTel = linhas.filter((l) => soDig(l.telefone).length < 10).length;
          const sts = Object.entries(resumo.porStatus).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${esc(k)}: ${n}`).join(' · ');
          prev.innerHTML = `<div class="card" style="padding:12px;box-shadow:none;border:1.5px solid var(--borda)">
            <b>${linhas.length} compras prontas para importar</b> · ${vip} VIP · ${linhas.length - vip} Padrão${semTel ? ` · <span style="color:var(--vermelho)">${semTel} sem telefone</span>` : ''}<br>
            <span class="muted">${resumo.total} linhas no arquivo${resumo.fora ? ` · ${resumo.fora} fora por status` : ''}${resumo.outros ? ` · ${resumo.outros} de outros produtos` : ''}${resumo.semNome ? ` · ${resumo.semNome} sem nome` : ''}</span>
            ${sts ? `<br><span class="muted">Status no arquivo: ${sts}</span>` : ''}
            <div style="margin-top:8px">${linhas.slice(0, 4).map((l) => `<div>• ${esc(l.nome)} — ${esc(telFmt(l.telefone))} — ${esc(l.email)} — <b>${l.tipo_ingresso === 'vip' ? 'VIP' : 'Padrão'}</b></div>`).join('')}</div></div>
            <div id="imp-res"></div>`;
          ok.disabled = sim.disabled = !linhas.length || mapa.nome < 0;
        };

        sh.querySelector('#imp-arq').addEventListener('change', async (e) => {
          const f = e.target.files[0]; if (!f) return;
          prev.textContent = 'Lendo arquivo…';
          try {
            dados = await lerArquivoTabela(f);
            if (dados.length < 2) throw new Error('Arquivo sem linhas.');
            iCab = acharCabecalho(dados);
            cab = dados[iCab];
            mapa = detectarColunas(cab);
            pintarMapa();
            montar();
          } catch (err) { prev.textContent = 'Não consegui ler o arquivo: ' + err.message; ok.disabled = sim.disabled = true; }
        });
        const enviar = (simular) => async () => {
          const r = await api('admin.importar', { linhas, simular });
          const box = sh.querySelector('#imp-res');
          const txt = `${r.importados} novos leads (${r.vip} VIP) · ${r.duplicados} já existiam${r.viraram_vip ? ` · ${r.viraram_vip} viraram VIP` : ''}${r.invalidos ? ` · ${r.invalidos} sem contato` : ''}`;
          if (simular) { box.innerHTML = `<div class="cliente-box mdl" style="margin-top:10px"><b>Simulação (nada foi gravado)</b>${txt}</div>`; return; }
          fecharSheet();
          toast('Importado: ' + txt, 'ok');
          await carregar();
        };
        sim.addEventListener('click', (ev) => comBotao(ev.currentTarget, enviar(true)));
        ok.addEventListener('click', (ev) => comBotao(ev.currentTarget, enviar(false)));
      }
    });
  }

  /* ---------------- importação de check-in / confirmações / diagnóstico / dados */
  const IMP_MARCOS = {
    interesse: ['Lista de interesse', 'Lista de quem levantou a mão para conhecer o programa (exportação do ActiveCampaign, por exemplo). Quem já é lead recebe a tag <b>Interessado</b>; quem não está no sistema entra como lead novo. Todos são divididos entre as concierges na hora.'],
    perfil: ['Perfil dos participantes', 'Planilha com cargo, empresa, faturamento, nº de funcionários, ramo e relação com a 4blue. É o que alimenta o ranking de cada lead.'],
    checkin: ['Presença no Treinamento', 'Lista de presença do Treinamento (quem assistiu). Marca "Participou do Treinamento" em cada lead encontrado.'],
    presentes: ['Baixou os presentes', 'Lista de quem baixou os materiais/presentes do Treinamento. Marca a tag no card de cada lead encontrado.'],
    confirmacao: ['Confirmações de presença', 'Lista de quem confirmou presença. Marca "Confirmou presença".'],
    diagnostico: ['Respostas do diagnóstico', 'Planilha de respostas do formulário. Marca o diagnóstico como feito e guarda as respostas no card do lead.'],
    obrigado: ['Dados da página de obrigado', 'Planilha com os dados extras (ActiveCampaign, formulário do obrigado). Preenche empresa, cargo e faturamento quando estiverem vazios e guarda o resto no card.']
  };

  const CAMPOS_PERFIL_IMP = [
    ['cargo', 'Cargo', /cargo|funcao|função|posicao|posição/],
    ['empresa', 'Empresa', /empresa.*revis|^empresa|razao|razão|negocio|negócio/],
    ['ramo', 'Ramo / segmento', /ramo|segmento|setor|nicho|atividade/],
    ['faturamento', 'Faturamento', /faturamento/],
    ['funcionarios', 'Nº de funcionários', /funcion|colaborad|equipe|time|quantos/],
    ['estado', 'Estado', /^estado$|^uf$/],
    ['cidade', 'Cidade', /cidade|municipio|município/],
    ['conhece_4blue', 'Conhece a 4blue', /conhece/],
    ['programa_4blue', 'Programa 4blue', /programa|mentoria|iluminismo|maquina|máquina/],
    ['desafio', 'Principal desafio', /desafio|dor|dificuldade|problema/]
  ];
  function detectarPerfil(cab) {
    const h = cab.map((x) => norm(x).trim());
    const map = {};
    CAMPOS_PERFIL_IMP.forEach(([k, , re]) => {
      let achou = -1;
      h.forEach((x, i) => { if (achou < 0 && re.test(x)) achou = i; });
      map[k] = achou;
    });
    return map;
  }

  function abrirImportarMarcos(tipo) {
    const [titulo, texto] = IMP_MARCOS[tipo];
    let dados = null, iCab = 0, cab = [], mapa = {}, linhas = [], mapaP = {};
    const guarda = tipo === 'diagnostico' || tipo === 'obrigado';
    const ehPerfil = tipo === 'perfil';
    abrirSheet({
      titulo: titulo,
      largo: true,
      corpo: `
        <p class="small muted" style="margin-top:0">${texto} A pessoa é encontrada por <b>e-mail</b> ou <b>telefone</b>.</p>
        <div class="field"><label>Arquivo (.csv, .xlsx, .xls)</label><input class="input" type="file" accept=".csv,.xlsx,.xls,.ods,text/csv" id="mi-arq"></div>
        <div id="mi-map"></div>
        <div id="mi-prev" class="small"></div>`,
      rodape: `<button class="btn line" data-x>Cancelar</button><button class="btn line" id="mi-sim" disabled data-loading=" Conferindo...">Simular</button><button class="btn amarelo" id="mi-ok" disabled data-loading=" Importando...">Importar</button>`,
      onMount: (sh) => {
        const $map = sh.querySelector('#mi-map'), prev = sh.querySelector('#mi-prev');
        const ok = sh.querySelector('#mi-ok'), sim = sh.querySelector('#mi-sim');
        const campos = [['email', 'E-mail'], ['telefone', 'Telefone'], ['nome', (tipo === 'interesse' || ehPerfil) ? 'Nome' : 'Nome (só para conferir)']];
        const pintar = () => {
          const ops = (sel) => '<option value="-1">— não usar —</option>' + cab.map((c, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(c || '(coluna ' + (i + 1) + ')')}</option>`).join('');
          $map.innerHTML = `<div class="secao" style="margin-top:4px">Confira as colunas</div>
            <div class="row" style="flex-wrap:wrap">${campos.map(([k, r]) => `<div class="field" style="min-width:200px"><label>${r}</label><select class="input" data-map="${k}">${ops(mapa[k])}</select></div>`).join('')}</div>
            ${guarda ? '<p class="hint">As outras colunas da planilha entram como respostas no card do lead.</p>' : ''}
            ${ehPerfil ? `<div class="secao">Campos do perfil (alimentam o ranking)</div>
              <div class="row" style="flex-wrap:wrap">${CAMPOS_PERFIL_IMP.map(([k, r]) => `<div class="field" style="min-width:190px"><label>${r}</label><select class="input" data-mapp="${k}">${ops(mapaP[k])}</select></div>`).join('')}</div>
              <label class="check"><input type="checkbox" id="ip-sobre"><span>Sobrescrever o que já está preenchido no lead</span></label>
              <label class="check"><input type="checkbox" id="ip-checkin" checked><span>Marcar essas pessoas como <b>participaram do Treinamento</b></span></label>
              <label class="check"><input type="checkbox" id="ip-criar"><span>Criar quem ainda não está no sistema (entra como lead novo e já distribuído)</span></label>` : ''}`;
          $map.querySelectorAll('select[data-map]').forEach((sel) => sel.addEventListener('change', () => { mapa[sel.dataset.map] = Number(sel.value); montar(); }));
          $map.querySelectorAll('select[data-mapp]').forEach((sel) => sel.addEventListener('change', () => { mapaP[sel.dataset.mapp] = Number(sel.value); montar(); }));
        };
        const montar = () => {
          const v = (r, k) => (mapa[k] >= 0 ? String(r[mapa[k]] || '').trim() : '');
          linhas = [];
          dados.slice(iCab + 1).forEach((r) => {
            const email = v(r, 'email'), tel = v(r, 'telefone');
            if (!email && !tel) return;
            const item = { email, telefone: tel, nome: v(r, 'nome') };
            if (ehPerfil) {
              const perfil = {};
              CAMPOS_PERFIL_IMP.forEach(([k]) => { const i = mapaP[k]; if (i >= 0) { const val = String(r[i] || '').trim(); if (val) perfil[k] = val; } });
              item.perfil = perfil;
            }
            if (guarda) {
              const respostas = {};
              cab.forEach((c, i) => {
                if ([mapa.email, mapa.telefone].indexOf(i) >= 0) return;
                const val = String(r[i] || '').trim();
                if (c && val) respostas[c] = val;
              });
              item.respostas = respostas;
            }
            linhas.push(item);
          });
          prev.innerHTML = `<div class="card" style="padding:12px;box-shadow:none;border:1.5px solid var(--borda)">
            <b>${linhas.length} linhas com contato</b><div class="muted">${dados.length - iCab - 1} linhas no arquivo</div>
            ${linhas.slice(0, 3).map((l) => `<div style="margin-top:4px">• ${esc(l.nome || '')} ${esc(l.email || telFmt(l.telefone))}${l.respostas ? ` <span class="muted">(${Object.keys(l.respostas).length} respostas)</span>` : ''}</div>`).join('')}</div>
            <div id="mi-res"></div>`;
          ok.disabled = sim.disabled = !linhas.length;
        };
        sh.querySelector('#mi-arq').addEventListener('change', async (e) => {
          const f = e.target.files[0]; if (!f) return;
          prev.textContent = 'Lendo arquivo…';
          try {
            dados = await lerArquivoTabela(f);
            if (dados.length < 2) throw new Error('Arquivo sem linhas.');
            iCab = acharCabecalho(dados);
            cab = dados[iCab];
            const det = detectarColunas(cab);
            mapa = { email: det.email, telefone: det.telefone, nome: det.nome };
            if (ehPerfil) mapaP = detectarPerfil(cab);
            pintar(); montar();
          } catch (err) { prev.textContent = 'Não consegui ler o arquivo: ' + err.message; ok.disabled = sim.disabled = true; }
        });
        const enviar = (simular) => async () => {
          const extra = ehPerfil ? {
            sobrescrever: sh.querySelector('#ip-sobre').checked,
            marcar_checkin: sh.querySelector('#ip-checkin').checked,
            criar: sh.querySelector('#ip-criar').checked
          } : {};
          const r = await api('admin.importar.marcos', Object.assign({ tipo, linhas, simular }, extra));
          const box = sh.querySelector('#mi-res');
          if (ehPerfil) {
            const txt3 = `${r.encontrados} leads encontrados · ${r.atualizados} atualizados · ${r.criados} criados · ${r.nao_encontrados} fora do sistema`;
            if (simular) {
              box.innerHTML = `<div class="cliente-box exmdl" style="margin-top:10px"><b>Simulação (nada foi gravado)</b>${txt3}
                ${r.exemplos_nao_encontrados.length ? `<div class="small" style="margin-top:6px">Não encontrados: ${esc(r.exemplos_nao_encontrados.join(', '))}</div>` : ''}</div>`;
              return;
            }
            fecharSheet(); toast(txt3, 'ok'); await carregar(); return;
          }
          if (tipo === 'interesse') {
            const porU = Object.entries(r.por_usuario || {}).map(([n, q]) => `${n} (${q})`).join(', ');
            const txt2 = `${r.marcados} leads já no sistema · ${r.criados} leads novos criados${r.ja_tinham ? ` · ${r.ja_tinham} já estavam na lista` : ''}`;
            if (simular) {
              box.innerHTML = `<div class="cliente-box exmdl" style="margin-top:10px"><b>Simulação (nada foi gravado)</b>${txt2}</div>`;
              return;
            }
            fecharSheet();
            toast(`${r.marcados + r.criados} interessados no ${PROG()}${porU ? ' · ' + porU : ''}`, 'ok');
            await carregar();
            return;
          }
          const txt = `${r.encontrados} leads encontrados · ${r.nao_encontrados} não estão no sistema`;
          if (simular) {
            box.innerHTML = `<div class="cliente-box exmdl" style="margin-top:10px"><b>Simulação (nada foi gravado)</b>${txt}
              ${r.exemplos_nao_encontrados.length ? `<div class="small" style="margin-top:6px">Não encontrados: ${esc(r.exemplos_nao_encontrados.join(', '))}</div>` : ''}</div>`;
            return;
          }
          fecharSheet();
          toast(`${r.atualizados} leads atualizados · ${r.nao_encontrados} não encontrados`, 'ok');
          await carregar();
        };
        sim.addEventListener('click', (ev) => comBotao(ev.currentTarget, enviar(true)));
        ok.addEventListener('click', (ev) => comBotao(ev.currentTarget, enviar(false)));
      }
    });
  }

  /* ---------------- importação direta pela API da Hotmart */
  function abrirHotmartApi() {
    const st = (S.config && S.config.hotmart_api) || {};
    abrirSheet({
      titulo: 'Puxar compras da Hotmart (API)',
      corpo: `
        <p class="small muted" style="margin-top:0">Busca todas as compras aprovadas dos produtos <b>Hotmart</b> direto na Hotmart, com nome, e-mail e telefone (para a Kiwify use a importação por planilha): ${(S.config.produtos || []).filter((pr) => pr.plataforma !== 'kiwify').map((pr) => `<b>${esc(pr.nome)}</b> (${esc(pr.id)})`).join(', ') || '<b>nenhum produto cadastrado</b>'}. Quem já está no sistema é ignorado, e compras reembolsadas/canceladas movem o lead para Reembolso.</p>
        <div class="cliente-box ${st.configurada ? 'mdl' : 'exmdl'}"><b>Credencial</b>${st.configurada ? 'Configurada (' + esc(st.client_id) + ')' : 'Ainda não configurada'}</div>
        <details ${st.configurada ? '' : 'open'} style="margin-bottom:12px">
          <summary class="small" style="cursor:pointer;font-weight:700;margin-bottom:10px">${st.configurada ? 'Trocar credencial' : 'Cadastrar credencial'}</summary>
          <p class="small muted">Na Hotmart: <b>Ferramentas → Credenciais Hotmart (API)</b> → <b>Criar credencial</b> (tipo API Hotmart). Copie o <b>Client ID</b>, o <b>Client Secret</b> e o <b>Basic</b>.</p>
          <div class="field"><label>Client ID</label><input class="input" id="h-id" autocomplete="off"></div>
          <div class="field"><label>Client Secret</label><input class="input" id="h-sec" type="password" autocomplete="new-password"></div>
          <div class="field"><label>Basic (opcional)</label><input class="input" id="h-basic" type="password" autocomplete="new-password" placeholder="Basic xxxxx"></div>
          <button class="btn line sm" id="h-salvar" data-loading=" Salvando...">Salvar credencial</button>
        </details>
        <div class="field"><label>Buscar compras desde</label><input class="input" id="h-desde" type="date" value="2026-01-01"></div>
        <p class="hint">Use a data em que as vendas dos ingressos começaram. Pode levar até alguns minutos em contas com muitas vendas.</p>
        <div id="h-res"></div>`,
      rodape: `<button class="btn line" data-x>Fechar</button><button class="btn line" id="h-sim" data-loading=" Consultando...">Simular</button><button class="btn amarelo" id="h-imp" data-loading=" Importando...">Importar</button>`,
      onMount: (sh) => {
        const res = sh.querySelector('#h-res');
        sh.querySelector('#h-salvar').addEventListener('click', (ev) => comBotao(ev.currentTarget, async () => {
          const id = sh.querySelector('#h-id').value.trim(), sec = sh.querySelector('#h-sec').value.trim();
          if (!id || !sec) throw new Error('Preencha Client ID e Client Secret.');
          const r = await api('admin.hotmart.cred', { client_id: id, client_secret: sec, basic: sh.querySelector('#h-basic').value.trim() });
          S.config.hotmart_api = r;
          toast('Credencial salva', 'ok');
          abrirHotmartApi();
        }));
        const rodar = (simular) => async () => {
          res.innerHTML = '<p class="small muted">Consultando a Hotmart… isso pode levar alguns minutos, não feche esta janela.</p>';
          try {
            const r = await api('admin.hotmart.importar', { desde: sh.querySelector('#h-desde').value, simular });
            res.innerHTML = `<div class="cliente-box ${simular ? 'exmdl' : 'mdl'}"><b>${simular ? 'Simulação — nada foi gravado' : 'Importação concluída'}</b>
              ${r.encontradas} compras aprovadas na Hotmart desde ${esc(String(r.desde).split('-').reverse().join('/'))}<br>
              <span class="small">${Object.entries(r.por_produto || {}).map(([k, n]) => esc(k) + ': ' + n).join(' · ')}</span><br>
              <b style="display:inline;text-transform:none;font-size:14px">${r.importados} ${simular ? 'seriam importados' : 'novos leads'}</b> (${r.vip} VIP) · ${r.duplicados} já existiam${r.viraram_vip ? ` · ${r.viraram_vip} ${simular ? (r.viraram_vip > 1 ? 'virariam' : 'viraria') : (r.viraram_vip > 1 ? 'viraram' : 'virou')} VIP` : ''}${r.sem_telefone ? ` · <span style="color:var(--vermelho)">${r.sem_telefone} sem telefone</span>` : ''}<br>
              ${r.canceladas} compras canceladas/reembolsadas na Hotmart · ${r.reembolsos_marcados} ${simular ? 'iriam' : 'foram'} para Reembolso
              ${r.exemplos.length ? `<div class="small" style="margin-top:6px">${r.exemplos.map((x) => '• ' + esc(x)).join('<br>')}</div>` : ''}</div>`;
            if (!simular) { toast(r.importados + ' leads importados da Hotmart', 'ok'); carregar(true); }
          } catch (e) {
            res.innerHTML = `<div class="cliente-box" style="background:var(--vermelho-2)"><b>Não deu certo</b>${esc(e.message)}</div>`;
          }
        };
        sh.querySelector('#h-sim').addEventListener('click', (ev) => comBotao(ev.currentTarget, rodar(true)));
        sh.querySelector('#h-imp').addEventListener('click', (ev) => comBotao(ev.currentTarget, rodar(false)));
      }
    });
  }

  /* ---------------------------------------------------- eventos globais */
  function acoesGlobais(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const id = el.dataset.id;
    const act = el.dataset.act;
    switch (act) {
      case 'wa': abrirWhats(id); break;
      case 'abrir': abrirLead(id); break;
      case 'editar': abrirFormLead(id); break;
      case 'ganho': abrirGanho(id); break;
      case 'fase': abrirFase(id); break;
      case 'marco': abrirMarco(id, el.dataset.campo); break;
      case 'copiar-upgrade': copiarTexto(S.links.upgrade); break;
      case 'copiar-diag': copiarTexto(S.links.diagnostico); break;
      case 'ver-funil': S.funilLista = !S.funilLista; renderMain(); break;
      case 'perdido': abrirMotivo(id, 'perdido'); break;
      case 'reembolso': abrirMotivo(id, 'reembolso'); break;
      case 'novo-lead': abrirFormLead(); break;
      case 'mais': S.limite += 60; renderMain(); break;
      case 'reabrir':
        comBotao(el, async () => { atualizaLead(await api('lead.reabrir', { id })); toast('Lead voltou para tratativas', 'ok'); abrirLead(id); renderMain(); });
        break;
      case 'nota': {
        const inp = document.getElementById('nota-txt');
        comBotao(el, async () => {
          if (!inp.value.trim()) throw new Error('Escreva a anotação.');
          await api('lead.nota', { id, texto: inp.value });
          inp.value = '';
          const l = S.leads.find((x) => x.id === id);
          if (l && l.responsavel_id === S.user.id) l.ultima_acao = agoraLocal();
          carregarHistorico(id, el.closest('.sheet'));
          toast('Anotação salva', 'ok');
        });
        break;
      }
      case 'excluir-venda':
        if (!confirm('Excluir esta venda?')) return;
        comBotao(el, async () => {
          const v = S.vendas.find((x) => x.id === id);
          await api('venda.excluir', { id });
          S.vendas = S.vendas.filter((x) => x.id !== id);
          await carregar(true);
          if (v) abrirLead(v.lead_id);
          toast('Venda excluída', 'ok');
        });
        break;
      case 'atribuir': {
        const uid = document.getElementById('adm-resp').value;
        if (!uid) { toast('Escolha um responsável.', 'erro'); return; }
        comBotao(el, async () => { atualizaLead(await api('admin.lead.atribuir', { id, usuario_id: uid })); toast('Lead atribuído', 'ok'); abrirLead(id); renderMain(); });
        break;
      }
      case 'liberar':
        if (!confirm('Devolver este lead para a lista de contatos (sem responsável)?')) return;
        comBotao(el, async () => { atualizaLead(await api('admin.lead.liberar', { id })); toast('Lead devolvido', 'ok'); abrirLead(id); renderMain(); });
        break;
      case 'excluir-lead':
        if (!confirm('Excluir definitivamente este lead?')) return;
        comBotao(el, async () => { await api('admin.lead.excluir', { id }); S.leads = S.leads.filter((l) => l.id !== id); fecharSheet(); toast('Lead excluído', 'ok'); renderMain(); });
        break;
      case 'exportar': exportarLeads(); break;
      case 'exportar-vendas': exportarVendas(); break;
      case 'importar': abrirImportar(); break;
      case 'hotmart-api': abrirHotmartApi(); break;
      case 'novo-usuario': abrirFormUsuario(); break;
      case 'editar-usuario': abrirFormUsuario(id); break;
      case 'nova-fase': abrirFormFase(); break;
      case 'editar-fase': abrirFormFase(id); break;
      case 'distribuir':
        comBotao(el, async () => {
          const prev = await api('admin.distribuir', { simular: true });
          if (!prev.distribuidos) { toast('Não há leads sem concierge.', 'erro'); return; }
          const txt = Object.entries(prev.por_usuario).map(([k, n]) => `${k}: ${n}`).join(' · ');
          if (!confirm(`Distribuir ${prev.distribuidos} leads entre ${prev.concierges} concierges?\n\n${txt}`)) return;
          const r = await api('admin.distribuir', {});
          toast(`${r.distribuidos} leads distribuídos`, 'ok');
          await carregar();
        });
        break;
      case 'novo-produto': abrirFormProduto(); break;
      case 'editar-produto': abrirFormProduto(id); break;
      case 'nova-mensagem': abrirFormMensagem(); break;
      case 'editar-mensagem': abrirFormMensagem(id); break;
      case 'sair': api('logout').catch(() => {}); sairLocal(); break;
      case 'ordem': S.ordem = el.dataset.ordem; renderMain(); break;
      case 'dup-ver': comBotao(el, verDuplicados); break;
      case 'dup-juntar': comBotao(el, juntarDuplicados); break;
      case 'copiar-campo': { const alvo = document.getElementById(el.dataset.alvo); if (alvo) copiarTexto(alvo.value); break; }
      case 'add-produto-hot': {
        const box = document.getElementById('cfg-produtos');
        box.insertAdjacentHTML('beforeend', linhaProduto({ id: '', nome: '', tipo: 'padrao', plataforma: 'hotmart' }));
        box.lastElementChild.querySelector('[data-p="id"]').focus();
        break;
      }
      case 'del-produto-hot': el.closest('.prod-linha').remove(); break;
      case 'sincronizar-diag':
        comBotao(el, async () => {
          const r = await api('admin.diagnostico.sincronizar');
          if (r.erro) {
            const erroBox = document.getElementById('diag-res');
            if (erroBox) erroBox.innerHTML = `<div class="cliente-box" style="background:var(--vermelho-2)"><b>Não deu certo</b>${esc(r.erro)}</div>`;
            return;
          }
          await carregar();
          const box = document.getElementById('diag-res');
          if (box) box.innerHTML = `<div class="cliente-box mdl"><b>Aba ${esc(r.aba || '')}</b>
            ${r.pessoas || 0} pessoas responderam · <b style="display:inline;text-transform:none;font-size:14px">${r.atualizados || 0} leads preenchidos</b>
            ${r.ja_estavam ? ` · ${r.ja_estavam} já estavam em dia` : ''} · ${r.sem_lead || 0} não são leads daqui
            ${(r.exemplos_sem_lead || []).length ? `<div class="small" style="margin-top:6px">Fora da base: ${esc(r.exemplos_sem_lead.join(', '))}</div>` : ''}</div>`;
          toast(`${r.atualizados || 0} leads com diagnóstico`, 'ok');
        });
        break;
      case 'imp-interesse': abrirImportarMarcos('interesse'); break;
      case 'imp-checkin': abrirImportarMarcos('checkin'); break;
      case 'imp-presentes': abrirImportarMarcos('presentes'); break;
      case 'imp-perfil': abrirImportarMarcos('perfil'); break;
      case 'imp-confirmacao': abrirImportarMarcos('confirmacao'); break;
      case 'imp-diagnostico': abrirImportarMarcos('diagnostico'); break;
      case 'imp-obrigado': abrirImportarMarcos('obrigado'); break;
      case 'copiar': {
        const inp = document.getElementById('wh-url');
        (navigator.clipboard ? navigator.clipboard.writeText(inp.value) : Promise.reject()).then(() => toast('URL copiada', 'ok')).catch(() => { inp.select(); document.execCommand('copy'); toast('URL copiada', 'ok'); });
        break;
      }
      case 'salvar-config':
        comBotao(el, async () => {
          const prods = [...document.querySelectorAll('#cfg-produtos .prod-linha')].map((el) => [
            el.querySelector('[data-p="id"]').value.trim(),
            el.querySelector('[data-p="nome"]').value.trim(),
            el.querySelector('[data-p="tipo"]').value,
            el.querySelector('[data-p="plat"]').value
          ]).filter((x) => x[0]).map((x) => x.join(';')).join('\n');
          S.config = await api('admin.config', { config: { HOTMART_PRODUTOS: prods, BASE_CLIENTES_ID: document.getElementById('cfg-base').value, HOTMART_MODO_TESTE: document.getElementById('cfg-teste').checked ? 'SIM' : 'NAO',
            NOME_SISTEMA: (document.getElementById('cfg-nome') || {}).value || undefined,
            QUEM_GERENCIA: (document.getElementById('cfg-gerencia') || {}).value || undefined,
            MARCOS_ATIVOS: [...document.querySelectorAll('[data-marco]')].filter((x) => x.checked).map((x) => x.dataset.marco).join(','),
            UPGRADE_VIP_URL: (document.getElementById('cfg-upg') || {}).value || undefined, UPGRADE_VIP_VALOR: (document.getElementById('cfg-upg-val') || {}).value || undefined,
            DIAGNOSTICO_URL: document.getElementById('cfg-diag').value.trim(), EVENTO_DATA: document.getElementById('cfg-evento').value,
            DIAG_PLANILHA_ID: (document.getElementById('cfg-diag-id') || {}).value || undefined,
            DIAG_ABA: (document.getElementById('cfg-diag-aba') || {}).value || undefined,
            KIWIFY_TOKEN: ((document.getElementById('cfg-kiwi-token') || {}).value || '').trim() || undefined,
            PROGRAMA_OFERTA: (document.getElementById('cfg-prog') || {}).value || undefined,
            DISTRIBUICAO_AUTO: document.getElementById('cfg-dist').checked ? 'SIM' : 'NAO' } });
          S.links = { upgrade: S.config.upgrade_url, upgrade_valor: S.config.upgrade_valor, diagnostico: S.config.diagnostico_url, evento: S.config.evento_data, programa: S.config.programa_oferta };
          S.marcosAtivos = S.config.marcos_ativos || S.marcosAtivos;
          if (S.config.nome_sistema) { S.nomeSistema = S.config.nome_sistema; document.title = S.nomeSistema; }
          toast('Configurações salvas', 'ok');
          renderMain();
        });
        break;
      case 'processar-fila':
        comBotao(el, async () => {
          const r = await api('admin.processarFila');
          toast(r.ocupado ? 'A fila já está sendo processada, aguarde.' : `${r.processados} webhook(s) processado(s)`, 'ok');
          await carregar();
        });
        break;
      case 'sincronizar':
        comBotao(el, async () => {
          const r = await api('admin.sincronizar');
          toast(`${r.clientes} contatos na base · ${r.leads_atualizados} leads atualizados`, 'ok');
          await carregar();
        });
        break;
      default:
    }
  }

  document.addEventListener('click', (ev) => {
    if (ev.target.closest('#sheet-root')) return; // sheets tratam os próprios cliques
    const main = ev.target.closest('#main');
    if (!main) return;
    const chip = ev.target.closest('[data-chip]');
    if (chip) { S.filtro = chip.dataset.chip; S.limite = 60; renderMain(); return; }
    const st = ev.target.closest('[data-adm-status]');
    if (st) { S.adm.status = st.dataset.admStatus; S.limite = 60; renderMain(); return; }
    const cat = ev.target.closest('[data-cat]');
    if (cat) { S.catalogo = cat.dataset.cat; renderMain(); return; }
    acoesGlobais(ev);
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.adm) { S.adm[t.dataset.adm] = t.value; S.limite = 60; renderMain(); }
    if (t.dataset.painel) { S.painel[t.dataset.painel] = t.value; renderMain(); }
  });
  let tBusca;
  document.addEventListener('input', (ev) => {
    if (!ev.target.matches('input[data-busca]')) return;
    clearTimeout(tBusca);
    const v = ev.target.value;
    tBusca = setTimeout(() => { S.busca = v; S.limite = 60; S._focoBusca = true; renderMain(); }, 220);
  });

  /* ------------------------------------------------------------ início */
  function iniciar() {
    document.title = CFG.NOME || document.title;
    const s = store.get('lw_sessao');
    if (s && s.token && s.user) {
      S.token = s.token; S.user = s.user;
      S.modo = s.user.perfil === 'coordenador' ? (s.modo || 'coord') : 'usuario';
      S.view = s.view || (S.modo === 'coord' ? 'painel' : 'novo');
      if (DEMO) window.DemoAPI.restaurar(s.token, s.user.id);
      renderShell();
      carregar();
    } else {
      renderLogin();
    }
    const seg = Math.max(20, Number(CFG.ATUALIZAR_SEGUNDOS) || 60);
    setInterval(() => {
      if (S.token && document.visibilityState === 'visible' && !$sheet.innerHTML) carregar(true);
    }, seg * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && S.token && !$sheet.innerHTML) carregar(true);
    });
  }

  // guarda a aba atual
  window.addEventListener('beforeunload', () => { if (S.token) store.set('lw_sessao', { token: S.token, user: S.user, modo: S.modo, view: S.view }); });

  iniciar();
})();
