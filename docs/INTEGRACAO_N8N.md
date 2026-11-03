# Integração com n8n — estado verificado

## Resposta curta

**O n8n não estava 100% conectado.** Em 2026-11-03 a verificação real mostrou que
os dois webhooks usados pelas planilhas respondem **404 "webhook not registered"**:

```json
{"code":404,"message":"The requested webhook \"GET ler-planilha\" is not registered.",
 "hint":"The workflow must be active for a production URL to run successfully."}
```

O mesmo aconteceu em `atualizar-celula`. O host `portalmeli.app.n8n.cloud` está no
ar (`/healthz` responde `{"status":"ok"}`), mas **nenhum workflow com esses paths
está ativo/publicado**. Sem isso, toda tela que lê ou grava planilha pelo n8n
mostrava erro.

Foi verificado também que o n8n **não tem** nenhuma rota de login, senha,
permissão ou administração — o que é intencional (ver "O que não vai para o n8n").

## O que foi entregue para resolver

| Item | Arquivo | Situação |
|---|---|---|
| Verificar a conexão de verdade | `scripts/verificar-n8n.mjs` (`npm run verificar:n8n`) | pronto |
| Verificar pelo navegador | `diagnostico.html` | pronto |
| Workflow pronto para importar | `docs/n8n/workflow-planilhas.json` | pronto (falta importar/ativar no n8n) |
| Adaptador das planilhas | `assets/js/n8n-api.js` | pronto |
| Permissões ver/editar | `assets/js/portal-permissoes.js` | pronto |

> **Pendência que só você pode fazer:** importar
> `docs/n8n/workflow-planilhas.json` no n8n, ligar a credencial do Google Sheets
> e ativar o workflow. Depois rodar `npm run verificar:n8n` ou abrir
> `diagnostico.html` e confirmar os dois "CONECTADO".

## Rotas e o que cada tela usa

| Ação da tela | Webhook POST | Corpo enviado |
|---|---|---|
| `getDashboardInit` | `ler-planilha` | `{ spreadsheetId, ...payload }` |
| `obterDadosLogisticos` | `ler-planilha` | `{ spreadsheetId, nomeAba, ... }` |
| `salvarEdicaoAnalise` | `atualizar-celula` | `{ spreadsheetId, id, coluna, valor, nomeAba }` |
| `salvarUsuario` | `adicionar-linha` | reservado — nenhuma tela usa hoje |

Telas que leem pelo n8n: `dashboard.html`, `analise.html`, `a1.html`.
Tela que grava pelo n8n: `a1.html` (duplo clique na linha).

### Planilhas usadas

O adaptador usa, nesta ordem:

1. A coluna **Planilha** da aba `Paginas` (aceita ID puro ou a URL do Google Sheets),
   configurada no painel administrativo → aba "Páginas".
2. Se a página não tiver planilha configurada, o ID de teste
   `1VgC0r0XBoD7MPdKi_eoORX73ETdcndzwpaIHV6Srx9Y`.

O `spreadsheetId` do corpo sempre prevalece sobre o valor enviado pela tela;
uma página não consegue redirecionar a gravação para outra planilha.

### API de cada página

A coluna **API** da aba `Paginas` prevalece sobre a URL fixa no HTML. O portal
repassa essa URL no `localStorage` (`apiUrl`) ao abrir a página, então a troca
pode ser feita só pelo admin, sem editar HTML.

## Contrato de resposta

O adaptador devolve o JSON recebido **sem renomear campos**. O workflow precisa
responder no formato que a tela já espera.

### `ler-planilha`

Campos consumidos: `abaAtiva`, `abas`, `dadosCompletos` e/ou `dadosDashboard`,
`avisos` (opcional), `colunasAusentes` (opcional).

```json
{
  "abaAtiva": "Base Teste",
  "abas": ["Base Teste"],
  "dadosCompletos": [],
  "dadosDashboard": []
}
```

Cada linha deve manter os campos que a tela usa: `_idNum` no A1 e os campos
calculados do dashboard (`id`, `desc`, `resp`, `statusInv`, `subStatus`,
`ultMov`, `aging`, `valorNum`).

### `atualizar-celula`

Sucesso:

```json
{ "success": true }
```

Erro de negócio (HTTP 4xx/5xx **ou** campo `erro`):

```json
{ "erro": "Linha não encontrada na aba informada." }
```

Não responda apenas `{"success": false}`: parte das telas verifica `erro`.

## Erros, timeout e fallback

- **Ação com webhook:** usa somente o n8n.
- **Ação sem webhook:** usa a chamada original do Apps Script daquela página.
- **Falha/timeout/HTTP de erro no n8n:** mostra erro e **não** repete no Apps
  Script — o webhook pode ter concluído a operação mesmo sem responder.
- Timeout do n8n: 45 segundos (`AbortController`).
- Resposta HTML no lugar de JSON: erro explícito.

## Configuração necessária no n8n

1. Importar `docs/n8n/workflow-planilhas.json` (Workflows → Import from File).
2. Abrir o nó **Google Sheets (abas)** e selecionar a credencial que acessa a
   planilha de teste.
3. Confirmar os paths exatos: `ler-planilha` e `atualizar-celula`.
4. Ligar o workflow (**Active**) — URL de teste `/webhook-test/` não serve.
5. Permitir CORS para a origem do portal e para o header `Content-Type`,
   respondendo ao preflight `OPTIONS`.

O workflow importado já entrega o esqueleto com webhook + resposta JSON e um
nó Google Sheets que lista as abas. A leitura das linhas de cada aba precisa ser
ligada ao nó `Montar resposta ler-planilha` conforme as colunas reais — o
workflow traz um aviso explícito no campo `avisos` enquanto isso não for feito.

## O que **não** vai para o n8n

Login, senha, solicitação de acesso, token de sessão, permissões e administração
continuam no Apps Script atual. O n8n só vê `spreadsheetId` e os dados da
planilha operacional. Não envie senhas para `adicionar-linha`.

## Como testar

```bash
npm ci
npm run check          # lint + sintaxe + 55 testes + 12 testes de navegador
npm run verificar:n8n  # consulta os webhooks reais do n8n
```

`npm run verificar:n8n` devolve:

| Código | Significado |
|---|---|
| 0 | todos os webhooks conectados |
| 1 | alguma rota falhou |
| 2 | nenhuma rota publicada (workflow inativo) |
| 3 | esta máquina não alcançou o n8n (rede/TLS local) |

Pelo navegador, abra `diagnostico.html` publicado junto com o portal — é o mesmo
teste, com o resultado na tela.

## Roteiro de teste no domínio

1. Publicar os HTMLs **e** a pasta `assets/`.
2. Abrir `diagnostico.html` e confirmar `CONECTADO` nas duas rotas.
3. Abrir `dashboard.html`, `analise.html` e `a1.html` e conferir, na aba Network,
   POST para `.../webhook/ler-planilha` com o `spreadsheetId` correto.
4. No A1, com um usuário que tenha permissão de edição, alterar um campo de uma
   linha de teste e conferir POST para `.../webhook/atualizar-celula`.
5. Confirmar a alteração somente na cópia de teste da planilha.
6. Simular webhook indisponível/404/CORS e conferir a mensagem de erro, o loader
   liberado e nenhuma segunda gravação no Apps Script.
7. Confirmar que login/solicitação de acesso continuam indo ao Apps Script.

## Limitações conhecidas

- Os testes automatizados usam rede simulada: não provam CORS do seu domínio nem
  permissões da credencial Google.
- O workflow de exemplo lê as abas, mas a leitura das linhas precisa ser ligada
  às colunas reais de cada tela.
- `adicionar-linha` está reservado e sem uso.
- A validação de permissão dentro das APIs individuais de cada página (Apps
  Scripts separados) continua sendo um passo futuro; ver
  `docs/PERMISSOES_VER_EDITAR.md`.
