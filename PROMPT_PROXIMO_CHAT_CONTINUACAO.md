# Prompt de Continuação — Próximo Chat (PortalMeli)

Use este prompt para retomar o trabalho em uma próxima sessão/chat sobre o repositório `PortalMeli`.

---

## Estado atual do que já foi feito (contexto)

- Repositório: `/home/user/PortalMeli`, branch `arena/fd8d8545-portalmeli` (branch fixo da sessão, não renomear).
- Commit inicial: `0116dac06ae8e1c3366f7f320527422c8a5578c6` (`main`).
- Os 22 arquivos HTML do portal foram analisados a partir dos uploads em `/tmp/arena-coding-uploads/` (NÃO foram copiados nem modificados no repositório, respeitando a instrução "não modificar nada, apenas criar prompts").
- Foram criados e comitados 3 arquivos de prompt no branch:
  1. `PROMPT_ANALISE_ERROS_BUGS.md` — levantamento de erros, bugs, riscos e vulnerabilidades (segurança, confiabilidade, manutenibilidade, UX, integração Apps Script).
  2. `PROMPT_REGRAS_SENIOR_100PCT.md` — checklist de regras para entrega em nível sênior 100% (segurança, código, confiabilidade, acessibilidade, testes, git, documentação).
  3. `PROMPT_PROXIMO_CHAT_CONTINUACAO.md` — este arquivo.
- Um **Pull Request** foi aberto da branch `arena/fd8d8545-portalmeli` para `main` contendo os 3 arquivos de prompt acima.

## O que ainda está pendente (próximos passos sugeridos)

1. **Revisar e aprovar o PR aberto** (ou fechar/reabrir conforme decisão).
2. **Decidir se os 22 arquivos HTML devem ser adicionados ao repositório** (eles estão apenas em `/tmp/arena-coding-uploads/`). Se sim, copiá-los **sem modificar**, commitar e atualizar o PR.
3. **Executar o plano de correção** baseado em `PROMPT_ANALISE_ERROS_BUGS.md`, priorizando:
   - Remover endpoint Google Apps Script hardcoded e senhas expostas no frontend (Crítica).
   - Adicionar CSP, X-Frame-Options, proteção CSRF (Alta).
   - Eliminar `innerHTML` sem sanitização (Alta).
   - Travar versões de CDN com SRI ou self-host dependências (Alta).
   - Adicionar testes, linter, CI (Alta).
4. **Aplicar as regras de `PROMPT_REGRAS_SENIOR_100PCT.md`** em qualquer nova entrega.
5. **Considerar hospedagem** (ex.: GitHub Pages) e CI/CD para o portal.

## Comandos úteis (executar em `/home/user/PortalMeli`)

```bash
# Ver status e branch atual
git status
git branch --show-current

# Ver diff do PR (arquivos staged/commitados)
git log --oneline -5
git diff main..arena/fd8d8545-portalmeli --stat

# Abrir PR (se ainda não estiver aberto)
gh pr create --base main --head arena/fd8d8545-portalmeli \
  --title "Prompt de analise de erros e regras sênior (PortalMeli)" \
  --body "Adiciona prompts de analise de bugs, regras de qualidade sênior 100% e continuacao. Nao modifica arquivos HTML existentes."

# Fazer push apenas para a branch da sessao
git push origin arena/fd8d8545-portalmeli

# Fazer merge do PR (apenas quando aprovado)
gh pr merge <NUMERO> --squash
```

## Regras da sessão (Arena)

- Todas as alterações devem ser feitas na branch `arena/fd8d8545-portalmeli`.
- Push apenas para `origin arena/fd8d8545-portalmeli`.
- PR deve ser aberto `arena/fd8d8545-portalmeli` → `main`.
- Não renomear a branch nem criar outras branches.
- Não modificar os arquivos HTML existentes a menos que o usuário solicite explicitamente.

## Observações

- Os arquivos HTML usam `CRLF` (\r\n) e carregam dependências de CDN sem SRI; manter isso em vista se adicioná-los ao repo.
- O backend observado é um Google Apps Script (`script.google.com/macros/s/.../exec`) usado para autenticação e ações — ponto de atenção para segurança antes de expor o portal.

---

Ao retomar, comece lendo este arquivo, o `PROMPT_ANALISE_ERROS_BUGS.md` e o `PROMPT_REGRAS_SENIOR_100PCT.md`, depois confirme com o usuário qual próximo passo executar.
