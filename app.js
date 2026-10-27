/**
 * ============================================================================
 *  Leads - Treinamento Gestão Financeira e Fluxo de Caixa
 *  [2026.10.27] WORKSHOP PAGO (ILU)  —  BACKEND (Google Apps Script)
 * ============================================================================
 *  Este script é o "cérebro" do sistema. Ele:
 *   - guarda tudo na planilha onde está instalado (abas criadas por setup());
 *   - responde às chamadas do site (GitHub Pages) via Web App (doPost);
 *   - recebe os webhooks da HOTMART e da KIWIFY (compras Padrão e VIP);
 *   - recebe webhooks de dados (ActiveCampaign, formulários);
 *   - cruza os leads com a base de clientes (MDL / ILU / eventos anteriores).
 *
 *  PRIMEIRO USO: rode setup() uma vez e publique como App da Web (ver GUIA).
 * ============================================================================
 */

// ---- Login inicial do coordenador (o mesmo dos outros sistemas) -------------
const ADMIN_EMAIL_INICIAL = 'equipemkt@4blue.com.br';
const ADMIN_SENHA_INICIAL = 'equipemkt@2026';     // troque no painel depois

// ---- Valores padrão (podem ser alterados na aba Config / em Ajustes) --------
const CONFIG_PADRAO = {
  NOME_SISTEMA: 'Leads - Treinamento Gestão Financeira e Fluxo de Caixa',
  MODO_SISTEMA: 'evento',
  TAG_EVENTO: '[2026.10.27] WORKSHOP PAGO (ILU)',
  PROGRAMA_OFERTA: 'ILU',          // programa oferecido na lista de interesse (ILU ou MDL)
  HOTMART_CHAVE: '',               // gerada no setup(); vai na URL do webhook da Hotmart
  HOTMART_HOTTOK: '',              // opcional: hottok da sua conta Hotmart
  HOTMART_MODO_TESTE: 'NAO',       // SIM = aceita compras de teste (Hotmart id 0 / Kiwify produto desconhecido)
  KIWIFY_CHAVE: '',                // gerada no setup(); vai na URL do webhook da Kiwify
  KIWIFY_TOKEN: '',                // opcional: token do webhook da Kiwify (confere a assinatura)
  HOTMART_ID_PADRAO: '',
  HOTMART_ID_VIP: '',
  // Produtos que viram leads. Um por linha: ID ; nome no sistema ; padrao|vip ; hotmart|kiwify
  // Preencha em Ajustes → "Produtos que viram leads" depois de criar os produtos.
  HOTMART_PRODUTOS: '',
  MARCOS_ATIVOS: 'confirmado,upgrade,interesse,diagnostico,reuniao,checkin,presentes,pesquisa',
  // --- Guru (vendas do ILU) ------------------------------------------------
  GURU_CHAVE: '',                  // gerada no setup(); vai na URL do webhook do Guru
  GURU_TOKEN: '',                  // opcional: token da conta no Guru (confere o api_token do payload)
  GURU_PRODUTOS: '',               // opcional: ids ou nomes que contam como venda (vazio = qualquer produto)
  GURU_PRODUTO_SISTEMA: '',        // id do Produto do sistema em que a venda do Guru é registrada
  GURU_CRIA_LEAD: 'SIM',           // comprador que não está no sistema entra como lead ganho
  // --- Pesquisa de perfil (Yay Forms) -------------------------------------
  PESQUISA_PLANILHA_ID: '',        // planilha com as respostas da pesquisa de perfil
  PESQUISA_ABA: '',                // aba das respostas (nome ou gid)
  PESQUISA_ULTIMA_SINC: '',
  PESQUISA_CRIA_LEAD: 'NAO',       // quem respondeu a pesquisa e não é lead entra no sistema
  CHECKIN_CRIA_LEAD: 'SIM',        // quem fez check-in e não está no sistema entra como lead
  DADOS_SOBRESCREVER: 'NAO',       // SIM = dados do formulário valem mais que o que já está no lead
  AC_TAG_INTERESSE: '[2026.10.27] WORKSHOP PAGO (ILU) - lista de interesse',
  QUEM_GERENCIA: 'coordenador',    // quem cria fases, produtos e mensagens: coordenador | todos
  UPGRADE_VIP_URL: '',             // link de checkout do upgrade para VIP
  UPGRADE_VIP_VALOR: '',
  DISTRIBUICAO_AUTO: 'NAO',
  EVENTO_DATA: '2026-10-27',
  DIAGNOSTICO_URL: '',             // link do formulário de diagnóstico
  DIAG_PLANILHA_ID: '',            // planilha com as respostas do diagnóstico
  DIAG_ABA: '',                    // aba das respostas (nome ou gid)
  DIAG_ULTIMA_SINC: '',
  DADOS_CHAVE: '',                 // chave do webhook de dados (gerada no setup)
  BASE_CLIENTES_ID: '1ihgdFxaR5cM6xyAECvJ-IORN1dmghRin9gmRFCsHe5I',
  BASE_ABA_MDL: 'Dados_pipe_mdl',
  BASE_ABA_ILU: 'dados_pipe_ilu',
  BASE_ABAS_IGNORAR: 'AUDITORIA,LOG_ACESSO,LOG_WEBHOOK',
  ULTIMA_SINCRONIZACAO: ''
};

/** Programa oferecido na lista de interesse (ILU por padrão). */
let progCache_ = null;
function progOferta_() {
  if (progCache_ === null) progCache_ = String(lerConfig_().PROGRAMA_OFERTA || CONFIG_PADRAO.PROGRAMA_OFERTA || 'ILU').trim() || 'ILU';
  return progCache_;
}

const SESSAO_SEGUNDOS = 21600; // 6h (máximo do CacheService); renovada a cada uso

// ---- Estrutura das abas ----------------------------------------------------
const ABAS = {
  Usuarios: ['id', 'nome', 'email', 'senha_hash', 'salt', 'perfil', 'foto', 'ativo', 'recebe_leads', 'criado_em', 'atualizado_em'],
  Fases: ['id', 'nome', 'ordem', 'cor', 'instrucoes', 'ativo', 'criado_em'],
  Leads: ['id', 'criado_em', 'origem', 'tipo_ingresso', 'nome', 'email', 'telefone', 'cidade', 'empresa', 'obs',
    'status', 'responsavel_id', 'responsavel_nome', 'inicio_tratativa', 'ultima_acao', 'fechado_em', 'motivo',
    'mensagem_usada', 'transacao', 'produto_hotmart', 'valor_ingresso', 'status_hotmart',
    'cliente_mdl', 'cliente_ilu', 'eventos', 'cargo', 'faturamento', 'criado_por', 'atualizado_em',
    'fase_id', 'fase_em', 'confirmado', 'confirmado_em', 'upgrade', 'upgrade_em', 'diagnostico', 'diagnostico_em',
    'diagnostico_respostas', 'reuniao', 'reuniao_em', 'reuniao_obs', 'checkin', 'checkin_em', 'presentes', 'presentes_em', 'dados_extra', 'origem_evento',
    'boas_vindas', 'boas_vindas_em', 'acesso', 'acesso_em', 'interesse', 'interesse_em',
    'funcionarios', 'ramo', 'estado', 'conhece_4blue', 'programa_4blue', 'desafio', 'compras', 'plataforma',
    'pesquisa', 'pesquisa_em', 'pesquisa_respostas', 'faixa_etaria', 'socios', 'sentimento'],
  Vendas: ['id', 'data', 'lead_id', 'lead_nome', 'usuario_id', 'usuario_nome', 'produto_id', 'produto_nome',
    'valor_entrada', 'valor_total', 'parcelas', 'forma_pagamento', 'obs', 'status', 'produto_fora_lista',
    'transacao', 'plataforma'],
  Produtos: ['id', 'nome', 'valor_total', 'valor_entrada', 'parcelas', 'descricao', 'ativo', 'origem', 'criado_por', 'criado_em'],
  Mensagens: ['id', 'titulo', 'texto', 'tipo_ingresso', 'fase_id', 'ordem', 'ativo', 'criado_em'],
  Historico: ['data', 'lead_id', 'usuario_id', 'usuario_nome', 'acao', 'detalhe'],
  Webhook_Fila: ['recebido_em', 'evento', 'produto_id', 'transacao', 'email', 'chave', 'status', 'resultado', 'processado_em', 'payload'],
  Base_Clientes: ['email', 'tel_chave', 'nome', 'mdl', 'ilu', 'eventos', 'cargo', 'faturamento', 'cidade'],
  Config: ['chave', 'valor']
};

const STATUS = ['novo', 'tratativa', 'ganho', 'perdido', 'reembolso'];

// Marcos da jornada do lead (cada um com os valores aceitos)
const MARCOS = {
  interesse: ['', 'sim', 'nao'],
  boas_vindas: ['', 'enviada', 'respondeu', 'sem_resposta'],
  acesso: ['', 'sim', 'nao'],
  confirmado: ['', 'sim', 'nao'],
  upgrade: ['', 'enviado', 'feito', 'nao_quer'],
  diagnostico: ['', 'enviado', 'feito'],
  reuniao: ['', 'agendada', 'feita', 'nao_compareceu'],
  checkin: ['', 'sim', 'nao'],
  presentes: ['', 'sim', 'nao'],
  pesquisa: ['', 'feita']
};

const FASES_PADRAO_EVENTO = [
  ['Primeiro contato', '#0369B1', 'Abrir a conversa no WhatsApp\nApresentar-se como concierge do lead\nConfirmar que recebeu o acesso do ingresso'],
  ['Confirmação de presença', '#F8B90C', 'Confirmar presença no Treinamento\nExplicar horário, formato e o que levar\nMarcar o marco "Confirmou presença"'],
  ['Upgrade VIP', '#7A4CC2', 'Apresentar os benefícios do VIP\nEnviar o link de upgrade\nConferir se o pagamento foi feito'],
  ['Diagnóstico', '#0B7A9E', 'Enviar o link do diagnóstico\nLembrar quem não respondeu\nLer as respostas antes da reunião'],
  ['Reunião', '#C2410C', 'Agendar a reunião\nConfirmar 1 dia antes\nRegistrar o combinado nas anotações'],
  ['Oferta e venda', '#12A150', 'Apresentar a oferta certa para o momento do lead\nRegistrar negócio ganho ou perdido']
];

function fasesPadrao_() { return FASES_PADRAO_EVENTO; }

/* ============================================================================
 *  RANKING DO LEAD (mesma lógica da planilha WORKSHOP GESTÃO PESSOAS)
 * ----------------------------------------------------------------------------
 *  Pontua poder de decisão + porte + relação com a 4blue + o que a pessoa fez.
 *  Classificação: 🔥 Quente ≥80 · ⚡ MQL+ 60-79 · ✅ MQL 40-59 ·
 *                 🔵 Viável 20-39 · ⚪ Baixo potencial 5-19 · ❌ Fora <5
 * ========================================================================== */
const PONTOS = {
  cargo: [
    [/dono|socio|sócio|propriet|ceo|fundador/i, 22],
    [/diretor/i, 15],
    [/gerente|coorden|supervis/i, 8],
    [/analista|assistente|auxiliar|estagi/i, -12]
  ],
  faturamento: [
    [/acima de 500|500\s*mil|\+\s*500|mais de 500|1\s*mi|milh/i, 27],
    [/300 a 500|300\s*-\s*500/i, 20],
    [/100 a 300|100\s*-\s*300/i, 17],
    [/60 a 100|60\s*-\s*100/i, 7],
    [/30 a 60|30\s*-\s*60/i, -8],
    [/ate 30|até 30|30\s*mil|menos de 30/i, -28],
    [/nada|nao tenho|não tenho|sem empresa|zero/i, -15]
  ],
  funcionarios: [
    [/mais de 50|\+\s*50|acima de 50/i, 5],
    [/30 a 50/i, 7],
    [/21 a 30/i, 5],
    [/11 a 20/i, 6],
    [/6 a 10/i, -1],
    [/2 a 5/i, -6],
    [/^1\b|sou uma|apenas eu|somente eu/i, -9]
  ],
  conhece: [
    [/sou cliente|ja conheco e sou|já conheço e sou/i, 19],
    [/nunca comprei|mas nunca/i, 8],
    [/conheci agora|nao conhecia|não conhecia/i, -8]
  ]
};

function pontosPor_(valor, tabela) {
  const v = String(valor || '').trim();
  if (!v) return 0;
  for (let i = 0; i < tabela.length; i++) if (tabela[i][0].test(v)) return tabela[i][1];
  return 0;
}

/** Calcula ranking e classificação. Devolve {score, classificacao, motivos}. */
function pontuarLead_(l) {
  const m = [];
  let p = 19; // base: comprou o ingresso e está na lista
  const add = function (n, rot) { if (n) { p += n; m.push((n > 0 ? '+' : '') + n + ' ' + rot); } };

  add(pontosPor_(l.cargo, PONTOS.cargo), l.cargo || '');
  add(pontosPor_(l.faturamento, PONTOS.faturamento), l.faturamento || '');
  add(pontosPor_(l.funcionarios, PONTOS.funcionarios), (l.funcionarios || '') + ' funcionários');
  add(pontosPor_(l.conhece_4blue, PONTOS.conhece), l.conhece_4blue || '');

  // relação com os programas da 4blue (depende do programa ofertado: ILU ou MDL)
  const prog = String(l.programa_4blue || '');
  const ofertaIlu = !/mdl|m[aá]quina/i.test(progOferta_());
  const ativoIlu = /ativo no iluminismo/i.test(prog), ativoMdl = /ativo no (programa )?m[aá]quina/i.test(prog);
  if ((ofertaIlu && ativoIlu) || (!ofertaIlu && ativoMdl)) add(-5, 'já é cliente do ' + progOferta_());
  else if (ativoIlu || ativoMdl) add(ofertaIlu ? 4 : 10, 'ativo em outro programa da 4blue');
  else if (/ja fui|já fui/i.test(prog)) add(6, 'ex-cliente (reativação)');

  // base de clientes cruzada pelo próprio sistema
  const iluAtivoBase = l.cliente_ilu && /ativ/i.test(String(l.cliente_ilu)) && !/ex /i.test(String(l.cliente_ilu));
  const mdlAtivoBase = ehMdlAtivoLead_(l);
  if (!prog) {
    if ((ofertaIlu && iluAtivoBase) || (!ofertaIlu && mdlAtivoBase)) add(-5, 'cliente ' + progOferta_() + ' ativo na base');
    else if (iluAtivoBase || mdlAtivoBase) add(ofertaIlu ? 4 : 10, 'cliente ativo de outro programa');
    else if (l.cliente_mdl || l.cliente_ilu) add(6, 'ex-cliente 4blue');
  }

  // o que a pessoa fez na campanha
  if (l.interesse === 'sim') add(20, 'levantou a mão para o ' + progOferta_());
  if (l.checkin === 'sim') add(8, 'participou do Treinamento');
  if (l.presentes === 'sim') add(4, 'baixou os presentes');
  if (l.diagnostico === 'feito') add(6, 'fez o diagnóstico');
  if (l.pesquisa === 'feita') add(3, 'respondeu a pesquisa de perfil');
  if (l.confirmado === 'sim') add(2, 'confirmou presença');
  if (l.tipo_ingresso === 'vip') add(6, 'ingresso VIP');
  if (l.reuniao === 'feita') add(10, 'reunião realizada');

  const score = Math.round(p);
  return { score: score, classificacao: classificar_(score), motivos: m };
}

function classificar_(score) {
  if (score >= 80) return 'quente';
  if (score >= 60) return 'mql_mais';
  if (score >= 40) return 'mql';
  if (score >= 20) return 'viavel';
  if (score >= 5) return 'baixo';
  return 'fora';
}

/** Cliente MDL ativo (não serve "ex" nem "cancelado"). */
function ehMdlAtivoLead_(l) {
  const t = String(l.cliente_mdl || '');
  if (!t) return /ativo no (programa )?m[aá]quina/i.test(String(l.programa_4blue || ''));
  const st = t.split('·')[0];
  return /ativ/i.test(st) && !/ex |cancel|reembols|suspens|congel/i.test(st);
}

/** Acrescenta score e classificação a uma lista de leads (sem gravar na planilha). */
function comScore_(leads) {
  progCache_ = null;
  return leads.map(function (l) {
    const r = pontuarLead_(l);
    l.score = r.score; l.classificacao = r.classificacao; l.score_motivos = r.motivos.join(' · ');
    return l;
  });
}

/** Marcos ligados nesta instalação. */
function marcosAtivos_() {
  const txt = String(lerConfig_().MARCOS_ATIVOS || CONFIG_PADRAO.MARCOS_ATIVOS || '');
  const lista = txt.split(',').map(function (x) { return x.trim(); }).filter(function (x) { return MARCOS[x]; });
  return lista.length ? lista : Object.keys(MARCOS);
}

/** Quem pode criar fases, produtos e mensagens. */
function podeGerenciar_(user) {
  if (!user) return false;
  if (user.perfil === 'coordenador') return true;
  return String(lerConfig_().QUEM_GERENCIA || 'coordenador') === 'todos';
}

function exigeGerenciar_(user) {
  if (!podeGerenciar_(user)) throw new Error('Só o coordenador pode alterar fases, produtos e mensagens.');
  return true;
}

/* ============================================================================
 *  SETUP
 * ========================================================================== */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(ABAS).forEach(function (nome) {
    let sh = ss.getSheetByName(nome);
    if (!sh) sh = ss.insertSheet(nome);
    const cab = ABAS[nome];
    const atual = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    // adiciona colunas que faltarem (permite atualizar versões sem perder dados)
    cab.forEach(function (c) {
      if (atual.indexOf(c) === -1) {
        sh.getRange(1, sh.getLastColumn() + 1).setValue(c);
        atual.push(c);
      }
    });
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#011527').setFontColor('#ffffff');
    // tudo como texto evita o Sheets converter telefone em número
    if (nome !== 'Config') sh.getRange('A:' + colLetra_(sh.getLastColumn())).setNumberFormat('@');
  });
  const padrao = ss.getSheetByName('Sheet1') || ss.getSheetByName('Página1') || ss.getSheetByName('Planilha1');
  if (padrao && ss.getSheets().length > 1) ss.deleteSheet(padrao);

  // Config
  const cfg = lerConfig_();
  Object.keys(CONFIG_PADRAO).forEach(function (k) {
    if (cfg[k] === undefined) salvarConfig_(k, CONFIG_PADRAO[k]);
  });
  if (!lerConfig_().HOTMART_CHAVE) salvarConfig_('HOTMART_CHAVE', Utilities.getUuid().replace(/-/g, ''));
  if (!lerConfig_().DADOS_CHAVE) salvarConfig_('DADOS_CHAVE', Utilities.getUuid().replace(/-/g, ''));
  if (!lerConfig_().KIWIFY_CHAVE) salvarConfig_('KIWIFY_CHAVE', Utilities.getUuid().replace(/-/g, ''));
  if (!lerConfig_().GURU_CHAVE) salvarConfig_('GURU_CHAVE', Utilities.getUuid().replace(/-/g, ''));
  // instalação antiga: liga o marco da pesquisa de perfil sem mexer no resto
  const marcosSalvos = String(lerConfig_().MARCOS_ATIVOS || '');
  if (marcosSalvos && marcosSalvos.indexOf('pesquisa') < 0) salvarConfig_('MARCOS_ATIVOS', marcosSalvos + ',pesquisa');

  // Fases do funil (só na primeira vez; depois o coordenador edita no painel)
  if (!tabela_('Fases').objs.length) {
    fasesPadrao_().forEach(function (f, i) {
      inserir_('Fases', { id: novoId_('F'), nome: f[0], ordem: String(i + 1), cor: f[1], instrucoes: f[2], ativo: 'SIM', criado_em: agora_() });
    });
  }

  // Coordenador inicial
  const users = tabela_('Usuarios').objs;
  if (!users.some(function (u) { return u.email === ADMIN_EMAIL_INICIAL.toLowerCase(); })) {
    const salt = Utilities.getUuid();
    inserir_('Usuarios', {
      id: novoId_('U'), nome: 'Coordenador', email: ADMIN_EMAIL_INICIAL.toLowerCase(),
      senha_hash: hash_(ADMIN_SENHA_INICIAL, salt), salt: salt, perfil: 'coordenador',
      foto: '', ativo: 'SIM', recebe_leads: 'NAO', criado_em: agora_(), atualizado_em: agora_()
    });
  }

  // Mensagens de exemplo (edite/exclua no painel)
  if (!tabela_('Mensagens').objs.length) {
    const fasesCriadas = fasesOrdenadas_();
    const f1 = fasesCriadas[0] ? fasesCriadas[0].id : '';
    const f2 = fasesCriadas[1] ? fasesCriadas[1].id : '';
    inserir_('Mensagens', {
      id: novoId_('M'), titulo: 'Boas-vindas', ordem: '1', ativo: 'SIM', tipo_ingresso: 'todos', fase_id: f1, criado_em: agora_(),
      texto: 'Oi {primeiro_nome}, tudo bem? Aqui é {usuario}, da 4blue! Vi que você garantiu seu ingresso para o Treinamento Gestão Financeira e Fluxo de Caixa do dia {data_evento} e queria te dar as boas-vindas. Posso te fazer uma pergunta rápida?'
    });
    inserir_('Mensagens', {
      id: novoId_('M'), titulo: 'Boas-vindas VIP', ordem: '2', ativo: 'SIM', tipo_ingresso: 'vip', fase_id: f1, criado_em: agora_(),
      texto: 'Oi {primeiro_nome}! Aqui é {usuario}, da 4blue. Obrigado por garantir o ingresso VIP do Treinamento Gestão Financeira e Fluxo de Caixa ({data_evento})! Vou cuidar pessoalmente da sua experiência. Posso te chamar aqui?'
    });
    inserir_('Mensagens', {
      id: novoId_('M'), titulo: 'Confirmar presença', ordem: '3', ativo: 'SIM', tipo_ingresso: 'todos', fase_id: f2, criado_em: agora_(),
      texto: '{primeiro_nome}, tudo certo para o dia {data_evento}? Me confirma aqui que você vai estar com a gente no Treinamento, por favor.'
    });
  }
  instalarGatilhos();
  const c = lerConfig_();
  Logger.log('Setup concluído.');
  Logger.log('Chave do webhook Hotmart: ' + c.HOTMART_CHAVE);
  Logger.log('Chave do webhook Kiwify: ' + c.KIWIFY_CHAVE);
  Logger.log('Chave do webhook Guru: ' + c.GURU_CHAVE);
  Logger.log('Depois de publicar, rode mostrarUrls() para ver todas as URLs prontas.');
  Logger.log('Login inicial: ' + ADMIN_EMAIL_INICIAL + ' / ' + ADMIN_SENHA_INICIAL);
}

/* ============================================================================
 *  URL DO APP DA WEB — SEMPRE A PÚBLICA
 * ----------------------------------------------------------------------------
 *  Em conta do Google Workspace, o Apps Script devolve a URL "da empresa":
 *      https://script.google.com/a/4blue.com.br/macros/s/ID/exec
 *  Essa URL só abre para quem está logado no domínio. No navegador de quem é da
 *  4blue ela funciona — mas Hotmart, Kiwify, Guru, ActiveCampaign e Yay Forms
 *  recebem uma tela de login e o aviso nunca chega. A URL pública é a mesma sem
 *  o pedaço do domínio. Toda URL mostrada pelo sistema passa por aqui.
 * ========================================================================== */
function urlPublica_(u) {
  return String(u || '')
    .replace(/^(https:\/\/script\.google\.com)\/a\/macros\/[^/]+\/s\//, '$1/macros/s/')
    .replace(/^(https:\/\/script\.google\.com)\/a\/[^/]+\/macros\/s\//, '$1/macros/s/');
}

function urlApp_() {
  let u = '';
  try { u = ScriptApp.getService().getUrl() || ''; } catch (e) { u = ''; }
  return urlPublica_(u);
}

/* ============================================================================
 *  URLS PRONTAS (rode mostrarUrls() no editor DEPOIS de publicar o App da Web)
 * ========================================================================== */
function mostrarUrls() {
  const c = lerConfig_();
  let url = '';
  url = urlApp_();
  if (!url) { Logger.log('Publique o App da Web primeiro (Implantar → Nova implantação → App da Web).'); return false; }
  Logger.log('URL da API (cole no config.js do site):\n  ' + url);
  Logger.log('Webhook HOTMART:\n  ' + url + '?src=hotmart&key=' + c.HOTMART_CHAVE);
  Logger.log('Webhook KIWIFY:\n  ' + url + '?src=kiwify&key=' + c.KIWIFY_CHAVE);
  Logger.log('Webhook GURU (vendas do ' + progOferta_() + '):\n  ' + url + '?src=guru&key=' + c.GURU_CHAVE);
  urlsDados_(url, c.DADOS_CHAVE).forEach(function (w) { Logger.log('Webhook de dados — ' + w.nome + ':\n  ' + w.url + '\n  (versão GET) ' + w.url_get); });
  return true;
}

/* ============================================================================
 *  DIAGNÓSTICO DA LISTA DE INTERESSE
 * ----------------------------------------------------------------------------
 *  Rode diagnosticoInteresse() no editor e leia o Log (Ctrl+Enter).
 *  Ele diz exatamente em que ponto a corrente quebrou.
 * ========================================================================== */
function diagnosticoInteresse() {
  const c = lerConfig_();
  let url = '';
  url = urlApp_() || '(não publicado)';
  Logger.log('1) URL publicada: ' + url);
  Logger.log('2) URL que o ActiveCampaign tem que chamar:');
  Logger.log('   ' + url + '?src=dados&key=' + c.DADOS_CHAVE + '&tipo=interesse');
  const temMarco = String(c.MARCOS_ATIVOS || '').indexOf('interesse') >= 0;
  Logger.log('3) Marco "interesse" ligado? ' + (temMarco ? 'sim' : 'NÃO  <<< ligue em Ajustes → Marcos'));
  const temCol = tabela_('Leads').cab.indexOf('interesse') >= 0;
  Logger.log('4) Coluna "interesse" na aba Leads? ' + (temCol ? 'sim' : 'NÃO  <<< rode setup()'));
  const cs = concierges_().map(function (u) { return u.nome; });
  Logger.log('5) Concierges que recebem leads: ' + (cs.length ? cs.join(', ') : 'NENHUM  <<< cadastre a equipe'));

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Webhook_Fila');
  if (!sh || sh.getLastRow() < 2) {
    Logger.log('6) A aba Webhook_Fila está VAZIA: nada chegou aqui ainda.');
    Logger.log('   => o ActiveCampaign não chamou a URL. Confira a automação (webhook ativo, URL completa com ?src=...&key=...&tipo=interesse).');
    return false;
  }
  const n = Math.min(10, sh.getLastRow() - 1);
  const vals = sh.getRange(sh.getLastRow() - n + 1, 1, n, ABAS.Webhook_Fila.length).getValues();
  Logger.log('6) Últimos ' + n + ' webhooks recebidos (mais novo por último):');
  vals.forEach(function (r) {
    Logger.log('   ' + r[0] + ' | ' + r[1] + ' | ' + (r[4] || '(sem e-mail)') + ' | ' + r[6] + ' | ' + r[7]);
  });
  const interesse = vals.filter(function (r) { return String(r[1]).indexOf('interesse') >= 0; });
  if (!interesse.length) Logger.log('   => nenhuma chamada com tipo=interesse chegou. A URL da automação está sem "&tipo=interesse" ou a automação não rodou.');
  else Logger.log('   => chegou! Se o status não for "ok", o motivo está na coluna resultado (acima).');
  Logger.log('7) Último payload recebido (para conferir e-mail/telefone):');
  Logger.log('   ' + String(vals[vals.length - 1][9] || '').slice(0, 900));
  return true;
}

/**
 * Simula uma levantada de mão SEM depender do ActiveCampaign.
 * Troque o e-mail/telefone pelos seus e rode no editor.
 */
function testarInteresse() {
  const r = registrarInteresse_({ id: 'teste', nome: 'Teste manual' }, {
    linhas: [{ email: 'coloque.seu@email.com', telefone: '', nome: 'Teste Interesse' }]
  });
  Logger.log(JSON.stringify(r));
  return r;
}

/* ============================================================================
 *  DIAGNÓSTICO DAS INTEGRAÇÕES NOVAS (check-in, pesquisa e Guru)
 *  Rode diagnosticoIntegracoes() no editor e leia o Log.
 * ========================================================================== */
function diagnosticoIntegracoes() {
  const c = lerConfig_();
  let url = '';
  url = urlApp_();
  if (!url) Logger.log('ATENÇÃO: o App da Web não está publicado. Implantar → Gerenciar implantações → Editar → Nova versão.');
  Logger.log('URL publicada: ' + (url || '(não publicada)'));
  Logger.log('');
  Logger.log('1) CHECK-IN (Yay Forms) — cole esta URL no webhook do formulário de check-in:');
  Logger.log('   ' + url + '?src=dados&key=' + c.DADOS_CHAVE + '&tipo=checkin');
  Logger.log('   Cria lead de quem não está no sistema? ' + (String(c.CHECKIN_CRIA_LEAD || 'SIM') !== 'NAO' ? 'sim' : 'não'));
  Logger.log('');
  Logger.log('2) PESQUISA DE PERFIL (Yay Forms) — webhook:');
  Logger.log('   ' + url + '?src=dados&key=' + c.DADOS_CHAVE + '&tipo=pesquisa');
  Logger.log('   Planilha das respostas já coletadas: ' + (c.PESQUISA_PLANILHA_ID || '(não cadastrada — cole o ID em Ajustes)'));
  Logger.log('   Última sincronização: ' + (c.PESQUISA_ULTIMA_SINC || 'nunca'));
  Logger.log('   Marco "pesquisa" ligado? ' + (marcosAtivos_().indexOf('pesquisa') >= 0 ? 'sim' : 'NÃO  <<< ligue em Ajustes → Marcos'));
  Logger.log('');
  Logger.log('3) GURU (vendas do ' + progOferta_() + ') — cole esta URL no webhook de vendas do Guru:');
  Logger.log('   ' + url + '?src=guru&key=' + c.GURU_CHAVE);
  Logger.log('   Filtro de produtos: ' + (c.GURU_PRODUTOS || '(nenhum — qualquer produto conta como venda)'));
  Logger.log('   Produto do sistema: ' + (c.GURU_PRODUTO_SISTEMA || '(usa o nome que vier do Guru)'));
  Logger.log('   Depois do primeiro teste real, rode verPayloadGuru() para ver o que chegou.');
  Logger.log('');
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Webhook_Fila');
  if (!sh || sh.getLastRow() < 2) { Logger.log('Webhook_Fila vazia: nenhum webhook chegou ainda.'); return true; }
  const n = Math.min(12, sh.getLastRow() - 1);
  Logger.log('Últimos ' + n + ' webhooks (mais novo por último):');
  sh.getRange(sh.getLastRow() - n + 1, 1, n, ABAS.Webhook_Fila.length).getValues().forEach(function (r) {
    Logger.log('   ' + r[0] + ' | ' + r[1] + ' | ' + (r[4] || '(sem e-mail)') + ' | ' + r[6] + ' | ' + r[7]);
  });
  return true;
}

/** Simula um check-in do Yay Forms (troque o e-mail por um que exista no sistema). */
function testarCheckin() {
  const cfg = lerConfig_();
  const r = webhookDados_({
    'Jogo rápido! Qual seu nome?': 'Teste Check-in',
    'Qual seu Whatsapp com DDD?': '+5511988887777',
    'E qual é seu e-mail?': 'coloque.seu@email.com',
    'Qual o seu cargo?': 'Dono / Sócio',
    'Qual o seu faturamento Mensal?': '100 a 300mil/mês',
    'Em qual segmento atua?': 'Comércio',
    'Contando com você, qual o número de colaboradores FIXOS da sua empresa?': '6 a 10',
    'Você já conhecia a 4blue?': 'Yes'
  }, { key: cfg.DADOS_CHAVE, tipo: 'checkin' });
  Logger.log(JSON.stringify(r));
  return r;
}

/** Gatilhos: base de clientes (1h), fila do webhook (1 min), diagnóstico (15 min) e pesquisa (1h). */
function instalarGatilhos() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const f = t.getHandlerFunction();
    if (f === 'sincronizarClientes' || f === 'processarFilaWebhook' || f === 'sincronizarDiagnostico' || f === 'sincronizarPesquisa') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sincronizarClientes').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('processarFilaWebhook').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('sincronizarDiagnostico').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('sincronizarPesquisa').timeBased().everyHours(1).create();
}

/* ============================================================================
 *  ROTEAMENTO HTTP
 * ========================================================================== */
const VERSAO_CODIGO = '2026-10-27-ilu-guru-2';

function doGet(e) {
  const p = (e && e.parameter) || {};
  // Webhook de dados também pelo endereço (GET), para ferramentas que perdem o corpo
  // do POST no redirecionamento do Apps Script. Ex. do ActiveCampaign:
  // ...exec?src=dados&key=CHAVE&tipo=interesse&email=%EMAIL%&telefone=%PHONE%&nome=%FIRSTNAME%
  if (p.src === 'dados' && (p.email || p.telefone || p.tel || p.phone || p.whatsapp)) {
    try {
      const body = {};
      Object.keys(p).forEach(function (k) { if (['src', 'key', 'tipo'].indexOf(k) < 0) body[k] = p[k]; });
      enfileirarWebhook_(body, p, JSON.stringify(body));
      let feitos = 0;
      try { feitos = (processarFilaWebhook() || {}).processados || 0; } catch (err2) { feitos = 0; }
      return json_({ ok: true, recebido: true, processados: feitos });
    } catch (err) {
      return json_({ ok: false, error: String(err && err.message ? err.message : err) });
    }
  }
  // Teste rápido pelo navegador: abrir a URL /exec mostra a versão publicada.
  // Com ?src=guru o Guru (ou você) confere se a chave da URL está certa.
  const cfgG = lerConfig_();
  if (p.src === 'guru') {
    return json_({
      ok: true, versao: VERSAO_CODIGO, webhook: 'guru',
      chave_confere: !!(p.key && p.key === cfgG.GURU_CHAVE),
      recado: (p.key && p.key === cfgG.GURU_CHAVE)
        ? 'URL do Guru certa. Agora é só o Guru mandar a venda por POST nesta mesma URL.'
        : 'A chave desta URL NÃO confere com a do sistema. Copie a URL de novo em Ajustes → Vendas pelo Guru.',
      hora: agora_()
    });
  }
  return json_({
    ok: true, sistema: cfgG.NOME_SISTEMA || CONFIG_PADRAO.NOME_SISTEMA,
    versao: VERSAO_CODIGO, interesse: marcosAtivos_().indexOf('interesse') >= 0,
    guru_pronto: !!cfgG.GURU_CHAVE, hora: agora_()
  });
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  let bruto = (e && e.postData && e.postData.contents) || '';
  let body = {};
  try { body = JSON.parse(bruto || '{}'); } catch (err) { body = {}; }
  if ((!body || !Object.keys(body).length) && Object.keys(p).length) {
    // formulário enviado como campos (ActiveCampaign, Zapier em modo form etc.)
    body = {};
    Object.keys(p).forEach(function (k) { if (['src', 'key', 'tipo'].indexOf(k) < 0) body[k] = p[k]; });
    bruto = JSON.stringify(body);
  }

  // Webhook da Hotmart: só enfileira e responde na hora (evita o erro 408).
  // O processamento acontece em processarFilaWebhook() (gatilho de 1 min e a cada acesso ao site).
  if (p.src === 'hotmart' || (body.event && body.data && !body.action)) {
    try {
      enfileirarWebhook_(body, p, bruto);
      return json_({ ok: true, recebido: true });
    } catch (err) {
      return json_({ ok: false, error: String(err) });
    }
  }

  // Webhook da Kiwify: confere a chave da URL (ou a assinatura) e enfileira.
  if (p.src === 'kiwify') {
    try {
      enfileirarWebhook_(body, p, bruto);
      return json_({ ok: true, recebido: true });
    } catch (err) { return json_({ ok: false, error: String(err) }); }
  }

  // Webhook do Guru (vendas do programa ofertado): entra na fila e responde na hora.
  if (p.src === 'guru') {
    try {
      enfileirarWebhook_(body, p, bruto);
      return json_({ ok: true, recebido: true });
    } catch (err) { return json_({ ok: false, error: String(err) }); }
  }

  // Webhook genérico de dados (diagnóstico, página de obrigado, check-in, pesquisa):
  // também entra na fila, para responder na hora a quem enviou.
  if (p.src === 'dados') {
    try {
      enfileirarWebhook_(body, p, bruto);
      return json_({ ok: true, recebido: true });
    } catch (err) { return json_({ ok: false, error: String(err) }); }
  }

  // Chegou um POST que não é do site e não tem ?src=... na URL.
  // Algumas ferramentas cortam os parâmetros da URL ao enviar o webhook — em vez de
  // devolver erro e o aviso sumir, guardamos o que chegou na fila para poder olhar.
  if (!body.action) {
    try {
      const plano = achatar_(body);
      const ehGuru = !!(acharResposta_(plano, ['api_token', 'webhook_type']) ||
        (acharResposta_(plano, ['contact.email']) && acharResposta_(plano, ['payment.total', 'payment.method', 'product.name'])));
      enfileirarWebhook_(body, ehGuru ? { src: 'guru', key: p.key || '' } : { src: 'desconhecido', key: p.key || '' }, bruto);
      return json_({ ok: true, recebido: true, identificado: ehGuru ? 'guru' : 'desconhecido' });
    } catch (errX) {
      return json_({ ok: false, error: String(errX && errX.message ? errX.message : errX) });
    }
  }

  // Chamadas do site
  try {
    const acao = body.action;
    if (acao === 'login') return json_({ ok: true, data: login_(body.email, body.senha) });
    const user = autenticar_(body.token);
    const fn = ROTAS[acao];
    if (!fn) throw new Error('Ação desconhecida: ' + acao);
    if (acao.indexOf('admin.') === 0 && user.perfil !== 'coordenador') throw new Error('Acesso restrito ao coordenador.');
    return json_({ ok: true, data: fn(user, body) });
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    return json_({ ok: false, error: msg, auth: msg === 'SESSAO_EXPIRADA' });
  }
}

const ROTAS = {
  'logout': function (u, b) { CacheService.getScriptCache().remove('s_' + b.token); return true; },
  'bootstrap': bootstrap_,
  'perfil.salvar': salvarPerfil_,
  'lead.criar': criarLead_,
  'lead.editar': editarLead_,
  'lead.iniciar': iniciarTratativa_,
  'lead.ganho': marcarGanho_,
  'lead.perdido': marcarPerdido_,
  'lead.reembolso': marcarReembolso_,
  'lead.reabrir': reabrirLead_,
  'lead.nota': notaLead_,
  'lead.fase': mudarFase_,
  'lead.marco': marcarMarco_,
  'fase.salvar': function (u, b) { exigeGerenciar_(u); return salvarFase_(u, b); },
  'fase.excluir': function (u, b) { exigeGerenciar_(u); return excluirFase_(u, b); },
  'produto.salvar': function (u, b) { exigeGerenciar_(u); return salvarProduto_(u, b); },
  'mensagem.salvar': function (u, b) { exigeGerenciar_(u); return salvarMensagem_(u, b); },
  'mensagem.excluir': function (u, b) { exigeGerenciar_(u); return excluir_('Mensagens', b.id); },
  'lead.historico': historicoLead_,
  'venda.excluir': excluirVenda_,
  'admin.painel': painelAdmin_,
  'admin.usuario.salvar': salvarUsuario_,
  'admin.produto.salvar': salvarProduto_,
  'admin.mensagem.salvar': salvarMensagem_,
  'admin.mensagem.excluir': function (u, b) { return excluir_('Mensagens', b.id); },
  'admin.fase.salvar': salvarFase_,
  'admin.fase.excluir': excluirFase_,
  'admin.distribuir': distribuirLeads_,
  'admin.duplicados': listarDuplicados_,
  'admin.duplicados.juntar': juntarDuplicados_,
  'admin.importar.marcos': importarMarcos_,
  'admin.lead.atribuir': atribuirLead_,
  'admin.lead.liberar': liberarLead_,
  'admin.lead.excluir': function (u, b) { logHist_(b.id, u, 'excluido', ''); return excluir_('Leads', b.id); },
  'admin.importar': importarLeads_,
  'admin.hotmart.cred': salvarCredHotmart_,
  'admin.hotmart.importar': importarHotmartApi_,
  'admin.sincronizar': function (u) { return sincronizarClientes(); },
  'admin.diagnostico.sincronizar': function (u) { return sincronizarDiagnostico(); },
  'admin.pesquisa.sincronizar': function (u) { return sincronizarPesquisa(); },
  'admin.processarFila': function (u) { return processarFilaWebhook(); },
  'admin.config': configAdmin_
};

/* ============================================================================
 *  AUTENTICAÇÃO
 * ========================================================================== */
function login_(email, senha) {
  email = String(email || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const tent = Number(cache.get('lf_' + email) || 0);
  if (tent >= 8) throw new Error('Muitas tentativas. Aguarde 10 minutos.');
  const u = tabela_('Usuarios').objs.filter(function (x) { return x.email === email; })[0];
  if (!u || u.ativo !== 'SIM' || hash_(String(senha || ''), u.salt) !== u.senha_hash) {
    cache.put('lf_' + email, String(tent + 1), 600);
    throw new Error('E-mail ou senha inválidos.');
  }
  cache.remove('lf_' + email);
  const token = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
  cache.put('s_' + token, u.id, SESSAO_SEGUNDOS);
  return { token: token, usuario: publicoUsuario_(u) };
}

function autenticar_(token) {
  if (!token) throw new Error('SESSAO_EXPIRADA');
  const cache = CacheService.getScriptCache();
  const id = cache.get('s_' + token);
  if (!id) throw new Error('SESSAO_EXPIRADA');
  const u = usuarioPorId_(id);
  if (!u || u.ativo !== 'SIM') throw new Error('SESSAO_EXPIRADA');
  cache.put('s_' + token, id, SESSAO_SEGUNDOS);
  return u;
}

function usuarioPorId_(id) {
  return tabela_('Usuarios').objs.filter(function (x) { return x.id === id; })[0];
}

function publicoUsuario_(u) {
  return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, foto: u.foto, ativo: u.ativo, recebe_leads: u.recebe_leads || '' };
}

function hash_(senha, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + senha, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/* ============================================================================
 *  DADOS DO USUÁRIO
 * ========================================================================== */
function bootstrap_(user) {
  try { processarFilaWebhook(); } catch (e) { /* segue mesmo se falhar */ }
  const coord = user.perfil === 'coordenador';
  const leads = comScore_(tabela_('Leads').objs.filter(function (l) {
    return coord || l.responsavel_id === user.id || (l.status === 'novo' && !l.responsavel_id);
  }));
  const vendas = tabela_('Vendas').objs.filter(function (v) { return coord || v.usuario_id === user.id; });
  const produtos = tabela_('Produtos').objs.filter(function (p) { return coord || p.ativo === 'SIM'; });
  const mensagens = tabela_('Mensagens').objs.filter(function (m) { return coord || m.ativo === 'SIM'; })
    .sort(function (a, b) { return Number(a.ordem || 0) - Number(b.ordem || 0); });
  const fases = tabela_('Fases').objs.filter(function (f) { return coord || f.ativo === 'SIM'; })
    .sort(function (a, b) { return Number(a.ordem || 0) - Number(b.ordem || 0); });
  const cfg = lerConfig_();
  return {
    fases: fases,
    modo: 'evento',
    marcos: marcosAtivos_(),
    pode_gerenciar: podeGerenciar_(user),
    links: { upgrade: cfg.UPGRADE_VIP_URL || '', upgrade_valor: cfg.UPGRADE_VIP_VALOR || '', diagnostico: cfg.DIAGNOSTICO_URL || '', evento: cfg.EVENTO_DATA || '', programa: progOferta_() },
    usuario: publicoUsuario_(user),
    leads: leads, vendas: vendas, produtos: produtos, mensagens: mensagens,
    sistema: lerConfig_().NOME_SISTEMA, servidor: agora_()
  };
}

function salvarPerfil_(user, b) {
  const campos = { atualizado_em: agora_() };
  if (b.nome !== undefined) {
    const nome = String(b.nome).trim();
    if (nome.length < 2) throw new Error('Informe seu nome.');
    campos.nome = nome;
  }
  if (b.foto !== undefined) {
    if (String(b.foto).length > 45000) throw new Error('Foto muito grande.');
    campos.foto = String(b.foto);
  }
  comTrava_(function () { atualizar_('Usuarios', user.id, campos); });
  if (campos.nome && campos.nome !== user.nome) {
    // mantém o nome do responsável atualizado nos leads
    comTrava_(function () {
      const t = tabela_('Leads');
      const col = t.cab.indexOf('responsavel_nome');
      t.objs.forEach(function (l, i) {
        if (l.responsavel_id === user.id) t.sh.getRange(i + 2, col + 1).setValue(campos.nome);
      });
      limparMemo_();
    });
  }
  return publicoUsuario_(usuarioPorId_(user.id));
}

/* ============================================================================
 *  LEADS
 * ========================================================================== */
const CAMPOS_EDITAVEIS = ['nome', 'email', 'telefone', 'cidade', 'empresa', 'obs', 'tipo_ingresso', 'cargo', 'faturamento'];

function criarLead_(user, b) {
  const d = b.lead || {};
  if (!String(d.nome || '').trim()) throw new Error('Informe o nome.');
  if (!String(d.telefone || '').trim() && !String(d.email || '').trim()) throw new Error('Informe telefone ou e-mail.');
  return comTrava_(function () {
    const dup = acharDuplicado_(d.email, d.telefone);
    if (dup) throw new Error('Já existe um lead com esse contato: ' + dup.nome + ' (' + dup.status + ').');
    const lead = {
      id: novoId_('L'), criado_em: agora_(), origem: 'manual',
      tipo_ingresso: d.tipo_ingresso === 'vip' ? 'vip' : 'padrao',
      status: 'novo', criado_por: user.nome, atualizado_em: agora_()
    };
    CAMPOS_EDITAVEIS.forEach(function (c) { if (d[c] !== undefined && c !== 'tipo_ingresso') lead[c] = limpar_(d[c], c); });
    lead.fase_id = primeiraFase_();
    if (d.assumir) {
      lead.status = 'tratativa'; lead.responsavel_id = user.id; lead.responsavel_nome = user.nome;
      lead.inicio_tratativa = agora_(); lead.ultima_acao = agora_(); lead.fase_em = agora_();
    } else {
      distribuirSeAuto_(lead);
    }
    enriquecer_(lead);
    inserir_('Leads', lead);
    logHist_(lead.id, user, 'criado', 'Lead cadastrado manualmente');
    return lead;
  });
}

function editarLead_(user, b) {
  return comTrava_(function () {
    const lead = leadPermitido_(user, b.id, true);
    const d = b.lead || {};
    const campos = { atualizado_em: agora_() };
    const mud = [];
    CAMPOS_EDITAVEIS.forEach(function (c) {
      if (d[c] === undefined) return;
      let v = limpar_(d[c], c);
      if (c === 'tipo_ingresso') v = v === 'vip' ? 'vip' : 'padrao';
      if (v !== lead[c]) { campos[c] = v; mud.push(c); }
    });
    if (!mud.length) return lead;
    atualizar_('Leads', lead.id, campos);
    logHist_(lead.id, user, 'editado', 'Campos: ' + mud.join(', '));
    return leadPorId_(lead.id);
  });
}

function iniciarTratativa_(user, b) {
  return comTrava_(function () {
    const lead = leadPorId_(b.id);
    if (!lead) throw new Error('Lead não encontrado.');
    const msg = String(b.mensagem || '').slice(0, 80);
    if (lead.status === 'novo') {
      if (lead.responsavel_id && lead.responsavel_id !== user.id && user.perfil !== 'coordenador') {
        throw new Error('Este lead é do concierge ' + (lead.responsavel_nome || '') + '.');
      }
      atualizar_('Leads', lead.id, {
        status: 'tratativa', responsavel_id: lead.responsavel_id || user.id, responsavel_nome: lead.responsavel_nome || user.nome,
        inicio_tratativa: agora_(), ultima_acao: agora_(), mensagem_usada: msg, atualizado_em: agora_(),
        fase_id: lead.fase_id || primeiraFase_(), fase_em: lead.fase_em || agora_()
      });
      logHist_(lead.id, user, 'tratativa_iniciada', msg ? 'Mensagem: ' + msg : 'WhatsApp aberto');
    } else if (lead.responsavel_id === user.id || user.perfil === 'coordenador') {
      atualizar_('Leads', lead.id, { ultima_acao: agora_(), atualizado_em: agora_() });
      logHist_(lead.id, user, 'whatsapp', msg ? 'Mensagem: ' + msg : 'WhatsApp aberto novamente');
    } else {
      throw new Error('Este lead já está com ' + (lead.responsavel_nome || 'outro usuário') + '.');
    }
    return leadPorId_(lead.id);
  });
}

function marcarGanho_(user, b) {
  return comTrava_(function () {
    const lead = leadPermitido_(user, b.id);
    const v = b.venda || {};
    let prod = null;
    let fora = false;
    if (v.produto_id) {
      prod = tabela_('Produtos').objs.filter(function (p) { return p.id === v.produto_id; })[0];
      if (!prod) throw new Error('Produto não encontrado.');
    } else {
      const nome = String(v.produto_nome || '').trim();
      if (!nome) throw new Error('Escolha ou informe o produto vendido.');
      fora = true;
      // produto fora da lista: cadastra para reaproveitar (coordenador revisa)
      prod = tabela_('Produtos').objs.filter(function (p) { return p.nome.toLowerCase() === nome.toLowerCase(); })[0];
      if (!prod) {
        prod = {
          id: novoId_('P'), nome: nome, valor_total: num_(v.valor_total), valor_entrada: num_(v.valor_entrada),
          parcelas: String(v.parcelas || ''), descricao: 'Incluído por ' + user.nome, ativo: 'SIM',
          origem: 'usuario', criado_por: user.nome, criado_em: agora_()
        };
        inserir_('Produtos', prod);
      }
    }
    const total = num_(v.valor_total !== undefined && v.valor_total !== '' ? v.valor_total : prod.valor_total);
    if (!(Number(total) > 0)) throw new Error('Informe o valor total da venda.');
    const entrada = num_(v.valor_entrada !== undefined ? v.valor_entrada : prod.valor_entrada);
    const venda = {
      id: novoId_('V'), data: agora_(), lead_id: lead.id, lead_nome: lead.nome,
      usuario_id: lead.responsavel_id || user.id, usuario_nome: lead.responsavel_nome || user.nome,
      produto_id: prod.id, produto_nome: prod.nome,
      valor_entrada: entrada, valor_total: total, parcelas: String(v.parcelas || prod.parcelas || ''),
      forma_pagamento: String(v.forma_pagamento || ''), obs: String(v.obs || '').slice(0, 500),
      status: 'ativa', produto_fora_lista: fora ? 'SIM' : ''
    };
    inserir_('Vendas', venda);
    const campos = { status: 'ganho', ultima_acao: agora_(), atualizado_em: agora_(), motivo: '' };
    if (lead.status !== 'ganho') campos.fechado_em = agora_();
    if (!lead.responsavel_id) { campos.responsavel_id = user.id; campos.responsavel_nome = user.nome; campos.inicio_tratativa = agora_(); }
    atualizar_('Leads', lead.id, campos);
    logHist_(lead.id, user, 'ganho', prod.nome + ' · entrada ' + brl_(entrada) + ' · total ' + brl_(total));
    return { lead: leadPorId_(lead.id), venda: venda, produto: prod };
  });
}

function marcarPerdido_(user, b) {
  return comTrava_(function () {
    const lead = leadPermitido_(user, b.id);
    const motivo = String(b.motivo || '').trim();
    if (!motivo) throw new Error('Informe o motivo.');
    atualizar_('Leads', lead.id, { status: 'perdido', motivo: motivo, fechado_em: agora_(), ultima_acao: agora_(), atualizado_em: agora_() });
    logHist_(lead.id, user, 'perdido', motivo);
    return leadPorId_(lead.id);
  });
}

function marcarReembolso_(user, b) {
  return comTrava_(function () {
    const lead = leadPermitido_(user, b.id);
    const motivo = String(b.motivo || '').trim();
    if (!motivo) throw new Error('Informe o motivo do reembolso.');
    atualizar_('Leads', lead.id, { status: 'reembolso', motivo: motivo, fechado_em: agora_(), ultima_acao: agora_(), atualizado_em: agora_() });
    let n = 0;
    if (b.reembolsar_vendas !== false) {
      const t = tabela_('Vendas');
      const col = t.cab.indexOf('status');
      t.objs.forEach(function (v, i) {
        if (v.lead_id === lead.id && v.status === 'ativa') { t.sh.getRange(i + 2, col + 1).setValue('reembolsada'); n++; }
      });
      limparMemo_();
    }
    logHist_(lead.id, user, 'reembolso', motivo + (n ? ' · ' + n + ' venda(s) marcada(s) como reembolsada(s)' : ''));
    return leadPorId_(lead.id);
  });
}

function reabrirLead_(user, b) {
  return comTrava_(function () {
    const lead = leadPermitido_(user, b.id);
    if (lead.status === 'tratativa' || lead.status === 'novo') return lead;
    atualizar_('Leads', lead.id, { status: 'tratativa', ultima_acao: agora_(), atualizado_em: agora_() });
    logHist_(lead.id, user, 'reaberto', 'De "' + lead.status + '" para tratativa');
    return leadPorId_(lead.id);
  });
}

function notaLead_(user, b) {
  const texto = String(b.texto || '').trim().slice(0, 1000);
  if (!texto) throw new Error('Escreva a anotação.');
  return comTrava_(function () {
    const lead = leadPermitido_(user, b.id, true);
    logHist_(lead.id, user, 'nota', texto);
    if (lead.responsavel_id === user.id) atualizar_('Leads', lead.id, { ultima_acao: agora_() });
    return true;
  });
}

function historicoLead_(user, b) {
  leadPermitido_(user, b.id, true);
  return tabela_('Historico').objs.filter(function (h) { return h.lead_id === b.id; }).reverse();
}

function excluirVenda_(user, b) {
  return comTrava_(function () {
    const v = tabela_('Vendas').objs.filter(function (x) { return x.id === b.id; })[0];
    if (!v) throw new Error('Venda não encontrada.');
    if (user.perfil !== 'coordenador' && v.usuario_id !== user.id) throw new Error('Sem permissão.');
    excluir_('Vendas', v.id);
    logHist_(v.lead_id, user, 'venda_excluida', v.produto_nome + ' · ' + brl_(v.valor_total));
    const restantes = tabela_('Vendas').objs.filter(function (x) { return x.lead_id === v.lead_id && x.status === 'ativa'; });
    const lead = leadPorId_(v.lead_id);
    if (lead && lead.status === 'ganho' && !restantes.length) {
      atualizar_('Leads', lead.id, { status: 'tratativa', atualizado_em: agora_() });
    }
    return true;
  });
}

/** Lead que o usuário pode alterar. leitura=true libera leads "novo" também. */
function leadPermitido_(user, id, leitura) {
  const lead = leadPorId_(id);
  if (!lead) throw new Error('Lead não encontrado.');
  if (user.perfil === 'coordenador') return lead;
  if (lead.responsavel_id === user.id) return lead;
  if (leitura && lead.status === 'novo' && !lead.responsavel_id) return lead;
  if (lead.status === 'novo' && !lead.responsavel_id) throw new Error('Inicie a conversa pelo WhatsApp para assumir este lead.');
  throw new Error('Este lead está com ' + (lead.responsavel_nome || 'outro usuário') + '.');
}

function leadPorId_(id) {
  return tabela_('Leads').objs.filter(function (l) { return l.id === id; })[0];
}

function acharDuplicado_(email, tel) {
  const e = String(email || '').trim().toLowerCase();
  const t = telChave_(tel);
  return tabela_('Leads').objs.filter(function (l) {
    return (e && l.email === e) || (t && telChave_(l.telefone) === t);
  })[0];
}

/* ============================================================================
 *  COORDENADOR
 * ========================================================================== */
function painelAdmin_(user) {
  const base = bootstrap_(user);
  base.usuarios = tabela_('Usuarios').objs.map(publicoUsuario_);
  base.historico = tabela_('Historico').objs.slice(-400).reverse();
  base.config = configPublica_();
  return base;
}

/** URLs prontas de cada tipo de webhook de dados (para copiar no painel). */
function urlsDados_(url, chave) {
  const tipos = [
    ['interesse', 'Lista de interesse no ' + progOferta_(), 'Quem levantou a mão. Cria o lead se não existir e distribui entre as concierges.'],
    ['checkin', 'Check-in / presença no Treinamento', 'Formulário de check-in (Yay Forms). Marca "Participou do Treinamento" E atualiza os dados do lead (cargo, faturamento, segmento, nº de colaboradores, desafio...). Quem não está no sistema entra como lead novo.'],
    ['pesquisa', 'Pesquisa de perfil', 'Respostas da pesquisa de perfil (Yay Forms). Marca o marco e preenche os campos que alimentam o ranking.'],
    ['presentes', 'Baixou os presentes', 'Quem baixou os materiais/presentes do Treinamento. Marca a tag no card.'],
    ['confirmacao', 'Confirmou presença', 'Quem confirmou que vai assistir.'],
    ['diagnostico', 'Diagnóstico respondido', 'Respostas do diagnóstico (as outras colunas viram respostas no card).'],
    ['obrigado', 'Página de obrigado', 'Dados extras do formulário de obrigado.']
  ];
  const ativos = marcosAtivos_();
  const mapa = { interesse: 'interesse', checkin: 'checkin', presentes: 'presentes', confirmacao: 'confirmado', pesquisa: 'pesquisa' };
  return tipos.filter(function (t) { return !mapa[t[0]] || ativos.indexOf(mapa[t[0]]) >= 0; }).map(function (t) {
    return {
      tipo: t[0], nome: t[1], ajuda: t[2],
      url: url ? url + '?src=dados&key=' + chave + '&tipo=' + t[0] : '',
      url_get: url ? url + '?src=dados&key=' + chave + '&tipo=' + t[0] + '&email=%EMAIL%&telefone=%PHONE%&nome=%FIRSTNAME%' : ''
    };
  });
}

function configPublica_() {
  const c = lerConfig_();
  const url = urlApp_();
  let urlBruta = '';
  try { urlBruta = ScriptApp.getService().getUrl() || ''; } catch (e) { urlBruta = ''; }
  return {
    // true = o Google devolve a URL "da empresa" (/a/dominio/). As URLs abaixo já
    // vêm corrigidas, mas qualquer URL copiada daqui ANTES desta correção precisa
    // ser trocada nas ferramentas de fora.
    url_dominio: !!urlBruta && urlBruta !== url,
    webhook: url ? url + '?src=hotmart&key=' + c.HOTMART_CHAVE : '(publique o App da Web para gerar a URL)',
    webhook_kiwify: url ? url + '?src=kiwify&key=' + c.KIWIFY_CHAVE : '(publique o App da Web para gerar a URL)',
    webhook_guru: url ? url + '?src=guru&key=' + c.GURU_CHAVE : '(publique o App da Web para gerar a URL)',
    guru_token: !!c.GURU_TOKEN, guru_produtos: c.GURU_PRODUTOS || '', guru_produto_sistema: c.GURU_PRODUTO_SISTEMA || '',
    guru_cria_lead: String(c.GURU_CRIA_LEAD || 'SIM') !== 'NAO',
    pesquisa_planilha_id: c.PESQUISA_PLANILHA_ID || '', pesquisa_aba: c.PESQUISA_ABA || '',
    pesquisa_ultima_sinc: c.PESQUISA_ULTIMA_SINC || '',
    pesquisa_cria_lead: c.PESQUISA_CRIA_LEAD === 'SIM',
    checkin_cria_lead: String(c.CHECKIN_CRIA_LEAD || 'SIM') !== 'NAO',
    dados_sobrescrever: c.DADOS_SOBRESCREVER === 'SIM',
    kiwify_token: !!c.KIWIFY_TOKEN, programa_oferta: progOferta_(), tag_evento: c.TAG_EVENTO || '',
    id_padrao: c.HOTMART_ID_PADRAO, id_vip: c.HOTMART_ID_VIP, produtos: produtosHotmart_(),
    base_id: c.BASE_CLIENTES_ID, ultima_sincronizacao: c.ULTIMA_SINCRONIZACAO,
    webhook_dados: url ? url + '?src=dados&key=' + c.DADOS_CHAVE + '&tipo=diagnostico' : '(publique o App da Web para gerar a URL)',
    upgrade_url: c.UPGRADE_VIP_URL || '', upgrade_valor: c.UPGRADE_VIP_VALOR || '', diagnostico_url: c.DIAGNOSTICO_URL || '',
    distribuicao_auto: c.DISTRIBUICAO_AUTO === 'SIM', evento_data: c.EVENTO_DATA || '',
    diag_planilha_id: c.DIAG_PLANILHA_ID || '', diag_aba: c.DIAG_ABA || '', diag_ultima_sinc: c.DIAG_ULTIMA_SINC || '',
    webhook_interesse: url ? url + '?src=dados&key=' + c.DADOS_CHAVE + '&tipo=interesse' : '(publique o App da Web para gerar a URL)',
    webhook_interesse_get: url ? url + '?src=dados&key=' + c.DADOS_CHAVE + '&tipo=interesse&email=%EMAIL%&telefone=%PHONE%&nome=%FIRSTNAME%' : '',
    ac_tag_interesse: c.AC_TAG_INTERESSE || '',
    webhooks_dados: urlsDados_(url, c.DADOS_CHAVE),
    modo_teste: c.HOTMART_MODO_TESTE === 'SIM',
    modo: 'evento',
    marcos_ativos: marcosAtivos_(),
    quem_gerencia: c.QUEM_GERENCIA || 'coordenador',
    nome_sistema: c.NOME_SISTEMA || '',
    hotmart_api: credHotmartStatus_(),
    webhooks: ultimosWebhooks_(8)
  };
}

function configAdmin_(user, b) {
  const permitidos = ['HOTMART_ID_PADRAO', 'HOTMART_ID_VIP', 'HOTMART_PRODUTOS', 'BASE_CLIENTES_ID', 'HOTMART_HOTTOK', 'HOTMART_MODO_TESTE',
    'UPGRADE_VIP_URL', 'UPGRADE_VIP_VALOR', 'DIAGNOSTICO_URL', 'DISTRIBUICAO_AUTO', 'EVENTO_DATA',
    'NOME_SISTEMA', 'MARCOS_ATIVOS', 'QUEM_GERENCIA', 'DIAG_PLANILHA_ID', 'DIAG_ABA', 'AC_TAG_INTERESSE', 'KIWIFY_TOKEN', 'PROGRAMA_OFERTA',
    'GURU_TOKEN', 'GURU_PRODUTOS', 'GURU_PRODUTO_SISTEMA', 'GURU_CRIA_LEAD',
    'PESQUISA_PLANILHA_ID', 'PESQUISA_ABA', 'PESQUISA_CRIA_LEAD', 'CHECKIN_CRIA_LEAD', 'DADOS_SOBRESCREVER'];
  const d = b.config || {};
  permitidos.forEach(function (k) { if (d[k] !== undefined) salvarConfig_(k, String(d[k]).trim()); });
  progCache_ = null;
  return configPublica_();
}

function salvarUsuario_(admin, b) {
  const d = b.usuario || {};
  const email = String(d.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');
  if (!String(d.nome || '').trim()) throw new Error('Informe o nome.');
  return comTrava_(function () {
    const todos = tabela_('Usuarios').objs;
    if (todos.some(function (u) { return u.email === email && u.id !== d.id; })) throw new Error('Já existe usuário com esse e-mail.');
    const campos = {
      nome: String(d.nome).trim(), email: email,
      perfil: d.perfil === 'coordenador' ? 'coordenador' : 'usuario',
      ativo: d.ativo === 'NAO' ? 'NAO' : 'SIM', recebe_leads: d.recebe_leads === 'SIM' ? 'SIM' : 'NAO',
      atualizado_em: agora_()
    };
    if (d.id === admin.id && (campos.ativo === 'NAO' || campos.perfil !== 'coordenador')) {
      throw new Error('Você não pode desativar nem rebaixar seu próprio acesso.');
    }
    if (d.senha) {
      if (String(d.senha).length < 6) throw new Error('A senha precisa de ao menos 6 caracteres.');
      campos.salt = Utilities.getUuid();
      campos.senha_hash = hash_(String(d.senha), campos.salt);
    }
    if (d.id) {
      atualizar_('Usuarios', d.id, campos);
      return publicoUsuario_(usuarioPorId_(d.id));
    }
    if (!d.senha) throw new Error('Defina uma senha para o novo usuário.');
    campos.id = novoId_('U'); campos.foto = ''; campos.criado_em = agora_();
    inserir_('Usuarios', campos);
    return publicoUsuario_(campos);
  });
}

function salvarProduto_(admin, b) {
  const d = b.produto || {};
  if (!String(d.nome || '').trim()) throw new Error('Informe o nome do produto.');
  if (!(Number(num_(d.valor_total)) > 0)) throw new Error('Informe o valor total.');
  return comTrava_(function () {
    const campos = {
      nome: String(d.nome).trim(), valor_total: num_(d.valor_total), valor_entrada: num_(d.valor_entrada),
      parcelas: String(d.parcelas || ''), descricao: String(d.descricao || ''), ativo: d.ativo === 'NAO' ? 'NAO' : 'SIM'
    };
    if (d.id) { atualizar_('Produtos', d.id, campos); campos.id = d.id; return campos; }
    campos.id = novoId_('P'); campos.origem = 'coordenador'; campos.criado_por = admin.nome; campos.criado_em = agora_();
    inserir_('Produtos', campos);
    return campos;
  });
}

function salvarMensagem_(admin, b) {
  const d = b.mensagem || {};
  if (!String(d.titulo || '').trim() || !String(d.texto || '').trim()) throw new Error('Preencha título e texto.');
  return comTrava_(function () {
    const campos = {
      titulo: String(d.titulo).trim(), texto: String(d.texto),
      tipo_ingresso: ['padrao', 'vip'].indexOf(d.tipo_ingresso) >= 0 ? d.tipo_ingresso : 'todos',
      fase_id: String(d.fase_id || ''), ordem: String(d.ordem || '0'), ativo: d.ativo === 'NAO' ? 'NAO' : 'SIM'
    };
    if (d.id) { atualizar_('Mensagens', d.id, campos); campos.id = d.id; return campos; }
    campos.id = novoId_('M'); campos.criado_em = agora_();
    inserir_('Mensagens', campos);
    return campos;
  });
}

function atribuirLead_(admin, b) {
  return comTrava_(function () {
    const lead = leadPorId_(b.id);
    const u = usuarioPorId_(b.usuario_id);
    if (!lead || !u) throw new Error('Lead ou usuário não encontrado.');
    const campos = { responsavel_id: u.id, responsavel_nome: u.nome, atualizado_em: agora_() };
    if (!lead.fase_id) campos.fase_id = primeiraFase_();
    atualizar_('Leads', lead.id, campos);
    logHist_(lead.id, admin, 'atribuido', 'Para ' + u.nome + (lead.responsavel_nome ? ' (antes: ' + lead.responsavel_nome + ')' : ''));
    return leadPorId_(lead.id);
  });
}

function liberarLead_(admin, b) {
  return comTrava_(function () {
    const lead = leadPorId_(b.id);
    if (!lead) throw new Error('Lead não encontrado.');
    atualizar_('Leads', lead.id, {
      status: 'novo', responsavel_id: '', responsavel_nome: '', inicio_tratativa: '', motivo: '', fechado_em: '', atualizado_em: agora_()
    });
    logHist_(lead.id, admin, 'liberado', 'Devolvido para a lista de contatos' + (lead.responsavel_nome ? ' (estava com ' + lead.responsavel_nome + ')' : ''));
    return leadPorId_(lead.id);
  });
}

/** Importa leads (planilha/CSV). b.linhas = [{nome,email,telefone,tipo_ingresso,cidade,transacao,...}] */
function importarLeads_(admin, b) {
  const linhas = b.linhas || [];
  if (!linhas.length) throw new Error('Nenhuma linha para importar.');
  if (linhas.length > 5000) throw new Error('Importe no máximo 5000 linhas por vez.');
  return comTrava_(function () { return importarLinhas_(linhas, admin, 'importacao', !!b.simular); });
}

/**
 * Núcleo da importação (usado pela planilha e pela API da Hotmart).
 * Não duplica: mesma transação, mesmo e-mail ou mesmo telefone.
 * Se a pessoa já existe como Padrão e aparece uma compra VIP, o lead vira VIP.
 */
function importarLinhas_(linhas, autor, origem, simular) {
  const existentes = tabela_('Leads').objs;
  const porEmail = {}, porTel = {}, porTrans = {};
  existentes.forEach(function (l) {
    if (l.email) porEmail[l.email] = l;
    const t = telChave_(l.telefone); if (t) porTel[t] = l;
    if (l.transacao) porTrans[l.transacao] = l;
  });
  const idx = indiceBase_();
  const abertos = contarAbertos_();
  const faseIni = primeiraFase_();
  const novos = [];
  const viraVip = {}, novosIds = {};
  let dup = 0, inval = 0, semTel = 0;
  linhas.forEach(function (r) {
    const nome = String(r.nome || '').trim();
    const email = String(r.email || '').trim().toLowerCase();
    const t = telChave_(r.telefone);
    const tipo = /vip/i.test(String(r.tipo_ingresso || '')) ? 'vip' : 'padrao';
    if (!nome || (!email && !t)) { inval++; return; }
    const ja = (r.transacao && porTrans[r.transacao]) || (email && porEmail[email]) || (t && porTel[t]);
    if (ja) {
      dup++;
      if (novosIds[ja.id]) {
        if (!ja.telefone && r.telefone) ja.telefone = limpar_(r.telefone, 'telefone');
        if (!ja.cidade && r.cidade) ja.cidade = String(r.cidade);
      }
      if (tipo === 'vip' && ja.tipo_ingresso !== 'vip') {
        if (novosIds[ja.id]) ja.tipo_ingresso = 'vip'; // lead desta mesma importação
        else viraVip[ja.id] = ja;
      }
      return;
    }
    if (!t) semTel++;
    const lead = {
      id: novoId_('L'), criado_em: r.criado_em || agora_(), origem: origem,
      tipo_ingresso: tipo, nome: nome, email: email, telefone: limpar_(r.telefone, 'telefone'),
      cidade: String(r.cidade || ''), transacao: String(r.transacao || ''),
      produto_hotmart: String(r.produto_hotmart || ''), origem_evento: String(r.origem_evento || ''), valor_ingresso: num_(r.valor_ingresso),
      status_hotmart: String(r.status_hotmart || ''), plataforma: String(r.plataforma || ''), status: 'novo', criado_por: autor.nome, atualizado_em: agora_()
    };
    lead.fase_id = faseIni;
    enriquecer_(lead, idx);
    if (!simular) distribuirSeAuto_(lead, abertos);
    novos.push(lead);
    novosIds[lead.id] = 1;
    if (email) porEmail[email] = lead;
    if (t) porTel[t] = lead;
    if (lead.transacao) porTrans[lead.transacao] = lead;
  });
  const vips = Object.keys(viraVip);
  if (!simular) {
    inserirVarios_('Leads', novos);
    vips.forEach(function (id) {
      atualizar_('Leads', id, { tipo_ingresso: 'vip', atualizado_em: agora_() });
      logHist_(id, autor, 'editado', 'Ingresso atualizado para VIP (compra VIP encontrada na importação)');
    });
    if (novos.length) logHist_('', autor, 'importacao', novos.length + ' leads importados (' + origem + ')');
  }
  return {
    simulacao: !!simular, importados: novos.length, duplicados: dup, invalidos: inval,
    sem_telefone: semTel, viraram_vip: vips.length,
    vip: novos.filter(function (l) { return l.tipo_ingresso === 'vip'; }).length,
    exemplos: novos.slice(0, 5).map(function (l) { return l.nome + ' · ' + (l.telefone || l.email) + ' · ' + l.tipo_ingresso; })
  };
}

/* ============================================================================
 *  PRODUTOS DA HOTMART (origens de lead)
 * ========================================================================== */
/** Lê a lista de produtos da aba Config: [{id, nome, tipo}] */
function produtosHotmart_() {
  const c = lerConfig_();
  const linhas = String(c.HOTMART_PRODUTOS || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  const out = [];
  linhas.forEach(function (l) {
    const p = l.split(';').map(function (x) { return x.trim(); });
    if (!p[0]) return;
    out.push({ id: String(p[0]), nome: p[1] || ('Produto ' + p[0]), tipo: /vip/i.test(p[2] || '') ? 'vip' : 'padrao', plataforma: /kiwify/i.test(p[3] || '') ? 'kiwify' : 'hotmart' });
  });
  if (!out.length) {
    // compatibilidade com a versão antiga (dois IDs soltos)
    if (c.HOTMART_ID_PADRAO) out.push({ id: String(c.HOTMART_ID_PADRAO), nome: 'Ingresso Padrão', tipo: 'padrao', plataforma: 'hotmart' });
    if (c.HOTMART_ID_VIP) out.push({ id: String(c.HOTMART_ID_VIP), nome: 'Ingresso VIP', tipo: 'vip', plataforma: 'hotmart' });
  }
  return out;
}

function produtoHotmartPorId_(id, plataforma) {
  const alvo = String(id);
  return produtosHotmart_().filter(function (p) { return p.id === alvo && (!plataforma || p.plataforma === plataforma); })[0] || null;
}

/* ============================================================================
 *  FASES DO FUNIL
 * ========================================================================== */
function fasesOrdenadas_() {
  return tabela_('Fases').objs.filter(function (f) { return f.ativo === 'SIM'; })
    .sort(function (a, b) { return Number(a.ordem || 0) - Number(b.ordem || 0); });
}

function primeiraFase_() {
  const f = fasesOrdenadas_()[0];
  return f ? f.id : '';
}

function faseNome_(id) {
  const f = tabela_('Fases').objs.filter(function (x) { return x.id === id; })[0];
  return f ? f.nome : '';
}

function mudarFase_(user, b) {
  return comTrava_(function () {
    const lead = leadPermitido_(user, b.id);
    const fase = tabela_('Fases').objs.filter(function (f) { return f.id === b.fase_id; })[0];
    if (!fase) throw new Error('Fase não encontrada.');
    if (lead.fase_id === fase.id) return lead;
    const campos = { fase_id: fase.id, fase_em: agora_(), ultima_acao: agora_(), atualizado_em: agora_() };
    if (lead.status === 'novo') { campos.status = 'tratativa'; if (!lead.inicio_tratativa) campos.inicio_tratativa = agora_(); }
    atualizar_('Leads', lead.id, campos);
    logHist_(lead.id, user, 'fase', (faseNome_(lead.fase_id) || 'sem fase') + ' → ' + fase.nome);
    return leadPorId_(lead.id);
  });
}

function salvarFase_(admin, b) {
  const d = b.fase || {};
  if (!String(d.nome || '').trim()) throw new Error('Informe o nome da fase.');
  return comTrava_(function () {
    const campos = {
      nome: String(d.nome).trim(), ordem: String(Number(d.ordem || 0) || (tabela_('Fases').objs.length + 1)),
      cor: String(d.cor || '#0369B1'), instrucoes: String(d.instrucoes || '').slice(0, 2000),
      ativo: d.ativo === 'NAO' ? 'NAO' : 'SIM'
    };
    if (d.id) { atualizar_('Fases', d.id, campos); campos.id = d.id; return campos; }
    campos.id = novoId_('F'); campos.criado_em = agora_();
    inserir_('Fases', campos);
    return campos;
  });
}

function excluirFase_(admin, b) {
  return comTrava_(function () {
    const usados = tabela_('Leads').objs.filter(function (l) { return l.fase_id === b.id; }).length;
    if (usados) throw new Error(usados + ' lead(s) estão nesta fase. Mova-os antes ou desative a fase.');
    return excluir_('Fases', b.id);
  });
}

/* ============================================================================
 *  MARCOS (presença, upgrade VIP, diagnóstico, reunião, check-in)
 * ========================================================================== */
const ROT_MARCO = {
  interesse: { sim: 'Levantou a mão (lista de interesse)', nao: 'Sem interesse no programa' },
  boas_vindas: { enviada: 'Boas-vindas enviada', respondeu: 'Respondeu as boas-vindas', sem_resposta: 'Não respondeu as boas-vindas' },
  acesso: { sim: 'Acessou o produto', nao: 'Ainda não acessou o produto' },
  confirmado: { sim: 'Confirmou presença', nao: 'Não vai participar' },
  upgrade: { enviado: 'Link do upgrade VIP enviado', feito: 'Fez o upgrade VIP', nao_quer: 'Não quer o upgrade VIP' },
  diagnostico: { enviado: 'Diagnóstico enviado', feito: 'Diagnóstico respondido' },
  reuniao: { agendada: 'Reunião agendada', feita: 'Reunião realizada', nao_compareceu: 'Não compareceu à reunião' },
  checkin: { sim: 'Participou do Treinamento', nao: 'Não participou do Treinamento' },
  presentes: { sim: 'Baixou os presentes do Treinamento', nao: 'Não baixou os presentes' },
  pesquisa: { feita: 'Respondeu a pesquisa de perfil' }
};

function marcarMarco_(user, b) {
  const campo = String(b.campo || '');
  const valor = String(b.valor || '');
  if (!MARCOS[campo]) throw new Error('Marco desconhecido.');
  if (marcosAtivos_().indexOf(campo) < 0) throw new Error('Este marco está desligado nesta instalação.');
  if (MARCOS[campo].indexOf(valor) < 0) throw new Error('Valor inválido para ' + campo + '.');
  return comTrava_(function () {
    const lead = leadPermitido_(user, b.id);
    const campos = { atualizado_em: agora_(), ultima_acao: agora_() };
    campos[campo] = valor;
    campos[campo + '_em'] = valor ? (b.data || agora_()) : '';
    if (campo === 'reuniao' && b.obs !== undefined) campos.reuniao_obs = String(b.obs || '').slice(0, 1000);
    if (campo === 'upgrade' && valor === 'feito') campos.tipo_ingresso = 'vip';
    if (lead.status === 'novo' && valor) { campos.status = 'tratativa'; campos.inicio_tratativa = lead.inicio_tratativa || agora_(); campos.fase_id = lead.fase_id || primeiraFase_(); }
    atualizar_('Leads', lead.id, campos);
    logHist_(lead.id, user, 'marco', (ROT_MARCO[campo] && ROT_MARCO[campo][valor]) || (campo + ': ' + (valor || 'limpo')));
    return leadPorId_(lead.id);
  });
}

/* ============================================================================
 *  DISTRIBUIÇÃO DE LEADS ENTRE OS CONCIERGES
 * ========================================================================== */
/** Concierges que podem receber leads (coordenador só se marcado como "recebe leads"). */
function concierges_() {
  return tabela_('Usuarios').objs.filter(function (u) {
    return u.ativo === 'SIM' && (u.perfil !== 'coordenador' || u.recebe_leads === 'SIM');
  });
}

/** Próximo concierge da fila: quem tem menos leads em aberto (novo + tratativa). */
function proximoConcierge_(abertosPorUsuario) {
  const lista = concierges_();
  if (!lista.length) return null;
  const abertos = abertosPorUsuario || contarAbertos_();
  let melhor = lista[0];
  lista.forEach(function (u) {
    if ((abertos[u.id] || 0) < (abertos[melhor.id] || 0)) melhor = u;
  });
  abertos[melhor.id] = (abertos[melhor.id] || 0) + 1;
  return melhor;
}

function contarAbertos_() {
  const c = {};
  tabela_('Leads').objs.forEach(function (l) {
    if (!l.responsavel_id) return;
    if (l.status === 'novo' || l.status === 'tratativa') c[l.responsavel_id] = (c[l.responsavel_id] || 0) + 1;
  });
  concierges_().forEach(function (u) { if (c[u.id] === undefined) c[u.id] = 0; });
  return c;
}

/** Aplica a distribuição automática em um lead novo (se estiver ligada). */
function distribuirSeAuto_(lead, abertos) {
  if (lerConfig_().DISTRIBUICAO_AUTO !== 'SIM') return lead;
  const u = proximoConcierge_(abertos);
  if (!u) return lead;
  lead.responsavel_id = u.id;
  lead.responsavel_nome = u.nome;
  if (!lead.fase_id) lead.fase_id = primeiraFase_();
  return lead;
}

/** Botão do coordenador: divide os leads sem responsável igualmente entre os concierges. */
/* ============================================================================
 *  LEADS DUPLICADOS (a mesma pessoa em duas concierges)
 * ----------------------------------------------------------------------------
 *  Acontecia quando a pessoa comprava dois produtos (ex.: Workshop + VIP):
 *  cada compra virava um lead e a fila mandava cada um para uma concierge.
 *  O webhook já não duplica mais; isto limpa o que ficou para trás.
 * ========================================================================== */
const PESO_STATUS = { ganho: 5, tratativa: 4, novo: 3, perdido: 2, reembolso: 1 };

function gruposDuplicados_() {
  const leads = tabela_('Leads').objs;
  const pai = {};
  const achar = function (x) { while (pai[x] && pai[x] !== x) x = pai[x]; return x; };
  const unir = function (a, b) { a = achar(a); b = achar(b); if (a !== b) pai[b] = a; };
  const porEmail = {}, porTel = {};
  leads.forEach(function (l) {
    pai[l.id] = pai[l.id] || l.id;
    const em = String(l.email || '').trim().toLowerCase();
    const tk = telChave_(l.telefone);
    if (em) { if (porEmail[em]) unir(porEmail[em], l.id); else porEmail[em] = l.id; }
    if (tk) { if (porTel[tk]) unir(porTel[tk], l.id); else porTel[tk] = l.id; }
  });
  const grupos = {};
  leads.forEach(function (l) { const r = achar(l.id); (grupos[r] = grupos[r] || []).push(l); });
  return Object.keys(grupos).map(function (k) { return grupos[k]; }).filter(function (g) { return g.length > 1; });
}

/** Qual lead do grupo fica: quem tem mais história; empate, o mais antigo. */
function principalDoGrupo_(grupo, porLead) {
  return grupo.slice().sort(function (a, b) {
    const pa = (PESO_STATUS[a.status] || 0), pb = (PESO_STATUS[b.status] || 0);
    if (pa !== pb) return pb - pa;
    const ha = (porLead[a.id] || 0), hb = (porLead[b.id] || 0);
    if (ha !== hb) return hb - ha;
    const ua = String(a.ultima_acao || a.inicio_tratativa || ''), ub = String(b.ultima_acao || b.inicio_tratativa || '');
    if (ua !== ub) return ub.localeCompare(ua);
    return String(a.criado_em).localeCompare(String(b.criado_em));
  })[0];
}

function listarDuplicados_(admin) {
  const hist = tabela_('Historico').objs;
  const porLead = {};
  hist.forEach(function (h) { if (h.lead_id) porLead[h.lead_id] = (porLead[h.lead_id] || 0) + 1; });
  return {
    grupos: gruposDuplicados_().map(function (g) {
      const p = principalDoGrupo_(g, porLead);
      return {
        fica: p.id,
        leads: g.map(function (l) {
          return {
            id: l.id, nome: l.nome, email: l.email, telefone: l.telefone, status: l.status,
            responsavel_nome: l.responsavel_nome || '', origem_evento: l.origem_evento || '',
            tipo_ingresso: l.tipo_ingresso, criado_em: l.criado_em, acoes: porLead[l.id] || 0,
            principal: l.id === p.id
          };
        })
      };
    })
  };
}

/** Junta cada grupo em um lead só. b.simular = true apenas mostra o que faria. */
function juntarDuplicados_(admin, b) {
  b = b || {};
  return comTrava_(function () {
    const grupos = gruposDuplicados_();
    if (!grupos.length) return { grupos: 0, juntados: 0, simulacao: !!b.simular, detalhes: [] };
    const histTab = tabela_('Historico');
    const porLead = {};
    histTab.objs.forEach(function (h) { if (h.lead_id) porLead[h.lead_id] = (porLead[h.lead_id] || 0) + 1; });

    const t = tabela_('Leads');
    const linhaDe = {};
    t.objs.forEach(function (l, i) { linhaDe[l.id] = i; });
    const valores = t.sh.getRange(2, 1, t.objs.length, t.cab.length).getValues();
    const col = function (c) { return t.cab.indexOf(c); };
    const MARCOS_SIM = { confirmado: 'sim', checkin: 'sim', presentes: 'sim', interesse: 'sim', acesso: 'sim', upgrade: 'feito', diagnostico: 'feito' };
    const detalhes = [], apagar = [], novosHist = [];
    let juntados = 0;

    grupos.forEach(function (g) {
      const p = principalDoGrupo_(g, porLead);
      const outros = g.filter(function (l) { return l.id !== p.id; });
      const campos = {};
      const compras = String(p.compras || '').split('\n').filter(Boolean);
      let valor = valorNum_(p.valor_ingresso);
      outros.forEach(function (o) {
        // campos vazios do principal são preenchidos pelo duplicado
        t.cab.forEach(function (c) {
          if (['id', 'criado_em', 'compras', 'valor_ingresso'].indexOf(c) >= 0) return;
          if (!p[c] && !campos[c] && o[c]) campos[c] = o[c];
        });
        // marcos: se qualquer um dos dois tem, o lead final tem
        Object.keys(MARCOS_SIM).forEach(function (m) {
          if (o[m] === MARCOS_SIM[m] && p[m] !== MARCOS_SIM[m]) {
            campos[m] = MARCOS_SIM[m];
            if (o[m + '_em']) campos[m + '_em'] = o[m + '_em'];
          }
        });
        // status mais avançado vence
        if ((PESO_STATUS[o.status] || 0) > (PESO_STATUS[campos.status || p.status] || 0)) campos.status = o.status;
        String(o.compras || '').split('\n').filter(Boolean).forEach(function (x) { compras.push(x); });
        if (o.produto_hotmart && o.produto_hotmart !== p.produto_hotmart) {
          compras.push([o.produto_hotmart, o.origem_evento || '', o.tipo_ingresso || '', num_(o.valor_ingresso), o.transacao || '', o.criado_em || ''].join('|'));
        }
        valor += valorNum_(o.valor_ingresso);
        if (o.tipo_ingresso === 'vip') { campos.tipo_ingresso = 'vip'; if (p.tipo_ingresso !== 'vip') campos.upgrade = p.upgrade || 'feito'; }
        apagar.push(o.id);
      });
      const vistos = {};
      campos.compras = compras.filter(function (x) { if (vistos[x]) return false; vistos[x] = 1; return true; }).join('\n').slice(0, 4000);
      campos.valor_ingresso = num_(valor);
      campos.atualizado_em = agora_();
      const resumo = {
        fica: p.id, nome: p.nome, responsavel: campos.responsavel_nome || p.responsavel_nome || '(sem responsável)',
        removidos: outros.map(function (o) { return o.id + ' (' + (o.responsavel_nome || 'sem responsável') + ')'; })
      };
      detalhes.push(resumo);
      juntados += outros.length;
      if (b.simular) return;
      // grava o lead principal
      const i = linhaDe[p.id];
      Object.keys(campos).forEach(function (c) { const j = col(c); if (j >= 0) valores[i][j] = campos[c]; });
      novosHist.push({
        data: agora_(), lead_id: p.id, usuario_id: admin.id || '', usuario_nome: admin.nome || 'Sistema',
        acao: 'editado', detalhe: 'Leads duplicados juntados (' + outros.length + '): ' + resumo.removidos.join(', ') + ' · responsável: ' + resumo.responsavel
      });
    });

    if (b.simular) return { grupos: grupos.length, juntados: juntados, simulacao: true, detalhes: detalhes };

    t.sh.getRange(2, 1, valores.length, t.cab.length).setValues(valores);
    limparMemo_();

    // histórico e vendas dos removidos passam para o lead que ficou
    const mapaNovo = {};
    detalhes.forEach(function (d) { d.removidos.forEach(function (r) { mapaNovo[r.split(' ')[0]] = d.fica; }); });
    [['Historico', 'lead_id'], ['Vendas', 'lead_id']].forEach(function (par) {
      const tb = tabela_(par[0]);
      if (!tb.objs.length) return;
      const c = tb.cab.indexOf(par[1]);
      if (c < 0) return;
      const vals = tb.sh.getRange(2, 1, tb.objs.length, tb.cab.length).getValues();
      let mudou = 0;
      vals.forEach(function (r) { if (mapaNovo[r[c]]) { r[c] = mapaNovo[r[c]]; mudou++; } });
      if (mudou) tb.sh.getRange(2, 1, vals.length, tb.cab.length).setValues(vals);
    });
    inserirVarios_('Historico', novosHist);
    limparMemo_();

    // apaga as linhas duplicadas (de baixo para cima)
    const t2 = tabela_('Leads');
    const fora = {};
    apagar.forEach(function (id) { fora[id] = 1; });
    const linhas = [];
    t2.objs.forEach(function (l, i) { if (fora[l.id]) linhas.push(i + 2); });
    linhas.sort(function (a, c) { return c - a; }).forEach(function (r) { t2.sh.deleteRow(r); });
    limparMemo_();
    return { grupos: grupos.length, juntados: juntados, simulacao: false, detalhes: detalhes };
  });
}

function distribuirLeads_(admin, b) {
  return comTrava_(function () {
    const lista = concierges_();
    if (!lista.length) throw new Error('Cadastre os concierges em Equipe antes de distribuir.');
    const abertos = contarAbertos_();
    const sem = tabela_('Leads').objs.filter(function (l) { return l.status === 'novo' && !l.responsavel_id; })
      .sort(function (a, b2) { return String(a.criado_em).localeCompare(String(b2.criado_em)); });
    if (!sem.length) return { distribuidos: 0, por_usuario: {}, concierges: lista.length };
    const porUsuario = {};
    if (b && b.simular) {
      sem.forEach(function () { const u = proximoConcierge_(abertos); porUsuario[u.nome] = (porUsuario[u.nome] || 0) + 1; });
      return { simulacao: true, distribuidos: sem.length, por_usuario: porUsuario, concierges: lista.length };
    }
    const t = tabela_('Leads');
    const cId = t.cab.indexOf('responsavel_id'), cNome = t.cab.indexOf('responsavel_nome'), cFase = t.cab.indexOf('fase_id');
    const linha = {};
    t.objs.forEach(function (l, i) { linha[l.id] = i + 2; });
    const faseIni = primeiraFase_();
    sem.forEach(function (l) {
      const u = proximoConcierge_(abertos);
      porUsuario[u.nome] = (porUsuario[u.nome] || 0) + 1;
      t.sh.getRange(linha[l.id], cId + 1).setValue(u.id);
      t.sh.getRange(linha[l.id], cNome + 1).setValue(u.nome);
      if (cFase >= 0 && !l.fase_id) t.sh.getRange(linha[l.id], cFase + 1).setValue(faseIni);
    });
    limparMemo_();
    logHist_('', admin, 'distribuicao', sem.length + ' leads distribuídos: ' + Object.keys(porUsuario).map(function (k) { return k + ' (' + porUsuario[k] + ')'; }).join(', '));
    return { distribuidos: sem.length, por_usuario: porUsuario, concierges: lista.length };
  });
}

/* ============================================================================
 *  LISTA DE INTERESSE (levantada de mão no Treinamento — programa em PROGRAMA_OFERTA)
 * ----------------------------------------------------------------------------
 *  Entra por dois caminhos:
 *   • webhook   ?src=dados&key=CHAVE&tipo=interesse   (ActiveCampaign / Zapier)
 *   • importação de planilha no painel (Dados de fora → Lista de interesse)
 *  Sempre marca o marco "interesse", cria o lead se ele ainda não existir e
 *  distribui para a concierge com menos leads em aberto — independente da
 *  distribuição automática estar ligada ou não.
 * ========================================================================== */
function origemInteresse_() { return 'Lista de interesse — ' + progOferta_(); }

function registrarInteresse_(autor, b) {
  if (marcosAtivos_().indexOf('interesse') < 0) throw new Error('A lista de interesse não está ativa nesta instalação.');
  b = b || {};
  autor = autor || { id: '', nome: 'Sistema' };
  const linhas = b.linhas || [];
  if (!linhas.length) throw new Error('Nenhuma linha para importar.');
  return comTrava_(function () {
    const t = tabela_('Leads');
    const porEmail = {}, porTel = {};
    t.objs.forEach(function (l, i) {
      l.__i = i;
      if (l.email) porEmail[String(l.email).toLowerCase()] = l;
      const k = telChave_(l.telefone); if (k) porTel[k] = l;
    });
    const valores = t.objs.length ? t.sh.getRange(2, 1, t.objs.length, t.cab.length).getValues() : [];
    const col = function (c) { return t.cab.indexOf(c); };
    const set = function (i, c, v) { const j = col(c); if (j >= 0) valores[i][j] = v; };
    const abertos = contarAbertos_();
    const temEquipe = concierges_().length > 0;
    const idx = indiceBase_();
    const faseIni = primeiraFase_();
    const hist = [], novos = [], vistos = {}, porUsuario = {};
    let marcados = 0, criados = 0, jaTinham = 0, escreveu = 0;

    linhas.forEach(function (r) {
      const em = String(r.email || '').trim().toLowerCase();
      const tk = telChave_(r.telefone);
      if (!em && !tk) return;
      const lead = (em && porEmail[em]) || (tk && porTel[tk]) || null;
      const quando = r.data || agora_();

      if (lead) {
        if (vistos[lead.id]) return;
        vistos[lead.id] = 1;
        if (lead.interesse === 'sim') { jaTinham++; return; }
        marcados++;
        if (b.simular) return;
        const i = lead.__i;
        set(i, 'interesse', 'sim');
        set(i, 'interesse_em', quando);
        let dono = lead.responsavel_nome || '';
        if (!lead.responsavel_id && temEquipe) {
          const u = proximoConcierge_(abertos);
          if (u) {
            set(i, 'responsavel_id', u.id);
            set(i, 'responsavel_nome', u.nome);
            dono = u.nome;
            porUsuario[u.nome] = (porUsuario[u.nome] || 0) + 1;
          }
        }
        if (!lead.fase_id) { set(i, 'fase_id', faseIni); set(i, 'fase_em', quando); }
        set(i, 'ultima_acao', agora_());
        set(i, 'atualizado_em', agora_());
        escreveu++;
        hist.push({
          data: agora_(), lead_id: lead.id, usuario_id: autor.id || '', usuario_nome: autor.nome || 'Sistema',
          acao: 'marco', detalhe: 'Levantou a mão para o ' + progOferta_() + (dono ? ' · atendimento: ' + dono : '')
        });
        return;
      }

      // não está no sistema: entra como lead novo, já marcado e já distribuído
      const chaveNova = 'n:' + (em || tk);
      if (vistos[chaveNova]) return;
      vistos[chaveNova] = 1;
      criados++;
      if (b.simular) return;
      const novo = {
        id: novoId_('L'), criado_em: quando, origem: 'interesse', tipo_ingresso: 'padrao',
        nome: String(r.nome || '').trim() || (em ? em.split('@')[0] : String(r.telefone || '')),
        email: em, telefone: limpar_(r.telefone || '', 'telefone'),
        empresa: String(r.empresa || '').slice(0, 120), cidade: String(r.cidade || '').slice(0, 120),
        status: 'novo', criado_por: autor.nome || 'Sistema', atualizado_em: agora_(),
        fase_id: faseIni, fase_em: quando, origem_evento: origemInteresse_(),
        interesse: 'sim', interesse_em: quando
      };
      enriquecer_(novo, idx);
      if (temEquipe) {
        const u = proximoConcierge_(abertos);
        if (u) {
          novo.responsavel_id = u.id; novo.responsavel_nome = u.nome;
          porUsuario[u.nome] = (porUsuario[u.nome] || 0) + 1;
        }
      }
      if (em) porEmail[em] = { id: novo.id, interesse: 'sim', __i: -1 };
      if (tk) porTel[tk] = { id: novo.id, interesse: 'sim', __i: -1 };
      novos.push(novo);
      hist.push({
        data: agora_(), lead_id: novo.id, usuario_id: autor.id || '', usuario_nome: autor.nome || 'Sistema',
        acao: 'criado', detalhe: 'Entrou pela lista de interesse no ' + progOferta_() + (novo.responsavel_nome ? ' · atendimento: ' + novo.responsavel_nome : '')
      });
    });

    if (!b.simular) {
      if (escreveu) t.sh.getRange(2, 1, valores.length, t.cab.length).setValues(valores);
      if (novos.length) inserirVarios_('Leads', novos);
      if (escreveu || novos.length) limparMemo_();
      if (hist.length) inserirVarios_('Historico', hist);
    }
    return {
      ok: true, simulacao: !!b.simular, tipo: 'interesse', linhas: linhas.length,
      marcados: marcados, criados: criados, ja_tinham: jaTinham,
      por_usuario: porUsuario, concierges: concierges_().length
    };
  });
}

/* ============================================================================
 *  DADOS EXTERNOS (check-in do evento, diagnóstico, página de obrigado)
 * ========================================================================== */
/**
 * Importa marcos/respostas casando por e-mail ou telefone.
 * b.tipo = 'checkin' | 'confirmacao' | 'diagnostico' | 'obrigado'
 * b.linhas = [{email, telefone, nome, valor?, respostas?{}}]
 */
function importarMarcos_(admin, b) {
  const tipo = String(b.tipo || '');
  const linhas = b.linhas || [];
  if (!linhas.length) throw new Error('Nenhuma linha para importar.');
  if (tipo === 'interesse') return registrarInteresse_(admin, b);
  if (tipo === 'perfil') return importarPerfil_(admin, b);
  if (tipo === 'pesquisa') {
    const rp = importarPerfil_(admin, Object.assign({}, b, {
      marcar_pesquisa: true,
      origem: b.origem || ('Pesquisa de perfil — ' + (lerConfig_().TAG_EVENTO || 'Treinamento'))
    }));
    rp.tipo = 'pesquisa';
    return rp;
  }
  if (['checkin', 'presentes', 'confirmacao', 'diagnostico', 'obrigado'].indexOf(tipo) < 0) throw new Error('Tipo de importação inválido.');
  return comTrava_(function () {
    const t = tabela_('Leads');
    if (!t.objs.length) throw new Error('Não há leads no sistema ainda.');
    const porEmail = {}, porTel = {};
    t.objs.forEach(function (l, i) {
      l.__i = i;
      if (l.email) porEmail[String(l.email).toLowerCase()] = l;
      const k = telChave_(l.telefone); if (k) porTel[k] = l;
    });
    const valores = t.sh.getRange(2, 1, t.objs.length, t.cab.length).getValues();
    const col = function (c) { return t.cab.indexOf(c); };
    const set = function (i, c, v) { const j = col(c); if (j >= 0) valores[i][j] = v; };
    const hist = [];
    const rot = { checkin: 'Participou do Treinamento (lista de presença)', presentes: 'Baixou os presentes do Treinamento', confirmacao: 'Confirmou presença (importado)', diagnostico: 'Diagnóstico respondido (importado)', obrigado: 'Dados da página de obrigado importados' }[tipo];
    let achados = 0, atualizados = 0, naoAchados = 0;
    const faltantes = [];
    const jaFeitos = {};
    linhas.forEach(function (r) {
      const em = String(r.email || '').trim().toLowerCase();
      const lead = (em && porEmail[em]) || porTel[telChave_(r.telefone)];
      if (!lead) { naoAchados++; if (faltantes.length < 20) faltantes.push(String(r.nome || em || r.telefone || '')); return; }
      if (jaFeitos[lead.id]) return;
      jaFeitos[lead.id] = 1;
      achados++;
      if (b.simular) return;
      const i = lead.__i;
      const quando = r.data || agora_();
      if (tipo === 'checkin') { set(i, 'checkin', 'sim'); set(i, 'checkin_em', quando); }
      else if (tipo === 'presentes') { set(i, 'presentes', 'sim'); set(i, 'presentes_em', quando); }
      else if (tipo === 'confirmacao') { set(i, 'confirmado', 'sim'); set(i, 'confirmado_em', quando); }
      else if (tipo === 'diagnostico') {
        set(i, 'diagnostico', 'feito'); set(i, 'diagnostico_em', quando);
        set(i, 'diagnostico_respostas', JSON.stringify(r.respostas || {}).slice(0, 45000));
      } else if (tipo === 'obrigado') {
        const extra = Object.assign({}, jsonSeguro_(lead.dados_extra), r.respostas || {});
        set(i, 'dados_extra', JSON.stringify(extra).slice(0, 45000));
        ['empresa', 'cargo', 'faturamento', 'cidade'].forEach(function (c) {
          const v = (r.respostas || {})[c];
          if (v && !lead[c]) set(i, c, String(v));
        });
      }
      set(i, 'atualizado_em', agora_());
      hist.push({ data: agora_(), lead_id: lead.id, usuario_id: admin.id || '', usuario_nome: admin.nome || 'Sistema', acao: 'marco', detalhe: rot });
      atualizados++;
    });
    if (atualizados) {
      t.sh.getRange(2, 1, valores.length, t.cab.length).setValues(valores);
      limparMemo_();
      inserirVarios_('Historico', hist);
    }
    return {
      simulacao: !!b.simular, tipo: tipo, linhas: linhas.length, encontrados: achados,
      atualizados: atualizados, nao_encontrados: naoAchados, exemplos_nao_encontrados: faltantes
    };
  });
}

/* ----------------------------------------------------------------------------
 *  PERFIL DO LEAD (planilha de check-in / inscrição com cargo, faturamento etc.)
 *  Preenche os campos que alimentam o ranking. Por padrão só preenche o que
 *  está vazio; b.sobrescrever = true manda o da planilha valer.
 *  b.marcar_checkin cria/marca presença; b.criar cria quem não existe.
 * -------------------------------------------------------------------------- */
const CAMPOS_PERFIL = ['cargo', 'empresa', 'faturamento', 'funcionarios', 'ramo', 'estado', 'cidade', 'conhece_4blue', 'programa_4blue', 'desafio',
  'faixa_etaria', 'socios', 'sentimento'];

function importarPerfil_(admin, b) {
  const linhas = b.linhas || [];
  if (!linhas.length) throw new Error('Nenhuma linha para importar.');
  return comTrava_(function () {
    const t = tabela_('Leads');
    const porEmail = {}, porTel = {};
    t.objs.forEach(function (l, i) {
      l.__i = i;
      if (l.email) porEmail[String(l.email).toLowerCase()] = l;
      const k = telChave_(l.telefone); if (k) porTel[k] = l;
    });
    const valores = t.objs.length ? t.sh.getRange(2, 1, t.objs.length, t.cab.length).getValues() : [];
    const col = function (c) { return t.cab.indexOf(c); };
    const set = function (i, c, v) { const j = col(c); if (j >= 0) valores[i][j] = v; };
    const abertos = contarAbertos_();
    const temEquipe = concierges_().length > 0;
    const faseIni = primeiraFase_();
    const idx = indiceBase_();
    const hist = [], novos = [], vistos = {}, faltantes = [];
    let achados = 0, atualizados = 0, criados = 0, naoAchados = 0, escreveu = 0, jaEstavam = 0;

    linhas.forEach(function (r) {
      const em = String(r.email || '').trim().toLowerCase();
      const tk = telChave_(r.telefone);
      if (!em && !tk) return;
      const lead = (em && porEmail[em]) || (tk && porTel[tk]) || null;
      const quando = r.data || agora_();
      const perfil = r.perfil || r.respostas || {};

      if (lead) {
        if (vistos[lead.id]) return;
        vistos[lead.id] = 1;
        achados++;
        if (b.simular) return;
        const i = lead.__i;
        const mud = [];
        CAMPOS_PERFIL.forEach(function (c) {
          const v = String(perfil[c] || '').trim();
          if (!v) return;
          if (lead[c] && !b.sobrescrever) return;
          if (String(lead[c] || '') === v) return;
          set(i, c, v.slice(0, 300)); mud.push(c);
        });
        if (b.marcar_checkin && lead.checkin !== 'sim') { set(i, 'checkin', 'sim'); set(i, 'checkin_em', quando); mud.push('presença'); }
        if (b.marcar_pesquisa) {
          const json = JSON.stringify(r.respostas || {}).slice(0, 45000);
          if (lead.pesquisa !== 'feita') { set(i, 'pesquisa', 'feita'); set(i, 'pesquisa_em', quando); mud.push('pesquisa de perfil'); }
          if (json !== '{}' && String(lead.pesquisa_respostas || '') !== json) {
            set(i, 'pesquisa_respostas', json);
            if (mud.indexOf('pesquisa de perfil') < 0) mud.push('respostas da pesquisa');
          }
        }
        if (b.guardar_extra && r.respostas && Object.keys(r.respostas).length) {
          const extra = Object.assign({}, jsonSeguro_(lead.dados_extra), r.respostas);
          const jx = JSON.stringify(extra).slice(0, 45000);
          if (jx !== String(lead.dados_extra || '')) { set(i, 'dados_extra', jx); mud.push('respostas do formulário'); }
        }
        if (!mud.length) { jaEstavam++; return; }
        set(i, 'atualizado_em', agora_());
        escreveu++; atualizados++;
        hist.push({
          data: agora_(), lead_id: lead.id, usuario_id: admin.id || '', usuario_nome: admin.nome || 'Sistema',
          acao: b.marcar_checkin || b.marcar_pesquisa ? 'marco' : 'editado',
          detalhe: (b.marcar_checkin ? 'Check-in no Treinamento' : b.marcar_pesquisa ? 'Respondeu a pesquisa de perfil' : 'Perfil importado') + ' · ' + mud.join(', ')
        });
        return;
      }

      naoAchados++;
      if (faltantes.length < 20) faltantes.push(String(r.nome || em || r.telefone || ''));
      if (!b.criar) return;
      const chave = 'n:' + (em || tk);
      if (vistos[chave]) return;
      vistos[chave] = 1;
      criados++;
      if (b.simular) return;
      const novo = {
        id: novoId_('L'), criado_em: quando, origem: 'planilha', tipo_ingresso: 'padrao',
        nome: String(r.nome || '').trim() || (em ? em.split('@')[0] : String(r.telefone || '')),
        email: em, telefone: limpar_(r.telefone || '', 'telefone'),
        status: 'novo', criado_por: admin.nome || 'Sistema', atualizado_em: agora_(),
        fase_id: faseIni, fase_em: quando, origem_evento: String(b.origem || 'Participantes do Treinamento')
      };
      CAMPOS_PERFIL.forEach(function (c) { const v = String(perfil[c] || '').trim(); if (v) novo[c] = v.slice(0, 300); });
      if (b.marcar_checkin) { novo.checkin = 'sim'; novo.checkin_em = quando; }
      if (b.marcar_pesquisa) {
        novo.pesquisa = 'feita'; novo.pesquisa_em = quando;
        novo.pesquisa_respostas = JSON.stringify(r.respostas || {}).slice(0, 45000);
      }
      if (b.guardar_extra && r.respostas && Object.keys(r.respostas).length) novo.dados_extra = JSON.stringify(r.respostas).slice(0, 45000);
      enriquecer_(novo, idx);
      if (temEquipe) {
        const u = proximoConcierge_(abertos);
        if (u) { novo.responsavel_id = u.id; novo.responsavel_nome = u.nome; }
      }
      novos.push(novo);
      hist.push({
        data: agora_(), lead_id: novo.id, usuario_id: admin.id || '', usuario_nome: admin.nome || 'Sistema', acao: 'criado',
        detalhe: b.marcar_checkin ? 'Entrou pelo check-in do Treinamento'
          : b.marcar_pesquisa ? 'Entrou pela pesquisa de perfil'
            : 'Importado da planilha de participantes'
      });
    });

    if (!b.simular) {
      if (escreveu) t.sh.getRange(2, 1, valores.length, t.cab.length).setValues(valores);
      if (novos.length) inserirVarios_('Leads', novos);
      if (escreveu || novos.length) limparMemo_();
      if (hist.length) inserirVarios_('Historico', hist);
    }
    return {
      simulacao: !!b.simular, tipo: 'perfil', linhas: linhas.length, encontrados: achados,
      atualizados: atualizados, criados: criados, ja_estavam: jaEstavam,
      nao_encontrados: naoAchados, exemplos_nao_encontrados: faltantes
    };
  });
}

function jsonSeguro_(txt) {
  try { const o = JSON.parse(txt); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}

/**
 * Webhook genérico de dados: ?src=dados&key=CHAVE&tipo=diagnostico|obrigado|checkin|confirmacao
 * Aceita qualquer JSON (YayForms, Zapier, ActiveCampaign etc.). Casa por e-mail ou telefone.
 */
function webhookDados_(body, p) {
  const cfg = lerConfig_();
  if (!p.key || p.key !== cfg.DADOS_CHAVE) return { ok: false, error: 'chave inválida' };
  const tipo = String(p.tipo || body.tipo || 'obrigado');
  const plano = achatar_(body);
  const email = acharValor_(plano, ['email', 'e_mail', 'e-mail', 'mail']);
  const tel = acharValor_(plano, ['telefone', 'whatsapp', 'celular', 'phone', 'fone']);
  if (!email && !tel) return { ok: true, ignorado: 'payload sem e-mail nem telefone' };
  const nome = acharValor_(plano, ['nome', 'name', 'full_name', 'first_name']);
  if (tipo === 'interesse') {
    return registrarInteresse_({ id: 'active', nome: 'ActiveCampaign' }, {
      linhas: [{
        email: email, telefone: tel, nome: nome,
        empresa: acharValor_(plano, ['empresa', 'company', 'organization', 'orgname']),
        cidade: acharValor_(plano, ['cidade', 'city'])
      }]
    });
  }
  const respostas = {};
  Object.keys(plano).forEach(function (k) {
    if (/token|hottok|chave|key|senha|password|ip_|user_agent|utm|referr|hidden/i.test(k)) return;
    if (/(^|\.)(id|_id|uuid|ucode|created_at|updated_at|form|submission)$/i.test(k)) return;
    if (Object.keys(respostas).length >= 60) return;
    if (plano[k] !== '' && plano[k] !== null && plano[k] !== undefined) respostas[k] = String(plano[k]).slice(0, 500);
  });

  // Check-in do evento e pesquisa de perfil: além do marco, puxam os dados do lead
  // (cargo, faturamento, segmento, nº de colaboradores, desafio...) do próprio formulário.
  if (tipo === 'checkin' || tipo === 'pesquisa') {
    const quemEnviou = tipo === 'pesquisa'
      ? { id: 'pesquisa', nome: 'Pesquisa de perfil' }
      : { id: 'checkin', nome: 'Check-in do evento' };
    const r = importarPerfil_(quemEnviou, {
      linhas: [{
        email: email, telefone: tel, nome: nome,
        perfil: perfilDoPlano_(plano), respostas: respostas
      }],
      marcar_checkin: tipo === 'checkin',
      marcar_pesquisa: tipo === 'pesquisa',
      guardar_extra: tipo === 'checkin',
      sobrescrever: cfg.DADOS_SOBRESCREVER === 'SIM',
      criar: tipo === 'checkin' ? cfg.CHECKIN_CRIA_LEAD !== 'NAO' : cfg.PESQUISA_CRIA_LEAD === 'SIM',
      origem: tipo === 'checkin' ? 'Check-in do Treinamento' : 'Pesquisa de perfil — ' + (cfg.TAG_EVENTO || 'Treinamento')
    });
    r.tipo = tipo;
    return r;
  }

  return importarMarcos_({ id: 'form', nome: 'Formulário' }, { tipo: tipo, linhas: [{ email: email, telefone: tel, nome: nome, respostas: respostas }] });
}

/* ----------------------------------------------------------------------------
 *  DE PERGUNTA DE FORMULÁRIO PARA CAMPO DO LEAD
 * ----------------------------------------------------------------------------
 *  O Yay Forms manda a pergunta inteira como chave ("Qual o seu cargo?").
 *  Aqui a pergunta é reconhecida por pedaço de texto, então serve para o
 *  check-in, para a pesquisa de perfil e para qualquer formulário parecido.
 * -------------------------------------------------------------------------- */
const PERGUNTAS_PERFIL = {
  cargo: { alvos: ['cargo', 'funcao na empresa', 'seu papel'] },
  empresa: { alvos: ['nome da empresa', 'empresa'], excluir: ['colaboradores', 'funcionarios', 'problema', 'faturamento', 'segmento', 'socio'] },
  faturamento: { alvos: ['faturamento'] },
  funcionarios: { alvos: ['colaboradores', 'funcionarios', 'empregados', 'tamanho da equipe'] },
  ramo: { alvos: ['segmento', 'ramo de atuacao', 'nicho', 'area de atuacao', 'setor'] },
  estado: { alvos: ['estado'] },
  cidade: { alvos: ['cidade'] },
  desafio: { alvos: ['maior problema', 'maior desafio', 'maior dificuldade', 'problema que', 'desafio'] },
  faixa_etaria: { alvos: ['faixa etaria', 'idade'], excluir: ['cidade'] },
  programa_4blue: { alvos: ['programa da 4blue', 'programa_4blue'] }
};

/**
 * Acha a resposta de uma pergunta: casa por pedaço de texto da pergunta e
 * ignora as chaves que contenham alguma palavra da lista "excluir"
 * (evita, por ex., "colaboradores da sua empresa" cair no campo empresa).
 */
function acharResposta_(plano, alvos, excluir) {
  const limpa = function (s) { return normalizar_(s).replace(/[^a-z0-9]/g, ''); };
  const ks = Object.keys(plano);
  const veto = (excluir || []).map(limpa);
  for (let i = 0; i < alvos.length; i++) {
    const alvo = limpa(alvos[i]);
    for (let j = 0; j < ks.length; j++) {
      const k = limpa(ks[j]);
      if (k.indexOf(alvo) < 0) continue;
      if (veto.some(function (x) { return x && k.indexOf(x) >= 0; })) continue;
      const v = String(plano[ks[j]] === undefined || plano[ks[j]] === null ? '' : plano[ks[j]]).trim();
      if (v) return v;
    }
  }
  return '';
}

/** "Sim/Yes" na pergunta "Você já conhecia a 4blue?" vira o texto que o ranking entende. */
function conhece4blue_(v) {
  const s = normalizar_(v);
  if (!s) return '';
  if (/^(sim|yes|y|true|1|ja conhecia|conheco)$/.test(s)) return 'Conheço, mas nunca comprei nada';
  if (/^(nao|no|n|false|0|nunca ouvi)$/.test(s)) return 'Conheci agora';
  return String(v).slice(0, 300);
}

/** Lê um payload já achatado e devolve os campos de perfil do lead. */
function perfilDoPlano_(plano) {
  const out = {};
  Object.keys(PERGUNTAS_PERFIL).forEach(function (campo) {
    const regra = PERGUNTAS_PERFIL[campo];
    const v = acharResposta_(plano, regra.alvos, regra.excluir);
    if (v) out[campo] = String(v).slice(0, 300);
  });

  // "Você já conhecia a 4blue?" (Sim/Não) → texto do ranking
  const conh = acharResposta_(plano, ['conhecia a 4blue', 'conhece a 4blue', 'conhece_4blue', 'conhece a 4 blue']);
  if (conh) out.conhece_4blue = conhece4blue_(conh);

  // "Você tem sócio?" + "Quantos?" viram um campo só
  const temSocio = acharResposta_(plano, ['tem socio', 'possui socio', 'socios']);
  if (temSocio) {
    const s = normalizar_(temSocio);
    const quantos = acharResposta_(plano, ['quantos'], ['colaboradores', 'funcionarios']);
    if (/^(nao|no|n|false|0)$/.test(s)) out.socios = 'Não tem sócio';
    else if (/^(sim|yes|y|true|1)$/.test(s)) out.socios = quantos ? quantos + ' sócio(s)' : 'Tem sócio';
    else out.socios = String(temSocio).slice(0, 120);
  }

  // leitura de sentimento que o próprio Yay Forms devolve
  const sent = acharResposta_(plano, ['sentiment']);
  const emo = acharResposta_(plano, ['emotion']);
  const sTxt = [sent, emo].filter(Boolean).join(' · ');
  if (sTxt) out.sentimento = sTxt.slice(0, 120);

  return out;
}

/** Transforma um JSON aninhado em pares chave/valor simples. */
function achatar_(obj, prefixo, saida, nivel) {
  saida = saida || {}; nivel = nivel || 0;
  if (nivel > 6) return saida;
  Object.keys(obj || {}).forEach(function (k) {
    const v = obj[k];
    const chave = prefixo ? prefixo + '.' + k : k;
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if (Array.isArray(v)) {
        // listas de {label/name, value} viram pares diretos (padrão de formulários)
        v.forEach(function (item, i) {
          if (item && typeof item === 'object' && (item.label || item.name || item.question || item.field)) {
            saida[String(item.label || item.name || item.question || item.field)] = item.value !== undefined ? item.value : (item.answer !== undefined ? item.answer : '');
          } else achatar_({ [String(i + 1)]: item }, chave, saida, nivel + 1);
        });
      } else achatar_(v, chave, saida, nivel + 1);
    } else saida[chave] = v;
  });
  return saida;
}

function acharValor_(plano, chaves) {
  const ks = Object.keys(plano);
  for (let i = 0; i < chaves.length; i++) {
    const alvo = chaves[i];
    for (let j = 0; j < ks.length; j++) {
      if (normalizar_(ks[j]).replace(/[^a-z0-9]/g, '').indexOf(alvo.replace(/[^a-z0-9]/g, '')) >= 0) {
        const v = String(plano[ks[j]] || '').trim();
        if (v) return v;
      }
    }
  }
  return '';
}

/* ============================================================================
 *  API DA HOTMART — puxar compras antigas
 *  Credenciais: Hotmart → Ferramentas → Credenciais Hotmart (API) → Criar credencial
 *  (client_id e client_secret ficam nas Propriedades do script, fora da planilha)
 * ========================================================================== */
const HOTMART_TOKEN_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token';
const HOTMART_API = 'https://developers.hotmart.com/payments/api/v1';

function salvarCredHotmart_(admin, b) {
  const props = PropertiesService.getScriptProperties();
  if (b.client_id !== undefined) props.setProperty('HOTMART_CLIENT_ID', String(b.client_id).trim());
  if (b.client_secret) props.setProperty('HOTMART_CLIENT_SECRET', String(b.client_secret).trim());
  if (b.basic) props.setProperty('HOTMART_BASIC', String(b.basic).replace(/^Basic\s+/i, '').trim());
  CacheService.getScriptCache().remove('hotmart_token');
  return credHotmartStatus_();
}

function credHotmartStatus_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('HOTMART_CLIENT_ID') || '';
  return { configurada: !!(id && p.getProperty('HOTMART_CLIENT_SECRET')), client_id: id ? id.slice(0, 6) + '…' : '' };
}

function hotmartToken_() {
  const cache = CacheService.getScriptCache();
  const c = cache.get('hotmart_token');
  if (c) return c;
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('HOTMART_CLIENT_ID'), sec = p.getProperty('HOTMART_CLIENT_SECRET');
  if (!id || !sec) throw new Error('Cadastre o client_id e o client_secret da Hotmart em Ajustes.');
  const basic = p.getProperty('HOTMART_BASIC') || Utilities.base64Encode(id + ':' + sec);
  const url = HOTMART_TOKEN_URL + '?grant_type=client_credentials&client_id=' + encodeURIComponent(id) + '&client_secret=' + encodeURIComponent(sec);
  const r = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Basic ' + basic }
  });
  if (r.getResponseCode() !== 200) {
    throw new Error('Hotmart recusou as credenciais (HTTP ' + r.getResponseCode() + '): ' + r.getContentText().slice(0, 200));
  }
  const j = JSON.parse(r.getContentText());
  if (!j.access_token) throw new Error('Hotmart não devolveu token: ' + r.getContentText().slice(0, 200));
  const ttl = Math.max(60, Math.min(21000, Number(j.expires_in || 3600) - 120));
  cache.put('hotmart_token', j.access_token, ttl);
  return j.access_token;
}

function hotmartGet_(path, params) {
  const q = Object.keys(params).filter(function (k) { return params[k] !== '' && params[k] !== undefined && params[k] !== null; })
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  const url = HOTMART_API + path + (q ? '?' + q : '');
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = UrlFetchApp.fetch(url, {
      method: 'get', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + hotmartToken_(), 'Content-Type': 'application/json' }
    });
    const code = r.getResponseCode();
    if (code === 200) return JSON.parse(r.getContentText() || '{}');
    if (code === 401) { CacheService.getScriptCache().remove('hotmart_token'); continue; }
    if (code === 429 || code >= 500) { Utilities.sleep(1500 * (tentativa + 1)); continue; }
    throw new Error('Erro da API Hotmart em ' + path + ' (HTTP ' + code + '): ' + r.getContentText().slice(0, 250));
  }
  throw new Error('A API da Hotmart não respondeu em ' + path + '. Tente de novo em alguns minutos.');
}

/** Percorre todas as páginas de um endpoint. */
function hotmartTodas_(path, params) {
  const itens = [];
  let token = '';
  for (let pag = 0; pag < 200; pag++) {
    const j = hotmartGet_(path, Object.assign({}, params, { max_results: 500, page_token: token }));
    (j.items || []).forEach(function (it) { itens.push(it); });
    token = (j.page_info && (j.page_info.next_page_token || j.page_info.nextPageToken)) || '';
    if (!token) break;
  }
  return itens;
}

/**
 * Busca as compras dos ingressos na Hotmart e importa como leads.
 * b.desde = 'AAAA-MM-DD' (padrão 2026-01-01) · b.simular = true só conta, não grava.
 */
function importarHotmartApi_(admin, b) {
  const cfg = lerConfig_();
  const ini = new Date((b.desde || '2026-01-01') + 'T00:00:00-03:00').getTime();
  if (isNaN(ini)) throw new Error('Data inicial inválida.');
  const fim = Date.now();
  const produtos = produtosHotmart_().filter(function (p) { return p.plataforma === 'hotmart' && (!b.produto_id || p.id === String(b.produto_id)); });
  const aprovadas = ['APPROVED', 'COMPLETE'];
  const canceladas = ['REFUNDED', 'CHARGEBACK', 'CANCELLED', 'PROTESTED', 'PARTIALLY_REFUNDED'];
  const compras = {};   // transacao -> dados
  const cancel = {};    // transacao -> status
  const porProduto = {};

  produtos.forEach(function (pp) {
    const prod = pp.id, tipo = pp.tipo;
    if (!prod) return;
    porProduto[pp.nome] = 0;
    aprovadas.concat(canceladas).forEach(function (st) {
      hotmartTodas_('/sales/history', { product_id: prod, transaction_status: st, start_date: ini, end_date: fim }).forEach(function (it) {
        const pu = it.purchase || {}, bu = it.buyer || {};
        const tr = String(pu.transaction || it.transaction || '');
        if (!tr) return;
        const status = String(pu.status || st).toUpperCase();
        if (aprovadas.indexOf(status) < 0) { cancel[tr] = status; return; }
        porProduto[pp.nome]++;
        compras[tr] = {
          transacao: tr, tipo_ingresso: tipo, produto_hotmart: prod, origem_evento: pp.nome, status_hotmart: status, plataforma: 'hotmart',
          nome: bu.name || '', email: bu.email || '', telefone: '',
          valor_ingresso: pu.price && pu.price.value,
          criado_em: pu.approved_date || pu.order_date ? Utilities.formatDate(new Date(Number(pu.approved_date || pu.order_date)), 'America/Sao_Paulo', "yyyy-MM-dd'T'HH:mm:ss") : ''
        };
      });
    });
    // telefones e cidade vêm do endpoint de participantes da venda
    hotmartTodas_('/sales/users', { product_id: prod, start_date: ini, end_date: fim }).forEach(function (it) {
      const c = compras[String(it.transaction || '')];
      if (!c) return;
      (it.users || []).forEach(function (u) {
        if (String(u.role || '').toUpperCase() !== 'BUYER') return;
        const us = u.user || {};
        const tel = us.cellphone || us.phone || us.phone_number || (us.phones && us.phones[0] && (us.phones[0].number || us.phones[0])) || '';
        const ddd = us.phone_local_code || us.cellphone_local_code || '';
        if (tel) c.telefone = soDigitos_(String(tel)).length >= 10 ? String(tel) : String(ddd) + String(tel);
        if (!c.nome && us.name) c.nome = us.name;
        if (!c.email && us.email) c.email = us.email;
        const ad = us.address || {};
        if (ad.city) c.cidade = [ad.city, ad.state].filter(Boolean).join(' / ');
      });
    });
  });

  const linhas = Object.keys(compras).map(function (k) { return compras[k]; })
    .sort(function (a, b2) { return String(a.criado_em).localeCompare(String(b2.criado_em)); });

  return comTrava_(function () {
    const r = importarLinhas_(linhas, { id: 'hotmart', nome: 'Hotmart (importação)' }, 'hotmart', !!b.simular);
    // compras canceladas/reembolsadas que já estão no sistema
    let reemb = 0;
    const leads = tabela_('Leads').objs.slice();
    Object.keys(cancel).forEach(function (tr) {
      const l = leads.filter(function (x) { return x.transacao === tr && x.status !== 'reembolso'; })[0];
      if (!l) return;
      reemb++;
      if (!b.simular) {
        atualizar_('Leads', l.id, { status: 'reembolso', motivo: 'Ingresso: ' + cancel[tr], status_hotmart: cancel[tr], fechado_em: agora_(), atualizado_em: agora_() });
        logHist_(l.id, { id: 'hotmart', nome: 'Hotmart' }, 'reembolso', 'Importação API: ' + cancel[tr]);
      }
    });
    if (!b.simular) logHist_('', admin, 'importacao', 'API Hotmart desde ' + (b.desde || '2026-01-01') + ': ' + r.importados + ' novos');
    r.encontradas = linhas.length;
    r.por_produto = porProduto;
    r.canceladas = Object.keys(cancel).length;
    r.reembolsos_marcados = reemb;
    r.desde = b.desde || '2026-01-01';
    return r;
  });
}

function soDigitos_(s) { return String(s || '').replace(/\D/g, ''); }

/** Dois produtos são do mesmo evento quando o nome antes do "—" é igual (ex.: Padrão e VIP do mesmo workshop). */
function ehMesmoEvento_(a, b) {
  const base = function (x) { return normalizar_(String(x || '').split('—')[0].split(' - ')[0]).replace(/\b(padrao|vip|ingresso)\b/g, '').trim(); };
  return base(a) === base(b);
}

/* ============================================================================
 *  IMPORTAÇÃO MANUAL PELO EDITOR (compras feitas antes de ligar o produto)
 * ----------------------------------------------------------------------------
 *  1) Cadastre as credenciais da Hotmart uma vez (pelo site, em Ajustes →
 *     Puxar da Hotmart, ou rodando salvarCredenciaisHotmart() abaixo).
 *  2) Ajuste IMPORTAR_DESDE e IMPORTAR_PRODUTO.
 *  3) Rode simularImportacaoHotmart() para conferir e depois
 *     importarComprasHotmart() para gravar. Ver → Registro de execução.
 * ========================================================================== */
const IMPORTAR_DESDE = '2026-01-01';   // data inicial da busca (AAAA-MM-DD)
const IMPORTAR_PRODUTO = '';           // '' = todos os produtos da lista · ex.: '4195296'

/** Só consulta e mostra os números. Não grava nada. */
function simularImportacaoHotmart() {
  return rodarImportacaoHotmart_(true);
}

/** Importa de verdade (quem já está no sistema é ignorado). */
function importarComprasHotmart() {
  return rodarImportacaoHotmart_(false);
}

function rodarImportacaoHotmart_(simular) {
  const r = importarHotmartApi_(
    { id: 'editor', nome: 'Importação manual' },
    { desde: IMPORTAR_DESDE, produto_id: IMPORTAR_PRODUTO, simular: simular }
  );
  Logger.log((simular ? '[SIMULAÇÃO — nada foi gravado] ' : '[IMPORTADO] ') +
    'desde ' + r.desde + ' · ' + r.encontradas + ' compras aprovadas na Hotmart');
  Logger.log('Por produto: ' + JSON.stringify(r.por_produto));
  Logger.log(r.importados + ' leads novos · ' + r.duplicados + ' já existiam · ' +
    r.sem_telefone + ' sem telefone · ' + r.viraram_vip + ' viraram VIP');
  Logger.log(r.canceladas + ' compras canceladas/reembolsadas · ' + r.reembolsos_marcados + ' leads movidos para Reembolso');
  if (r.exemplos && r.exemplos.length) Logger.log('Exemplos: ' + r.exemplos.join(' | '));
  return r;
}

/**
 * Atalho para guardar as credenciais da API sem passar pelo site.
 * Preencha, rode uma vez e APAGUE os valores daqui (eles ficam salvos nas
 * Propriedades do script, não na planilha).
 */
function salvarCredenciaisHotmart() {
  const CLIENT_ID = '';
  const CLIENT_SECRET = '';
  const BASIC = '';        // opcional
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Preencha CLIENT_ID e CLIENT_SECRET dentro da função.');
  salvarCredHotmart_({ id: 'editor', nome: 'Editor' }, { client_id: CLIENT_ID, client_secret: CLIENT_SECRET, basic: BASIC });
  Logger.log('Credenciais salvas. Apague os valores da função e rode simularImportacaoHotmart().');
}

/** Mostra os produtos cadastrados e quantos leads já existem de cada um. */
function listarProdutosEOrigens() {
  const leads = tabela_('Leads').objs;
  produtosHotmart_().forEach(function (p) {
    const n = leads.filter(function (l) { return l.produto_hotmart === p.id || l.origem_evento === p.nome; }).length;
    Logger.log(p.id + ' · ' + p.nome + ' (' + p.tipo + ') → ' + n + ' leads no sistema');
  });
  const sem = leads.filter(function (l) { return !l.origem_evento; }).length;
  if (sem) Logger.log(sem + ' leads sem origem definida (entraram antes desta versão)');
  return true;
}

/* ============================================================================
 *  WEBHOOKS DE COMPRA — HOTMART (postback 2.0) e KIWIFY
 * ----------------------------------------------------------------------------
 *  Os dois são traduzidos para o mesmo formato ("compra") e passam pela mesma
 *  regra: uma pessoa = um lead, VIP promove o lead, reembolso move o lead.
 * ========================================================================== */
function webhookHotmart_(body, p) {
  const cfg = lerConfig_();
  const chaveOk = (p.key && p.key === cfg.HOTMART_CHAVE) || (cfg.HOTMART_HOTTOK && body.hottok === cfg.HOTMART_HOTTOK);
  if (!chaveOk) return { ok: false, error: 'chave inválida' };

  const d = body.data || {};
  const prodId = d.product && d.product.id !== undefined && d.product.id !== null ? String(d.product.id) : '';
  const teste = prodId === '0' && cfg.HOTMART_MODO_TESTE === 'SIM';
  const prodCfg = produtoHotmartPorId_(prodId, 'hotmart');
  if (!prodCfg && !teste) return { ok: true, ignorado: prodId === '0' ? 'produto de teste da Hotmart (id 0) — ative o modo teste para aceitar' : 'produto ' + prodId + ' não está na lista de produtos do sistema (Hotmart)' };

  const ev = String(body.event || '');
  const buyer = d.buyer || {};
  const compra = d.purchase || {};
  const telBase = String(buyer.checkout_phone || buyer.phone || '').replace(/\D/g, '');
  const addr = buyer.address || {};
  return registrarCompra_({
    plataforma: 'hotmart', teste: teste, prodId: prodId,
    tipo: prodCfg ? prodCfg.tipo : 'padrao', origemEvento: prodCfg ? prodCfg.nome : 'Teste Hotmart',
    acao: (ev === 'PURCHASE_APPROVED' || ev === 'PURCHASE_COMPLETE') ? 'aprovada' : (/REFUNDED|CHARGEBACK|CANCELED|CANCELLED|PROTEST/.test(ev) ? 'cancelada' : 'outro'),
    evento: ev, status: compra.status || ev,
    transacao: String(compra.transaction || ''),
    email: String(buyer.email || '').trim().toLowerCase(),
    telefone: telBase.length >= 10 ? telBase : String(buyer.checkout_phone_code || '').replace(/\D/g, '') + telBase,
    nome: String(buyer.name || '').trim(),
    cidade: [addr.city, addr.state].filter(Boolean).join(' / '),
    valor: (compra.price && compra.price.value) || ''
  });
}

/**
 * Webhook da Kiwify. Aceita o JSON padrão da Kiwify:
 *  { order_id, order_status, webhook_event_type, Product{product_id,product_name},
 *    Customer{full_name,email,mobile,city,state}, Commissions{charge_amount (centavos)} }
 * Segurança: a chave na URL (?key=) OU a assinatura (?signature=) feita com o token.
 */
function webhookKiwify_(body, p) {
  const cfg = lerConfig_();
  const chaveOk = (p.key && p.key === cfg.KIWIFY_CHAVE) || !!p.assinatura_ok;
  if (!chaveOk) return { ok: false, error: 'chave inválida (confira o ?key= da URL cadastrada na Kiwify)' };

  const o = body.order || body;
  const prod = o.Product || o.product || {};
  const cli = o.Customer || o.customer || {};
  const com = o.Commissions || o.commissions || {};
  const prodId = String(prod.product_id || prod.id || o.product_id || '');
  const prodCfg = produtoHotmartPorId_(prodId, 'kiwify');
  const teste = !prodCfg && cfg.HOTMART_MODO_TESTE === 'SIM';
  if (!prodCfg && !teste) return { ok: true, ignorado: 'produto Kiwify ' + prodId + ' (' + (prod.product_name || '?') + ') não está na lista de produtos do sistema' };

  const st = String(o.order_status || '').toLowerCase();
  const ev = String(o.webhook_event_type || st || '').toLowerCase();
  let acao = 'outro';
  if (st === 'paid' || st === 'approved' || st === 'completed' || ev === 'order_approved') acao = 'aprovada';
  if (/refund|chargeback|chargedback|cancel/.test(st + ' ' + ev)) acao = 'cancelada';

  // valor: Kiwify manda em centavos (charge_amount). Se vier com vírgula/ponto, já está em reais.
  let valor = com.charge_amount !== undefined ? com.charge_amount : (com.product_base_price !== undefined ? com.product_base_price : '');
  if (valor !== '' && /^\d+$/.test(String(valor))) valor = Number(valor) / 100;

  let tel = String(cli.mobile || cli.phone || cli.cellphone || '').replace(/\D/g, '');
  if (tel.length >= 12 && tel.indexOf('55') === 0) tel = tel.slice(2);
  return registrarCompra_({
    plataforma: 'kiwify', teste: teste, prodId: prodId,
    tipo: prodCfg ? prodCfg.tipo : 'padrao', origemEvento: prodCfg ? prodCfg.nome : 'Teste Kiwify',
    acao: acao, evento: 'kiwify:' + (ev || st), status: st || ev,
    transacao: String(o.order_id || o.order_ref || ''),
    email: String(cli.email || '').trim().toLowerCase(),
    telefone: tel,
    nome: String(cli.full_name || cli.name || [cli.first_name, cli.last_name].filter(Boolean).join(' ') || '').trim(),
    cidade: [cli.city, cli.state].filter(Boolean).join(' / '),
    valor: valor
  });
}

/** Confere a assinatura da Kiwify (HMAC-SHA1 do corpo com o token). */
function assinaturaKiwifyOk_(bruto, assinatura) {
  const token = String(lerConfig_().KIWIFY_TOKEN || '');
  if (!token || !assinatura) return false;
  const bytes = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, String(bruto || ''), token, Utilities.Charset.UTF_8);
  const hex = bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  return hex === String(assinatura).toLowerCase();
}

/* ============================================================================
 *  GURU (Digital Manager Guru) — vendas do programa ofertado (ILU)
 * ----------------------------------------------------------------------------
 *  No Guru: Configurações → Webhooks → Novo webhook de vendas, e cole a URL
 *      .../exec?src=guru&key=GURU_CHAVE
 *  O Guru manda nomes de campo diferentes dependendo do tipo de venda, então a
 *  leitura aqui é tolerante: acha o valor pelo pedaço do nome do campo, em
 *  qualquer nível do JSON. Depois do primeiro teste real, rode verPayloadGuru()
 *  no editor para ver exatamente o que chegou e, se precisar, ajustar.
 *
 *  Venda aprovada  → lead vira GANHO + registra a venda na aba Vendas
 *  Reembolso/chargeback → lead vai para REEMBOLSO e a venda é marcada
 *  Outros eventos (aguardando pagamento, boleto impresso...) → só ficam no log
 * ========================================================================== */
/** Texto de status do payload do Guru (usado no log e na classificação). */
function statusGuru_(plano) {
  if (!plano) return 'sem_status';
  const st = acharResposta_(plano, ['last_status', 'transaction.status', 'order.status', 'payment.status', 'status'], ['contact', 'subscriber', 'subscription']);
  const tipo = acharResposta_(plano, ['webhook_type', 'event', 'type'], ['payment.type', 'payment_type', 'doc_type', 'product']);
  return (normalizar_([st, tipo].filter(Boolean).join('/')).replace(/\s+/g, '_').slice(0, 60)) || 'sem_status';
}

function acaoGuru_(stTxt) {
  const s = normalizar_(stTxt);
  if (/refund|chargeback|charged_back|dispute|protest|reembols|estorn|cancel/.test(s)) return 'cancelada';
  if (/approved|aprovad|paid|pago|complete|concluid|^active|_active|ativa/.test(s)) return 'aprovada';
  return 'outro';
}

function produtoGuru_(plano) {
  if (!plano) return { id: '', nome: '' };
  return {
    id: acharResposta_(plano, ['product.internal_id', 'product.id', 'product_id', 'offer.id'], ['contact', 'producer']) || '',
    nome: acharResposta_(plano, ['product.name', 'product_name', 'offer.name', 'marketplace_name'], ['contact', 'producer']) || ''
  };
}

function transacaoGuru_(plano) {
  if (!plano) return '';
  return acharResposta_(plano, ['transaction.id', 'transaction_id', 'order.id', 'order_id', 'code', 'subscription.id', 'id'],
    ['product', 'contact', 'offer', 'payment', 'producer', 'affiliate', 'internal']) || '';
}

/** Lê o payload do Guru (em qualquer formato) e devolve os dados da venda. */
function lerVendaGuru_(body) {
  const plano = achatar_(body);
  const prod = produtoGuru_(plano);
  const stTxt = statusGuru_(plano);
  let tel = acharResposta_(plano, ['phone_number', 'telefone', 'whatsapp', 'celular', 'phone'], ['producer', 'local_code']);
  const ddd = acharResposta_(plano, ['phone_local_code', 'ddd']);
  const soTel = String(tel || '').replace(/\D/g, '');
  if (ddd && soTel && soTel.length <= 9) tel = String(ddd).replace(/\D/g, '') + soTel;
  return {
    plano: plano, plataforma: 'guru', status: stTxt, evento: 'guru:' + stTxt, acao: acaoGuru_(stTxt),
    transacao: transacaoGuru_(plano), prodId: prod.id, prodNome: prod.nome,
    email: String(acharResposta_(plano, ['contact.email', 'email', 'mail'], ['producer', 'affiliate', 'support'])).trim().toLowerCase(),
    telefone: tel,
    nome: acharResposta_(plano, ['contact.name', 'nome', 'name'], ['producer', 'product', 'affiliate', 'marketplace', 'offer', 'company']),
    valor: num_(acharResposta_(plano, ['payment.total', 'total_value', 'net_value', 'value', 'total', 'valor', 'price'], ['tax', 'discount', 'coupon'])),
    forma: acharResposta_(plano, ['payment.method', 'payment_method', 'forma_pagamento', 'method'], []),
    parcelas: acharResposta_(plano, ['installments.qty', 'installments', 'parcelas'], ['interest'])
  };
}

function webhookGuru_(body, p) {
  const cfg = lerConfig_();
  const c = lerVendaGuru_(body);
  const token = acharResposta_(c.plano, ['api_token', 'apitoken', 'account_token']);
  const chaveOk = (p && p.key && p.key === cfg.GURU_CHAVE) || (cfg.GURU_TOKEN && token && token === cfg.GURU_TOKEN);
  if (!chaveOk) {
    if (!p || !p.key) {
      return {
        ok: false,
        error: 'O aviso do Guru CHEGOU, mas a URL cadastrada lá está sem a chave (?src=guru&key=...). ' +
          'Copie a URL inteira em Ajustes → Vendas pelo Guru' +
          (token ? ', ou salve o token da conta em Ajustes (o aviso veio com api_token)' : '') +
          ', e depois rode reprocessarGuru() para aproveitar este mesmo aviso.'
      };
    }
    return { ok: false, error: 'chave inválida: o ?key= da URL cadastrada no Guru não é o mesmo do sistema. Copie a URL de novo em Ajustes → Vendas pelo Guru e rode reprocessarGuru().' };
  }

  // filtro opcional: só contam os produtos listados em GURU_PRODUTOS
  const filtro = String(cfg.GURU_PRODUTOS || '').trim();
  if (filtro) {
    const alvos = filtro.split(/[,;\n]/).map(normalizar_).filter(Boolean);
    const quem = normalizar_(c.prodId + ' ' + c.prodNome);
    if (!alvos.some(function (a) { return quem.indexOf(a) >= 0; })) {
      return { ok: true, ignorado: 'produto "' + (c.prodNome || c.prodId || '?') + '" não está na lista de produtos do Guru (Ajustes)' };
    }
  }

  if (!c.email && !telChave_(c.telefone)) {
    return { ok: true, ignorado: 'payload do Guru sem e-mail nem telefone — rode verPayloadGuru() no editor para ver o que chegou' };
  }
  if (c.acao === 'aprovada') return registrarVendaGuru_(c);
  if (c.acao === 'cancelada') return reembolsoGuru_(c);
  return { ok: true, evento: c.evento, ignorado: 'evento "' + c.status + '" do Guru (só venda aprovada move o lead)' };
}

/** Produto do sistema em que a venda do Guru é registrada. */
function produtoDaVendaGuru_(c) {
  const cfg = lerConfig_();
  const prods = tabela_('Produtos').objs;
  const idCfg = String(cfg.GURU_PRODUTO_SISTEMA || '').trim();
  if (idCfg) {
    const p = prods.filter(function (x) { return x.id === idCfg; })[0];
    if (p) return p;
  }
  const nome = String(c.prodNome || '').trim();
  if (nome) {
    const p = prods.filter(function (x) { return normalizar_(x.nome) === normalizar_(nome); })[0];
    if (p) return p;
  }
  const novo = {
    id: novoId_('P'), nome: nome || (progOferta_() + ' (venda pelo Guru)'),
    valor_total: num_(c.valor), valor_entrada: num_(c.valor), parcelas: String(c.parcelas || ''),
    descricao: 'Criado pelo webhook do Guru', ativo: 'SIM', origem: 'guru',
    criado_por: 'Guru', criado_em: agora_()
  };
  inserir_('Produtos', novo);
  return novo;
}

function registrarVendaGuru_(c) {
  const bot = { id: 'guru', nome: 'Guru' };
  return comTrava_(function () {
    const vendas = tabela_('Vendas').objs;
    if (c.transacao && vendas.some(function (v) { return String(v.transacao || '').trim() === c.transacao; })) {
      return { ok: true, ignorado: 'a venda ' + c.transacao + ' já estava registrada' };
    }
    const leads = tabela_('Leads').objs;
    const tk = telChave_(c.telefone);
    let lead = leads.filter(function (l) {
      return (c.email && String(l.email || '').trim().toLowerCase() === c.email) || (tk && telChave_(l.telefone) === tk);
    })[0];
    let criado = '';
    if (!lead) {
      if (String(lerConfig_().GURU_CRIA_LEAD || 'SIM') === 'NAO') {
        return { ok: true, ignorado: 'comprador ' + (c.email || c.telefone) + ' não está no sistema (criação automática desligada)' };
      }
      lead = {
        id: novoId_('L'), criado_em: agora_(), origem: 'guru', plataforma: 'guru', tipo_ingresso: 'padrao',
        nome: c.nome || c.email || c.telefone, email: c.email, telefone: limpar_(c.telefone, 'telefone'),
        status: 'novo', criado_por: bot.nome, atualizado_em: agora_(), fase_id: primeiraFase_(),
        origem_evento: 'Venda ' + progOferta_() + ' — Guru'
      };
      enriquecer_(lead);
      distribuirSeAuto_(lead);
      inserir_('Leads', lead);
      criado = lead.id;
      logHist_(lead.id, bot, 'criado', 'Comprou o ' + progOferta_() + ' pelo Guru sem estar no sistema');
    }

    const prod = produtoDaVendaGuru_(c);
    const total = valorNum_(c.valor);

    // a concierge pode ter registrado a venda na mão antes do webhook chegar:
    // mesmo lead, mesmo valor e sem transação → confirma aquela venda em vez de duplicar
    const jaNaMao = total > 0 && vendas.filter(function (v) {
      return v.lead_id === lead.id && v.status === 'ativa' && !String(v.transacao || '').trim() && valorNum_(v.valor_total) === total;
    })[0];
    if (jaNaMao) {
      atualizar_('Vendas', jaNaMao.id, {
        transacao: c.transacao, plataforma: 'guru',
        obs: (jaNaMao.obs ? jaNaMao.obs + ' · ' : '') + 'confirmada pelo Guru (' + c.status + ')'
      });
      const campos1 = { status: 'ganho', motivo: '', ultima_acao: agora_(), atualizado_em: agora_() };
      if (lead.status !== 'ganho') campos1.fechado_em = agora_();
      atualizar_('Leads', lead.id, campos1);
      logHist_(lead.id, bot, 'ganho', 'Guru confirmou a venda já registrada · ' + brl_(total) + (c.transacao ? ' (' + c.transacao + ')' : ''));
      return { ok: true, venda: jaNaMao.id, lead: lead.id, lead_nome: lead.nome, valor: brl_(total), juntado: true };
    }

    const v = {
      id: novoId_('V'), data: agora_(), lead_id: lead.id, lead_nome: lead.nome,
      usuario_id: lead.responsavel_id || 'guru', usuario_nome: lead.responsavel_nome || bot.nome,
      produto_id: prod.id, produto_nome: prod.nome,
      valor_entrada: num_(total), valor_total: num_(total), parcelas: String(c.parcelas || ''),
      forma_pagamento: String(c.forma || 'guru'), obs: 'Venda do Guru · ' + c.status,
      status: 'ativa', produto_fora_lista: '', transacao: c.transacao, plataforma: 'guru'
    };
    inserir_('Vendas', v);
    const campos = { status: 'ganho', motivo: '', ultima_acao: agora_(), atualizado_em: agora_() };
    if (lead.status !== 'ganho') campos.fechado_em = agora_();
    atualizar_('Leads', lead.id, campos);
    logHist_(lead.id, bot, 'ganho', prod.nome + ' · ' + brl_(total) + ' · Guru' + (c.transacao ? ' (' + c.transacao + ')' : ''));
    return { ok: true, venda: v.id, lead: lead.id, lead_nome: lead.nome, criado: criado, valor: brl_(total) };
  });
}

function reembolsoGuru_(c) {
  const bot = { id: 'guru', nome: 'Guru' };
  return comTrava_(function () {
    const t = tabela_('Vendas');
    const vendaOrig = c.transacao ? t.objs.filter(function (x) { return String(x.transacao || '').trim() === c.transacao; })[0] : null;
    const leads = tabela_('Leads').objs;
    const tk = telChave_(c.telefone);
    const lead = (vendaOrig && leads.filter(function (l) { return l.id === vendaOrig.lead_id; })[0]) ||
      leads.filter(function (l) {
        return (c.email && String(l.email || '').trim().toLowerCase() === c.email) || (tk && telChave_(l.telefone) === tk);
      })[0];
    if (!lead) return { ok: true, ignorado: c.status + ' de uma venda que não está no sistema' };

    const col = t.cab.indexOf('status');
    let n = 0;
    t.objs.forEach(function (x, i) {
      if (x.status !== 'ativa') return;
      const alvo = c.transacao ? String(x.transacao || '').trim() === c.transacao
        : (x.lead_id === lead.id && String(x.plataforma || '') === 'guru');
      if (alvo) { t.sh.getRange(i + 2, col + 1).setValue('reembolsada'); n++; }
    });
    if (n) limparMemo_();
    atualizar_('Leads', lead.id, {
      status: 'reembolso', motivo: 'Venda ' + progOferta_() + ' (Guru): ' + c.status,
      fechado_em: agora_(), atualizado_em: agora_()
    });
    logHist_(lead.id, bot, 'reembolso', 'Guru: ' + c.status + (n ? ' · ' + n + ' venda(s) marcada(s) como reembolsada(s)' : ''));
    return { ok: true, reembolso: lead.id, lead_nome: lead.nome, vendas: n };
  });
}

/**
 * Mostra no Log o último payload que o Guru mandou, campo por campo, e o que o
 * sistema entendeu de cada coisa. Rode depois do primeiro teste real de venda.
 */
function verPayloadGuru() {
  const cfg = lerConfig_();
  let urlPub = '';
  urlPub = urlApp_();
  Logger.log('Versão do código publicado: ' + VERSAO_CODIGO);
  Logger.log('URL que o Guru tem que chamar (POST):');
  Logger.log('   ' + urlPub + '?src=guru&key=' + (cfg.GURU_CHAVE || '(rode setup())'));
  Logger.log('');

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Webhook_Fila');
  if (!sh || sh.getLastRow() < 2) { Logger.log('A aba Webhook_Fila está VAZIA: nenhum aviso chegou aqui, de nenhuma ferramenta.'); return null; }
  const cab = ABAS.Webhook_Fila;
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, cab.length).getValues();
  const linhas = vals.filter(function (r) {
    const ev = String(r[cab.indexOf('evento')]);
    return ev.indexOf('guru') === 0 || ev.indexOf('desconhecido') === 0;
  });
  if (!linhas.length) {
    Logger.log('Nenhum aviso do Guru chegou até aqui.');
    Logger.log('Os últimos ' + Math.min(10, vals.length) + ' avisos que chegaram (de qualquer ferramenta):');
    vals.slice(-10).forEach(function (r) {
      Logger.log('   ' + r[0] + ' | ' + r[cab.indexOf('evento')] + ' | ' + (r[cab.indexOf('email')] || '') + ' | ' + r[cab.indexOf('status')] + ' | ' + r[cab.indexOf('resultado')]);
    });
    Logger.log('');
    Logger.log('O que conferir, nesta ordem:');
    Logger.log(' 1) Abra no navegador: ' + urlPub + '  → tem que mostrar "versao":"' + VERSAO_CODIGO + '".');
    Logger.log('    Se mostrar outra versão (ou pedir login), o código novo não foi publicado:');
    Logger.log('    Implantar → Gerenciar implantações → ✏️ → Versão: Nova versão → Implantar.');
    Logger.log(' 2) A URL cadastrada no Guru tem que terminar em /exec (a /dev pede login e nunca funciona)');
    Logger.log('    e tem que estar inteira, com ?src=guru&key=... no fim.');
    Logger.log(' 3) No Guru, confira se o webhook está ATIVO, se está ligado ao produto certo e se o');
    Logger.log('    evento de venda aprovada está marcado. Se houver botão de enviar um teste, use.');
    Logger.log(' 4) Compra de teste/sandbox às vezes não dispara webhook. Se der, faça um PIX de R$ 1.');
    return null;
  }
  const ultima = linhas[linhas.length - 1];
  Logger.log('Recebido em: ' + ultima[0] + ' · evento: ' + ultima[1] + ' · status do processamento: ' + ultima[cab.indexOf('status')] + ' · ' + ultima[cab.indexOf('resultado')]);
  const body = jsonSeguro_(ultima[cab.indexOf('payload')]);
  const plano = achatar_(body);
  Logger.log('--- campos que o Guru mandou ---');
  Object.keys(plano).forEach(function (k) { Logger.log('  ' + k + ' = ' + String(plano[k]).slice(0, 120)); });
  const c = lerVendaGuru_(body);
  Logger.log('--- o que o sistema entendeu ---');
  ['status', 'acao', 'transacao', 'prodId', 'prodNome', 'email', 'telefone', 'nome', 'valor', 'forma', 'parcelas'].forEach(function (k) {
    Logger.log('  ' + k + ': ' + c[k]);
  });
  return c;
}

/**
 * Reprocessa o último aviso do Guru que chegou (sem precisar de outra compra).
 * Use depois de arrumar a chave da URL, o produto ou o token.
 */
function reprocessarGuru() {
  const cfg = lerConfig_();
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Webhook_Fila');
  if (!sh || sh.getLastRow() < 2) { Logger.log('Nada na fila para reprocessar.'); return null; }
  const cab = ABAS.Webhook_Fila;
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, cab.length).getValues();
  let alvo = null, linha = 0;
  vals.forEach(function (r, i) {
    const ev = String(r[cab.indexOf('evento')]);
    if (ev.indexOf('guru') === 0 || ev.indexOf('desconhecido') === 0) { alvo = r; linha = i + 2; }
  });
  if (!alvo) { Logger.log('Nenhum aviso do Guru na fila. Rode verPayloadGuru() para ver o que chegou.'); return null; }
  const r = webhookGuru_(jsonSeguro_(alvo[cab.indexOf('payload')]), { key: cfg.GURU_CHAVE });
  Logger.log('Reprocessado o aviso de ' + alvo[0] + ':');
  Logger.log('   ' + JSON.stringify(r));
  sh.getRange(linha, cab.indexOf('status') + 1, 1, 3).setValues([[r.ok === false ? 'erro' : (r.ignorado ? 'ignorado' : 'ok'), String(r.error || r.ignorado || JSON.stringify(r)).slice(0, 500), agora_()]]);
  return r;
}

/** Teste do webhook do Guru pelo editor (usa um payload de exemplo). */
function testarGuru() {
  const cfg = lerConfig_();
  const r = webhookGuru_({
    api_token: cfg.GURU_TOKEN || 'teste',
    webhook_type: 'transaction',
    id: 'GURUTESTE' + Date.now(),
    status: 'approved',
    product: { internal_id: 'prod_ilu', name: 'Iluminismo — Combo', marketplace_name: 'Guru' },
    contact: { name: 'Lead Teste Guru', email: 'teste.guru@exemplo.com', phone_local_code: '11', phone_number: '988887777' },
    payment: { method: 'credit_card', total: 4997, installments: { qty: 12 } },
    dates: { confirmed_at: agora_() }
  }, { key: cfg.GURU_CHAVE });
  Logger.log(JSON.stringify(r));
  return r;
}

/** Regra única de compra (Hotmart ou Kiwify). */
function registrarCompra_(c) {
  const bot = { id: c.plataforma, nome: (c.plataforma === 'kiwify' ? 'Kiwify' : 'Hotmart') + (c.teste ? ' (teste)' : '') };
  const prodId = c.prodId, tipo = c.tipo, origemEvento = c.origemEvento, transacao = c.transacao, email = c.email, tel = c.telefone;
  const rotTipo = tipo === 'vip' ? 'VIP' : 'Padrão';

  return comTrava_(function () {
    const leads = tabela_('Leads').objs;
    const existente = leads.filter(function (l) {
      return (transacao && l.transacao === transacao) ||
        (email && l.email === email && l.produto_hotmart === prodId);
    })[0];

    if (c.acao === 'aprovada') {
      // MESMA PESSOA = mesmo e-mail OU mesmo telefone, não importa o produto nem a plataforma.
      const tchave = telChave_(tel);
      const mesmaPessoa = !existente && leads.filter(function (l) {
        return (email && String(l.email || '').trim().toLowerCase() === email) || (tchave && telChave_(l.telefone) === tchave);
      })[0];
      const alvo = existente || mesmaPessoa;
      if (alvo) {
        const campos = { status_hotmart: c.status, atualizado_em: agora_() };
        const hist = [];
        const jaTem = !!transacao && String(alvo.compras || '').split('\n').some(function (x) { return x.indexOf(transacao) >= 0; });
        if (!jaTem && transacao !== alvo.transacao) {
          const linha = [prodId, origemEvento, tipo, num_(c.valor), transacao, agora_(), c.plataforma].join('|');
          campos.compras = (String(alvo.compras || '') + (alvo.compras ? '\n' : '') + linha).slice(0, 4000);
          campos.valor_ingresso = num_(valorNum_(alvo.valor_ingresso) + valorNum_(c.valor));
        }
        if (!alvo.telefone && tel) campos.telefone = limpar_(tel, 'telefone');
        if (alvo.origem === 'interesse' && !alvo.transacao) {
          campos.origem = c.plataforma; campos.origem_evento = origemEvento; campos.plataforma = c.plataforma;
          campos.produto_hotmart = prodId; campos.transacao = transacao; campos.tipo_ingresso = tipo;
          hist.push('Comprou o ingresso ' + rotTipo + ' na ' + bot.nome + ' (' + transacao + ')');
        } else if (!jaTem && transacao && transacao !== alvo.transacao) {
          hist.push('Comprou também: ' + origemEvento + ' · ' + rotTipo + ' (' + transacao + ')');
        }
        if (tipo === 'vip' && alvo.tipo_ingresso !== 'vip') {
          campos.tipo_ingresso = 'vip';
          if (alvo.transacao) { campos.upgrade = 'feito'; campos.upgrade_em = agora_(); hist.push('Fez o upgrade VIP (' + transacao + ')'); }
          if (ehMesmoEvento_(alvo.origem_evento, origemEvento) || !alvo.origem_evento) campos.origem_evento = origemEvento;
        }
        if (!alvo.origem_evento && !campos.origem_evento) campos.origem_evento = origemEvento;
        if (!alvo.produto_hotmart && !campos.produto_hotmart) campos.produto_hotmart = prodId;
        if (!alvo.plataforma && !campos.plataforma) campos.plataforma = c.plataforma;
        atualizar_('Leads', alvo.id, campos);
        hist.forEach(function (h) { logHist_(alvo.id, bot, 'marco', h); });
        return { ok: true, duplicado: alvo.id, juntado: !!mesmaPessoa };
      }
      const lead = {
        id: novoId_('L'), criado_em: agora_(), origem: c.plataforma, plataforma: c.plataforma, tipo_ingresso: tipo,
        nome: (c.nome || email || tel) + (c.teste ? ' (TESTE)' : ''), email: email, telefone: limpar_(tel, 'telefone'),
        cidade: c.cidade || '', status: 'novo', transacao: transacao, produto_hotmart: prodId,
        valor_ingresso: num_(c.valor), status_hotmart: c.status,
        criado_por: bot.nome, atualizado_em: agora_(), fase_id: primeiraFase_(), origem_evento: origemEvento,
        compras: [prodId, origemEvento, tipo, num_(c.valor), transacao, agora_(), c.plataforma].join('|')
      };
      enriquecer_(lead);
      distribuirSeAuto_(lead);
      inserir_('Leads', lead);
      logHist_(lead.id, bot, 'criado', 'Compra aprovada ' + bot.nome + ' · ' + rotTipo + ' · ' + transacao);
      return { ok: true, criado: lead.id };
    }

    if (c.acao === 'cancelada') {
      if (!existente) return { ok: true, ignorado: c.evento + ' de uma compra que não está no sistema' };
      atualizar_('Leads', existente.id, {
        status: 'reembolso', motivo: 'Ingresso: ' + c.evento, status_hotmart: c.status,
        fechado_em: agora_(), atualizado_em: agora_()
      });
      logHist_(existente.id, bot, 'reembolso', bot.nome + ': ' + c.evento);
      return { ok: true, reembolso: existente.id };
    }
    if (existente) atualizar_('Leads', existente.id, { status_hotmart: c.status, atualizado_em: agora_() });
    return { ok: true, evento: c.evento, ignorado: existente ? '' : 'evento ' + c.evento + ' (só compras aprovadas criam lead)' };
  });
}

/* ============================================================================
 *  FILA DO WEBHOOK (resposta rápida para a Hotmart)
 * ========================================================================== */
function enfileirarWebhook_(body, p, bruto) {
  const d = body.data || {};
  const prod = d.product && d.product.id !== undefined && d.product.id !== null ? String(d.product.id) : '';
  const dados = p.src === 'dados';
  const kiwi = p.src === 'kiwify';
  const guru = p.src === 'guru';
  const ko = kiwi ? (body.order || body) : {};
  const pg = guru ? achatar_(body) : null;
  let chave = String(p.key || '');
  // Kiwify: se a URL perdeu o ?key=, a assinatura válida do token também serve
  if (kiwi && chave !== lerConfig_().KIWIFY_CHAVE && assinaturaKiwifyOk_(bruto, p.signature)) chave = lerConfig_().KIWIFY_CHAVE;
  const linha = [
    agora_(),
    dados ? 'dados:' + String(p.tipo || body.tipo || 'obrigado')
      : kiwi ? 'kiwify:' + String(ko.webhook_event_type || ko.order_status || '')
        : guru ? 'guru:' + statusGuru_(pg)
          : p.src === 'desconhecido' ? 'desconhecido:sem_src'
            : String(body.event || ''),
    dados ? 'dados' : kiwi ? String((ko.Product && ko.Product.product_id) || '') : guru ? produtoGuru_(pg).id : prod,
    kiwi ? String(ko.order_id || '') : guru ? transacaoGuru_(pg) : String((d.purchase && d.purchase.transaction) || ''),
    kiwi ? String((ko.Customer && ko.Customer.email) || '') : String((d.buyer && d.buyer.email) || acharValor_(guru ? pg : achatar_(body), ['email']) || ''),
    chave, 'pendente', '', '',
    String(bruto || JSON.stringify(body)).slice(0, 49000)
  ];
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Webhook_Fila');
  if (!sh) throw new Error('Aba Webhook_Fila não existe. Rode setup() de novo.');
  sh.appendRow(linha);
}

/** Processa os webhooks pendentes. Roda pelo gatilho de 1 minuto e a cada acesso ao site. */
function processarFilaWebhook() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Webhook_Fila');
  if (!sh || sh.getLastRow() < 2) return { processados: 0 };
  const n = sh.getLastRow() - 1;
  const colStatus = ABAS.Webhook_Fila.indexOf('status') + 1;
  const status = sh.getRange(2, colStatus, n, 1).getValues();
  const pend = [];
  status.forEach(function (r, i) { if (r[0] === 'pendente') pend.push(i + 2); });
  if (!pend.length) return { processados: 0 };

  // evita duas execuções processando a fila ao mesmo tempo
  const cache = CacheService.getScriptCache();
  if (cache.get('fila_rodando')) return { processados: 0, ocupado: true };
  cache.put('fila_rodando', '1', 120);
  let feitos = 0;
  try {
    const cab = ABAS.Webhook_Fila;
    pend.slice(0, 50).forEach(function (row) {
      const vals = sh.getRange(row, 1, 1, cab.length).getValues()[0];
      if (vals[cab.indexOf('status')] !== 'pendente') return;
      let st = 'ok', res = '';
      try {
        const body = JSON.parse(vals[cab.indexOf('payload')]);
        const chave = vals[cab.indexOf('chave')];
        const evento = String(vals[cab.indexOf('evento')] || '');
        if (evento.indexOf('dados:') === 0) {
          const r2 = webhookDados_(body, { key: chave, tipo: evento.slice(6) });
          if (r2.ok === false) { st = 'erro'; res = r2.error; }
          else if (r2.ignorado) { st = 'ignorado'; res = r2.ignorado; }
          else if (r2.tipo === 'interesse') {
            if (r2.criados) res = 'Lead criado pela lista de interesse (' + progOferta_() + ')';
            else if (r2.marcados) res = 'Interesse no ' + progOferta_() + ' registrado';
            else { st = 'ignorado'; res = r2.ja_tinham ? 'esse contato já estava na lista de interesse' : 'payload sem e-mail nem telefone'; }
          }
          else if (r2.criados) {
            res = { checkin: 'Lead criado pelo check-in do evento', pesquisa: 'Lead criado pela pesquisa de perfil' }[r2.tipo] || ('Lead criado (' + r2.tipo + ')');
          }
          else if (r2.atualizados) {
            res = { checkin: 'Presença marcada e dados do lead atualizados', presentes: 'Marcado que baixou os presentes', confirmacao: 'Presença confirmada', diagnostico: 'Diagnóstico gravado no lead', pesquisa: 'Pesquisa de perfil gravada no lead', obrigado: 'Dados da página de obrigado gravados' }[r2.tipo] || ('Lead atualizado (' + r2.tipo + ')');
          }
          else if (r2.encontrados) res = 'Esse contato já estava com tudo igual (' + r2.tipo + ')';
          else { st = 'ignorado'; res = 'não achei esse contato entre os leads'; }
        } else if (evento.indexOf('desconhecido') === 0) {
          st = 'ignorado';
          const chaves = Object.keys(achatar_(body)).slice(0, 12).join(', ');
          res = 'Chegou um aviso sem ?src=... na URL. Campos recebidos: ' + (chaves || '(vazio)');
        } else if (evento.indexOf('guru:') === 0) {
          const rg = webhookGuru_(body, { key: chave });
          if (rg.ok === false) { st = 'erro'; res = rg.error; }
          else if (rg.ignorado) { st = 'ignorado'; res = rg.ignorado; }
          else if (rg.criado) res = 'Venda do ' + progOferta_() + ' registrada · lead criado: ' + rg.criado;
          else if (rg.venda) res = 'Venda do ' + progOferta_() + ' registrada em ' + (rg.lead_nome || rg.lead) + ' · ' + rg.valor;
          else if (rg.reembolso) res = 'Reembolso/chargeback: ' + (rg.lead_nome || rg.reembolso);
          else res = JSON.stringify(rg);
        } else {
        const r = evento.indexOf('kiwify:') === 0 ? webhookKiwify_(body, { key: chave }) : webhookHotmart_(body, { key: chave });
        if (!r.ok) { st = 'erro'; res = r.error; }
        else if (r.ignorado) { st = 'ignorado'; res = r.ignorado; }
        else if (r.criado) res = 'Lead criado: ' + r.criado;
        else if (r.duplicado) res = 'Já existia: ' + r.duplicado;
        else if (r.reembolso) res = 'Movido para reembolso: ' + r.reembolso;
        else res = JSON.stringify(r);
        }
      } catch (err) {
        st = 'erro'; res = String(err && err.message ? err.message : err);
      }
      sh.getRange(row, colStatus, 1, 3).setValues([[st, String(res).slice(0, 500), agora_()]]);
      feitos++;
    });
  } finally {
    cache.remove('fila_rodando');
  }
  limparMemo_();
  return { processados: feitos };
}

function ultimosWebhooks_(qtd) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Webhook_Fila');
  if (!sh || sh.getLastRow() < 2) return [];
  const n = Math.min(qtd, sh.getLastRow() - 1);
  const ini = sh.getLastRow() - n + 1;
  return sh.getRange(ini, 1, n, 9).getDisplayValues().reverse().map(function (r) {
    return { recebido_em: r[0], evento: r[1], produto: r[2], transacao: r[3], email: r[4], status: r[6], resultado: r[7] };
  });
}

/* ============================================================================
 *  DIAGNÓSTICO — lê a planilha de respostas e preenche os leads
 * ----------------------------------------------------------------------------
 *  Roda sozinho a cada 15 minutos (gatilho sincronizarDiagnostico) e pelo botão
 *  em Ajustes. Só preenche quem JÁ É LEAD aqui (casando por e-mail ou telefone);
 *  quem respondeu e não comprou/se inscreveu é ignorado.
 * ========================================================================== */

/** Colunas que não entram nas respostas mostradas no card. */
const DIAG_IGNORAR = /^(id|substituicoes|atualizado_em|criado_em|pagina|nome|email|e-mail|whatsapp|telefone|celular)$|^utm_|^(res|fin|est|mkt|ven|pro|pes|lid)\d+$/i;

/** Nomes bonitos para as colunas conhecidas da planilha de diagnóstico. */
const DIAG_ROTULOS = {
  empresa: 'Empresa',
  tipo_negocio: 'Tipo de negócio',
  faturamento_atual: 'Faturamento atual',
  faturamento_desejado: 'Faturamento desejado',
  lucro_pct: 'Lucro (%)',
  indice_geral: 'Índice geral',
  resultados_pct: 'Resultados (%)',
  financas_pct: 'Finanças (%)',
  estrategia_pct: 'Estratégia (%)',
  marketing_pct: 'Marketing (%)',
  vendas_pct: 'Vendas (%)',
  processos_pct: 'Processos (%)',
  pessoas_pct: 'Pessoas (%)',
  lideranca_pct: 'Liderança (%)',
  custo_ineficiencia_mes: 'Custo da ineficiência (mês)',
  custo_oportunidade_mes: 'Custo de oportunidade (mês)'
};

function rotuloDiag_(chave) {
  const k = String(chave || '').trim();
  if (DIAG_ROTULOS[k]) return DIAG_ROTULOS[k];
  const t = k.replace(/_pct$/, ' (%)').replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Acha a aba das respostas: pelo nome, pelo gid, ou a primeira com coluna de e-mail. */
function abaDiagnostico_(ss, alvo) {
  const nome = String(alvo || '').trim();
  if (nome) {
    const porNome = ss.getSheetByName(nome);
    if (porNome) return porNome;
    if (/^\d+$/.test(nome)) {
      const porGid = ss.getSheets().filter(function (sh) { return String(sh.getSheetId()) === nome; })[0];
      if (porGid) return porGid;
    }
    return null; // aba configurada não existe: não adivinha outra, para não gravar lixo
  }
  // sem aba configurada: só aceita uma que realmente pareça de respostas
  return ss.getSheets().filter(function (sh) {
    if (sh.getLastRow() < 2 || sh.getLastColumn() < 5) return false;
    const cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(normalizar_);
    const temContato = cab.indexOf('email') >= 0 || cab.indexOf('e-mail') >= 0 || cab.indexOf('whatsapp') >= 0;
    const temResposta = cab.indexOf('indice geral') >= 0 || cab.indexOf('indice_geral') >= 0 ||
      cab.indexOf('criado_em') >= 0 || cab.indexOf('carimbo de data/hora') >= 0;
    return temContato && temResposta;
  })[0] || null;
}

/**
 * Lê a planilha de diagnóstico e grava as respostas nos leads encontrados.
 * Não duplica: se a resposta já está igual no lead, não reescreve nem gera histórico.
 */
function sincronizarDiagnostico() {
  const cfg = lerConfig_();
  const idPlan = String(cfg.DIAG_PLANILHA_ID || '').trim();
  if (!idPlan) return { erro: 'Cadastre o ID da planilha de diagnóstico em Ajustes.' };

  let ss;
  try { ss = SpreadsheetApp.openById(idPlan); }
  catch (e) { return { erro: 'Não consegui abrir a planilha de diagnóstico. Confira o ID e o compartilhamento. (' + e.message + ')' }; }

  const sh = abaDiagnostico_(ss, cfg.DIAG_ABA);
  if (!sh) return { erro: cfg.DIAG_ABA ? 'Não achei a aba "' + cfg.DIAG_ABA + '" nessa planilha. Confira o nome da aba em Ajustes.' : 'Não achei nenhuma aba de respostas nessa planilha.' };
  if (sh.getLastRow() < 2) return { linhas: 0, encontrados: 0, atualizados: 0, sem_lead: 0, aba: sh.getName() };

  const lc = sh.getLastColumn();
  const cab = sh.getRange(1, 1, 1, lc).getValues()[0].map(function (c) { return String(c || '').trim(); });
  const dados = sh.getRange(2, 1, sh.getLastRow() - 1, lc).getDisplayValues();
  const idx = function (nomes) {
    for (let i = 0; i < nomes.length; i++) {
      const c = cab.map(normalizar_).indexOf(normalizar_(nomes[i]));
      if (c >= 0) return c;
    }
    return -1;
  };
  const cEmail = idx(['email', 'e-mail', 'e_mail']);
  const cTel = idx(['whatsapp', 'telefone', 'celular', 'fone']);
  const cData = idx(['criado_em', 'data', 'timestamp', 'carimbo de data/hora']);
  const cNome = idx(['nome', 'name']);
  if (cEmail < 0 && cTel < 0) return { erro: 'A aba "' + sh.getName() + '" não tem coluna de e-mail nem de telefone.' };

  // monta uma resposta por pessoa (a mais recente, quando há mais de uma)
  const porChave = {};
  let linhasValidas = 0;
  dados.forEach(function (row) {
    const email = cEmail >= 0 ? String(row[cEmail] || '').trim().toLowerCase() : '';
    const tel = cTel >= 0 ? String(row[cTel] || '').trim() : '';
    if (!email && !telChave_(tel)) return;
    linhasValidas++;
    const quando = cData >= 0 ? String(row[cData] || '') : '';
    const respostas = {};
    cab.forEach(function (nomeCol, i) {
      if (!nomeCol || DIAG_IGNORAR.test(nomeCol)) return;
      const v = String(row[i] || '').trim();
      if (!v) return;
      if (Object.keys(respostas).length >= 60) return;
      respostas[rotuloDiag_(nomeCol)] = v.slice(0, 500);
    });
    const chave = email || ('tel:' + telChave_(tel));
    const atual = porChave[chave];
    if (!atual || String(quando) > String(atual.quando)) {
      porChave[chave] = { email: email, telefone: tel, nome: cNome >= 0 ? row[cNome] : '', quando: quando, respostas: respostas };
    }
  });

  const lista = Object.keys(porChave).map(function (k) { return porChave[k]; });
  if (!lista.length) return { linhas: linhasValidas, encontrados: 0, atualizados: 0, sem_lead: 0, aba: sh.getName() };

  return comTrava_(function () {
    const t = tabela_('Leads');
    if (!t.objs.length) return { linhas: linhasValidas, encontrados: 0, atualizados: 0, sem_lead: lista.length, aba: sh.getName() };
    const porEmail = {}, porTel = {};
    t.objs.forEach(function (l, i) {
      l.__i = i;
      if (l.email) porEmail[String(l.email).toLowerCase()] = l;
      const k = telChave_(l.telefone); if (k) porTel[k] = l;
    });
    const valores = t.sh.getRange(2, 1, t.objs.length, t.cab.length).getValues();
    const col = function (c) { return t.cab.indexOf(c); };
    const set = function (i, c, v) { const j = col(c); if (j >= 0) valores[i][j] = v; };
    const hist = [];
    let achados = 0, atualizados = 0, semLead = 0, iguais = 0;
    const exemplosSemLead = [];

    lista.forEach(function (r) {
      const lead = (r.email && porEmail[r.email]) || porTel[telChave_(r.telefone)];
      if (!lead) {
        semLead++;
        if (exemplosSemLead.length < 10) exemplosSemLead.push(String(r.nome || r.email || r.telefone || ''));
        return;
      }
      achados++;
      const json = JSON.stringify(r.respostas).slice(0, 45000);
      if (lead.diagnostico === 'feito' && lead.diagnostico_respostas === json) { iguais++; return; }
      const i = lead.__i;
      set(i, 'diagnostico', 'feito');
      set(i, 'diagnostico_em', r.quando || agora_());
      set(i, 'diagnostico_respostas', json);
      set(i, 'atualizado_em', agora_());
      hist.push({
        data: agora_(), lead_id: lead.id, usuario_id: 'diagnostico', usuario_nome: 'Diagnóstico',
        acao: 'marco', detalhe: 'Diagnóstico respondido' + (r.respostas['Índice geral'] ? ' · índice ' + r.respostas['Índice geral'] : '')
      });
      atualizados++;
    });

    if (atualizados) {
      t.sh.getRange(2, 1, valores.length, t.cab.length).setValues(valores);
      limparMemo_();
      inserirVarios_('Historico', hist);
    }
    salvarConfig_('DIAG_ULTIMA_SINC', agora_());
    return {
      aba: sh.getName(), linhas: linhasValidas, pessoas: lista.length, encontrados: achados,
      atualizados: atualizados, ja_estavam: iguais, sem_lead: semLead,
      exemplos_sem_lead: exemplosSemLead, em: agora_()
    };
  });
}

/** Atalho pelo editor: mostra o resultado no Registro de execução. */
function sincronizarDiagnosticoAgora() {
  const r = sincronizarDiagnostico();
  Logger.log(JSON.stringify(r));
  return r;
}

/* ============================================================================
 *  PESQUISA DE PERFIL (Yay Forms) — lê a planilha de respostas
 * ----------------------------------------------------------------------------
 *  A pesquisa feita nos grupos antes do evento. Cada resposta vira:
 *   • marco "Respondeu a pesquisa de perfil" (+ data)
 *   • campos do lead que alimentam o ranking (cargo, faturamento, nº de
 *     colaboradores, segmento, estado/cidade, se já conhecia a 4blue, sócios,
 *     faixa etária, leitura de sentimento) — só onde o lead está vazio, a menos
 *     que DADOS_SOBRESCREVER esteja em SIM
 *   • as respostas inteiras guardadas no card (pesquisa_respostas)
 *  Roda pelo botão em Ajustes e pelo gatilho de hora em hora.
 * ========================================================================== */
/** Colunas que não precisam virar "resposta" no card (controle, geo e contato). */
const PESQ_IGNORAR = /^(id|status da resposta|comecou as|enviado as|url de referencia|score|ai feedback|continente|pais|cep)$|^utm_|e-?mail|whatsapp|telefone|celular|qual seu nome/i;

/** Acha a aba das respostas da pesquisa (nome, gid, ou a primeira que tenha contato). */
function abaPesquisa_(ss, alvo) {
  const nome = String(alvo || '').trim();
  if (nome) {
    const porNome = ss.getSheetByName(nome);
    if (porNome) return porNome;
    if (/^\d+$/.test(nome)) {
      const porGid = ss.getSheets().filter(function (sh) { return String(sh.getSheetId()) === nome; })[0];
      if (porGid) return porGid;
    }
    return null;
  }
  return ss.getSheets().filter(function (sh) { return sh.getLastRow() >= 2 && cabecalhoPesquisa_(sh); })[0] || null;
}

/**
 * Acha a linha do cabeçalho nas 5 primeiras linhas.
 * A exportação do Yay Forms às vezes vem com uma linha solta antes do cabeçalho
 * de verdade — por isso não assumimos que é sempre a linha 1.
 */
function cabecalhoPesquisa_(sh) {
  const lc = sh.getLastColumn();
  const n = Math.min(5, sh.getLastRow());
  if (!lc || !n) return null;
  const linhas = sh.getRange(1, 1, n, lc).getDisplayValues();
  for (let i = 0; i < n; i++) {
    const limpo = linhas[i].map(normalizar_);
    const temContato = limpo.some(function (c) { return /e-?mail|whatsapp|telefone|celular/.test(c); });
    const cheias = limpo.filter(Boolean).length;
    if (temContato && cheias >= 3) {
      return { linha: i + 1, cab: linhas[i].map(function (c) { return String(c || '').trim(); }) };
    }
  }
  return null;
}

function sincronizarPesquisa() {
  const cfg = lerConfig_();
  const idPlan = String(cfg.PESQUISA_PLANILHA_ID || '').trim();
  if (!idPlan) return { erro: 'Cadastre o ID da planilha da pesquisa de perfil em Ajustes.' };

  let ss;
  try { ss = SpreadsheetApp.openById(idPlan); }
  catch (e) { return { erro: 'Não consegui abrir a planilha da pesquisa. Confira o ID e o compartilhamento. (' + e.message + ')' }; }

  const sh = abaPesquisa_(ss, cfg.PESQUISA_ABA);
  if (!sh) return { erro: cfg.PESQUISA_ABA ? 'Não achei a aba "' + cfg.PESQUISA_ABA + '" nessa planilha.' : 'Não achei nenhuma aba de respostas (com coluna de e-mail ou WhatsApp) nessa planilha.' };
  const info = cabecalhoPesquisa_(sh);
  if (!info) return { erro: 'A aba "' + sh.getName() + '" não tem uma linha de cabeçalho com e-mail nem WhatsApp.' };
  if (sh.getLastRow() <= info.linha) return { aba: sh.getName(), linhas: 0, pessoas: 0, encontrados: 0, atualizados: 0 };

  const lc = sh.getLastColumn();
  const cab = info.cab;
  const dados = sh.getRange(info.linha + 1, 1, sh.getLastRow() - info.linha, lc).getDisplayValues();

  const porChave = {};
  let validas = 0;
  dados.forEach(function (row) {
    const plano = {};
    cab.forEach(function (c, i) { if (c) plano[c] = String(row[i] || '').trim(); });
    const email = String(acharResposta_(plano, ['e-mail', 'email', 'mail'], ['referencia'])).trim().toLowerCase();
    const tel = acharResposta_(plano, ['whatsapp', 'telefone', 'celular', 'fone']);
    if (!email && !telChave_(tel)) return;
    validas++;
    const nome = acharResposta_(plano, ['seu nome', 'nome'], ['empresa', 'sobrenome']);
    const quando = acharResposta_(plano, ['enviado as', 'enviado em', 'comecou as', 'data', 'timestamp', 'carimbo']);
    const respostas = {};
    cab.forEach(function (c, i) {
      const v = String(row[i] || '').trim();
      if (!c || !v) return;
      if (PESQ_IGNORAR.test(normalizar_(c))) return;
      if (Object.keys(respostas).length >= 40) return;
      respostas[c] = v.slice(0, 500);
    });
    const chave = email || ('tel:' + telChave_(tel));
    const atual = porChave[chave];
    if (!atual || String(quando) > String(atual.data)) {
      porChave[chave] = {
        email: email, telefone: tel, nome: nome, data: quando || '',
        perfil: perfilDoPlano_(plano), respostas: respostas
      };
    }
  });

  const lista = Object.keys(porChave).map(function (k) { return porChave[k]; });
  if (!lista.length) return { aba: sh.getName(), linhas: validas, pessoas: 0, encontrados: 0, atualizados: 0 };

  const r = importarPerfil_({ id: 'pesquisa', nome: 'Pesquisa de perfil' }, {
    linhas: lista,
    marcar_pesquisa: true,
    criar: cfg.PESQUISA_CRIA_LEAD === 'SIM',
    sobrescrever: cfg.DADOS_SOBRESCREVER === 'SIM',
    origem: 'Pesquisa de perfil — ' + (cfg.TAG_EVENTO || 'Treinamento')
  });
  salvarConfig_('PESQUISA_ULTIMA_SINC', agora_());
  r.tipo = 'pesquisa';
  r.aba = sh.getName();
  r.linha_cabecalho = info.linha;
  r.linhas = validas;
  r.pessoas = lista.length;
  r.sem_lead = r.nao_encontrados;
  r.em = agora_();
  return r;
}

/** Atalho pelo editor: sincroniza a pesquisa e mostra o resultado no Log. */
function sincronizarPesquisaAgora() {
  const r = sincronizarPesquisa();
  Logger.log(JSON.stringify(r));
  return r;
}

/* ============================================================================
 *  CRUZAMENTO COM BASE DE CLIENTES (MDL / ILU / eventos anteriores)
 * ========================================================================== */
function sincronizarClientes() {
  const cfg = lerConfig_();
  const base = SpreadsheetApp.openById(cfg.BASE_CLIENTES_ID);
  const ignorar = String(cfg.BASE_ABAS_IGNORAR || '').split(',').map(function (s) { return s.trim().toLowerCase(); });
  const abaMdl = String(cfg.BASE_ABA_MDL).toLowerCase();
  const abaIlu = String(cfg.BASE_ABA_ILU).toLowerCase();
  const reg = {};            // email -> registro
  const porTel = {};         // tel -> email (ou chave tel)

  function pegar(chaveEmail, tel, nome) {
    const e = String(chaveEmail || '').trim().toLowerCase();
    const t = telChave_(tel);
    let k = e || (t ? 'tel:' + t : '');
    if (!k) return null;
    if (!e && porTel[t]) k = porTel[t];
    if (!reg[k]) reg[k] = { email: e, tel_chave: t, nome: nome || '', mdl: '', ilu: '', eventos: [], cargo: '', faturamento: '', cidade: '' };
    const r = reg[k];
    if (t && !r.tel_chave) r.tel_chave = t;
    if (t && !porTel[t]) porTel[t] = k;
    if (nome && !r.nome) r.nome = nome;
    return r;
  }

  base.getSheets().forEach(function (sh) {
    const nomeAba = sh.getName();
    const low = nomeAba.toLowerCase();
    if (ignorar.indexOf(low) >= 0) return;
    const cols = colunas_(sh);
    if (!cols) return;

    if (low === abaMdl) {
      const em = cols.get(['email do cliente', 'email']), st = cols.get(['status referencia', 'status']);
      const pl = cols.get(['plano']), seg = cols.get(['2ª cadeira', '2a cadeira', 'segunda cadeira']), nm = cols.get(['nome do cliente', 'nome']);
      for (let i = 0; i < cols.n; i++) {
        const txt = [st && st[i], pl && pl[i]].filter(Boolean).join(' · ') || 'Cliente MDL';
        [em && em[i], seg && seg[i]].forEach(function (mail, j) {
          if (!mail || String(mail).indexOf('@') < 0) return;
          const r = pegar(mail, '', j === 0 && nm ? nm[i] : '');
          if (r && prioridadeMdl_(txt) >= prioridadeMdl_(r.mdl)) r.mdl = txt + (j === 1 ? ' (2ª cadeira)' : '');
        });
      }
      return;
    }
    if (low === abaIlu) {
      const em = cols.get(['email do cliente', 'email']), st = cols.get(['status referencia', 'status']), nm = cols.get(['nome do cliente', 'nome']);
      for (let i = 0; i < cols.n; i++) {
        if (!em || !em[i]) continue;
        const r = pegar(em[i], '', nm && nm[i]);
        if (r) r.ilu = String((st && st[i]) || 'Cliente ILU');
      }
      return;
    }

    // Abas de eventos (cidades normais e VIP)
    const em = cols.get(['email']);
    if (!em) return;
    const vip = / vip$/i.test(nomeAba);
    const evento = nomeAba.replace(/ vip$/i, '').trim();
    const nm = cols.get(['nome camprador', 'nome comprador', 'nome']);
    const tl = cols.get(['telefone']);
    const cid = cols.get(['cidade']);
    const cg = cols.get(['cargo']);
    const fat = cols.get(['faturamento']);
    const foi = cols.get(['foi no evento']);
    const comp = cols.get(['comprou']);
    const em2 = cols.get(['email segundo participante', 'email acompanhante']);
    const nm2 = cols.get(['nome segundo participante', 'nome acompanhante']);
    const foi2 = cols.get(['foi no evento segundo']);
    for (let i = 0; i < cols.n; i++) {
      const mail = em[i];
      const tel = tl && tl[i];
      if (mail || tel) {
        const r = pegar(mail, tel, nm && nm[i]);
        if (r) {
          r.eventos.push({ e: evento, t: vip ? 'VIP' : 'Normal', f: String((foi && foi[i]) || ''), c: String((comp && comp[i]) || '') });
          if (cg && cg[i] && !r.cargo) r.cargo = String(cg[i]);
          if (fat && fat[i] && !r.faturamento) r.faturamento = String(fat[i]);
          if (cid && cid[i] && !r.cidade) r.cidade = String(cid[i]);
        }
      }
      if (em2 && em2[i] && String(em2[i]).indexOf('@') > 0) {
        const r2 = pegar(em2[i], '', nm2 && nm2[i]);
        if (r2) r2.eventos.push({ e: evento, t: (vip ? 'VIP' : 'Normal') + ' (acompanhante)', f: String((foi2 && foi2[i]) || ''), c: '' });
      }
    }
  });

  // grava Base_Clientes
  const linhas = Object.keys(reg).map(function (k) {
    const r = reg[k];
    return [r.email, r.tel_chave, r.nome, r.mdl, r.ilu, r.eventos.length ? JSON.stringify(r.eventos).slice(0, 45000) : '', r.cargo, r.faturamento, r.cidade];
  });
  const sh = aba_('Base_Clientes');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, ABAS.Base_Clientes.length).clearContent();
  if (linhas.length) sh.getRange(2, 1, linhas.length, ABAS.Base_Clientes.length).setNumberFormat('@').setValues(linhas);
  cacheBase_ = null;
  limparMemo_();

  // atualiza todos os leads
  const n = comTrava_(function () {
    const t = tabela_('Leads');
    if (!t.objs.length) return 0;
    const idx = indiceBase_();
    const campos = ['cliente_mdl', 'cliente_ilu', 'eventos', 'cargo', 'faturamento'];
    const colIdx = campos.map(function (c) { return t.cab.indexOf(c); });
    const valores = t.sh.getRange(2, 1, t.objs.length, t.cab.length).getValues();
    let alterados = 0;
    t.objs.forEach(function (l, i) {
      const antes = campos.map(function (c) { return l[c]; }).join('|');
      enriquecer_(l, idx);
      if (campos.map(function (c) { return l[c]; }).join('|') !== antes) {
        alterados++;
        colIdx.forEach(function (ci, j) { valores[i][ci] = l[campos[j]] || ''; });
      }
    });
    if (alterados) t.sh.getRange(2, 1, valores.length, t.cab.length).setValues(valores);
    limparMemo_();
    return alterados;
  });
  salvarConfig_('ULTIMA_SINCRONIZACAO', agora_());
  return { clientes: linhas.length, leads_atualizados: n, em: agora_() };
}

function prioridadeMdl_(txt) {
  txt = String(txt || '').toLowerCase();
  if (!txt) return 0;
  if (txt.indexOf('ativo') >= 0) return 3;
  if (txt.indexOf('upsell') >= 0 || txt.indexOf('downsell') >= 0) return 2;
  return 1;
}

let cacheBase_ = null;
function indiceBase_() {
  if (cacheBase_) return cacheBase_;
  const t = tabela_('Base_Clientes');
  const porEmail = {}, porTel = {};
  t.objs.forEach(function (r) {
    if (r.email) porEmail[r.email] = r;
    if (r.tel_chave && !porTel[r.tel_chave]) porTel[r.tel_chave] = r;
  });
  cacheBase_ = { email: porEmail, tel: porTel };
  return cacheBase_;
}

function enriquecer_(lead, idx) {
  idx = idx || indiceBase_();
  const r = (lead.email && idx.email[String(lead.email).toLowerCase()]) || idx.tel[telChave_(lead.telefone)];
  if (!r) return lead;
  lead.cliente_mdl = r.mdl || '';
  lead.cliente_ilu = r.ilu || '';
  lead.eventos = r.eventos || '';
  if (!lead.cargo && r.cargo) lead.cargo = r.cargo;
  if (!lead.faturamento && r.faturamento) lead.faturamento = r.faturamento;
  if (!lead.cidade && r.cidade) lead.cidade = r.cidade;
  return lead;
}

/** Lê só as colunas necessárias de uma aba (as abas de eventos têm colunas enormes de JSON). */
function colunas_(sh) {
  const lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr < 2 || lc < 1) return null;
  const cab = sh.getRange(1, 1, 1, lc).getValues()[0].map(function (h) { return normalizar_(h); });
  const cache = {};
  return {
    n: lr - 1,
    get: function (nomes) {
      for (let k = 0; k < nomes.length; k++) {
        const c = cab.indexOf(normalizar_(nomes[k]));
        if (c >= 0) {
          if (!cache[c]) cache[c] = sh.getRange(2, c + 1, lr - 1, 1).getDisplayValues().map(function (r) { return String(r[0]).trim(); });
          return cache[c];
        }
      }
      return null;
    }
  };
}

/* ============================================================================
 *  UTILITÁRIOS DE PLANILHA
 * ========================================================================== */
function aba_(nome) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!sh) throw new Error('Aba "' + nome + '" não existe. Rode setup().');
  return sh;
}

let memo_ = {};
function limparMemo_() { memo_ = {}; }

function tabela_(nome) {
  if (memo_[nome]) return memo_[nome];
  const sh = aba_(nome);
  const lr = sh.getLastRow(), lc = sh.getLastColumn();
  const cab = lc ? sh.getRange(1, 1, 1, lc).getValues()[0].map(String) : [];
  const vals = lr > 1 ? sh.getRange(2, 1, lr - 1, lc).getDisplayValues() : [];
  const objs = vals.map(function (row) {
    const o = {};
    cab.forEach(function (c, i) { if (c) o[c] = row[i]; });
    return o;
  });
  memo_[nome] = { sh: sh, cab: cab, objs: objs };
  return memo_[nome];
}

function inserir_(nome, obj) { inserirVarios_(nome, [obj]); }

function inserirVarios_(nome, objs) {
  if (!objs.length) return;
  limparMemo_();
  const sh = aba_(nome);
  const cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const linhas = objs.map(function (o) {
    return cab.map(function (c) { return o[c] === undefined || o[c] === null ? '' : String(o[c]); });
  });
  const ini = sh.getLastRow() + 1;
  const rg = sh.getRange(ini, 1, linhas.length, cab.length);
  rg.setNumberFormat('@');
  rg.setValues(linhas);
}

function atualizar_(nome, id, campos) {
  const t = tabela_(nome);
  const i = t.objs.findIndex(function (o) { return o.id === id; });
  if (i < 0) throw new Error('Registro não encontrado: ' + id);
  const linha = t.sh.getRange(i + 2, 1, 1, t.cab.length);
  const vals = linha.getValues()[0];
  Object.keys(campos).forEach(function (k) {
    const c = t.cab.indexOf(k);
    if (c >= 0) vals[c] = campos[k] === undefined || campos[k] === null ? '' : String(campos[k]);
  });
  linha.setNumberFormat('@');
  linha.setValues([vals]);
  limparMemo_();
}

function excluir_(nome, id) {
  const t = tabela_(nome);
  const i = t.objs.findIndex(function (o) { return o.id === id; });
  if (i < 0) throw new Error('Registro não encontrado.');
  t.sh.deleteRow(i + 2);
  limparMemo_();
  return true;
}

function logHist_(leadId, user, acao, detalhe) {
  try {
    inserir_('Historico', {
      data: agora_(), lead_id: leadId || '', usuario_id: user ? user.id : '', usuario_nome: user ? user.nome : 'Sistema',
      acao: acao, detalhe: String(detalhe || '').slice(0, 1000)
    });
  } catch (e) { /* não interrompe a operação principal */ }
}

function lerConfig_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config');
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues().forEach(function (r) { if (r[0]) out[r[0]] = r[1]; });
  return out;
}

function salvarConfig_(k, v) {
  const sh = aba_('Config');
  const lr = sh.getLastRow();
  const chaves = lr > 1 ? sh.getRange(2, 1, lr - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
  const i = chaves.indexOf(k);
  if (i >= 0) sh.getRange(i + 2, 2).setNumberFormat('@').setValue(v);
  else { sh.getRange(lr + 1, 1, 1, 2).setNumberFormat('@').setValues([[k, v]]); }
}

function comTrava_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Sistema ocupado, tente novamente em instantes.');
  try { return fn(); } finally { lock.releaseLock(); }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function agora_() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', "yyyy-MM-dd'T'HH:mm:ss");
}

function novoId_(prefixo) {
  return prefixo + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyMMddHHmmss') + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

/** Número de verdade (num_ devolve texto para gravar na planilha). */
function valorNum_(v) { const n = Number(num_(v)); return isNaN(n) ? 0 : n; }

function num_(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'number') return String(Math.round(v * 100) / 100);
  let s = String(v).replace(/[R$\s]/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? '' : String(Math.round(n * 100) / 100);
}

function brl_(v) {
  const n = Number(v || 0);
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function limpar_(v, campo) {
  let s = String(v === undefined || v === null ? '' : v).trim();
  if (campo === 'email') return s.toLowerCase();
  if (campo === 'telefone') return s.replace(/\.0$/, '').replace(/[^\d+]/g, '');
  return s.slice(0, 1000);
}

/** Chave de telefone: DDD + últimos 8 dígitos (ignora 55 e o 9º dígito). */
function telChave_(tel) {
  let d = String(tel || '').replace(/\.0$/, '').replace(/\D/g, '');
  if (d.length >= 12 && d.indexOf('55') === 0) d = d.slice(2);
  if (d.length < 10) return '';
  return d.slice(0, 2) + d.slice(-8);
}

function normalizar_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function colLetra_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Teste rápido do webhook pelo editor (cria um lead fictício). */
function testarWebhook() {
  const cfg = lerConfig_();
  const r = webhookHotmart_({
    event: 'PURCHASE_APPROVED', version: '2.0.0',
    data: {
      product: { id: (produtosHotmart_().filter(function (x) { return x.plataforma === 'hotmart'; })[0] || { id: '0' }).id, name: 'Ingresso' },
      buyer: { name: 'Lead Teste Webhook', email: 'teste.webhook@exemplo.com', checkout_phone: '11999990000' },
      purchase: { transaction: 'HPTESTE' + Date.now(), status: 'APPROVED', price: { value: 997 } }
    }
  }, { key: cfg.HOTMART_CHAVE });
  Logger.log(JSON.stringify(r));
}

/** Teste do webhook da Kiwify pelo editor (cria um lead fictício no 1º produto Kiwify da lista). */
function testarWebhookKiwify() {
  const cfg = lerConfig_();
  const p = produtosHotmart_().filter(function (x) { return x.plataforma === 'kiwify'; })[0];
  if (!p) { Logger.log('Cadastre um produto Kiwify em Ajustes (ou ligue o modo teste).'); }
  const r = webhookKiwify_({
    order_id: 'KWTESTE' + Date.now(), order_status: 'paid', webhook_event_type: 'order_approved',
    Product: { product_id: p ? p.id : 'produto-teste', product_name: p ? p.nome : 'Teste' },
    Customer: { full_name: 'Lead Teste Kiwify', email: 'teste.kiwify@exemplo.com', mobile: '+5511988887777', city: 'São Paulo', state: 'SP' },
    Commissions: { charge_amount: 19700 }
  }, { key: cfg.KIWIFY_CHAVE });
  Logger.log(JSON.stringify(r));
}
