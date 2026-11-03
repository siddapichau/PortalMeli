import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium as playwright } from 'playwright-core';
import chromium, { inflate, setupLambdaEnvironment } from '@sparticuz/chromium';
import { createStaticServer } from '../../scripts/serve.mjs';
import { ROOT, ID_PLANILHA, N8N_BASE_URL, htmlFiles, read } from '../helpers.mjs';

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
  const calls = { n8n: [], legacy: [], preflight: [] };
  page.on('pageerror', error => pageErrors.push(error.message));
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
    if (url.href.startsWith(N8N_BASE_URL) || url.hostname === 'script.google.com') {
      const call = { url: url.href, method: request.method(), headers: request.headers(), body: request.postDataJSON() };
      const isN8N = url.href.startsWith(N8N_BASE_URL);
      calls[isN8N ? 'n8n' : 'legacy'].push(call);
      const handler = handlers[isN8N ? 'n8n' : 'legacy'];
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

test('servidor entrega o adaptador e os 22 HTMLs, sem expor arquivos internos', async () => {
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
    assert.equal(calls.legacy.length, 1);
    assert.deepEqual(calls.legacy[0].body, { action: 'carregarBackground', abasParaCarregar: ['Base Teste'] });
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('a1 mostra erro de leitura do n8n e não consulta a API antiga como fallback', async () => {
  const { context, page, calls, pageErrors } = await openPage('a1.html', {
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
