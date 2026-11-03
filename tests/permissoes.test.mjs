import test from 'node:test';
import assert from 'node:assert/strict';
import {
  htmlFiles, read, inlineScripts, walk, createAdapter, createPermissoes,
  recordingFetch, jsonResponse
} from './helpers.mjs';

const API_CENTRAL = 'https://apps-script.test/exec';
const PLANILHA_TESTE = '1VgC0r0XBoD7MPdKi_eoORX73ETdcndzwpaIHV6Srx9Y';
const PLANILHA_PAGINA = '1co3KfvzbAc_Jdt5lf7D_optZWlG8EPYxIsLKk4Q9rOk';

function armazenamento(inicial = {}) {
  const dados = { ...inicial };
  return {
    getItem: chave => (Object.hasOwn(dados, chave) ? dados[chave] : null),
    setItem: (chave, valor) => { dados[chave] = String(valor); },
    removeItem: chave => { delete dados[chave]; }
  };
}

function localizacao(arquivo = 'avarias.html', busca = '') {
  return { pathname: `/portal/${arquivo}`, search: busca };
}

function documentoFalso() {
  const classes = new Set();
  const filhos = [];
  const ouvintes = [];
  const elementos = new Map();
  const criar = () => ({ style: {}, append() {}, setAttribute() {}, hidden: false, textContent: '' });
  return {
    readyState: 'complete',
    title: '',
    documentElement: { classList: { toggle: (nome, ativo) => (ativo ? classes.add(nome) : classes.delete(nome)) } },
    body: { appendChild: filho => { filhos.push(filho); elementos.set(filho.id, filho); }, innerHTML: '' },
    createElement: criar,
    getElementById: id => elementos.get(id) || null,
    addEventListener: (evento, handler) => ouvintes.push({ evento, handler }),
    classes,
    filhos,
    ouvintes
  };
}

function politica(config) {
  const documento = config.documento ?? documentoFalso();
  const mock = config.mock ?? recordingFetch(() => jsonResponse(config.resposta ?? { ok: true, data: {} }));
  const api = createPermissoes({
    fetch: mock.fetch,
    localStorage: armazenamento({ apiUrl: API_CENTRAL, token: 'token-teste', ...config.armazenamento }),
    document: documento,
    location: config.location ?? localizacao()
  });
  return { api, mock: config.mock ?? mock, documento };
}

test('sem token a página abre em somente leitura e não chama a API central', async () => {
  const { api, mock } = politica({ armazenamento: { token: '' } });
  const estado = await api.iniciar();
  assert.equal(estado.carregado, true);
  assert.equal(estado.somenteLeitura, true);
  assert.equal(estado.podeEditar, false);
  assert.equal(estado.bloqueado, false);
  assert.equal(mock.calls.length, 0);
});

test('podeVer=true e podeEditar=true libera leitura e escrita', async () => {
  const { api, mock } = politica({
    resposta: { ok: true, data: { podeVer: true, podeEditar: true, planilha: PLANILHA_PAGINA, api: 'https://script.google.com/macros/s/pagina/exec' } }
  });
  const estado = await api.iniciar();
  assert.equal(estado.somenteLeitura, false);
  assert.equal(api.podeExecutarAcao('salvarEdicaoAnalise'), true);
  assert.equal(api.planilhaIdDaPagina(), PLANILHA_PAGINA);
  assert.equal(await api.apiDaPagina('https://reserva/exec'), 'https://script.google.com/macros/s/pagina/exec');
  assert.equal(mock.calls.length, 1);
  const corpo = mock.calls[0].body;
  assert.equal(mock.calls[0].url, API_CENTRAL);
  assert.deepEqual(corpo, { action: 'obterConfigPagina', token: 'token-teste', arquivo: 'avarias.html' });
  assert.match(mock.calls[0].options.headers['Content-Type'], /^text\/plain/);
});

test('podeEditar=false bloqueia ações de escrita e libera as de leitura', async () => {
  const { api } = politica({ resposta: { ok: true, data: { podeVer: true, podeEditar: false } } });
  await api.iniciar();
  for (const acao of ['getDashboardInit', 'obterDadosLogisticos', 'getAvarias', 'listar', 'getHistorico']) {
    assert.equal(api.podeExecutarAcao(acao), true, acao);
  }
  for (const acao of ['salvarEdicaoAnalise', 'salvar', 'excluir', 'importarRotas', 'uploadCSV', 'dispararEmails', 'acaoNaoCatalogada']) {
    assert.throws(() => api.podeExecutarAcao(acao), /somente leitura/i, acao);
  }
  assert.throws(() => api.exigirEdicao(), /somente leitura/i);
});

test('ação desconhecida é tratada como escrita (fail closed)', async () => {
  const { api } = politica({ resposta: { ok: true, data: { podeVer: true, podeEditar: false } } });
  await api.iniciar();
  assert.equal(api.classificarAcao('acaoNovaDoFuturo'), 'escrita');
  assert.equal(api.classificarAcao('getAlgoNovo'), 'leitura');
  assert.equal(api.classificarAcao('salvarAlgoNovo'), 'escrita');
});

test('podeVer=false bloqueia a página inteira', async () => {
  const { api, documento } = politica({ resposta: { ok: true, data: { podeVer: false, podeEditar: false } } });
  const estado = await api.iniciar();
  assert.equal(estado.bloqueado, true);
  assert.equal(estado.podeVer, false);
  assert.throws(() => api.podeExecutarAcao('getDashboardInit'), /somente leitura/i);
  assert.ok(documento.filhos.length > 0, 'deveria montar a tela de bloqueio');
});

test('resposta ok:false da API (sem permissão) bloqueia o acesso', async () => {
  const { api } = politica({ resposta: { ok: false, error: 'Você não tem permissão para acessar esta página.' } });
  const estado = await api.iniciar();
  assert.equal(estado.bloqueado, true);
});

test('API indisponível mantém a página aberta porém em somente leitura', async () => {
  const mock = recordingFetch(() => jsonResponse({}, 500));
  const { api } = politica({ mock });
  const estado = await api.iniciar();
  assert.equal(estado.bloqueado, false);
  assert.equal(estado.somenteLeitura, true);
  assert.equal(estado.podeEditar, false);
  assert.throws(() => api.exigirEdicao(), /somente leitura/i);
});

test('falha de rede/CORS também cai em somente leitura, sem liberar escrita', async () => {
  const mock = recordingFetch(() => { throw new TypeError('Failed to fetch'); });
  const { api } = politica({ mock });
  const estado = await api.iniciar();
  assert.equal(estado.somenteLeitura, true);
  assert.equal(estado.podeEditar, false);
});

test('parâmetro modo=ver do portal força somente leitura sem consultar a API', async () => {
  const { api, mock } = politica({ location: localizacao('avarias.html', '?modo=ver&token=abc') });
  const estado = await api.iniciar();
  assert.equal(estado.somenteLeitura, true);
  assert.equal(estado.podeEditar, false);
  assert.equal(mock.calls.length, 0);
});

test('arquivo da página vem do parâmetro arquivo quando informado', async () => {
  const { api, mock } = politica({ location: localizacao('portal.html', '?arquivo=avarias.html') });
  await api.iniciar();
  assert.equal(mock.calls[0].body.arquivo, 'avarias.html');
});

test('a política é consultada uma única vez por carregamento', async () => {
  const { api, mock } = politica({ resposta: { ok: true, data: { podeVer: true, podeEditar: true } } });
  await Promise.all([api.iniciar(), api.iniciar(), api.iniciar()]);
  await api.iniciar();
  assert.equal(mock.calls.length, 1);
});

test('a planilha da coluna Planilha aceita ID puro ou URL do Google Sheets', async () => {
  for (const [valor, esperado] of [
    [PLANILHA_PAGINA, PLANILHA_PAGINA],
    [`https://docs.google.com/spreadsheets/d/${PLANILHA_PAGINA}/edit#gid=0`, PLANILHA_PAGINA],
    ['', ''],
    ['id-invalido', '']
  ]) {
    const { api } = politica({ resposta: { ok: true, data: { podeVer: true, podeEditar: true, planilha: valor } } });
    await api.iniciar();
    assert.equal(api.planilhaIdDaPagina(), esperado, valor);
  }
});

test('classificação dos handlers inline cobre os botões do portal', () => {
  const { api } = politica({ resposta: { ok: true, data: { podeVer: true, podeEditar: false } } });
  for (const handler of [
    "salvarEquipamento()", "salvarDevolucao()", "executarAcao('atualizarResp')",
    "executarAcao('importarDados')", "executarReporte('salvar')", "executarQuery()",
    "excluirRegistro('1')", "dispararEmails()", "processarCustom()", "tornarEditavel(this, '1', 'x')",
    "abrirModalEdicao('1')", "abrirModalOperadores()", "gravarItem('x')", "salvarLinha(this, 'a')"
  ]) {
    assert.equal(api.handlerDeEscrita(handler), true, handler);
  }
  for (const handler of [
    "abrirTela('screen-menu')", "filtrarTabela()", "aplicarFiltrosDashboard()",
    "baixarImagem()", "exportarDashboard()", "fecharModal()", "abrirDashboard('daily')",
    "ordenarPor('x', 'asc')", "carregarEquipamentos()", "resetarFiltros()", "welcome()",
    "event.stopPropagation(); ordenarPor('x', 'desc'); fecharFiltro();"
  ]) {
    assert.equal(api.handlerDeEscrita(handler), false, handler);
  }
  assert.equal(api.handlerDeEscrita('funcaoDesconhecida()'), true);
  assert.equal(api.classificarHandler('funcaoDesconhecida()'), 'desconhecido');
  assert.equal(api.classificarHandler('salvarEquipamento()'), 'escrita');
  assert.equal(api.classificarHandler('filtrarTabela()'), 'leitura');
});

test('todo handler inline dos HTMLs tem classificação explícita de leitura ou escrita', () => {
  const { api } = politica({ resposta: { ok: true, data: { podeVer: true, podeEditar: false } } });
  const ignorados = new Set([
    'open', 'close', 'click', 'blur', 'print', 'reload', 'remove',
    'getElementById', 'stopPropagation', 'if', 'event', 'this', 'window', 'document'
  ]);
  const naoClassificados = new Set();
  for (const filename of htmlFiles) {
    for (const script of inlineScripts(read(filename), filename)) {
      for (const node of script.ast.body) {
        void node;
      }
    }
    for (const achado of read(filename).matchAll(/\bon(?:click|change|submit|dblclick)="([^"]*)"/g)) {
      const handler = achado[1].replace(/\$\{[^}]*\}/g, 'VAR');
      for (const chamada of handler.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
        const nome = chamada[1];
        if (ignorados.has(nome)) continue;
        // Só funções de handler (chamada no início ou após ;) precisam de decisão.
        if (!new RegExp(`(^|;)\\s*(?:event\\.stopPropagation\\(\\);?\\s*)?${nome}\\s*\\(`).test(handler)) continue;
        if (api.classificarHandler(`${nome}()`) === 'desconhecido') naoClassificados.add(nome);
      }
    }
  }
  assert.deepEqual([...naoClassificados].sort(), [], 'adicione a função em FUNCOES_LEITURA ou FUNCOES_ESCRITA');
});

test('só as páginas de ferramenta marcam data-exigir-permissoes', () => {
  const servico = new Set(['admin.html', 'portal.html', 'login.html', 'limpar.html', 'diagnostico.html']);
  for (const filename of htmlFiles) {
    const fonte = read(filename);
    const marcada = /n8n-api\.js\?v=\d+" data-exigir-permissoes/.test(fonte);
    assert.equal(marcada, !servico.has(filename), filename);
  }
});

test('login e solicitação de acesso continuam funcionando sem política carregada', async () => {
  const vm = await import('node:vm');
  for (const acao of ['login', 'solicitarAcesso']) {
    const mock = recordingFetch(() => jsonResponse({ ok: true, data: { token: 't' } }));
    // Sem a marca data-exigir-permissoes: é o cenário de login.html.
    const contexto = vm.createContext({
      fetch: mock.fetch, AbortController, setTimeout, clearTimeout,
      document: { currentScript: { hasAttribute: () => false } }
    });
    vm.runInContext(read('assets/js/n8n-api.js'), contexto, { filename: 'n8n-api.js' });
    const resultado = await contexto.PortalN8N.callAPI(acao, { email: 'a@b.com' }, async () => ({ ok: true }));
    assert.ok(resultado, acao);
  }
});

test('página de ferramenta marcada não perde o bloqueio se a política não carregar', async () => {
  const vm = await import('node:vm');
  const mock = recordingFetch(() => jsonResponse({ ok: true }));
  const contexto = vm.createContext({
    fetch: mock.fetch, AbortController, setTimeout, clearTimeout,
    console: { warn() {} },
    document: { currentScript: { hasAttribute: atributo => atributo === 'data-exigir-permissoes' } }
  });
  vm.runInContext(read('assets/js/n8n-api.js'), contexto, { filename: 'n8n-api.js' });
  assert.equal(contexto.PortalPermissoes.podeEditar(), false);
  await assert.rejects(contexto.PortalN8N.callAPI('salvarEdicaoAnalise', {}, () => {}), /somente leitura/);
  assert.equal(mock.calls.length, 0);
});

test('a política é carregada antes do código da página em todas as ferramentas', () => {
  const ferramentas = htmlFiles.filter(nome => !['admin.html', 'portal.html', 'login.html', 'limpar.html', 'diagnostico.html'].includes(nome));
  assert.equal(ferramentas.length, 18);
  for (const filename of ferramentas) {
    const fonte = read(filename);
    const n8n = fonte.search(/<script src="assets\/js\/n8n-api\.js\?v=\d+" data-exigir-permissoes><\/script>/);
    const permissoes = fonte.search(/<script src="assets\/js\/portal-permissoes\.js\?v=\d+"><\/script>/);
    const codigo = fonte.search(/<script>/);
    assert.ok(n8n > -1 && permissoes > n8n && permissoes < codigo, filename);
  }
});

test('o adaptador n8n respeita a política antes de chamar n8n ou Apps Script', async () => {
  const { api } = politica({ resposta: { ok: true, data: { podeVer: true, podeEditar: false } } });
  await api.iniciar();
  const mock = recordingFetch(() => jsonResponse({ success: true }));
  const contexto = createAdapter(mock.fetch);
  // Injeta a política carregada (somente leitura) no mesmo contexto do adaptador.
  const vm = await import('node:vm');
  const unificado = vm.createContext({
    fetch: mock.fetch,
    AbortController,
    setTimeout,
    clearTimeout,
    console: { warn() {}, error() {} },
    PortalPermissoes: api
  });
  vm.runInContext(read('assets/js/n8n-api.js'), unificado, { filename: 'n8n-api.js' });
  let legadoChamado = 0;

  await assert.rejects(
    unificado.PortalN8N.callAPI('salvarEdicaoAnalise', { id: '1' }, () => { legadoChamado += 1; }),
    /somente leitura/i
  );
  await assert.rejects(
    unificado.PortalN8N.callAPI('acaoSemWebhook', {}, () => { legadoChamado += 1; }),
    /somente leitura/i
  );
  assert.equal(mock.calls.length, 0, 'nenhuma requisição deveria sair');
  assert.equal(legadoChamado, 0, 'o fallback do Apps Script não pode ser usado para escrita');

  // Leitura continua liberada no n8n.
  const leitura = await unificado.PortalN8N.callAPI('getDashboardInit', {});
  assert.deepEqual(JSON.parse(JSON.stringify(leitura)), { success: true });
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].url, 'https://portalmeli.app.n8n.cloud/webhook/ler-planilha');
  void contexto;
});

test('o adaptador usa a planilha da página quando configurada', async () => {
  const { api } = politica({
    resposta: { ok: true, data: { podeVer: true, podeEditar: true, planilha: `https://docs.google.com/spreadsheets/d/${PLANILHA_PAGINA}/edit` } }
  });
  await api.iniciar();
  const vm = await import('node:vm');
  const mock = recordingFetch(() => jsonResponse({ ok: true }));
  const contexto = vm.createContext({
    fetch: mock.fetch, AbortController, setTimeout, clearTimeout,
    PortalPermissoes: api
  });
  vm.runInContext(read('assets/js/n8n-api.js'), contexto, { filename: 'n8n-api.js' });
  await contexto.PortalN8N.callAPI('getDashboardInit', {});
  assert.equal(mock.calls[0].body.spreadsheetId, PLANILHA_PAGINA);
});

test('o adaptador mantém o ID de teste quando a página não tem planilha configurada', async () => {
  const { api } = politica({ resposta: { ok: true, data: { podeVer: true, podeEditar: true, planilha: '' } } });
  await api.iniciar();
  const vm = await import('node:vm');
  const mock = recordingFetch(() => jsonResponse({ ok: true }));
  const contexto = vm.createContext({
    fetch: mock.fetch, AbortController, setTimeout, clearTimeout, PortalPermissoes: api
  });
  vm.runInContext(read('assets/js/n8n-api.js'), contexto, { filename: 'n8n-api.js' });
  await contexto.PortalN8N.callAPI('getDashboardInit', {});
  assert.equal(mock.calls[0].body.spreadsheetId, PLANILHA_TESTE);
});

test('nenhuma página de ferramenta envia escrita sem passar pela política', () => {
  const ferramentas = htmlFiles.filter(nome => !['admin.html', 'portal.html', 'login.html', 'limpar.html', 'diagnostico.html'].includes(nome));
  for (const filename of ferramentas) {
    const fonte = read(filename);
    // Cada wrapper precisa delegar ao adaptador compartilhado.
    assert.match(fonte, /PortalN8N\.callAPI\(/, filename);
    // O fetch de reserva não pode ser usado fora do fallback.
    for (const script of inlineScripts(fonte, filename)) {
      walk(script.ast, node => {
        if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier' || node.callee.name !== 'fetch') return;
        const alvo = node.arguments[0];
        if (alvo?.type === 'Identifier' && alvo.name === 'API_URL') {
          assert.fail(`${script.filename}: fetch direto em API_URL fora do adaptador`);
        }
      });
    }
  }
});

test('se o arquivo de permissões não carregar, a página fica em somente leitura (nunca libera escrita)', async () => {
  const vm = await import('node:vm');
  const mock = recordingFetch(() => jsonResponse({ success: true }));
  // Só o adaptador n8n numa página de ferramenta: simula portal-permissoes.js ausente.
  const contexto = vm.createContext({
    fetch: mock.fetch, AbortController, setTimeout, clearTimeout,
    console: { warn() {} },
    document: { currentScript: { hasAttribute: atributo => atributo === 'data-exigir-permissoes' } }
  });
  vm.runInContext(read('assets/js/n8n-api.js'), contexto, { filename: 'n8n-api.js' });
  assert.equal(contexto.PortalPermissoes.carregado(), true);
  assert.equal(contexto.PortalPermissoes.podeEditar(), false);
  assert.equal(contexto.PortalPermissoes.podeExecutarAcao('getDashboardInit'), true);
  assert.throws(() => contexto.PortalPermissoes.podeExecutarAcao('salvarEdicaoAnalise'), /somente leitura/i);

  let legado = 0;
  await assert.rejects(
    contexto.PortalN8N.callAPI('salvarEdicaoAnalise', { id: '1' }, () => { legado += 1; }),
    /somente leitura/i
  );
  await assert.rejects(
    contexto.PortalN8N.callAPI('acaoSemWebhook', {}, () => { legado += 1; }),
    /somente leitura/i
  );
  assert.equal(legado, 0);
  assert.equal(mock.calls.length, 0);
  // Leitura continua funcionando pelo n8n.
  await contexto.PortalN8N.callAPI('getDashboardInit', {});
  assert.equal(mock.calls.length, 1);
});
