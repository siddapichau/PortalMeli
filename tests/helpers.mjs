import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ID_PLANILHA = '1VgC0r0XBoD7MPdKi_eoORX73ETdcndzwpaIHV6Srx9Y';
export const N8N_BASE_URL = 'https://portalmeli.app.n8n.cloud/webhook/';
export const htmlFiles = fs.readdirSync(ROOT).filter(name => name.endsWith('.html')).sort();

export function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

export function inlineScripts(source, filename = 'page.html') {
  const scripts = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for (const match of source.matchAll(pattern)) {
    if (/\bsrc\s*=/i.test(match[1])) continue;
    const type = match[1].match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1];
    if (type && !['text/javascript', 'application/javascript'].includes(type)) continue;
    const line = source.slice(0, match.index).split('\n').length;
    scripts.push({ code: match[2], filename: `${filename}:${line}`, ast: parse(match[2], { ecmaVersion: 'latest', sourceType: 'script' }) });
  }
  return scripts;
}

export function walk(node, visit, parents = []) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node, parents);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue;
    const next = typeof node.type === 'string' ? [...parents, node] : parents;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit, next);
    } else if (value && typeof value === 'object') {
      walk(value, visit, next);
    }
  }
}

export function findFunction(source, name, filename) {
  for (const script of inlineScripts(source, filename)) {
    for (const node of script.ast.body) {
      if (node.type === 'FunctionDeclaration' && node.id.name === name) {
        return script.code.slice(node.start, node.end);
      }
    }
  }
  throw new Error(`Função ${name} não encontrada em ${filename}`);
}

export function legacyUrl(source, filename) {
  for (const script of inlineScripts(source, filename)) {
    for (const node of script.ast.body) {
      if (node.type !== 'VariableDeclaration') continue;
      const declaration = node.declarations.find(item => item.id.name === 'API_URL');
      if (declaration?.init.type === 'Literal') return declaration.init.value;
    }
  }
  throw new Error(`API_URL não encontrada em ${filename}`);
}

/**
 * Carrega o adaptador n8n em um contexto isolado.
 * Por padrão informa uma política que permite edição (`podeEditar`), porque
 * estes testes verificam o contrato de rede do adaptador, não permissões.
 * Passe `permitirEdicao: false` para testar o bloqueio.
 * @param {Function} fetchImpl
 * @param {Object} [timers]
 * @param {{permitirEdicao?: boolean}} [opcoes]
 */
export function createAdapter(fetchImpl, timers = {}, opcoes = {}) {
  const podeEditar = opcoes.permitirEdicao !== false;
  const context = vm.createContext({
    fetch: fetchImpl,
    AbortController,
    setTimeout: timers.setTimeout ?? setTimeout,
    clearTimeout: timers.clearTimeout ?? clearTimeout,
    // Simula a marca `data-exigir-permissoes` da tag <script> (páginas de ferramenta).
    ...(opcoes.semPolitica ? {
      document: { currentScript: { hasAttribute: atributo => atributo === 'data-exigir-permissoes' } },
      console: { warn() {} }
    } : {}),
    ...(opcoes.semPolitica ? {} : {
      PortalPermissoes: {
        podeExecutarAcao: acao => {
          if (podeEditar || /^(get|listar|ler|obter|buscar|verificar|consultar|carregar)/i.test(String(acao || ''))) return true;
          throw new Error('somente leitura (teste)');
        },
        planilhaIdDaPagina: () => ''
      }
    })
  });
  vm.runInContext(read('assets/js/n8n-api.js'), context, { filename: 'n8n-api.js' });
  return context.PortalN8N;
}

/**
 * Carrega a política de permissões em um contexto isolado.
 * Sem `document`/`localStorage`, a auto-inicialização não roda e a política
 * fica "não carregada" (comportamento antigo), o que serve para testar as
 * páginas sem simular a API central.
 */
export function createPermissoes(opcoes = {}) {
  const context = vm.createContext({
    fetch: opcoes.fetch ?? (async () => jsonResponse({})),
    AbortController,
    setTimeout,
    clearTimeout,
    console: { warn() {}, error() {} },
    ...(opcoes.localStorage ? { localStorage: opcoes.localStorage } : {}),
    ...(opcoes.document ? { document: opcoes.document } : {}),
    ...(opcoes.location ? { location: opcoes.location } : {}),
    ...(opcoes.Swal ? { Swal: opcoes.Swal } : {})
  });
  vm.runInContext(read('assets/js/portal-permissoes.js'), context, { filename: 'portal-permissoes.js' });
  return context.PortalPermissoes;
}

export function recordingFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const call = { url: String(url), options, body: options?.body ? JSON.parse(options.body) : undefined };
    calls.push(call);
    return handler(call);
  };
  return { fetch: fetchImpl, calls };
}

export function jsonResponse(data, status = 200) {
  return Response.json(data, { status });
}

export function fakeTimers() {
  let sequence = 0;
  const pending = new Map();
  const cleared = [];
  return {
    setTimeout(callback, delay) {
      const id = ++sequence;
      pending.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      cleared.push(id);
      pending.delete(id);
    },
    fire(id) {
      const timer = pending.get(id);
      if (!timer) throw new Error(`Timer ${id} já foi removido`);
      pending.delete(id);
      timer.callback();
    },
    pending,
    cleared
  };
}
