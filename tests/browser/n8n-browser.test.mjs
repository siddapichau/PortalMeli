import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium as playwright } from 'playwright-core';
import chromium, { inflate, setupLambdaEnvironment } from '@sparticuz/chromium';
import { createStaticServer } from '../../scripts/serve.mjs';
import { ROOT, ID_PLANILHA, N8N_BASE_URL, htmlFiles, read } from '../helpers.mjs';

// API central simulada (Apps Script): responde obterConfigPagina nos testes.
const API_CENTRAL = 'https://apps-script.test/exec';
const CONFIG_EDITAR = { podeVer: true, podeEditar: true, planilha: '', api: '' };
const CONFIG_VER = { podeVer: true, podeEditar: false, planilha: '', api: '' };

/** URL de Apps Script declarada na própria página (fallback do adaptador). */
function pageApiUrl(filename) {
  return read(filename).match(/const API_URL = '([^']+)'/)[1];
}

let server;
let browser;
let origin;

before(async () => {
  server = createStaticServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || await chromium.executablePath();
  if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    const libDirectory = path.join(os.tmpdir(), 'al2023', 'lib');
    if (!fs.existsSync(libDirectory)) {
      await inflate(path.join(ROOT, 'node_modules/@sparticuz/chromium/bin/al2023.tar.br'));
    }
    setupLambdaEnvironment(libDirectory);
  }
  // Mantém a política de mesma origem ativa: CORS é simulado explicitamente nas respostas.
  const args = chromium.args.filter(arg => !['--disable-web-security', '--allow-running-insecure-content', '--single-process'].includes(arg));
  browser = await playwright.launch({ executablePath, args, headless: true });
});

after(async () => {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
});

async function openPage(filename, handlers = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  const calls = { n8n: [], legacy: [], preflight: [], config: [] };
  page.on('pageerror', error => pageErrors.push(error.message));
  if (handlers.session) {
    await page.addInitScript(({ apiUrl, token, arquivo }) => {
      window.localStorage.setItem('apiUrl', apiUrl);
      if (token) window.localStorage.setItem('token', token);
      if (arquivo) window.__arquivoTeste = arquivo;
    }, { apiUrl: API_CENTRAL, token: handlers.session.token ?? '', arquivo: handlers.session.arquivo ?? '' });
  }
  await page.addInitScript(() => {
    window.__swalCalls = [];
    window.Swal = {
      fire: (...args) => { window.__swalCalls.push(args); return Promise.resolve({ isConfirmed: false }); },
      mixin: () => ({ fire: () => {} }),
      showLoading: () => {},
      showValidationMessage: () => {}
    };
  });
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (request.method() === 'OPTIONS') {
      calls.preflight.push(url.href);
      return route.fulfill({ status: 204, headers: cors, body: '' });
    }
    if (url.href.startsWith(N8N_BASE_URL) || url.hostname === 'script.google.com' || url.href === API_CENTRAL) {
      const call = { url: url.href, method: request.method(), headers: request.headers(), body: request.postDataJSON() };
      const canal = url.href === API_CENTRAL ? 'config' : url.href.startsWith(N8N_BASE_URL) ? 'n8n' : 'legacy';
      calls[canal].push(call);
      const handler = handlers[canal];
      const result = handler ? await handler(call) : { ok: true, data: [] };
      const explicitStatus = typeof result.status === 'number';
      return route.fulfill({
        status: explicitStatus ? result.status : 200,
        contentType: 'application/json',
        headers: cors,
        body: JSON.stringify(explicitStatus ? result.data : result)
      });
    }
    // CDNs não são acessadas: o teste verifica o código local, não a disponibilidade das CDNs.
    return route.fulfill({
      status: 200,
      contentType: url.pathname.endsWith('.js') ? 'application/javascript' : 'text/css',
      body: ''
    });
  });
  await page.goto(`${origin}/${filename}`, { waitUntil: 'domcontentloaded' });
  return { context, page, calls, pageErrors };
}

const dashboardRow = {
  _idNum: '42', Descricao: 'Pacote de teste', Observacoes: 'Original',
  Responsabilidade: 'SERVICE', Turno: 'MANHA', Valor_Real: '10,00'
};

test('servidor entrega o adaptador e os 23 HTMLs, sem expor arquivos internos', async () => {
  const asset = await fetch(`${origin}/assets/js/n8n-api.js?v=1`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /javascript/);
  assert.equal(await asset.text(), read('assets/js/n8n-api.js'));
  for (const filename of htmlFiles) {
    const response = await fetch(`${origin}/${filename}`);
    assert.equal(response.status, 200, filename);
    assert.match(await response.text(), /assets\/js\/n8n-api\.js/, filename);
  }
  assert.equal((await fetch(`${origin}/.git/config`)).status, 403);
  assert.equal((await fetch(`${origin}/login.html`, { method: 'POST' })).status, 405);
});

test('login real no navegador continua no Apps Script e não envia senha ao n8n', async () => {
  const { context, page, calls, pageErrors } = await openPage('login.html', {
    legacy: () => ({ ok: true, data: { token: 'token-somente-teste', nome: 'Teste', email: 'teste@example.com', perfil: 'user' } })
  });
  try {
    assert.equal(await page.evaluate(() => window.PortalN8N.ID_PLANILHA), ID_PLANILHA);
    await page.locator('#email').fill('teste@example.com');
    await page.locator('#password').fill('senha-somente-teste');
    await page.locator('#submitButton').click();
    await page.waitForURL('**/portal.html', { waitUntil: 'commit' });
    assert.equal(calls.n8n.length, 0);
    const login = calls.legacy.find(call => call.body.action === 'login');
    assert.equal(login.url, read('login.html').match(/const apiUrl="([^"]+)"/)[1]);
    assert.equal(login.body.email, 'teste@example.com');
    assert.equal(login.body.senha, 'senha-somente-teste');
    assert.match(login.headers['content-type'], /^text\/plain/);
    assert.equal(await page.evaluate(() => window.localStorage.getItem('token')), 'token-somente-teste');
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('solicitação de acesso também permanece no Apps Script', async () => {
  const { context, page, calls, pageErrors } = await openPage('login.html', {
    legacy: () => ({ ok: true, message: 'Solicitação de teste registrada.' })
  });
  try {
    await page.locator('#requestAccess').click();
    await page.locator('#requestName').fill('Usuário Teste');
    await page.locator('#requestEmail').fill('teste@example.com');
    await page.locator('#requestPassword').fill('senha-somente-teste');
    await page.locator('#requestConfirmPassword').fill('senha-somente-teste');
    await page.locator('#sendRequest').click();
    await page.waitForFunction(() => document.getElementById('errorMessage').textContent.includes('Solicitação de teste registrada'));
    assert.equal(calls.n8n.length, 0);
    assert.equal(calls.legacy.length, 1);
    assert.equal(calls.legacy[0].body.action, 'solicitarAcesso');
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('a1 carrega dados do webhook, renderiza a tabela e envia edição ao webhook de célula', async () => {
  const { context, page, calls, pageErrors } = await openPage('a1.html', {
    session: { token: 'token-teste' },
    config: () => ({ ok: true, data: CONFIG_EDITAR }),
    n8n: call => call.url.endsWith('/ler-planilha')
      ? { dadosCompletos: [dashboardRow], abaAtiva: 'Base Teste' }
      : { success: true },
    legacy: () => ({ cache: {} })
  });
  try {
    await page.waitForFunction(() => document.getElementById('contador-linhas').textContent === '1 de 1 linhas');
    assert.match(await page.locator('#tabela-corpo').textContent(), /Pacote de teste/);
    assert.equal(calls.n8n[0].url, N8N_BASE_URL + 'ler-planilha');
    assert.equal(calls.n8n[0].body.spreadsheetId, ID_PLANILHA);
    assert.equal(calls.n8n[0].headers['content-type'], 'application/json');
    const edit = await page.evaluate(() => window.callAPI('salvarEdicaoAnalise', {
      id: '42', coluna: 'Observacoes', valor: 'Atualizado em teste', nomeAba: 'Base Teste'
    }));
    assert.deepEqual(edit, { success: true });
    assert.equal(calls.n8n[1].url, N8N_BASE_URL + 'atualizar-celula');
    assert.deepEqual(calls.n8n[1].body, {
      id: '42', coluna: 'Observacoes', valor: 'Atualizado em teste', nomeAba: 'Base Teste', spreadsheetId: ID_PLANILHA
    });
    const legacy = await page.evaluate(() => window.callAPI('carregarBackground', { abasParaCarregar: ['Base Teste'] }));
    assert.deepEqual(legacy, { cache: {} });
    const legado = calls.legacy.at(-1);
    assert.equal(legado.url, pageApiUrl('a1.html'));
    assert.deepEqual(legado.body, { action: 'carregarBackground', abasParaCarregar: ['Base Teste'] });
    assert.equal(calls.config.length, 1);
    assert.deepEqual(calls.config[0].body, { action: 'obterConfigPagina', token: 'token-teste', arquivo: 'a1.html' });
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('a1 mostra erro de leitura do n8n e não consulta a API antiga como fallback', async () => {
  const { context, page, calls, pageErrors } = await openPage('a1.html', {
    session: { token: 'token-teste' },
    config: () => ({ ok: true, data: CONFIG_EDITAR }),
    n8n: () => ({ status: 503, data: { erro: 'indisponível' } })
  });
  try {
    await page.waitForFunction(() => document.getElementById('top-progress-bar').style.backgroundColor === 'red');
    const alerts = await page.evaluate(() => window.__swalCalls);
    assert.ok(alerts.some(args => String(args[1]).includes('Erro HTTP 503')));
    assert.equal(calls.n8n.length, 1);
    assert.equal(calls.legacy.length, 0);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('limpar.html carrega a configuração sem fazer nenhuma chamada de backend', async () => {
  const { context, page, calls, pageErrors } = await openPage('limpar.html');
  try {
    assert.equal(await page.evaluate(() => window.PortalN8N.ID_PLANILHA), ID_PLANILHA);
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('#limpar').click();
    assert.equal(calls.n8n.length, 0);
    assert.equal(calls.legacy.length, 0);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('em somente leitura a tela de ferramenta não envia nenhuma escrita para n8n nem Apps Script', async () => {
  const { context, page, calls, pageErrors } = await openPage('a1.html', {
    session: { token: 'token-teste' },
    config: () => ({ ok: true, data: CONFIG_VER }),
    n8n: call => call.url.endsWith('/ler-planilha')
      ? { dadosCompletos: [dashboardRow], abaAtiva: 'Base Teste' }
      : { success: true },
    legacy: () => ({ cache: {} })
  });
  try {
    await page.waitForFunction(() => document.getElementById('contador-linhas').textContent === '1 de 1 linhas');
    const estado = await page.evaluate(() => window.PortalPermissoes.estado());
    assert.equal(estado.podeEditar, false);
    assert.equal(estado.somenteLeitura, true);
    assert.ok(await page.evaluate(() => document.documentElement.classList.contains('pm-somente-leitura')));

    // Tenta editar a célula pelo adaptador da própria página.
    const erro = await page.evaluate(() => window.callAPI('salvarEdicaoAnalise', {
      id: '42', coluna: 'Observacoes', valor: 'não deveria gravar', nomeAba: 'Base Teste'
    }).then(() => null, e => e.message));
    assert.match(erro, /somente leitura/i);

    // Duplo clique na linha (o caminho real do usuário) precisa ser bloqueado.
    await page.locator('#tabela-corpo tr').first().dblclick();
    const avisos = await page.evaluate(() => window.__swalCalls);
    assert.ok(avisos.some(args => JSON.stringify(args).includes('somente leitura')), 'o duplo clique deveria avisar sobre o modo somente leitura');
    assert.equal(await page.locator('.swal2-popup').count(), 0, 'o modal de edição não pode abrir');

    // Nada de escrita saiu: só o POST de leitura no n8n e a consulta de permissão.
    assert.equal(calls.n8n.length, 1);
    assert.equal(calls.n8n[0].url, N8N_BASE_URL + 'ler-planilha');
    assert.equal(calls.legacy.filter(call => call.body?.action === 'salvarEdicaoAnalise').length, 0);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('podeVer=false bloqueia a página inteira e nenhuma leitura é feita', async () => {
  const { context, page, calls, pageErrors } = await openPage('avarias.html', {
    session: { token: 'token-teste' },
    config: () => ({ ok: false, error: 'Você não tem permissão para acessar esta página.' })
  });
  try {
    await page.waitForFunction(() => document.body.textContent.includes('Acesso não permitido'));
    assert.match(await page.locator('body').textContent(), /não tem permissão/i);
    assert.equal(calls.n8n.length, 0);
    assert.equal(calls.legacy.length, 0);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('sem sessão a ferramenta abre em somente leitura e avisa o usuário', async () => {
  const { context, page, calls, pageErrors } = await openPage('semidciclos2.html', {
    session: { token: '' },
    legacy: () => ({ ok: true, data: [] })
  });
  try {
    await page.waitForFunction(() => document.getElementById('pm-aviso-permissao')?.textContent.length > 0);
    const estado = await page.evaluate(() => window.PortalPermissoes.estado());
    assert.equal(estado.somenteLeitura, true);
    assert.equal(estado.podeEditar, false);
    const erro = await page.evaluate(() => window.callAPI('salvarItem', { item: { ID: 1 } }).then(() => null, e => e.message));
    assert.match(erro, /somente leitura/i);
    assert.equal(calls.legacy.filter(call => call.body?.action === 'salvarItem').length, 0);
    assert.equal(calls.config.length, 0, 'sem token não deve consultar a API central');
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('modo=ver na URL mantém a leitura e bloqueia a escrita, sem consultar a API central', async () => {
  const { context, page, calls, pageErrors } = await openPage('avarias.html?modo=ver', {
    session: { token: 'token-teste' },
    legacy: () => ({ ok: true, dados: [] })
  });
  try {
    await page.waitForFunction(() => window.PortalPermissoes?.estado().carregado === true);
    const estado = await page.evaluate(() => window.PortalPermissoes.estado());
    assert.equal(estado.podeEditar, false);
    assert.equal(estado.somenteLeitura, true);
    assert.equal(calls.config.length, 0);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('a planilha configurada na aba Paginas é usada pelo adaptador n8n', async () => {
  const planilhaDaPagina = '1co3KfvzbAc_Jdt5lf7D_optZWlG8EPYxIsLKk4Q9rOk';
  const { context, page, calls, pageErrors } = await openPage('a1.html', {
    session: { token: 'token-teste' },
    config: () => ({ ok: true, data: { podeVer: true, podeEditar: true, planilha: planilhaDaPagina, api: '' } }),
    n8n: () => ({ dadosCompletos: [], abaAtiva: 'Base Teste' }),
    legacy: () => ({ cache: {} })
  });
  try {
    await page.waitForFunction(() => window.PortalPermissoes?.estado().carregado === true);
    await page.evaluate(() => window.callAPI('getDashboardInit'));
    const leitura = calls.n8n.filter(call => call.url.endsWith('/ler-planilha'));
    assert.ok(leitura.length >= 1);
    assert.equal(leitura.at(-1).body.spreadsheetId, planilhaDaPagina);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('diagnostico.html classifica webhook publicado e não publicado pelo n8n', async () => {
  const { context, page, calls, pageErrors } = await openPage('diagnostico.html', {
    n8n: call => call.url.endsWith('/ler-planilha')
      ? { abas: ['Base Teste'], abaAtiva: 'Base Teste', dadosCompletos: [], dadosDashboard: [] }
      : { status: 404, data: { code: 404, message: 'The requested webhook "atualizar-celula" is not registered.' } }
  });
  try {
    await page.locator('#executar').click();
    await page.waitForFunction(() => document.getElementById('resumo').textContent.includes('Integração parcial'));
    const texto = await page.locator('#corpo').textContent();
    assert.match(texto, /CONECTADO/);
    assert.match(texto, /NÃO PUBLICADO/);
    assert.equal(calls.n8n.length, 2);
    assert.equal(calls.n8n[0].body.spreadsheetId, ID_PLANILHA);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});
