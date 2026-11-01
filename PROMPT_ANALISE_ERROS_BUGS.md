# Prompt de Análise de Erros, Bugs, Riscos e Vulnerabilidades — PortalMeli

**Objetivo deste prompt:** ser usado como entrada para um próximo ciclo de revisão/atividade de correção. Ele **NÃO modifica nenhum arquivo existente**. Apenas lista possíveis erros, bugs, falhas de segurança e pontos de fragilidade encontrados nos 22 arquivos HTML do portal, com arquivo(s) afetado(s), severidade e recomendação de correção.

---

## Contexto do projeto (observado nos arquivos)

- Repositório: `PortalMeli`, branch `arena/fd8d8545-portalmeli`.
- 22 páginas HTML independentes (`portal.html`, `login.html`, `dashboard.html`, `admin.html`, `avarias.html`, `fazerdevolucao.html`, `missorted.html`, `pokayoke.html`, etc.).
- Portal interno de controles operacionais do Mercado Livre (Meli), idioma pt-BR.
- Navegação principal feita via `<iframe>` (conteúdo das páginas carregado dentro do shell `portal.html`).
- Backend único: Google Apps Script (URL `https://script.google.com/macros/s/.../exec`) referenciado em praticamente todos os arquivos.
- Dependências carregadas por CDN sem trava de versão e sem SRI (Tailwind, Chart.js, html2canvas, SweetAlert2, FontAwesome).
- Logo do Mercado Livre carregada de fonte externa (Wikimedia).
- Estilos e JavaScript embutidos inline em cada arquivo (código duplicado entre páginas).

---

## 1. Segurança (alta prioridade)

| # | Problema | Arquivo(s) afetado(s) | Severidade | Recomendação |
|---|----------|----------------------|------------|--------------|
| S1 | Endpoint do Google Apps Script hardcoded e exposto no código frontend (chave de deployment visível no cliente). | Todos os 22 arquivos (ex.: `login.html`, `admin.html`, `dashboard.html`) | Crítica | Remover a URL do frontend. Expor apenas via backend próprio com autenticação, ou usar variável de ambiente / proxy seguro. Nunca commitar credenciais/endpoints sensíveis. |
| S2 | Senhas transitadas e manipuladas no cliente (formulário de cadastro/solicitação de acesso envia `senha` via `fetch` para o Google Apps Script). | `login.html` (e outros que usam `apiUrl`) | Crítica | Não tratar senha no frontend. Usar fluxo de autenticação próprio (OAuth/OIDC), HTTPS obrigatório, hashing no servidor, nunca enviar senha simples por fetch direto. |
| S3 | Armazenamento de `apiUrl` em `localStorage` (dados sensíveis expostos no navegador). | `login.html`, `portal.html`, `admin.html`, `analise.html`, `semidciclos.html`, `biparinventario.html`, `equipamentos.html` | Alta | Remover do `localStorage` ou não armazenar dados sensíveis sem criptografia. Usar cookies `HttpOnly; Secure; SameSite=Strict` quando aplicável. |
| S4 | Ausência de Content Security Policy (CSP) e de cabeçalho `X-Frame-Options`. | Todos os 22 arquivos | Alta | Adicionar CSP restritiva e `X-Frame-Options: SAMEORIGIN` (ou `DENY` quando não for iframe) para mitigar XSS e clickjacking. |
| S5 | Uso de `innerHTML` com conteúdo potencialmente não sanitizado (risco de XSS). | Quase todos os arquivos (`admin.html`, `aduanas.html`, `dashboard.html`, `fazerdevolucao.html`, etc.) | Alta | Substituir `innerHTML` por `textContent` ou sanitizar rigorosamente a entrada antes de injetar no DOM. |
| S6 | Nenhum token CSRF / SameSite nas chamadas `fetch` para o Google Apps Script. | Todos os arquivos com `fetch(` | Alta | Implementar proteção CSRF e validar origem nas requisições de estado mutável. |
| S7 | URL externa hardcoded (`http://`) encontrada (possível mixed content / MITM). | `equipamentos.html` | Média | Forçar HTTPS em todas as referências externas; evitar URLs hardcodadas. |
| S8 | Logo da marca carregada de domínio externo (Wikimedia) — falha de carregamento quebra a identidade visual e é ponto de dependência externa não controlada. | `portal.html`, `login.html` | Baixa | Hospedar a logo localmente no repositório. |

---

## 2. Confiabilidade e disponibilidade

| # | Problema | Arquivo(s) afetado(s) | Severidade | Recomendação |
|---|----------|----------------------|------------|--------------|
| C1 | Dependências críticas por CDN sem SRI (Subresource Integrity) e sem versão travada. Se o CDN cair ou for comprometido, o portal para ou executa código malicioso. | `dashboard.html` (Tailwind, Chart.js, html2canvas, SweetAlert2, FontAwesome) e possivelmente outros | Alta | Baixar dependências para o repositório (self-host) OU usar CDN com versão travada (`@x.y.z`) + atributo `integrity` + `crossorigin="anonymous"`. |
| C2 | Falta de fallback offline / service worker. Qualquer pane de rede deixa o portal inutilizável. | Todos os arquivos | Média | Implementar estratégia offline-first (service worker + cache) para páginas críticas. |
| C3 | Navegação por `<iframe>` — difícil de debugar, histórico do navegador comprometido, problemas de comunicação entre janelas e SEO/acessibilidade prejudicados. | `portal.html` (shell com `framewrap` + `iframe`) | Média | Avaliar migração para SPA (single-page application) ou carregamento de conteúdo sem iframes, mantendo rotas navegáveis. |
| C4 | Tratamento de erros de `fetch` frágil (blocos `try/catch` genéricos, sem retry, sem feedback claro ao usuário em muitos casos). | Todos os arquivos com `fetch(` | Média | Padronizar tratamento de erros de rede: retry com backoff, mensagens amigáveis, logging de erro e fallback de UI. |
| C5 | `redirect: "follow"` em requisições `fetch` pode expor dados ou redirecionar inesperadamente. | `login.html` e outros | Média | Usar `redirect: "manual"` e tratar redirecionamentos explicitamente. |
| C6 | Linhas de término `CRLF` (`\r\n`) detectadas nos arquivos — pode causar inconsistência diff/git entre sistemas operacionais. | Todos os 22 arquivos | Baixa | Padronizar line endings para `LF` (`.gitattributes` com `* text=auto eol=lf`). |

---

## 3. Qualidade e manutenibilidade de código

| # | Problema | Arquivo(s) afetado(s) | Severidade | Recomendação |
|---|----------|----------------------|------------|--------------|
| M1 | Código duplicado em 22 arquivos (mesmos estilos, mesmos scripts, mesma lógica de menu/login/fetch). Manter uma correção exige editar 22 arquivos. | Todos | Alta | Extrair componentes compartilhados (CSS/JS comuns) ou migrar para um único shell com rotas; evitar copiar-colar. |
| M2 | JavaScript e CSS embutidos inline em cada HTML — difícil de versionar, testar e fazer cache. | Todos | Alta | Separar em arquivos `.css` e `.js` dedicados, carregados com versão/hash. |
| M3 | Uso excessivo de manipuladores inline `onclick=` misturados com `addEventListener`. | Quase todos os arquivos | Média | Padronizar em listeners unobstrusivos (`addEventListener`), separados do HTML. |
| M4 | Nenhum sistema de build, bundler, linter ou formatador (ESLint, Prettier, Stylelint). | Repositório inteiro | Média | Adicionar `package.json`, ESLint + Prettier, script de lint/format e verificação no CI. |
| M5 | Ausência de testes automatizados (unitários, de integração, e2e). | Repositório inteiro | Alta | Incluir testes (Jest/Vitest + Playwright/Cypress) antes de qualquer alteração de produção. |
| M6 | HTMLs sem declaração consistente de `<meta charset="UTF-8">` em todos os arquivos. | Alguns arquivos (verificar os que faltam) | Baixa | Garantir `<meta charset="UTF-8">` no `<head>` de todas as páginas. |
| M7 | Dois arquivos sem `<meta name="viewport">` (layout pode quebrar em mobile). | `dashboard.html`, `painelemail.html` | Média | Adicionar viewport meta tag a todas as páginas. |

---

## 4. Experiência do usuário e acessibilidade

| # | Problema | Arquivo(s) afetado(s) | Severidade | Recomendação |
|---|----------|----------------------|------------|--------------|
| U1 | Elementos interativos sem foco gerenciável / navegação por teclado parcial (ex.: `role="button"` em `<div>` sem `tabindex` e teclado). | `portal.html`, `login.html` | Média | Usar elementos semânticos (`<button>`, `<a>`) e garantir navegação por teclado completa. |
| U2 | Mensagens de erro/validação de formulário limitadas (ex.: apenas "As senhas não coincidem"). | `login.html` | Média | Validação client-side e server-side clara, acessível (`aria-live`, `aria-invalid`), em pt-BR. |
| U3 | Nenhuma indicação de carregamento (loading state) consistente em ações de `fetch`; algumas telas usam overlay próprio (`ghost-truck`), outras não. | Vários | Baixa | Padronizar estados de carregamento, vazio, erro e sucesso em todas as ações. |
| U4 | Contraste e escala de tipografia variam entre páginas (não há design system). | Todos | Baixa | Definir design system (cores, espaçamento, tipografia) e aplicar consistentemente. |

---

## 5. Dados e integração (Google Apps Script)

| # | Problema | Arquivo(s) afetado(s) | Severidade | Recomendação |
|---|----------|----------------------|------------|--------------|
| I1 | Um único endpoint Apps Script atende a múltiplas ações (`action:"solicitarAcesso"`, etc.) — ponto único de falha e difícil de versionar/auditar. | Todos os arquivos que chamam `apiUrl` | Alta | Separar por endpoint/recurso, versionar a API e adicionar autenticação/autorização por chamada. |
| I2 | Validação feita apenas no cliente; o servidor Apps Script parece confiar nos dados recebidos. | `login.html` (`requestForm`) e outros | Alta | Validar e sanitizar novamente no servidor (defesa em profundidade). |
| I3 | Nenhum contrato de API documentado (OpenAPI/Swagger) nem versionamento de payloads. | Repositório inteiro | Média | Documentar contrato de entrada/saída de cada ação. |

---

## Como usar este prompt

1. Leia cada item e confirme nos arquivos alvo.
2. Priorize correções por severidade (Crítica → Alta → Média → Baixa).
3. **Não altere os arquivos HTML ainda** — este prompt serve somente para gerar o plano de ação e os prompts de execução.
4. Após a análise, crie um branch de correção, aplique as mudanças, teste e abra PR para revisão.

---

**Resumo de risco geral:** o portal funciona como protótipo interno, mas apresenta **exposição de credenciais/endpoint, ausência de CSP/CSRF, XSS via `innerHTML`, dependências de CDN não travadas, código duplicado e sem testes**. Não deve ser exposto a usuários externos nem manipular dados sensíveis antes dessas correções.
