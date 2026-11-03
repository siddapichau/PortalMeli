/*
 * Integração de teste com n8n, compartilhada pelos HTMLs do PortalMeli.
 * Este arquivo não contém credenciais. A autorização deve ser validada no backend.
 * Ações sem webhook continuam no Apps Script por meio do fallback da própria página.
 *
 * Regra de permissão (ver/editar):
 * - Este adaptador não decide sozinho quem pode editar. Ele consulta a política
 *   publicada por `assets/js/portal-permissoes.js` (global `PortalPermissoes`).
 * - Sem política carregada, nada muda (compatibilidade com telas antigas/testes).
 * - Com política carregada, a checagem acontece ANTES de qualquer requisição,
 *   inclusive antes do fallback para o Apps Script. Assim uma ação de escrita
 *   não escapa por um caminho alternativo.
 */
(function (global) {
  'use strict';

  /*
   * Reserva de segurança para PÁGINAS DE FERRAMENTA.
   *
   * Essas páginas marcam a tag como `data-exigir-permissoes`. Se
   * `assets/js/portal-permissoes.js` não carregar (arquivo não publicado, cache
   * antigo, 404), a página não pode ficar sem controle de escrita: esta reserva
   * libera somente leitura. O arquivo real substitui o objeto ao carregar.
   *
   * Telas de autenticação e administração (login, portal, admin, limpar,
   * diagnostico) NÃO têm a marca e seguem funcionando como antes.
   */
  const tagAtual = global.document && global.document.currentScript;
  const exigePermissoes = Boolean(tagAtual && typeof tagAtual.hasAttribute === 'function' &&
    tagAtual.hasAttribute('data-exigir-permissoes'));

  if (exigePermissoes && !global.PortalPermissoes) {
    const aviso = 'Arquivo de permissões não carregado: a página ficará em modo somente leitura.';
    const erroLeitura = () => {
      const erro = new Error(aviso);
      erro.name = 'PermissaoIndisponivelError';
      erro.code = 'SOMENTE_LEITURA';
      return erro;
    };
    const leitura = /^(get|listar|ler|obter|buscar|verificar|consultar|carregar|comparar|estatisticas)/i;
    global.PortalPermissoes = Object.freeze({
      iniciar: async () => ({ carregado: true, podeVer: true, podeEditar: false, somenteLeitura: true }),
      estado: () => ({ carregado: true, podeVer: true, podeEditar: false, somenteLeitura: true, bloqueado: false }),
      podeVer: () => true,
      podeEditar: () => false,
      somenteLeitura: () => true,
      carregado: () => true,
      podeExecutarAcao: acao => {
        if (leitura.test(String(acao || ''))) return true;
        throw erroLeitura();
      },
      exigirEdicao: () => { throw erroLeitura(); },
      classificarAcao: acao => (leitura.test(String(acao || '')) ? 'leitura' : 'escrita'),
      classificarHandler: () => 'desconhecido',
      handlerDeEscrita: () => true,
      planilhaIdDaPagina: () => '',
      apiDaPagina: async padrao => padrao,
      modoLeitura: () => {},
      bloquear: () => {},
      resetarEstado: () => {}
    });
    if (global.console && typeof global.console.warn === 'function') {
      global.console.warn(aviso);
    }
  }

  // ID confirmado pelo usuário: cópia de teste registrada na continuidade.
  const ID_PLANILHA = '1VgC0r0XBoD7MPdKi_eoORX73ETdcndzwpaIHV6Srx9Y';
  const N8N_BASE_URL = 'https://portalmeli.app.n8n.cloud/webhook/';
  const TIMEOUT_MS = 45000;
  const PADRAO_ID_PLANILHA = /^[A-Za-z0-9_-]{20,}$/;

  // Somente rotas explicitamente definidas. Não inferir endpoints de escrita.
  const WEBHOOKS = Object.freeze({
    getDashboardInit: 'ler-planilha',
    obterDadosLogisticos: 'ler-planilha',
    salvarEdicaoAnalise: 'atualizar-celula',
    salvarUsuario: 'adicionar-linha'
  });

  /**
   * Devolve a política de permissões carregada na página, se existir.
   * @returns {{podeExecutarAcao: Function, planilhaIdDaPagina?: Function}|null}
   */
  function politicaDePermissoes() {
    const politica = global.PortalPermissoes;
    if (!politica || typeof politica.podeExecutarAcao !== 'function') return null;
    return politica;
  }

  /**
   * Aplica a política antes de qualquer chamada de backend.
   * A própria política lança o erro (a página exibe a mensagem ao usuário).
   * @param {string} action
   */
  function checarPermissao(action) {
    const politica = politicaDePermissoes();
    if (!politica) return;
    politica.podeExecutarAcao(action);
  }

  /**
   * A planilha do n8n pode ser definida por página na aba Paginas (coluna Planilha).
   * Sem configuração válida, mantém o ID de teste padrão.
   * @returns {string}
   */
  function planilhaDaPagina() {
    const politica = politicaDePermissoes();
    if (!politica || typeof politica.planilhaIdDaPagina !== 'function') return ID_PLANILHA;
    const id = politica.planilhaIdDaPagina();
    return typeof id === 'string' && PADRAO_ID_PLANILHA.test(id) ? id : ID_PLANILHA;
  }

  /**
   * Mantém o contrato de cada tela: devolve o JSON sem renomear seus campos.
   * O fallback é usado apenas quando NÃO existe webhook para a ação.
   * Nunca repetir uma escrita no Apps Script após uma falha/timeout do n8n:
   * o webhook pode ter concluído a operação mesmo sem devolver a resposta.
   *
   * @param {string} action Ação já usada pela página.
   * @param {Object} payload Campos enviados ao webhook, sem encapsulamento.
   * @param {Function} [legacyCall] Chamada original, incluindo seu parsing/validação.
   * @returns {Promise<*>} JSON do n8n ou o resultado original do Apps Script.
   */
  async function callAPI(action, payload = {}, legacyCall) {
    if (typeof action !== 'string' || !action.trim()) {
      throw new TypeError('Informe uma ação válida para a API.');
    }

    // Bloqueia escrita sem permissão antes de qualquer rede (n8n ou Apps Script).
    checarPermissao(action);

    const endpoint = Object.hasOwn(WEBHOOKS, action) ? WEBHOOKS[action] : '';
    if (!endpoint) {
      if (typeof legacyCall !== 'function') {
        throw new Error(`A ação "${action}" ainda não possui um webhook configurado.`);
      }
      return legacyCall();
    }

    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new TypeError('O payload da API deve ser um objeto.');
    }

    // O ID configurado sempre prevalece, mesmo se o payload contiver outro ID.
    const bodyData = { ...payload, spreadsheetId: planilhaDaPagina() };
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, TIMEOUT_MS);

    try {
      const response = await fetch(N8N_BASE_URL + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status} no n8n (${endpoint}).`);
      }

      try {
        return await response.json();
      } catch (cause) {
        throw new Error(`O webhook "${endpoint}" não retornou JSON válido.`, { cause });
      }
    } catch (error) {
      if (timedOut) {
        throw new Error(`O webhook "${endpoint}" excedeu o limite de 45 segundos.`, { cause: error });
      }
      if (error?.name === 'TypeError') {
        throw new Error('Falha de conexão com o n8n. Verifique a conexão, a URL e o CORS.', { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  global.PortalN8N = Object.freeze({
    ID_PLANILHA,
    N8N_BASE_URL,
    TIMEOUT_MS,
    WEBHOOKS,
    callAPI
  });
})(globalThis);
