# Título da PR
<!-- Use um título claro. Sugestão: Conventional Commits, ex.: feat: implementa X no módulo Y -->

## Resumo do que foi pedido (escopo)
<!-- Cole aqui, em 3–5 linhas, o que a tarefa/issue solicitou (o "pedido do escopo"). -->

## O que foi feito
- [ ] Item 1
- [ ] Item 2
- [ ] Item 3

## Critérios de aceite (marque o que foi cumprido)
- [ ] Critério 1
- [ ] Critério 2
- [ ] Critério 3

## Impacto técnico
- **Migrations:** (sim/não; quais)
- **Env vars:** (sim/não; quais)
- **Breaking changes:** (sim/não; explique brevemente)
- **Observabilidade (logs/métricas):** (lista curta, se relevante)
- **Documentação de arquitetura relacionada:** (link para seção do doc) <!-- (Req. #17) -->

## Testes & validações (mínimo necessário)
- **Como validar manualmente:** passos curtos
- **Evidências:** prints, logs, curl etc. (se aplicável)

## Riscos / rollback
- **Riscos:** lista curta
- **Rollback:** como desfazer de forma segura
- **Feature flag:** (se existir)

## Escopo x Fora de escopo
- **Escopo atendido:** bullets do que entrou
- **Fora de escopo (registrado em /task):** se houve, informe o arquivo criado em `/task/PR<numero>-TASK<id>.md`

## Labels sugeridas
- `tipo:feature` | `tipo:bug` | `tipo:refactor`
- `prioridade:1-urgente` … `prioridade:5-baixa`
- `escopo:aderente` | `escopo:fora`

## Branch & commits
- **Branch:** `feature/*`, `fix/*`, `hotfix/*`, `release/*`
- **Commits:** Conventional Commits (ex.: `feat: ...`, `fix: ...`)

## Hotfix (quando aplicável)
- PRs `hotfix/*` podem pular itens não críticos, **mas segurança continua obrigatória**.
