# Permissões de ver e editar nas páginas

## Regra

- **Pode ver:** a página abre e **lê** dados normalmente.
- **Pode editar:** além de ler, pode salvar, importar, excluir, disparar e-mail e
  registrar bipagem.
- **Sem permissão de ver:** a página não abre; aparece "Acesso não permitido" com
  link de volta ao portal.

A fonte da verdade é a ação `obterConfigPagina` da API central, que devolve
`podeVer` e `podeEditar` para o usuário logado (admin sempre tem os dois).

## Como funciona no HTML

Cada página de ferramenta carrega dois arquivos, nesta ordem:

```html
<script src="assets/js/n8n-api.js?v=3" data-exigir-permissoes></script>
<script src="assets/js/portal-permissoes.js?v=1"></script>
<script>/* código da página */</script>
```

O atributo **`data-exigir-permissoes`** marca a página como ferramenta. Se o
`portal-permissoes.js` não carregar (arquivo não publicado, cache antigo, 404), o
`n8n-api.js` ativa uma reserva que libera **apenas leitura** — a página não fica
sem controle de escrita. Login, portal, admin, limpar e diagnóstico não têm a
marca e continuam funcionando normalmente.

`portal-permissoes.js` expõe `PortalPermissoes` e aplica a política:

1. Lê o token do `localStorage` e a API central salva pelo login (`apiUrl`).
2. Chama `obterConfigPagina` com `{ token, arquivo }` — uma vez por carregamento.
3. Guarda `podeVer`, `podeEditar`, `planilha` e `api` da página.
4. Em modo somente leitura:
   - mostra um aviso fixo na tela;
   - bloqueia clique/duplo clique/`submit` em elementos cujo handler inline grava;
   - a lista de ações e funções de escrita está em `assets/js/portal-permissoes.js`.

O adaptador `n8n-api.js` consulta a mesma política **antes de qualquer
requisição** — inclusive antes do fallback para o Apps Script. Assim uma escrita
não escapa por outro caminho.

## Ordem de confiança (falha fechada)

| Situação | Resultado |
|---|---|
| Portal envia `?modo=ver` | somente leitura, sem consultar a API |
| API responde `podeEditar: false` | somente leitura |
| API responde `podeVer: false` | acesso bloqueado |
| API indisponível/erro/timeout | somente leitura + aviso |
| Sem token no navegador | somente leitura + aviso |
| Ação não catalogada | tratada como **escrita** (bloqueada) |

Nenhum caminho libera edição por engano: na dúvida, a página abre em leitura.

## O que é bloqueado no modo somente leitura

Ações da API classificadas como escrita (`salvar*`, `excluir*`, `importar*`,
`rodar*`, `disparar*`, `processar*`, `upload*`, `bipar`, `naoRegistrado`, etc.) e
os handlers inline equivalentes (`salvarEquipamento()`, `executarAcao(...)`,
`dispararEmails()`, `tornarEditavel(...)`, …).

Continuam liberados: leitura de dados, filtros, ordenação, navegação entre telas,
exportar/baixar imagem da própria tela e a busca por leitor de código.

O teste `tests/permissoes.test.mjs` percorre **todos** os handlers inline dos
HTMLs: uma função nova sem classificação faz o teste falhar, em vez de virar
brecha silenciosa.

## Páginas cobertas

As 18 páginas de ferramenta (`a1`, `aduanas`, `agingdevolucao`, `analise`,
`analisedeslocados`, `ativosbpp`, `avarias`, `biparinventario`, `bpp2026`,
`dashboard`, `equipamentos`, `fazerdevolucao`, `missorted`, `painelemail`,
`pokainventario`, `pokayoke`, `semidciclos`, `semidciclos2`).

`login.html`, `portal.html`, `admin.html`, `limpar.html` e `diagnostico.html`
ficam fora: são telas de autenticação, de administração ou de serviço, e não
passam por `obterConfigPagina`.

## Configuração no painel administrativo

1. Cadastre a página em **Páginas** com o campo **Arquivo** exatamente igual ao
   nome do HTML (`avarias.html`). É por esse campo que a página se identifica.
2. Preencha **API** e **Planilha** (opcional; sem preencher, valem as URLs
   gravadas no próprio HTML e o ID de teste).
3. Em **Permissões**, marque *ver* e, se for o caso, *editar*. O painel liga
   *ver* automaticamente ao marcar *editar* e desmarca *editar* ao remover *ver*,
   que é a mesma regra validada pelo backend.

## Limites (importante)

- O bloqueio no navegador é de **UX e contrato de rede**; não substitui
  autorização no servidor. Um usuário que conheça o endpoint do Apps Script da
  página ainda poderia chamá-lo direto.
- A proteção definitiva exige que cada Apps Script individual aceite e valide o
  token central — passo futuro já registrado em `continuidade/CONTINUIDADE.md`.
- Se `obterConfigPagina` ainda não estiver implantada no seu Apps Script, **todas**
  as ferramentas abrem em somente leitura (falha fechada). Nesse caso, reaproveite
  o `apps-script.gs` atualizado do repositório e publique uma nova versão da
  implantação existente (sem trocar a URL `/exec`).

## Testes

```bash
npm test                      # inclui tests/permissoes.test.mjs
npm run test:browser          # inclui os cenários reais de ver/editar
```

Cenários cobertos no navegador: edição liberada, somente leitura sem escrita
para n8n/Apps Script, bloqueio total por `podeVer=false`, ausência de sessão e
`?modo=ver` vindo do portal.
