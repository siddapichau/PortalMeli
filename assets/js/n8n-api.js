/*
 * Integração de teste com n8n, compartilhada pelos HTMLs do PortalMeli.
 * Este arquivo não contém credenciais. A autorização deve ser validada no backend.
 * Ações sem webhook continuam no Apps Script por meio do fallback da própria página.
 */
(function (global) {
  'use strict';

  // ID confirmado pelo usuário: cópia de teste registrada na continuidade.
  const ID_PLANILHA = '1VgC0r0XBoD7MPdKi_eoORX73ETdcndzwpaIHV6Srx9Y';
  const N8N_BASE_URL = 'https://portalmeli.app.n8n.cloud/webhook/';
  const TIMEOUT_MS = 45000;

  // Somente rotas explicitamente definidas. Não inferir endpoints de escrita.
  const WEBHOOKS = Object.freeze({
    getDashboardInit: 'ler-planilha',
    obterDadosLogisticos: 'ler-planilha',
    salvarEdicaoAnalise: 'atualizar-celula',
    salvarUsuario: 'adicionar-linha'
  });

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
    const bodyData = { ...payload, spreadsheetId: ID_PLANILHA };
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
