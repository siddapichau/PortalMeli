# Continuidade do Projeto — Portal de Controles Internos

> **Leia este arquivo por completo antes de fazer qualquer alteração.**
> Ele é a "memória" entre conversas/chats diferentes. Sempre que um chat novo
> continuar este trabalho, ele deve: (1) ler este arquivo, (2) seguir as regras
> abaixo, (3) executar o próximo lote da fila, (4) **atualizar este arquivo**
> com o que foi feito e qual é o próximo lote, (5) abrir/atualizar o Pull
> Request e mandar o link pro usuário.

---

## 1. O que é este projeto

O "Portal de Controles Internos" é um conjunto de páginas HTML estáticas
(`portal.html`, `login.html`, `admin.html` + ~19 páginas de ferramentas como
`avarias.html`, `aduanas.html`, `pokayoke.html`, etc.) que conversam com um
backend em **Google Apps Script** (`apps-script.gs`, na raiz do repo) ligado a
uma planilha Google Sheets central chamada **"Permissoes"** (abas: Usuarios,
Paginas, Menus, Permissoes, Solicitacoes, Configuracoes, Historico, Sessoes).

Hoje (estado antigo) cada página HTML tem o `API_URL` do Apps Script
**fixo/hardcoded** dentro do próprio `<script>`. Várias páginas também têm o
link da planilha de dados fixo num botão "Planilha".

## 2. Objetivo deste projeto (o que o usuário pediu)

1. **Ambiente de teste isolado**: nunca mexer nas planilhas/API de produção.
   Sempre trabalhar em cópias ("planilhas de teste") até tudo estar validado.
2. Centralizar, na aba **Paginas** da planilha "Permissoes", para cada página:
   - `Arquivo` (já existia) — nome do arquivo HTML.
   - `API` (nova) — URL do Apps Script `.../exec` daquela página.
   - `Planilha` (nova) — link do Google Sheets de dados daquela página.
   - **O usuário vai preencher essas duas colunas manualmente** pelo painel
     admin (não é pra gente adivinhar/auto-preencher esses links).
3. No `admin.html`, aba "Páginas e organização do menu", o formulário de
   criar/editar página agora tem os campos **API** e **Planilha** (feito —
   ver seção 4).
4. Cada página HTML (`avarias.html`, `aduanas.html`, etc.) deve, no futuro,
   **parar de ter o `API_URL` fixo no código** e em vez disso:
   - Verificar se existe uma sessão válida (token) salva no `localStorage`
     (do jeito que `login.html`/`portal.html` já fazem hoje).
   - Se não tiver sessão válida → redirecionar para `login.html`.
   - Chamar a ação nova do backend `obterConfigPagina` passando
     `{ token, arquivo: "avarias.html" }` (ver seção 4) para descobrir:
     `api` (endpoint a usar), `planilha` (link do botão "Planilha"),
     `podeVer` e `podeEditar`.
   - Se `podeVer` for `false` → bloquear o acesso (mensagem + redirecionar).
   - Se `podeEditar` for `false` → a página deve funcionar em **modo somente
     leitura**: desabilitar botões de salvar/editar/excluir/importar, mas
     deixar visualizar os dados normalmente.
   - **Importante (regra de segurança)**: a filtragem de view/edit no
     back-end (`obterConfigPagina`) é a fonte da verdade. O bloqueio no HTML
     é só para UX — não é a única proteção. Se uma ação de escrita existir na
     própria API da página (fora do `apps-script.gs` central), o ideal a
     médio prazo é essa API de dados também aceitar/validar o token central,
     mas isso é um passo futuro, não travar a entrega atual por causa disso.
5. Fazer essa migração **3 arquivos HTML por vez**, em lotes, para não
   sobrecarregar o chat. Cada lote = 1 conversa/execução.

## 3. Regras inegociáveis (NÃO QUEBRAR O QUE JÁ FUNCIONA)

- **Nunca editar a planilha de produção** (`1CZyuYHPbRQLlIXyqe7XjYdXkIG7RqLtpHAKLhCc3HzU`,
  a "Permissoes" original) nem os deployments de API de produção. Sempre usar
  as cópias de teste.
- Antes de editar qualquer HTML, **ler o arquivo inteiro primeiro** e manter
  tudo que já funciona (não remover funções, não mudar nomes de variáveis
  usadas em outros lugares, não mudar o comportamento visual existente).
- Ao mexer no `apps-script.gs`: só **adicionar** (novas colunas, novos
  campos, novas ações). Nunca remover/alterar uma função já existente, nem
  mudar a assinatura ou o retorno de uma ação já usada pelo front-end atual.
  Qualquer mudança incompatível quebra as páginas que ainda não migraram.
- A migração de cada página precisa de **fallback seguro**: se a chamada
  `obterConfigPagina` falhar (ação ainda não implantada, erro de rede, etc.),
  a página deve continuar funcionando com o `API_URL` antigo (hardcoded) como
  reserva — nunca travar a página por causa da parte nova.
- Sempre validar sintaticamente o `apps-script.gs` depois de editar
  (`node -e "new Function(require('fs').readFileSync('apps-script.gs','utf8'))"`).
- Nunca commitar pastas de export temporárias (`google_drive/`, etc.) — já
  estão sendo limpas manualmente a cada sessão; confirmar com `git status`
  antes de finalizar.
- Ao final de cada lote: abrir/atualizar o Pull Request desta branch pra
  `main` e mandar o link pro usuário (não fazer merge sozinho).
- Cada sessão usa a branch informada pelo Arena. Nesta sessão (2026-11-03): `arena/0620b4d2-portalmeli`. As branches citadas em logs antigos são histórico, não a branch atual.

## 4. O que já foi feito (histórico)

### Planilhas de teste criadas no Drive (cópias, nunca a de produção)
| Página | Planilha de teste (cópia) |
|---|---|
| aduanas.html | `1yBxgeYEg0TmjllUoNa_Ylma1Qwme8oEFH5rzJnu4yAE` |
| agingdevolucao.html | `132aUjzis3jd0qmaNpk5dcKN0iAy_2DeBjhJByCxfzaA` |
| analisedeslocados.html | `1U-eNTMcxwd5z3u1RnDa1mS46pzbn9wh6YRApAXhkByg` |
| ativosbpp.html | `1co3KfvzbAc_Jdt5lf7D_optZWlG8EPYxIsLKk4Q9rOk` |
| avarias.html | `1ctX1XoTa3kAxflM6iv9jLIYEDIDNhdVylbn8f6XWzJE` |
| fazerdevolucao.html | `13qboTxcHjIglFIcqK9_5pbBJTjEJdiBtWZIIYi_aPXw` |
| missorted.html | `1YmopmvpSeHcuaI98knJLm8CXlUBXN7TKDrnRbw-dc90` |
| pokainventario.html | `1VgC0r0XBoD7MPdKi_eoORX73ETdcndzwpaIHV6Srx9Y` |
| pokayoke.html | `1pfq0sgCkbgqLrqNfBBpg8lgmQE1NLCZ4foSye7a0qGQ` |
| semidciclos2.html | `1gWE-v4Nvv85b5FafiNe-YJ7gQQ0HTUg7E-2_kPb0zYc` |

Nos 10 HTMLs acima, o botão "Planilha" já aponta pra essas cópias (feito).
O `API_URL` de cada um **ainda é o antigo** (o usuário vai trocar manualmente
pela aba Paginas do admin quando reimplantar cada Apps Script individual).

### Planilha central "Permissoes" (teste)
- Cópia criada: `1Sicp6HLQCvmFZVkCSGEqJu6z65L47vovkXpWm2hr7EY` (nome no Drive:
  **"Permissoes"** — o usuário removeu o prefixo "COPIA").
- 8 abas intactas (Usuarios, Menus, Historico, Solicitacoes, Paginas,
  Permissoes, Configuracoes, Sessoes) com os dados reais copiados (ex.: 2
  usuários cadastrados).
- Aba **Paginas**: colunas novas `API` e `Planilha` adicionadas e
  pré-preenchidas com os valores conhecidos até aqui (o usuário disse que vai
  apagar e preencher manualmente pelo painel admin — não insistir em manter
  esses valores “default”).
- `login.html`, `admin.html`, `portal.html` já apontam pro novo endpoint de
  API dessa planilha de teste:
  `https://script.google.com/macros/s/AKfycbxPQh9gT-5wKsMNQQzD7qupZXxMrltanLSAiC6pl95Td2bWyqxUL2UW_OE9l5LYGsB9/exec`

### `apps-script.gs` (adicionado ao repositório, raiz)
Código completo do backend, igual ao que o usuário tem hoje implantado, **mais**:
- `PORTAL.SHEETS.Paginas` ganhou `"API"` e `"Planilha"` no fim do array de colunas.
- `safePage_()` agora devolve também `api` e `planilha`.
- `savePage_()` agora aceita, valida (precisa começar com `http(s)://` se
  preenchido) e salva `api` e `planilha`.
- Nova ação **`obterConfigPagina`** → função `getPageConfig_(input)`.
  Recebe `{ token, arquivo }`, devolve
  `{ ok, data: { id, nome, arquivo, api, planilha, podeVer, podeEditar } }`
  respeitando permissão (admin vê tudo; usuário comum depende da aba
  Permissoes) igual à lógica já usada em `listPages_`.
- Nenhuma função antiga foi removida ou teve o comportamento alterado.
- **Pendência do usuário**: colar esse `apps-script.gs` atualizado no editor
  Apps Script do projeto ligado à planilha "Permissoes" de teste e
  reimplantar (sem trocar a URL `.../exec`, só "Gerenciar implantações" →
  nova versão), do jeito que o `README.md` já explica na seção "Atualização
  sem trocar a URL da API".

### `admin.html`
- Aba "Páginas e organização do menu" → modal de criar/editar página agora
  tem dois campos novos: **"API da página (Apps Script /exec)"** e
  **"Planilha da página (Google Sheets)"**, usando o mesmo padrão
  `data-field` que os outros campos (preenchimento automático ao editar).
- O payload de `salvarPagina` agora envia `api` e `planilha`.

## 5. Fila de migração das páginas (3 por lote)

Cada lote = migrar 3 páginas HTML para o padrão novo descrito na seção 2,
item 4 (ler config dinâmica + respeitar login/permissão, com fallback pro
`API_URL` antigo). Marcar com `[x]` quando concluído e revisado.

- [ ] **Lote 1**: `aduanas.html`, `agingdevolucao.html`, `analisedeslocados.html`
- [ ] **Lote 2**: `ativosbpp.html`, `avarias.html`, `fazerdevolucao.html`
- [ ] **Lote 3**: `missorted.html`, `pokainventario.html`, `pokayoke.html`
- [ ] **Lote 4**: `semidciclos2.html`, `bpp2026.html`, `dashboard.html`
- [ ] **Lote 5**: `a1.html`, `painelemail.html`, `analise.html`
- [ ] **Lote 6**: `biparinventario.html`, `equipamentos.html`, `semidciclos.html`
- [ ] **Revisão final**: `portal.html`, `login.html`, `admin.html` (já usam a
      API central; revisar se precisam de algum ajuste fino depois que todas
      as páginas de ferramentas estiverem migradas)

> **Estado da fila:** a **política** de `obterConfigPagina` + bloqueio por permissão
> + modo somente leitura foi implementada de forma transversal em 2026-11-03
> (seção 9), cobrindo as 18 páginas de ferramenta de uma vez, com testes.
> O que **ainda falta** nessa fila é apenas a troca definitiva do `API_URL`
> hardcoded dentro de cada página por um valor 100% vindo da aba Paginas:
> hoje a coluna `API` já prevalece em tempo de execução, mas o HTML ainda guarda
> a URL antiga como reserva (fallback). Migrar os lotes 1–6 agora significa
> **remover esse fallback** depois que cada Apps Script individual estiver
> reimplantado. Não é urgente e não bloqueia nada.

## 6. Como um novo chat deve continuar este trabalho

1. Ler este arquivo inteiro.
2. Confirmar com o usuário se o `apps-script.gs` já foi colado/reimplantado
   no projeto de teste (se ainda não foi, perguntar antes de assumir que
   `obterConfigPagina` já existe no servidor).
3. Pegar o próximo lote não marcado na fila da seção 5.
4. Para cada um dos 3 arquivos do lote, aplicar o padrão da seção 2 (item 4)
   com fallback seguro.
5. Testar mentalmente / revisar o diff de cada arquivo antes de seguir pro
   próximo.
6. Marcar o lote como `[x]` nesta seção e atualizar a seção 7 (log) com data
   e resumo do que mudou.
7. Rodar `git status` pra garantir que não sobrou lixo (ex.: pasta
   `google_drive/`).
8. Commitar e dar push somente para a branch atual da sessão informada pelo Arena.
9. Abrir ou atualizar o Pull Request dessa branch para `main` e mandar o link
   pro usuário. Não fazer merge sem aprovação.

## 7. Log de sessões

- **2026-11-02** — Sessão de setup: criadas as 10 planilhas de teste +
  cópia da planilha "Permissoes"; `login.html`/`admin.html`/`portal.html`
  apontados pro novo endpoint de teste; `apps-script.gs` adicionado ao repo
  com a ação `obterConfigPagina` e os campos `api`/`planilha`; `admin.html`
  ganhou os campos de API/Planilha no formulário de página; este arquivo de
  continuidade criado. **Nenhuma página de ferramenta (lote 1–6) foi migrada
  ainda.**
- **2026-11-03** — Integração de teste n8n: criado `assets/js/n8n-api.js` e
  incluído nos 22 HTMLs; 18 wrappers operacionais + portal/admin/login usam o
  adaptador; somente as 4 ações com webhook definido vão ao n8n, demais mantêm
  Apps Script; adicionados testes, servidor estático, guia e CI. ID da planilha
  confirmado com o usuário: `1VgC0r0XBoD7MPdKi_eoORX73ETdcndzwpaIHV6Srx9Y`.
  Validação local com rede simulada passou; integração real n8n/CORS pendente.
  A fila de migração dinâmica da seção 5 continua pendente.
- **2026-11-03 (sessão 2)** — Diagnóstico real do n8n + permissões ver/editar:
  consulta real aos webhooks mostrou **404 "not registered"** em `ler-planilha`
  e `atualizar-celula` (host no ar, workflow inativo/ausente). Criados
  `scripts/verificar-n8n.mjs` (`npm run verificar:n8n`), `diagnostico.html` e
  `docs/n8n/workflow-planilhas.json` para fechar essa lacuna. Implementada a
  política de permissões (`assets/js/portal-permissoes.js`) nas 18 páginas de
  ferramenta, com bloqueio de escrita antes de qualquer rede, bloqueio total sem
  `podeVer` e falha fechada. Detalhes na seção 9.

## 8. Integração n8n adicionada em 2026-11-03

- Arquivo único: `assets/js/n8n-api.js`, carregado nos 22 HTMLs como
  `assets/js/n8n-api.js?v=1` antes do script inline da página.
- Configuração: `ID_PLANILHA` de teste confirmado (44 caracteres) e
  `N8N_BASE_URL = https://portalmeli.app.n8n.cloud/webhook/`.
- Rotas: `getDashboardInit`/`obterDadosLogisticos` → `ler-planilha`;
  `salvarEdicaoAnalise` → `atualizar-celula`; `salvarUsuario` →
  `adicionar-linha` (reservada; nenhum HTML atual a chama).
- Payload n8n é plano e recebe `spreadsheetId` automaticamente. O contrato de
  resposta das telas foi preservado; o n8n precisa devolver os campos esperados.
- Ações sem webhook usam o fallback original do Apps Script. Falha/timeout de
  ação com webhook **não** aciona fallback, para não duplicar escrita.
- Login, solicitação de acesso, token, permissões e administração permanecem no
  Apps Script atual. Não enviar senhas para `adicionar-linha`.
- Guia completo: `docs/INTEGRACAO_N8N.md`.
- Testes: `npm run check` executa lint, sintaxe dos 22 HTMLs + Apps Script,
  31 testes unitários/integração e 6 testes Chromium com rede simulada.
- Pendências reais: publicar/autorizar os webhooks no n8n, configurar CORS,
  validar contratos JSON e testar no domínio com a planilha de teste.
- Ao publicar: enviar os HTMLs **e** a pasta `assets/`; ao mudar o JS,
  atualizar o cache/versão `?v=1`.
- Esta entrega não alterou `apps-script.gs`, não fez deploy no site do usuário
  e não executou escritas reais em planilhas/webhooks.

## 9. Permissões ver/editar e estado real do n8n (2026-11-03, sessão 2)

### Diagnóstico do n8n (o que foi verificado de verdade)

- `GET/POST https://portalmeli.app.n8n.cloud/webhook/ler-planilha` → **HTTP 404**
  `{"code":404,"message":"The requested webhook \"GET ler-planilha\" is not registered."}`
- `GET/POST .../webhook/atualizar-celula` → **404** idem.
- `.../healthz` → `200 {"status":"ok"}`: a instância está no ar; o que falta é o
  workflow publicado.
- Conclusão: **o n8n não está 100% conectado**. As planilhas já passam pelo
  adaptador n8n no código, mas recebem erro até o workflow ser ativado.

### O que foi criado para fechar a lacuna

- `scripts/verificar-n8n.mjs` + `npm run verificar:n8n`: consulta as rotas reais,
  distingue "não publicado" (404 do n8n) de "sem acesso nesta máquina"
  (rede/TLS local), com códigos de saída 0/1/2/3. Não grava nada.
- `diagnostico.html`: o mesmo teste pelo navegador, sem DevTools.
- `docs/n8n/workflow-planilhas.json`: workflow pronto para importar, com os paths
  `ler-planilha` e `atualizar-celula`, webhook em `responseMode: responseNode`,
  CORS liberado e resposta no contrato das telas.

### Permissões ver/editar

- Novo `assets/js/portal-permissoes.js`, carregado nas **18 páginas de ferramenta**
  depois do `n8n-api.js` e antes do script da página.
- Consulta `obterConfigPagina` uma vez por carregamento e aplica:
  `podeVer=false` → bloqueia a página; `podeEditar=false` → somente leitura com
  aviso fixo, bloqueio de handlers de escrita e bloqueio no adaptador antes de
  qualquer requisição (inclusive antes do fallback do Apps Script).
- Falha fechada: sem token, sem API, timeout ou resposta inválida → somente leitura.
- `?modo=ver` vindo do portal força somente leitura sem consultar a API.
- `portal.html` agora envia `modo`, `arquivo` e grava a `apiUrl` da página no
  `localStorage`; a coluna **API** da aba Paginas passa a valer de verdade.
- `admin.html`: marcar "editar" liga "ver"; desmarcar "ver" desliga "editar"
  (mesma regra do backend).
- `apps-script.gs`: `obterConfigPagina` agora aceita nome ou URL no `arquivo`
  (novo `extractFileName_`) e garante as colunas API/Planilha sem apagar dados
  (`ensurePageColumns_`). Nenhuma função existente foi alterada.
- Guia: `docs/PERMISSOES_VER_EDITAR.md`.

### Estado dos testes

`npm run check`: lint + sintaxe de 23 HTMLs + **55 testes** + **12 testes de
navegador**, todos passando. Os testes percorrem todos os handlers inline e
falham se uma função nova ficar sem classificação de leitura/escrita.

### Pendências reais (para o usuário)

1. **n8n:** importar `docs/n8n/workflow-planilhas.json`, ligar a credencial do
   Google Sheets, ativar o workflow e rodar `npm run verificar:n8n` (ou abrir
   `diagnostico.html`). Sem isso, nenhuma escrita/leitura via n8n funciona.
2. **Apps Script:** colar o `apps-script.gs` atualizado e publicar nova versão da
   implantação existente (sem trocar a URL `/exec`). Sem `obterConfigPagina`, as
   ferramentas abrem em somente leitura (falha fechada) — é o comportamento
   esperado, não um bug.
3. **Admin:** preencher `Arquivo` de cada página com o nome exato do HTML e
   revisar as permissões de ver/editar de cada usuário.
4. **Fila da seção 5:** só resta remover o `API_URL` de reserva de cada HTML
   depois que o Apps Script individual de cada página estiver reimplantado.
