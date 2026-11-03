#!/usr/bin/env node
/*
 * Verificação real da integração n8n/planilhas do PortalMeli.
 *
 * Diferente dos testes automatizados (que simulam a rede), este script faz
 * requisições de verdade para os webhooks publicados e informa o que está e o
 * que não está conectado.
 *
 * Uso:
 *   npm run verificar:n8n
 *   npm run verificar:n8n -- --planilha=1AbC... --json
 *
 * Códigos de saída:
 *   0  tudo conectado (webhooks respondendo no contrato esperado)
 *   1  alguma rota falhou
 *   2  nenhuma rota publicada (workflow inativo ou path diferente)
 *   3  esta máquina não conseguiu acessar o n8n (rede/TLS local)
 */
import process from 'node:process';

const BASE = process.env.N8N_BASE_URL || 'https://portalmeli.app.n8n.cloud/webhook/';
const PLANILHA = process.env.ID_PLANILHA || '1VgC0r0XBoD7MPdKi_eoORX73ETdcndzwpaIHV6Srx9Y';
const TIMEOUT_MS = Number(process.env.N8N_TIMEOUT_MS || 20000);

const argumentos = process.argv.slice(2);
const somenteJson = argumentos.includes('--json');
const planilha = (argumentos.find(item => item.startsWith('--planilha=')) || '').split('=')[1] || PLANILHA;

const CORES = { ok: '\u001b[32m', erro: '\u001b[31m', aviso: '\u001b[33m', neutro: '\u001b[0m' };
const pintar = (texto, cor) => (process.stdout.isTTY ? `${CORES[cor]}${texto}${CORES.neutro}` : texto);

const rotas = [
  {
    acao: 'getDashboardInit / obterDadosLogisticos',
    endpoint: 'ler-planilha',
    corpo: { spreadsheetId: planilha },
    contrato: dados => {
      if (!dados || typeof dados !== 'object') return 'resposta não é um objeto JSON';
      if (dados.erro) return `a rota respondeu erro: ${dados.erro}`;
      if (!('abas' in dados) && !('dadosCompletos' in dados) && !('dadosDashboard' in dados)) {
        return 'a resposta não contém abas, dadosCompletos ou dadosDashboard';
      }
      return '';
    }
  },
  {
    acao: 'salvarEdicaoAnalise',
    endpoint: 'atualizar-celula',
    corpo: { spreadsheetId: planilha, nomeAba: '', id: '', coluna: '', valor: '' },
    // Envia payload vazio de propósito: valida que a rota existe e responde JSON,
    // sem gravar nada na planilha.
    contrato: dados => {
      if (!dados || typeof dados !== 'object') return 'resposta não é um objeto JSON';
      if (dados.success === true) return '';
      if (dados.erro) return `rejeitou o payload vazio (esperado): ${dados.erro}`;
      return 'resposta sem success=true e sem campo erro';
    },
    tolerante: true
  }
];

async function chamar(endpoint, corpo) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const inicio = Date.now();
  try {
    const resposta = await fetch(BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: controller.signal
    });
    const texto = await resposta.text();
    let dados = null;
    try { dados = JSON.parse(texto); } catch { dados = null; }
    return {
      status: resposta.status,
      ms: Date.now() - inicio,
      json: dados,
      texto: texto.slice(0, 400),
      cors: resposta.headers.get('access-control-allow-origin')
    };
  } catch (erro) {
    return { erro: erro.name === 'AbortError' ? `timeout de ${TIMEOUT_MS} ms` : erro.message, ms: Date.now() - inicio };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Quando o POST falha por rede/TLS, faz uma última tentativa via GET.
 * Um 404 do próprio n8n ("webhook not registered") prova que a rede funciona
 * e que o path não está publicado — sem precisar de acesso de escrita.
 * @param {string} endpoint
 * @returns {Promise<{status: number, texto: string}|null>}
 */
async function diagnosticoPorGet(endpoint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(BASE + endpoint, { method: 'GET', signal: controller.signal });
    return { status: resposta.status, texto: (await resposta.text()).slice(0, 400) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function classificar(resultado, rota) {
  if (resultado.erro) {
    // Falha local de rede/TLS não diz nada sobre o workflow: pode ser proxy,
    // firewall da máquina ou DNS. Só um HTTP real prova se a rota existe.
    const local = /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|SSL|TLS|certificate/i.test(resultado.erro);
    return local
      ? { estado: 'rede', detalhe: `${resultado.erro} — esta máquina não conseguiu falar com o n8n; o estado do workflow não foi verificado` }
      : { estado: 'erro', detalhe: resultado.erro };
  }
  if (resultado.status === 404) {
    let dica = resultado.texto;
    try {
      const corpo = JSON.parse(resultado.texto);
      if (corpo.message) dica = corpo.message;
    } catch { /* mantém o texto bruto */ }
    return { estado: 'ausente', detalhe: `HTTP 404 — ${dica}` };
  }
  if (resultado.status >= 500) return { estado: 'erro', detalhe: `HTTP ${resultado.status} — ${resultado.texto}` };
  if (!resultado.json) return { estado: 'erro', detalhe: `HTTP ${resultado.status} sem JSON: ${resultado.texto}` };
  const problema = rota.contrato(resultado.json);
  if (!problema) return { estado: 'ok', detalhe: `HTTP ${resultado.status} em ${resultado.ms} ms` };
  return { estado: rota.tolerante ? 'aviso' : 'erro', detalhe: `${problema} (HTTP ${resultado.status}, ${resultado.ms} ms)` };
}

async function verificarRota(rota) {
  let bruto = await chamar(rota.endpoint, rota.corpo);
  let resultado = classificar(bruto, rota);
  if (resultado.estado === 'rede') {
    const diagnostico = await diagnosticoPorGet(rota.endpoint);
    if (diagnostico) {
      bruto = { ...bruto, getStatus: diagnostico.status, getTexto: diagnostico.texto };
      resultado = classificar(diagnostico, rota);
      if (resultado.estado === 'ok' || resultado.estado === 'aviso') {
        resultado = { estado: 'aviso', detalhe: `o path responde a GET (HTTP ${diagnostico.status}), mas o POST falhou por rede/TLS nesta máquina` };
      }
    }
  }
  return { ...rota, bruto, ...resultado };
}

const resultados = [];
for (const rota of rotas) {
  resultados.push(await verificarRota(rota));
}

const publicadas = resultados.filter(item => ['ok', 'aviso'].includes(item.estado)).length;
const falhaDeRede = resultados.filter(item => item.estado === 'rede').length;
const ausentes = resultados.filter(item => item.estado === 'ausente').length;

if (somenteJson) {
  console.log(JSON.stringify({
    base: BASE,
    planilha,
    publicadas,
    total: resultados.length,
    rotas: resultados.map(({ endpoint, acao, estado, detalhe, bruto }) => ({
      endpoint, acao, estado, detalhe,
      status: bruto.status ?? null,
      cors: bruto.cors ?? null
    }))
  }, null, 2));
} else {
  console.log(`\nVerificação n8n — ${BASE}`);
  console.log(`Planilha enviada: ${planilha}\n`);
  for (const item of resultados) {
    const cor = item.estado === 'ok' ? 'ok' : item.estado === 'aviso' ? 'aviso' : 'erro';
    const etiqueta = {
      ok: 'CONECTADO', ausente: 'NÃO PUBLICADO', aviso: 'ATENÇÃO',
      erro: 'FALHOU', rede: 'SEM ACESSO AQUI'
    }[item.estado];
    console.log(`${pintar(etiqueta.padEnd(16), cor)} ${item.endpoint}  (${item.acao})`);
    console.log(`                 ${item.detalhe}`);
    if (item.bruto.cors) console.log(`                 CORS: ${item.bruto.cors}`);
    console.log('');
  }
  if (falhaDeRede === resultados.length) {
    console.log(pintar('Esta máquina não conseguiu acessar o n8n. Rode o script em um computador com internet liberada para saber o estado real das rotas.', 'aviso'));
  } else if (publicadas === 0 && ausentes > 0) {
    console.log(pintar('Nenhum webhook publicado: ative o workflow no n8n (toggle "Active") e confirme os paths ler-planilha e atualizar-celula.', 'erro'));
  } else if (ausentes > 0) {
    console.log(pintar('Integração parcial: falta publicar as rotas marcadas como NÃO PUBLICADO.', 'aviso'));
  } else if (publicadas === resultados.length) {
    console.log(pintar('Integração n8n respondendo nas rotas verificadas.', 'ok'));
  }
  console.log('\nEste script não grava dados: a rota de escrita é chamada com payload vazio de propósito.');
  console.log('Contrato completo: docs/INTEGRACAO_N8N.md\n');
}

if (falhaDeRede === resultados.length) process.exitCode = 3;
else if (publicadas === 0) process.exitCode = 2;
else if (resultados.some(item => ['erro', 'ausente'].includes(item.estado))) process.exitCode = 1;
else process.exitCode = 0;
