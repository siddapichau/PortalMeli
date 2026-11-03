/*
 * Política de permissões (ver/editar) compartilhada pelas páginas do PortalMeli.
 *
 * - Fonte da verdade: ação `obterConfigPagina` da API central (Apps Script), que
 *   devolve `podeVer`/`podeEditar` para o usuário logado.
 * - Este arquivo aplica a política no frontend: bloqueia ação de escrita quando
 *   `podeEditar` é falso e bloqueia a tela inteira quando `podeVer` é falso.
 * - O bloqueio aqui é de UX e de contrato de rede. A validação definitiva
 *   continua no backend; ver docs/PERMISSOES_VER_EDITAR.md.
 *
 * Ordem de confiança (nunca liberar edição por engano):
 * 1. Portal informa `modo=ver` na URL -> somente leitura, sem consultar a API.
 * 2. API responde `podeEditar: false` -> somente leitura.
 * 3. API responde `podeVer: false` -> acesso bloqueado.
 * 4. API indisponível -> somente leitura (fail closed) e aviso na tela.
 * 5. Sem token (arquivo aberto sem sessão) -> somente leitura.
 */
(function (global) {
  'use strict';

  const CHAVE_TOKEN = 'token';
  const TIMEOUT_MS = 8000;
  const PARAMETRO_MODO = 'modo';
  const PARAMETRO_ARQUIVO = 'arquivo';
  const CLASSE_LEITURA = 'pm-somente-leitura';
  const CLASSE_BLOQUEADA = 'pm-acao-bloqueada';
  const ID_AVISO = 'pm-aviso-permissao';
  const CLASSE_AVISO = 'pm-aviso-permissao';

  // Ações da API que apenas leem dados: liberadas para quem pode ver.
  const ACOES_LEITURA = new Set([
    'getDashboardInit', 'obterDadosLogisticos', 'carregarBackground',
    'getDashboardData', 'getDashboard', 'getAvarias', 'getDadosAnalise',
    'getDadosIniciais', 'getItensPendentes', 'getHistorico', 'getUser',
    'lerDados', 'listar', 'listarAbas', 'listarHUsBipados', 'listarDatasInv',
    'estatisticasInv', 'compararInv', 'historico', 'buscarDadosDS',
    'buscarDadosAtuaisFormulario', 'buscarMotivosShipments', 'buscarAtivosPendentes',
    'obterDadosOperador', 'obterDatasIniciais', 'verificarProgresso',
    'backendVerificarStatusQuerys', 'getDashboardDevolucao'
  ]);

  // Ações que gravam, importam, excluem, disparam processos ou registram bipagem.
  const ACOES_ESCRITA = new Set([
    'salvarEdicaoAnalise', 'salvarUsuario', 'salvarDadosUsar', 'salvarHistorico',
    'salvarOperadores', 'salvarLoteAnalise', 'salvarEdicaoModal', 'salvarDatas',
    'salvarItem', 'salvarCabecalhoDevolucao', 'salvarHUsBipados',
    'salvarHistoricoFinalizador', 'salvarHistoricoIDs20', 'salvarShipmentRapido',
    'salvarPdfNoDrive', 'importarRotas', 'importarPacotes', 'importarBasePcts',
    'importarAreas', 'importarCSV', 'rodarQuery', 'rodarQuerys', 'runQueries',
    'trazerEVerificar', 'uploadCSV', 'uploadCSVs', 'dispararEmails',
    'backendDispararEmails', 'backendIniciarQuerys', 'excluir', 'excluirItem',
    'deletarHUBipado', 'limparInventario', 'limparFormulario', 'naoRegistrado',
    'bipar', 'updateStatusErro', 'valorEmDolar', 'processarReporte',
    'atualizarResp', 'buscarCFTV', 'importarDados', 'salvarFinalizados',
    'adicionarOperadorBanco'
  ]);

  // Funções chamadas por onclick/onchange que GRAVAM dados ou disparam processos.
  // Inventário completo dos handlers inline do repositório (ver tests/permissoes.test.mjs,
  // que falha se um handler novo ficar sem classificação).
  const FUNCOES_ESCRITA = new Set([
    'acaoValorDolar', 'atualizarMotivos', 'confirmarLimparInventario',
    'deletarHU', 'dispararAcao', 'dispararEmails', 'enviarArquivo',
    'enviarArquivos', 'enviarPacotes', 'excluirEquipamento', 'excluirRegistro',
    'executarAcao', 'executarAuditoria', 'executarComparacao',
    'executarImportarAreas', 'executarImportarBasePcts', 'executarQuery',
    'executarReporte', 'executarRodarQuery', 'executarSalvarHistorico',
    'executarTrazerEVerificar', 'fazerInventario', 'gravarItem',
    'importarRotas', 'iniciarImportacaoCSV', 'limparFormulario',
    'processarCustom', 'processarMultiplosCSVs', 'rodarQueries', 'rodarQuerys',
    'salvarBipagem', 'salvarDados20', 'salvarDadosHistorico', 'salvarDataAntiga',
    'salvarDataNova', 'salvarDevolucao', 'salvarEquipamento', 'salvarLinha',
    'salvarModal', 'salvarNoDrive', 'salvarNomeManual', 'tornarEditavel',
    'abrirEdicao', 'abrirModalEdicao', 'abrirModalAdicionarOP',
    'abrirModalOperadores', 'abrirModalAutoCompletar', 'uploadCSV'
  ]);

  // Funções chamadas por onclick/onchange que apenas leem, filtram, navegam,
  // alternam a interface ou exportam uma imagem da tela atual.
  const FUNCOES_LEITURA = new Set([
    'abrirDashboard', 'abrirDetalhes', 'abrirFiltroFlutuante', 'abrirInventario',
    'abrirManual', 'abrirModalComparar', 'abrirModalEquipamento', 'abrirTela',
    'abrirTelaBipagem', 'abrirTelaDestinos', 'abrirTelaDevolucao',
    'abrirTelaDigitalizar', 'abrirTipo', 'alternarTela', 'aplicarFiltros',
    'aplicarFiltrosDash', 'aplicarFiltrosDashboard', 'aplicarFiltrosEOrdenacao',
    'applyFilters', 'atualizarFiltro', 'avancarTemplate', 'baixarImagem',
    'baixarImagemDashboardDev', 'baixarRelatorio', 'buscarPendentes',
    'carregarAbas', 'carregarAderencia', 'carregarAnalise', 'carregarAuditoria',
    'carregarDadosGerais', 'carregarDashboard', 'carregarDashboardDevolucao',
    'carregarEmail', 'carregarEquipamentos', 'carregarImagem',
    'compartilharWhatsApp', 'copiarResumoWhatsApp', 'copiarResumoWhatsAppDev',
    'copiarWhatsApp', 'copiarWhatsAppInv', 'escolherPeriodo',
    'escolherTipoImpressao', 'executarSmartSearch', 'exportarDashboard',
    'exportarImagemInv', 'fecharFiltro', 'fecharHistorico', 'fecharModal',
    'fecharModalComparar', 'fecharModalEquipamento', 'fecharPreview',
    'filtrarTabela', 'gerarMensagemZap', 'gerarPdf', 'gerarWPP', 'limparCache',
    'limparFiltroColuna', 'limparFiltros', 'mostrarArquivo',
    'mostrarArquivosSelecionados', 'ordenar', 'ordenarPor', 'prepararDashboard',
    'recarregarDados', 'renderAduana', 'renderAnalise', 'renderErros',
    'renderizarEquipamentos', 'resetarDigitalizador', 'resetarFiltros',
    'selecionarOperador', 'selecionarTodasOrigens', 'selecionarTodos',
    'toggleColunaVisivel', 'toggleErro', 'toggleMenuColunas', 'verBase',
    'verificarSituacao', 'voltarEmailStep1', 'welcome', 'wspRelatorio'
  ]);

  const estado = {
    carregado: false,
    emAndamento: null,
    podeVer: false,
    podeEditar: false,
    somenteLeitura: false,
    bloqueado: false,
    motivo: '',
    planilha: '',
    api: '',
    arquivo: '',
    contexto: null
  };

  function lerParametros() {
    const busca = String((global.location && global.location.search) || '');
    const retorno = {};
    busca.replace(/^\?/, '').split('&').forEach(par => {
      if (!par) return;
      const [chave, valor = ''] = par.split('=');
      try {
        retorno[decodeURIComponent(chave)] = decodeURIComponent(valor.replace(/\+/g, ' '));
      } catch (erro) {
        console.warn('Parâmetro de URL inválido ignorado:', erro);
      }
    });
    return retorno;
  }

  function lerToken() {
    try {
      const token = global.localStorage && global.localStorage.getItem(CHAVE_TOKEN);
      return typeof token === 'string' ? token : '';
    } catch (erro) {
      console.warn('Não foi possível ler a sessão do navegador:', erro);
      return '';
    }
  }

  function nomeDoArquivo() {
    const informado = lerParametros()[PARAMETRO_ARQUIVO];
    if (informado) return String(informado).split('/').pop();
    const caminho = String((global.location && global.location.pathname) || '');
    const arquivo = caminho.split('/').pop();
    return arquivo || '';
  }

  /** API central usada pelo login/portal (salva em localStorage pelo login). */
  function urlDaApi() {
    try {
      const salvo = global.localStorage && global.localStorage.getItem('apiUrl');
      if (typeof salvo === 'string' && /^https:\/\//.test(salvo)) return salvo;
    } catch (erro) {
      console.warn('Não foi possível ler a URL da API salva:', erro);
    }
    return '';
  }

  function erroSemPermissao(acao) {
    const rotulo = acao ? ` (ação: ${acao})` : '';
    const erro = new Error(`Seu acesso é somente leitura${rotulo}. Peça ao administrador a permissão de edição.`);
    erro.name = 'PermissaoNegadaError';
    erro.code = 'SOMENTE_LEITURA';
    return erro;
  }

  /**
   * Classifica uma ação da API como leitura ou escrita.
   * Ações não catalogadas são tratadas como ESCRITA (fail closed).
   * @param {string} acao
   * @returns {'leitura'|'escrita'}
   */
  function classificarAcao(acao) {
    const nome = String(acao || '').trim();
    if (!nome) return 'escrita';
    if (ACOES_ESCRITA.has(nome)) return 'escrita';
    if (ACOES_LEITURA.has(nome)) return 'leitura';
    if (/^(get|listar|ler|obter|buscar|verificar|consultar|carregar|comparar|estatisticas)/i.test(nome)) return 'leitura';
    return 'escrita';
  }

  /** Nomes de função/ação citados dentro de um handler inline. */
  function citadosNoHandler(texto) {
    const encontrados = new Set();
    const padrao = /[A-Za-z_$][\w$]*/g;
    let achado = padrao.exec(texto);
    while (achado) {
      encontrados.add(achado[0]);
      achado = padrao.exec(texto);
    }
    return encontrados;
  }

  function nomeDaFuncaoChamada(handler) {
    const chamada = String(handler || '').trim().match(/^(?:event\.stopPropagation\(\);?\s*)?([A-Za-z_$][\w$]*)\s*\(/);
    if (!chamada) return '';
    if (['event', 'this', 'document', 'window'].includes(chamada[1])) {
      const seguinte = String(handler).match(/[;)]\s*([A-Za-z_$][\w$]*)\s*\(/);
      return seguinte ? seguinte[1] : '';
    }
    return chamada[1];
  }

  /**
   * Classifica um handler inline (`onclick`/`onchange`/`onsubmit`) em
   * 'leitura', 'escrita' ou 'desconhecido'. O modo somente leitura trata
   * 'desconhecido' como escrita (fail closed).
   * @param {string} handler conteúdo do atributo inline
   * @returns {'leitura'|'escrita'|'desconhecido'}
   */
  function classificarHandler(handler) {
    const texto = String(handler || '').trim();
    if (!texto) return 'leitura';
    for (const citado of citadosNoHandler(texto)) {
      if (ACOES_ESCRITA.has(citado) || FUNCOES_ESCRITA.has(citado)) return 'escrita';
    }
    const nomeFuncao = nomeDaFuncaoChamada(texto);
    if (!nomeFuncao) return 'leitura';
    if (FUNCOES_LEITURA.has(nomeFuncao) || ACOES_LEITURA.has(nomeFuncao)) return 'leitura';
    if (FUNCOES_ESCRITA.has(nomeFuncao)) return 'escrita';
    return 'desconhecido';
  }

  /**
   * Indica se um handler inline executa escrita.
   * @param {string} handler conteúdo do atributo inline
   * @returns {boolean}
   */
  function handlerDeEscrita(handler) {
    return classificarHandler(handler) !== 'leitura';
  }

  /**
   * Lança erro quando a ação não é permitida no modo atual.
   * @param {string} acao ação da API
   */
  function podeExecutarAcao(acao) {
    if (!estado.carregado) return true; // sem configuração carregada, comportamento antigo
    if (estado.bloqueado) throw erroSemPermissao(acao);
    if (!estado.somenteLeitura) return true;
    if (classificarAcao(acao) === 'leitura') return true;
    throw erroSemPermissao(acao);
  }

  function exigirEdicao() {
    if (!estado.carregado) return true;
    if (estado.bloqueado || estado.somenteLeitura) throw erroSemPermissao('');
    return true;
  }

  /**
   * Normaliza a coluna `Planilha` da aba Paginas em ID de planilha.
   * Aceita o ID puro ou a URL completa do Google Sheets; devolve '' quando
   * não há configuração válida (o adaptador então usa o ID de teste padrão).
   * @returns {string}
   */
  function planilhaIdDaPagina() {
    if (!estado.carregado) return '';
    const valor = String(estado.planilha || '').trim();
    if (!valor) return '';
    const daUrl = valor.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
    if (daUrl) return daUrl[1];
    return /^[A-Za-z0-9_-]{20,}$/.test(valor) ? valor : '';
  }

  let ultimoAviso = 0;
  function atualizarAviso(mensagem, variacao) {
    const doc = global.document;
    if (!doc || !doc.body) return;
    let aviso = doc.getElementById(ID_AVISO);
    if (!aviso) {
      aviso = doc.createElement('div');
      aviso.id = ID_AVISO;
      aviso.setAttribute('role', 'status');
      aviso.className = CLASSE_AVISO;
      aviso.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:18px', 'transform:translateX(-50%)',
        'z-index:2147483000', 'max-width:min(92vw,560px)', 'padding:10px 16px',
        'border-radius:10px', 'font:600 13px/1.4 Segoe UI,Arial,sans-serif',
        'box-shadow:0 8px 28px rgba(0,0,0,.25)', 'text-align:center', 'pointer-events:none'
      ].join(';');
      doc.body.appendChild(aviso);
    }
    aviso.textContent = mensagem;
    aviso.style.background = variacao === 'erro' ? '#b00020' : '#2D3277';
    aviso.style.color = '#fff';
    aviso.hidden = false;
  }

  function avisarBloqueio() {
    const agora = Date.now();
    if (agora - ultimoAviso < 1200) return;
    ultimoAviso = agora;
    const mensagem = estado.bloqueado
      ? 'Você não tem permissão para acessar esta página.'
      : 'Modo somente leitura: esta ação precisa de permissão de edição.';
    try {
      if (global.Swal && typeof global.Swal.fire === 'function') {
        global.Swal.fire({ icon: 'warning', title: 'Permissão', text: mensagem });
        return;
      }
    } catch (erro) {
      console.warn('Não foi possível exibir o alerta de permissão:', erro);
    }
    atualizarAviso(mensagem, estado.bloqueado ? 'erro' : 'aviso');
  }

  function mostrarBloqueio(mensagem) {
    const doc = global.document;
    if (!doc) return;
    const montar = () => {
      doc.body.innerHTML = '';
      const caixa = doc.createElement('div');
      caixa.style.cssText = 'max-width:520px;margin:12vh auto;padding:28px;border-radius:16px;background:#fff;color:#20283b;box-shadow:0 20px 60px rgba(0,0,0,.18);font:400 15px/1.6 Segoe UI,Arial,sans-serif;text-align:center';
      const titulo = doc.createElement('h1');
      titulo.textContent = 'Acesso não permitido';
      titulo.style.cssText = 'font-size:20px;margin:0 0 12px;color:#2D3277';
      const texto = doc.createElement('p');
      texto.textContent = mensagem;
      texto.style.margin = '0 0 18px';
      const voltar = doc.createElement('a');
      voltar.href = 'portal.html';
      voltar.textContent = 'Voltar ao portal';
      voltar.style.cssText = 'display:inline-block;padding:12px 22px;border-radius:10px;background:#FFD700;color:#20283b;font-weight:800;text-decoration:none';
      caixa.append(titulo, texto, voltar);
      doc.body.appendChild(caixa);
      doc.title = 'Acesso não permitido';
    };
    if (doc.body) montar();
    else doc.addEventListener('DOMContentLoaded', montar, { once: true });
  }

  let interceptacaoAplicada = false;

  /** Intercepta clique/dblclick/submit em modo somente leitura ou bloqueado. */
  function aplicarRestricoes() {
    const doc = global.document;
    if (!doc) return;
    const raiz = doc.documentElement;
    if (raiz) raiz.classList.toggle(CLASSE_LEITURA, estado.somenteLeitura && !estado.bloqueado);
    if (!estado.somenteLeitura && !estado.bloqueado) return;
    if (interceptacaoAplicada) return;
    interceptacaoAplicada = true;

    const aoInteragir = event => {
      if (!estado.somenteLeitura && !estado.bloqueado) return;
      const alvo = event.target && event.target.closest ? event.target.closest('[onclick], [onchange]') : null;
      if (!alvo) return;
      const handler = alvo.getAttribute('onclick') || alvo.getAttribute('onchange') || '';
      const deveBloquear = estado.bloqueado || handlerDeEscrita(handler);
      if (!deveBloquear) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      alvo.classList.add(CLASSE_BLOQUEADA);
      avisarBloqueio();
    };

    doc.addEventListener('click', aoInteragir, true);
    doc.addEventListener('dblclick', aoInteragir, true);
    doc.addEventListener('submit', event => {
      if (!estado.somenteLeitura && !estado.bloqueado) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      avisarBloqueio();
    }, true);
  }

  function resetarEstado() {
    Object.assign(estado, {
      carregado: false, podeVer: false, podeEditar: false,
      somenteLeitura: false, bloqueado: false, motivo: '',
      planilha: '', api: '', arquivo: '', contexto: null
    });
  }

  function aplicar(opcoes) {
    estado.carregado = true;
    estado.podeVer = opcoes.podeVer !== false;
    estado.podeEditar = estado.podeVer && opcoes.podeEditar === true;
    estado.somenteLeitura = !estado.podeEditar;
    estado.bloqueado = !estado.podeVer;
    estado.motivo = opcoes.motivo || '';
    if (opcoes.planilha) estado.planilha = String(opcoes.planilha);
    if (opcoes.api) estado.api = String(opcoes.api);
    if (opcoes.contexto) estado.contexto = opcoes.contexto;
    aplicarRestricoes();
    if (estado.bloqueado) mostrarBloqueio(estado.motivo || 'Você não tem permissão para acessar esta página.');
    else if (estado.somenteLeitura && opcoes.avisar !== false) atualizarAviso(estado.motivo, 'aviso');
    return { ...estado };
  }

  function somenteLeitura(motivo, opcoes = {}) {
    return aplicar({
      podeVer: opcoes.podeVer !== false,
      podeEditar: false,
      motivo,
      planilha: opcoes.planilha,
      api: opcoes.api,
      contexto: opcoes.contexto,
      avisar: opcoes.avisar
    });
  }

  async function consultarConfiguracao() {
    const token = lerToken();
    if (!token) {
      return somenteLeitura('Modo somente leitura: sessão não encontrada neste navegador. Abra esta página pelo portal para validar seu acesso.', { avisar: true });
    }
    const api = urlDaApi();
    if (!api) {
      return somenteLeitura('Modo somente leitura: não foi possível identificar a API do portal para validar sua permissão.', { avisar: true });
    }
    const arquivo = nomeDoArquivo();
    if (!arquivo) {
      return somenteLeitura('Modo somente leitura: não foi possível identificar o arquivo desta página.', { avisar: true });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const resposta = await fetch(api, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'obterConfigPagina', token, arquivo }),
        signal: controller.signal
      });
      if (!resposta.ok) throw new Error(`A API respondeu HTTP ${resposta.status}.`);
      const saida = await resposta.json();
      if (!saida || saida.ok !== true || !saida.data) {
        const motivo = saida && saida.error ? saida.error : 'não foi possível confirmar sua permissão.';
        return aplicar({ podeVer: false, podeEditar: false, motivo, avisar: false });
      }
      const dados = saida.data;
      estado.arquivo = arquivo;
      return aplicar({
        podeVer: dados.podeVer === true,
        podeEditar: dados.podeEditar === true,
        planilha: dados.planilha,
        api: dados.api,
        contexto: dados,
        motivo: 'Modo somente leitura: seu usuário não tem permissão de edição nesta página.',
        avisar: true
      });
    } catch (erro) {
      console.warn('Não foi possível validar a permissão da página:', erro);
      return somenteLeitura('Modo somente leitura: não foi possível validar sua permissão agora. Nenhuma alteração será gravada.', { avisar: true });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Consulta a permissão uma única vez e aplica o resultado.
   * @param {{forcar?: boolean}} opcoes
   * @returns {Promise<Object>}
   */
  function iniciar(opcoes = {}) {
    if (estado.carregado && !opcoes.forcar) return Promise.resolve({ ...estado });
    if (estado.emAndamento && !opcoes.forcar) return estado.emAndamento;

    const modo = String(lerParametros()[PARAMETRO_MODO] || '').toLowerCase();
    if (modo === 'ver') {
      estado.emAndamento = Promise.resolve(somenteLeitura('Modo somente leitura definido pelo portal.', { avisar: true }));
      return estado.emAndamento;
    }

    estado.emAndamento = consultarConfiguracao().finally(() => {
      estado.emAndamento = null;
    });
    return estado.emAndamento;
  }

  /**
   * API da página (coluna `API` da aba Paginas) quando existir.
   * @param {string} padrao URL usada como reserva.
   * @returns {Promise<string>}
   */
  async function apiDaPagina(padrao) {
    await iniciar().catch(erro => console.warn('Falha ao validar a API da página:', erro));
    const configurada = String(estado.api || '').trim();
    return /^https:\/\//.test(configurada) ? configurada : padrao;
  }

  const API = {
    iniciar,
    estado: () => ({ ...estado }),
    podeVer: () => !estado.carregado || estado.podeVer,
    podeEditar: () => !estado.carregado || estado.podeEditar,
    somenteLeitura: () => estado.carregado && estado.somenteLeitura,
    carregado: () => estado.carregado,
    podeExecutarAcao,
    exigirEdicao,
    classificarAcao,
    classificarHandler,
    handlerDeEscrita,
    planilhaIdDaPagina,
    apiDaPagina,
    modoLeitura: motivo => somenteLeitura(motivo, { avisar: true }),
    bloquear: motivo => aplicar({ podeVer: false, podeEditar: false, motivo, avisar: false }),
    resetarEstado
  };

  global.PortalPermissoes = Object.freeze(API);

  // Toda página que carregar este arquivo já aplica a política ao abrir.
  if (global.document) {
    const iniciarAoCarregar = () => iniciar().catch(erro => console.warn('Falha ao aplicar permissões:', erro));
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', iniciarAoCarregar, { once: true });
    else iniciarAoCarregar();
  }
})(globalThis);
