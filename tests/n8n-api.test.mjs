import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAdapter, recordingFetch, jsonResponse, fakeTimers,
  ID_PLANILHA, N8N_BASE_URL
} from './helpers.mjs';

const routes = [
  ['getDashboardInit', 'ler-planilha', {}],
  ['obterDadosLogisticos', 'ler-planilha', { nomeAba: 'Base Teste' }],
  ['salvarEdicaoAnalise', 'atualizar-celula', { id: '42', coluna: 'Observações', valor: 'Teste', nomeAba: 'Base Teste' }],
  ['salvarUsuario', 'adicionar-linha', { nome: 'Usuário Teste', email: 'teste@example.com' }]
];

test('configuração usa o ID de teste confirmado e congela o mapa de rotas', () => {
  const api = createAdapter(async () => jsonResponse({}));
  assert.equal(api.ID_PLANILHA, ID_PLANILHA);
  assert.equal(ID_PLANILHA.length, 44);
  assert.equal(api.N8N_BASE_URL, N8N_BASE_URL);
  assert.equal(api.TIMEOUT_MS, 45000);
  assert.ok(Object.isFrozen(api));
  assert.ok(Object.isFrozen(api.WEBHOOKS));
  assert.deepEqual(Object.keys(api.WEBHOOKS), routes.map(([action]) => action));
});

for (const [action, endpoint, payload] of routes) {
  test(`${action} envia POST JSON para ${endpoint}, com ID automático e payload plano`, async () => {
    const expected = { ...payload, marker: 'não alterar' };
    const mock = recordingFetch(() => jsonResponse({ success: true, custom: [1, 2] }));
    const api = createAdapter(mock.fetch);
    let legacyCalls = 0;
    const result = await api.callAPI(action, expected, () => { legacyCalls += 1; });
    assert.deepEqual(result, { success: true, custom: [1, 2] });
    assert.equal(legacyCalls, 0);
    assert.equal(mock.calls.length, 1);
    const call = mock.calls[0];
    assert.equal(call.url, N8N_BASE_URL + endpoint);
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.headers['Content-Type'], 'application/json');
    assert.deepEqual(call.body, { ...payload, marker: 'não alterar', spreadsheetId: ID_PLANILHA });
    assert.equal(Object.hasOwn(call.body, 'action'), false);
    assert.equal(Object.hasOwn(call.body, 'payload'), false);
    assert.ok(call.options.signal instanceof AbortSignal);
  });
}

test('payload não é mutado e não pode redirecionar a gravação para outra planilha', async () => {
  const payload = Object.freeze({ nomeAba: 'Teste', spreadsheetId: 'outra-planilha' });
  const mock = recordingFetch(() => jsonResponse({ ok: true }));
  const api = createAdapter(mock.fetch);
  await api.callAPI('getDashboardInit', payload);
  assert.equal(mock.calls[0].body.spreadsheetId, ID_PLANILHA);
  assert.equal(payload.spreadsheetId, 'outra-planilha');
  assert.deepEqual(Object.keys(payload), ['nomeAba', 'spreadsheetId']);
});

test('ação sem webhook usa exatamente uma vez o fallback original, sem buscar URL vazia', async () => {
  const mock = recordingFetch(() => jsonResponse({ shouldNotRun: true }));
  const api = createAdapter(mock.fetch);
  const original = { ok: true, data: { perfil: 'admin' } };
  let legacyCalls = 0;
  const result = await api.callAPI('validarToken', { token: 'teste' }, async () => {
    legacyCalls += 1;
    return original;
  });
  assert.equal(result, original);
  assert.equal(legacyCalls, 1);
  assert.equal(mock.calls.length, 0);
});

test('nomes herdados do prototype não são tratados como webhooks', async () => {
  const api = createAdapter(async () => jsonResponse({}));
  for (const action of ['toString', '__proto__', 'constructor']) {
    let calls = 0;
    await api.callAPI(action, {}, () => { calls += 1; return 'legacy'; });
    assert.equal(calls, 1);
  }
});

test('ação sem webhook e sem fallback apresenta erro explícito', async () => {
  const mock = recordingFetch(() => jsonResponse({}));
  const api = createAdapter(mock.fetch);
  await assert.rejects(api.callAPI('acaoFutura'), /ainda não possui um webhook/);
  assert.equal(mock.calls.length, 0);
});

test('ações e payloads inválidos são rejeitados antes de qualquer requisição', async () => {
  const mock = recordingFetch(() => jsonResponse({}));
  const api = createAdapter(mock.fetch);
  for (const action of ['', '   ', null, 123]) {
    await assert.rejects(api.callAPI(action, {}, () => 'legacy'), /ação válida/);
  }
  for (const payload of [null, [], 'texto', 123]) {
    await assert.rejects(api.callAPI('getDashboardInit', payload, () => 'legacy'), /deve ser um objeto/);
  }
  assert.equal(mock.calls.length, 0);
});

for (const status of [400, 401, 403, 404, 500]) {
  test(`HTTP ${status} falha sem repetir a operação no Apps Script`, async () => {
    const mock = recordingFetch(() => jsonResponse({ error: 'falha' }, status));
    const api = createAdapter(mock.fetch);
    let legacyCalls = 0;
    await assert.rejects(
      api.callAPI('salvarEdicaoAnalise', { id: '1' }, () => { legacyCalls += 1; }),
      new RegExp(`Erro HTTP ${status} no n8n`)
    );
    assert.equal(mock.calls.length, 1);
    assert.equal(legacyCalls, 0);
  });
}

test('resposta HTML/JSON inválida gera erro identificável, não sucesso vazio', async () => {
  const mock = recordingFetch(() => new Response('<html>erro</html>', { status: 200 }));
  const api = createAdapter(mock.fetch);
  let legacyCalls = 0;
  await assert.rejects(
    api.callAPI('getDashboardInit', {}, () => { legacyCalls += 1; }),
    error => error.message.includes('não retornou JSON válido') && Boolean(error.cause)
  );
  assert.equal(legacyCalls, 0);
});

test('falha de rede/CORS não dispara fallback de escrita', async () => {
  const mock = recordingFetch(() => { throw new TypeError('Failed to fetch'); });
  const api = createAdapter(mock.fetch);
  let legacyCalls = 0;
  await assert.rejects(
    api.callAPI('salvarUsuario', { nome: 'Teste' }, () => { legacyCalls += 1; }),
    error => error.message.includes('Verifique a conexão, a URL e o CORS') && Boolean(error.cause)
  );
  assert.equal(mock.calls.length, 1);
  assert.equal(legacyCalls, 0);
});

test('timeout aborta o fetch, informa o webhook e nunca repete a escrita', async () => {
  const timers = fakeTimers();
  const signals = [];
  const api = createAdapter((url, options) => new Promise((resolve, reject) => {
    signals.push(options.signal);
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }), timers);
  let legacyCalls = 0;
  const pending = api.callAPI('salvarEdicaoAnalise', { id: '1' }, () => { legacyCalls += 1; });
  const rejection = assert.rejects(pending, error => error.message.includes('excedeu o limite de 45 segundos') && Boolean(error.cause));
  assert.equal(timers.pending.size, 1);
  const [id, timer] = [...timers.pending][0];
  assert.equal(timer.delay, 45000);
  timers.fire(id);
  await rejection;
  assert.equal(signals[0].aborted, true);
  assert.equal(legacyCalls, 0);
  assert.equal(timers.pending.size, 0);
});

test('timer é limpo em sucesso, HTTP de erro, JSON inválido e erro de rede', async () => {
  const cases = [
    () => jsonResponse({ ok: true }),
    () => jsonResponse({}, 500),
    () => new Response('inválido'),
    () => { throw new TypeError('rede'); }
  ];
  for (const handler of cases) {
    const timers = fakeTimers();
    const api = createAdapter(handler, timers);
    await api.callAPI('getDashboardInit').catch(() => {});
    assert.equal(timers.pending.size, 0);
    assert.equal(timers.cleared.length, 1);
  }
});

test('fallback não cria timer do n8n nem altera a rejeição original', async () => {
  const timers = fakeTimers();
  const api = createAdapter(async () => jsonResponse({}), timers);
  const originalError = new Error('Erro original do Apps Script');
  await assert.rejects(api.callAPI('listar', {}, async () => { throw originalError; }), error => error === originalError);
  assert.equal(timers.pending.size, 0);
  assert.equal(timers.cleared.length, 0);
});

test('login, senhas, permissões e administração não têm rota n8n nesta etapa', () => {
  const api = createAdapter(async () => jsonResponse({}));
  for (const action of ['login', 'solicitarAcesso', 'validarToken', 'salvarPermissoes', 'salvarPagina', 'salvarUsuarioPortal']) {
    assert.equal(Object.hasOwn(api.WEBHOOKS, action), false);
  }
});
