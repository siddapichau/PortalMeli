# Prompt de Regras de Ouro — Nível 100% (Profissional Sênior)

**Objetivo deste prompt:** ser anexado a qualquer tarefa de desenvolvimento, revisão ou manutenção no repositório `PortalMeli`. Ele define o padrão de qualidade que todo código, PR e entrega devem atingir. É um guia de comportamento técnico, não uma alteração de arquivo.

---

## Mentalidade sênior (pré-requisito)

1. **Entenda antes de escrever.** Leia o código, o histórico e o contexto de negócio. Nunca altere o que não compreende.
2. **Zero regressões.** Uma correção não pode quebrar o que já funciona. Teste antes e depois.
3. **Segurança por padrão.** Nunca confie na entrada do usuário. Nunca expor segredos, chaves ou endpoints sensíveis no frontend.
4. **Entregue com rastreabilidade.** Todo commit tem propósito, mensagem clara e está vinculado a uma issue/PR.
5. **Se não tem teste, não está pronto.** Código sem teste é código sem compromisso de qualidade.

---

## Regras obrigatórias (checklist de 100%)

### A. Segurança
- [ ] Nenhum segredo, senha, token, chave de API ou endpoint de backend hardcoded no frontend.
- [ ] Credenciais via variáveis de ambiente / secrets do CI; jamais no repositório (verificar `.gitignore`).
- [ ] Todas as requisições sensíveis em **HTTPS**.
- [ ] CSP (Content Security Policy) definida e restritiva.
- [ ] `X-Frame-Options` e `X-Content-Type-Options` configurados.
- [ ] Proteção CSRF em operações que alteram estado.
- [ ] Nenhum dado sensível em `localStorage`/`sessionStorage` sem criptografia.
- [ ] Sanitização de toda entrada antes de injetar no DOM (nunca `innerHTML` com dado bruto).
- [ ] Validação de entrada **no cliente E no servidor** (defesa em profundidade).
- [ ] Autenticação e autorização verificadas em cada rota/ação sensível.

### B. Qualidade de código
- [ ] Código legível, autodocumentado e com nomes intencionais (em português ou inglês, consistente com o projeto).
- [ ] Princípio DRY respeitado, mas sem sacrificar clareza; não abstrair prematuramente.
- [ ] Funções pequenas, com uma única responsabilidade.
- [ ] Nenhum código comentado ou "morto" deixado no repositório.
- [ ] Tratamento explícito de erros: **nunca `catch` vazio**, sempre logue e informe o usuário.
- [ ] Promises/async com tratamento de rejeição; evitar callbacks aninhados profundos.
- [ ] CSS separado do HTML; evitar estilos inline e `!important`.
- [ ] JavaScript separato do HTML; usar `addEventListener` (não `onclick` inline).

### C. Confiabilidade e desempenho
- [ ] Dependências com versão travada (`@x.y.z`) e SRI quando carregadas por CDN; preferir self-host.
- [ ] Fallback para falha de rede; estados de carregamento, vazio, erro e sucesso em toda ação.
- [ ] Nenhum bloqueio da thread principal (evitar processamento síncrono pesado).
- [ ] Imagens e assets otimizados; logo e imagens hospedadas localmente.
- [ ] Timeouts definidos em chamadas de rede; `redirect: "manual"` quando não for desejado seguir redirecionamentos automaticamente.

### D. Acessibilidade e UX (WCAG 2.1 AA)
- [ ] Navegação completa por teclado; foco visível e gerenciado.
- [ ] Elementos semânticos (`<button>`, `<a>`, `<nav>`, `<main>`) em vez de `<div>`/`<span>` com `role`.
- [ ] Labels associados a inputs; mensagens de erro com `aria-invalid` e `aria-live`.
- <meta charset="UTF-8"> e `<meta name="viewport">` em todas as páginas.
- [ ] Layout responsivo, mobile-first, testado em diferentes tamanhos de tela.
- [ ] Idioma consistente (pt-BR) e mensagens amigáveis ao usuário.

### E. Testes e validação
- [ ] Pelo menos um teste unitário por função crítica.
- [ ] Teste de integração para fluxos principais (login, envio de formulário, consulta de dados).
- [ ] Teste e2e em pelo menos um caminho crítico antes de merge.
- [ ] Teste manual na funcionalidade alterada + nos fluxos adjacentes (regressão).
- [ ] Linter (ESLint/Stylelint) e formatador (Prettier) passando sem warnings.

### F. Processo e git
- [ ] Branch dedicado por feature/correção (não commitar direto na `main`).
- [ ] Commits atômicos, uma responsabilidade por commit, mensagem no formato conventional commits.
- [ ] PR com descrição clara: o quê, por quê, como testar, prints antes/depois (quando UI).
- [ ] PR revisado por ao menos outra pessoa antes do merge (não auto-aprovar próprio PR).
- [ ] Resolver conversas e mudanças solicitadas no PR antes de merge.
- [ ] Nunca fazer push forçado em branches compartilhados sem consenso.

### G. Documentação
- [ ] README atualizado com instruções de instalação, execução e deploy.
- [ ] Variáveis de ambiente necessárias documentadas (exemplo `.env.example` sem valores reais).
- [ ] Mudanças de comportamento documentadas para o time.

---

## Critério de "feito" (Definition of Done)

Uma tarefa só está concluída quando:
1. O código atende a **todas as regras acima aplicáveis**.
2. Há teste cobrindo a mudança.
3. O build/lint/test passa no CI localmente.
4. O PR foi revisado e aprovado.
5. A documentação relevante foi atualizada.
6. Não há novas vulnerabilidades introduzidas (verificar com scanner de dependências quando houver pacotes).

---

## Frases que um sênior não diz (e alternativas)

- "Funciona na minha máquina" → "Reproduzo no ambiente de integração e documento os passos."
- "É só uma mudança rápida" → "Avalio o impacto, testo regressão e só então commito."
- "Não preciso de teste pra isso" → "Escrevo o teste que valida esse comportamento."
- "Arrumei, não testei" → "Não é entregue até passar nos testes e na revisão."
