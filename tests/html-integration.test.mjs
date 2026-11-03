import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  ROOT, ID_PLANILHA, N8N_BASE_URL, htmlFiles, read, inlineScripts,
  walk, findFunction, legacyUrl, createAdapter, createPermissoes, recordingFetch, jsonResponse
} from './helpers.mjs';

const nestedPages = new Set([
  'aduanas.html', 'agingdevolucao.html', 'analisedeslocados.html',
  'ativosbpp.html', 'avarias.html', 'biparinventario.html',
  'equipamentos.html', 'fazerdevolucao.html', 'missorted.html',
  'pokainventario.html', 'pokayoke.html', 'semidciclos.html', 'semidciclos2.html'
]);
const wrapperPages = htmlFiles.filter(name => !['admin.html', 'portal.html', 'login.html', 'limpar.html', 'diagnostico.html'].includes(name));
// Páginas de ferramenta: carregam a política de ver/editar. Login, portal, admin
// e limpar são telas de autenticação/serviço e não passam por obterConfigPagina.
const paginasComPermissao = new Set(wrapperPages);
// diagnóstico é uma ferramenta de teste: não é página de negócio e não passa por obterConfigPagina.
const paginasDeServico = new Set(['diagnostico.html']);
const loaderPages = new Set([
  'aduanas.html', 'agingdevolucao.html', 'analisedeslocados.html',
  'ativosbpp.html', 'avarias.html', 'equipamentos.html', 'missorted.html',
  'pokainventario.html', 'pokayoke.html', 'semidciclos2.html'
]);

function loaderStub() {
  const classes = new Set();
  return {
    style: {},
    classList: {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name)
    }
  };
}

function pageContext(filename, handler) {
  const mock = recordingFetch(handler);
  const loader = loaderStub();
  const alerts = [];
  const context = vm.createContext({
    API_URL: legacyUrl(read(filename), filename),
    fetch: mock.fetch,
    PortalN8N: createAdapter(mock.fetch),
    PortalPermissoes: createPermissoes(),
    document: { getElementById: () => loader },
    Swal: { fire: (...args) => alerts.push(args) },
    mostrarLoader: () => loader.classList.add('active'),
    esconderLoader: () => loader.classList.remove('active'),
    setTimeout, clearTimeout, AbortController, console
  });
  const name = filename === 'semidciclos.html' ? 'chamarAPI' : 'callAPI';
  vm.runInContext(`${findFunction(read(filename), name, filename)}\nglobalThis.invoke = ${name};`, context, { filename });
  return { invoke: context.invoke, mock, loader, alerts };
}

function assertLoaderHidden(filename, loader) {
  if (filename === 'semidciclos2.html') assert.equal(loader.style.display, 'none');
  else if (filename === 'equipamentos.html') assert.equal(loader.classList.contains('active'), false);
  else if (loaderPages.has(filename)) assert.equal(loader.classList.contains('show'), false);
}

test('todos os 23 HTMLs carregam uma única configuração compartilhada antes do código da página', () => {
  assert.equal(htmlFiles.length, 23);
  for (const filename of htmlFiles) {
    const source = read(filename);
    const tags = source.match(/<script src="assets\/js\/n8n-api\.js\?v=\d+"(?: data-exigir-permissoes)?><\/script>/g) || [];
    assert.equal(tags.length, 1, filename);
    assert.ok(source.indexOf(tags[0]) < source.search(/<script>/), filename);
    assert.equal(/\bconst\s+(?:ID_PLANILHA|N8N_BASE_URL)\b/.test(source), false, filename);
    const permissoes = source.match(/<script src="assets\/js\/portal-permissoes\.js\?v=\d+"><\/script>/g) || [];
    const deveTerPermissao = paginasComPermissao.has(filename) && !paginasDeServico.has(filename);
    assert.equal(permissoes.length, deveTerPermissao ? 1 : 0, filename);
    if (permissoes.length) assert.ok(source.indexOf(tags[0]) < source.indexOf(permissoes[0]), filename);
  }
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/js/n8n-api.js')));
});

test('todas as chamadas ao backend permanecem dentro de fallbacks explícitos do adaptador', () => {
  let backendCalls = 0;
  for (const filename of htmlFiles) {
    for (const script of inlineScripts(read(filename), filename)) {
      walk(script.ast, (node, parents) => {
        if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier' || node.callee.name !== 'fetch') return;
        const target = node.arguments[0];
        const isBackend = target && (
          (target.type === 'Identifier' && ['API_URL', 'apiUrl', 'url', 'paginaApi'].includes(target.name)) ||
          (target.type === 'CallExpression' && target.callee.name === 'API')
        );
        if (!isBackend) return;
        backendCalls += 1;
        const guarded = parents.some(parent => parent.type === 'CallExpression' &&
          parent.callee.type === 'MemberExpression' &&
          parent.callee.object.name === 'PortalN8N' &&
          parent.callee.property.name === 'callAPI' &&
          parent.arguments[2]?.start <= node.start && parent.arguments[2]?.end >= node.end);
        assert.ok(guarded, `${script.filename}: fetch de backend fora do adaptador`);
      });
    }
  }
  // 18 wrappers + admin + portal + 2 fluxos de login.
  assert.equal(backendCalls, 22);
});

test('os 18 adaptadores de páginas preservam o retorno JSON do n8n', async () => {
  assert.equal(wrapperPages.length, 18);
  for (const filename of wrapperPages) {
    const expected = { dadosCompletos: [{ id: '1' }], abaAtiva: 'Teste', success: true };
    const { invoke, mock, loader } = pageContext(filename, () => jsonResponse(expected));
    const result = await invoke('getDashboardInit', { nomeAba: 'Teste' });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), expected, filename);
    assert.equal(mock.calls.length, 1, filename);
    assert.equal(mock.calls[0].url, N8N_BASE_URL + 'ler-planilha', filename);
    assert.deepEqual(mock.calls[0].body, { nomeAba: 'Teste', spreadsheetId: ID_PLANILHA }, filename);
    assertLoaderHidden(filename, loader);
  }
});

test('os 18 adaptadores preservam URL, headers e formato action/payload do Apps Script quando não há rota', async () => {
  for (const filename of wrapperPages) {
    const { invoke, mock, loader } = pageContext(filename, () => jsonResponse({ ok: true, rows: [], origem: 'legacy' }));
    const payload = { campo: 'valor', numero: 7 };
    const result = await invoke('acaoTesteSemWebhook', payload);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, rows: [], origem: 'legacy' }, filename);
    assert.equal(mock.calls.length, 1, filename);
    const call = mock.calls[0];
    assert.equal(call.url, legacyUrl(read(filename), filename), filename);
    assert.equal(call.options.method, 'POST', filename);
    const expectedBody = nestedPages.has(filename)
      ? { action: 'acaoTesteSemWebhook', payload }
      : { action: 'acaoTesteSemWebhook', ...payload };
    assert.deepEqual(call.body, expectedBody, filename);
    assert.equal(Object.hasOwn(call.body, 'spreadsheetId'), false, filename);
    if (filename === 'biparinventario.html') assert.equal(call.options.headers, undefined);
    else assert.match(call.options.headers['Content-Type'], /^text\/plain/, filename);
    if (filename === 'semidciclos.html') assert.equal(call.options.mode, 'cors');
    if (filename === 'fazerdevolucao.html') assert.equal(call.options.redirect, 'follow');
    assertLoaderHidden(filename, loader);
  }
});

test('erro do n8n libera loaders e não aciona fallback em nenhuma página operacional', async () => {
  for (const filename of wrapperPages) {
    const { invoke, mock, loader, alerts } = pageContext(filename, () => jsonResponse({}, 503));
    await assert.rejects(invoke('getDashboardInit'), /Erro HTTP 503/, filename);
    assert.equal(mock.calls.length, 1, filename);
    assert.equal(mock.calls[0].url, N8N_BASE_URL + 'ler-planilha', filename);
    assertLoaderHidden(filename, loader);
    if (alerts.length) assert.equal(alerts.length, 1, filename);
  }
});

test('showLoader=false continua suprimindo loader e alerta nos adaptadores que oferecem esse parâmetro', async () => {
  for (const filename of ['aduanas.html', 'ativosbpp.html']) {
    const { invoke, loader, alerts } = pageContext(filename, () => jsonResponse({}, 500));
    await assert.rejects(invoke('getDashboardInit', {}, false), /Erro HTTP 500/);
    assert.equal(loader.classList.contains('show'), false);
    assert.equal(alerts.length, 0);
  }
});

test('erro de negócio do Apps Script continua sendo tratado pelo wrapper original', async () => {
  const { invoke, mock, loader, alerts } = pageContext('aduanas.html', () => jsonResponse({ erro: 'Falha de teste' }));
  await assert.rejects(invoke('getDashboardData'), /Falha de teste/);
  assert.equal(mock.calls.length, 1);
  assert.equal(alerts.length, 1);
  assertLoaderHidden('aduanas.html', loader);
});

test('admin mantém token, timeout e desempacotamento data no fallback', async () => {
  const mock = recordingFetch(() => jsonResponse({ ok: true, data: { perfil: 'admin' } }));
  const timers = [];
  const context = vm.createContext({
    PortalN8N: createAdapter(mock.fetch),
    fetch: mock.fetch,
    API: () => 'https://apps-script.test/exec',
    TOKEN: () => 'token-teste',
    AbortController,
    setTimeout: (callback, delay) => { timers.push(delay); return 1; },
    clearTimeout: () => {}
  });
  vm.runInContext(`${findFunction(read('admin.html'), 'call', 'admin.html')}\nglobalThis.invoke = call;`, context);
  assert.deepEqual(await context.invoke('validarToken'), { perfil: 'admin' });
  assert.deepEqual(mock.calls[0].body, { action: 'validarToken', token: 'token-teste' });
  assert.equal(mock.calls[0].options.redirect, 'follow');
  assert.deepEqual(timers, [15000]);
});

test('portal mantém o envelope ok/data e o token no fallback', async () => {
  const expected = { ok: true, data: { nome: 'Teste' } };
  const mock = recordingFetch(() => jsonResponse(expected));
  const context = vm.createContext({
    PortalN8N: createAdapter(mock.fetch), fetch: mock.fetch,
    API_URL: 'https://apps-script.test/exec',
    AbortController, setTimeout: () => 1, clearTimeout: () => {}
  });
  vm.runInContext(`${findFunction(read('portal.html'), 'api', 'portal.html')}\nglobalThis.invoke = api;`, context);
  assert.deepEqual(await context.invoke('validarToken', { token: 'token-teste' }), expected);
  assert.deepEqual(mock.calls[0].body, { action: 'validarToken', token: 'token-teste' });
});

test('polling de e-mail/BPP usa o adaptador, sem fetch direto fora do fallback', () => {
  for (const filename of ['bpp2026.html', 'painelemail.html']) {
    const source = read(filename);
    assert.match(source, /callAPI\('verificarProgresso'\)/);
    assert.doesNotMatch(source, /fetch\(API_URL[^\n]*verificarProgresso/);
  }
});
