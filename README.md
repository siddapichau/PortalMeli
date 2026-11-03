# Portal de Controles Internos — versão atualizada

> 🔧 Trabalho em andamento (ambiente de teste, API dinâmica por página e
> permissões de ver/editar): ver [`continuidade/CONTINUIDADE.md`](continuidade/CONTINUIDADE.md)
> para o estado atual, as regras da migração e a fila de arquivos pendentes.

## Integração de teste com n8n

Os 22 HTMLs agora carregam a configuração compartilhada [`assets/js/n8n-api.js`](assets/js/n8n-api.js).
As ações `getDashboardInit`, `obterDadosLogisticos`, `salvarEdicaoAnalise` e `salvarUsuario` têm rotas n8n; as demais continuam no Apps Script original até receberem um webhook próprio.
Login, senhas, permissões e administração **não** foram enviados ao n8n.

- Guia completo, contratos JSON e roteiro de teste: [`docs/INTEGRACAO_N8N.md`](docs/INTEGRACAO_N8N.md).
- Ao publicar, enviar os HTMLs **e** a pasta `assets/`.
- Uma escrita que falhar no n8n não é repetida automaticamente no Apps Script, para evitar duplicação.
- A validação local usa respostas simuladas; a implantação real do n8n/CORS ainda precisa ser testada no domínio.

```bash
npm ci
npm run check   # lint + sintaxe dos HTMLs + testes unitários/integração + Chromium
npm start       # preview estático em http://localhost:3000/login.html
```

## Arquivos usados em produção

- `portal.html` — portal, menu hierárquico, favoritos por usuário e carregamento das páginas no iframe.
- `login.html` — login moderno e solicitação de acesso.
- `admin.html` — gestão de usuários, páginas, permissões e ordenação por arrastar e soltar.
- `apps-script.gs` — API do Google Apps Script.
- `README.md` — este guia.

`setup.html` não é mais necessário para o uso diário do portal: a URL da API está configurada diretamente no login, portal e painel administrativo. O arquivo foi omitido do ZIP de produção. Guarde-o apenas se quiser manter uma tela de configuração de emergência.

## Links já configurados

- Planilha: https://docs.google.com/spreadsheets/d/1CZyuYHPbRQLlIXyqe7XjYdXkIG7RqLtpHAKLhCc3HzU/edit?gid=0#gid=0
- API: https://script.google.com/macros/s/AKfycbxHUc58l6dqttLAGaAkPdK5IQxIAMCeOQwMlso0lmiCasjurGlammjV2rTgJTqPQStq/exec

## Atualização sem trocar a URL da API

1. Faça backup dos arquivos atuais e da planilha.
2. Substitua `portal.html`, `login.html` e `admin.html` no seu servidor.
3. Abra o projeto Apps Script vinculado à API existente e substitua o código pelo `apps-script.gs` atualizado.
4. No Apps Script, abra **Implantar → Gerenciar implantações**, edite a implantação existente e selecione **Nova versão**. Atualize a implantação existente, em vez de criar uma implantação nova, para manter a URL `/exec` atual.
5. A primeira chamada de `solicitarAcesso` cria a aba `Solicitacoes` caso não exista. A configuração `setup` também adiciona cabeçalhos novos ausentes sem apagar as colunas existentes.
6. Teste login, solicitação de acesso, favoritos, menu e permissões com uma conta de teste.

A API atual precisa ser atualizada para que a nova função de solicitação de acesso funcione. O HTML sozinho não cria essa função no servidor.

## Como organizar menu e submenu

No painel administrativo, crie/edite uma página e preencha:
- **Menu principal:** `Análise`
- **Submenu (opcional):** `BPP 2026`
- **Arquivo HTML:** `bpp2026.html`

As páginas do mesmo menu principal ficam agrupadas. O submenu é salvo em coluna própria. Na lista de páginas do painel administrativo, arraste uma linha para cima ou para baixo para alterar a ordem; a nova ordem é gravada na API.

A estrela ao lado de cada item no menu lateral permite marcar/remover favoritos. Os favoritos são associados ao usuário e sincronizados com a aba `Usuarios` (coluna `Favoritos`); se a coluna estiver ausente, a configuração a adiciona.

## URLs diretas das páginas

Ao abrir uma página pelo menu, o portal atualiza o endereço para um formato semelhante a:

`https://testes.opaisid.com.br/portal.html?pagina=bpp2026.html`

O nome é baseado no campo **Arquivo** cadastrado. Links diretos funcionam para páginas às quais o usuário tem permissão. Ao entrar em `portal.html` sem o parâmetro `pagina`, a tela inicial do portal aparece; ao abrir um link com `?pagina=...`, a página indicada é carregada.

## Solicitar acesso

A solicitação cria um registro pendente na aba `Solicitacoes`. Ela não cria usuário nem concede acesso automaticamente. O administrador ainda precisa criar/ativar a conta e definir as permissões no painel administrativo.

## Segurança e boas práticas

- Não compartilhe o token de sessão.
- Não use links de páginas como substituto das permissões da API.
- Mantenha o Apps Script configurado para executar com a conta autorizada e confira quem pode acessar a implantação.
- Teste em uma cópia antes de atualizar a planilha real.
- Se a planilha já tiver dados, não apague abas nem recrie a estrutura manualmente.

## Limites de validação

A sintaxe JavaScript dos HTMLs e do Apps Script é verificada por `npm run lint`. Há testes automatizados de unidade/integração (`npm test`) e de navegador (`npm run test:browser`), todos com rede simulada. A integração real com a sua implantação n8n/Apps Script, planilha, CORS e permissões ainda precisa ser testada no domínio. Não foi feita alteração diretamente no seu site ou na sua planilha.


## Atualizações da versão visual
- O menu agora agrupa páginas por `Menu` e abre o painel de páginas ao passar o mouse sobre o grupo.
- A coluna `Descricao` foi adicionada à aba `Paginas` para resumir mudanças e aparecer no bloco de atualizações recentes. Execute `setup` novamente para criar a coluna ausente sem apagar dados.
- O painel de equipe inicia fechado e é exibido pelo botão `Equipe`.
- As opções administrativas e sair foram movidas para o menu do usuário no cabeçalho.
- O painel inclui `Página inicial` e `Manutenção`. **A edição da página inicial nesta versão fica no localStorage do navegador atual**, não é sincronizada entre usuários/dispositivos. Para publicação centralizada, é necessário implementar armazenamento compartilhado na API.
- `Limpar cache local` remove caches disponíveis via Cache Storage e dados de sessão, preservando as chaves de login no localStorage; não limpa caches de servidor nem dados da planilha.
- A lista de atualizações utiliza as descrições das páginas cadastradas (até quatro itens).


## Correções da versão 4
- Corrigido um texto literal `\n` que aparecia abaixo do botão de login.
- A solicitação de acesso agora abre uma janela modal com campos de nome e e-mail, validação nativa, botões de enviar/cancelar e fechamento por Escape ou clique fora.
- A validação de sessão no portal faz uma segunda tentativa curta antes de limpar a sessão e redirecionar ao login, reduzindo redirecionamentos por falhas transitórias de comunicação.
- O login redireciona para a raiz limpa `portal.html`, sem reaproveitar o parâmetro de página anterior.
