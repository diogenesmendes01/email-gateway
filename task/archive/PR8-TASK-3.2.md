# PR8 - TASK 3.2 - Refatoração Completa de Magic Numbers

## Contexto
- Origem: PR #8 (MINOR-1)
- Durante a revisão do PR #8, foi identificado que o schema email-job.schema.ts contém diversos "magic numbers" (números literais sem constantes nomeadas). Iniciamos a refatoração criando EMAIL_JOB_VALIDATION com as principais constantes, mas a refatoração completa ficou fora do escopo da PR atual.

## O que precisa ser feito
- [ ] Substituir todos os números literais restantes em email-job.schema.ts por constantes de EMAIL_JOB_VALIDATION
- [ ] Revisar email-send.schema.ts e outros schemas para identificar magic numbers
- [ ] Garantir que todas as mensagens de erro usem template strings com as constantes
- [ ] Atualizar testes para usar as constantes onde aplicável
- [ ] Validar que nenhuma regressão foi introduzida (rodar todos os testes)

## Urgência
- **Nível (1–5):** 3 (melhoria de manutenibilidade, não crítico)

## Responsável sugerido
- Time de desenvolvimento

## Dependências / Riscos
- Dependências: Nenhuma
- Riscos: Baixo - refatoração interna que não altera comportamento
