# Integração de teste com n8n

## Estado desta entrega

Os **22 HTMLs** carregam `assets/js/n8n-api.js?v=1` antes do JavaScript da página.
O arquivo centraliza a configuração e evita copiar a mesma função para cada tela.

- Planilha de teste confirmada: `1VgC0r0XBoD7MPdKi_eoORX73ETdcndzwpaIHV6Srx9Y` (44 caracteres).
- Base n8n: `https://portalmeli.app.n8n.cloud/webhook/`
- O ID de 43 caracteres enviado inicialmente na conversa **não** foi usado; o usuário confirmou o ID já registrado na continuidade e no botão Planilha do `pokainventario.html`.
- Nenhuma credencial, token ou senha foi adicionado ao arquivo compartilhado.
- Nenhuma chamada real ao n8n ou à planilha foi executada durante a validação local.

## Rotas implementadas

| Ação antiga | Webhook POST | Corpo enviado |
|---|---|---|
| `getDashboardInit` | `ler-planilha` | `{ spreadsheetId }` + campos do payload |
| `obterDadosLogisticos` | `ler-planilha` | `{ spreadsheetId, nomeAba, ... }` |
| `salvarEdicaoAnalise` | `atualizar-celula` | `{ spreadsheetId, id, coluna, valor, nomeAba }` |
| `salvarUsuario` | `adicionar-linha` | `{ spreadsheetId, ...campos do usuário }` |

O corpo é **plano**: o adaptador não envia `{ action, payload }` para o n8n.
O `spreadsheetId` configurado sempre prevalece sobre um eventual campo de mesmo nome no payload.

`salvarUsuario` está mapeado porque foi informado no exemplo, mas **nenhum HTML atual chama essa ação**.
Não use `adicionar-linha` como fluxo de autenticação nem envie senhas em texto puro para a planilha.
Login, solicitação de acesso, permissões, favoritos e administração continuam no Apps Script atual.

## Fallback e erros

- **Ação sem webhook:** usa a chamada original do Apps Script, preservando URL, headers, token, timeout e formato `action/payload` ou `action ...payload` daquela página.
- **Ação com webhook:** usa somente o n8n.
- **Falha/timeout/HTTP de erro no n8n:** mostra erro e **não** repete a operação no Apps Script. Isso evita gravar duas vezes quando o webhook concluiu a operação mas a resposta falhou.
- Timeout do n8n: 45 segundos, com `AbortController`.
- Resposta inválida ou HTML no lugar de JSON: erro explícito.
- Os loaders e o parâmetro `showLoader` dos adaptadores existentes foram preservados.

## Contrato de resposta esperado pelo n8n

O adaptador devolve o JSON recebido **sem renomear campos**. O workflow precisa responder no formato que a tela já espera; não basta devolver as linhas cruas do Google Sheets se a tela espera campos calculados.

### `ler-planilha`

Usado por `dashboard.html`, `analise.html` e `a1.html`.

Campos consumidos pelas telas, conforme o caso:

- `abaAtiva`
- `abas`
- `dadosCompletos` e/ou `dadosDashboard`
- `avisos` (opcional)
- `colunasAusentes` (opcional)
- `cache` para a ação antiga `carregarBackground`, que ainda fica no Apps Script

Exemplo mínimo para leitura:

```json
{
  "abaAtiva": "Base Teste",
  "abas": ["Base Teste"],
  "dadosCompletos": [],
  "dadosDashboard": []
}
```

Para dados reais, cada linha deve manter os campos/IDs que a tela usa, por exemplo `_idNum` no A1 e os campos calculados do dashboard (`id`, `desc`, `resp`, `statusInv`, `subStatus`, `ultMov`, `aging`, `valorNum`).

### `atualizar-celula`

Recebe `id`, `coluna`, `valor`, `nomeAba` e `spreadsheetId`.
Responda sucesso com JSON, por exemplo:

```json
{ "success": true }
```

Em erro de negócio, use HTTP 4xx/5xx **ou** o campo esperado pelas telas:

```json
{ "erro": "Linha não encontrada na aba informada." }
```

Não responda apenas `{ "success": false }`: parte das telas atuais verifica `erro`, não `success`.

### `adicionar-linha`

Rota reservada para o exemplo `salvarUsuario`. Ainda não há tela chamando essa ação.
Defina e documente o contrato antes de ligá-la a um fluxo real.

## Configuração necessária no n8n

1. Criar/publicar os webhooks POST com os paths exatos: `ler-planilha`, `atualizar-celula`, `adicionar-linha`.
2. Configurar o nó de resposta para devolver **JSON** no contrato acima.
3. Permitir CORS para a origem do portal de teste e para o header `Content-Type`; responder ao preflight `OPTIONS`.
4. Confirmar que a credencial do Google Sheets no n8n acessa somente a planilha de teste.
5. Validar autorização no backend. O ID da planilha e a URL do webhook são identificadores públicos no frontend, não mecanismos de autenticação.

## Publicação dos arquivos

Ao subir para o servidor de teste, enviar **os 22 HTMLs e a pasta `assets/`**.
Se apenas os HTMLs forem enviados, as páginas não encontrarão `PortalN8N`.

Ao alterar `assets/js/n8n-api.js`, alterar também o parâmetro de versão `?v=1` nos HTMLs ou invalidar o cache do servidor/CDN.

## Como testar localmente

Requisito: Node.js 22.17 ou superior.

```bash
npm ci
npm run lint
npm test
npm run test:browser
# ou tudo:
npm run check

# preview estático local:
npm start
```

`npm start` abre o servidor em `0.0.0.0:3000` e redireciona `/` para `/login.html`.
Ele não faz proxy nem chama webhooks durante a inicialização. As chamadas de API acontecem somente quando o usuário usa uma tela.

Os testes automatizados interceptam a rede e usam respostas simuladas. Eles não validam a implantação real do n8n, CORS do seu domínio, permissões da credencial Google nem o conteúdo da planilha.

## Roteiro de teste real no domínio de teste

1. Publicar HTMLs + `assets/` e confirmar nos DevTools que `n8n-api.js?v=1` carregou com HTTP 200.
2. Abrir `dashboard.html`, `analise.html` ou `a1.html`.
3. Na aba Network, conferir POST para `.../webhook/ler-planilha` com `spreadsheetId` correto.
4. Conferir que a tabela/carregamento usa os dados retornados pelo n8n.
5. No A1, editar um campo de uma linha de teste e conferir POST para `.../webhook/atualizar-celula`.
6. Confirmar a alteração somente na cópia de teste da planilha.
7. Simular webhook indisponível/404/CORS e conferir mensagem de erro, loader liberado e nenhuma segunda gravação no Apps Script.
8. Conferir que login/solicitação de acesso continuam indo ao Apps Script e não ao n8n.

## Limitações conhecidas

- A migração antiga para `obterConfigPagina`/permissões dinâmicas continua pendente; esta entrega não a conclui.
- Ações ainda sem webhook continuam apontando para os Apps Scripts anteriores. Antes de testar escritas, garantir que esses endpoints também são de teste.
- Os problemas históricos de segurança listados em `PROMPT_ANALISE_ERROS_BUGS.md` não foram todos resolvidos nesta tarefa.
- Não foi feito deploy no site do usuário nem alteração direta em planilhas ou workflows n8n.
