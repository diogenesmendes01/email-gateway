# PR8 - TASK 3.4 - Adicionar Exemplo de Integração API → Worker

## Contexto
- Origem: PR #8 (MINOR-4)
- Durante a revisão do PR #8, foi sugerido adicionar um exemplo prático de integração completa mostrando o fluxo da API até o Worker. Isso ajudaria desenvolvedores a entender o fluxo end-to-end do sistema.

## O que precisa ser feito
- [ ] Criar documento de exemplo mostrando:
  - Endpoint da API recebendo requisição de envio de email
  - Criação do registro em email_outbox
  - Enfileiramento do job email:send
  - Processamento pelo Worker
  - Atualização do status no banco
  - Resposta final ao cliente
- [ ] Incluir exemplos de código para cada etapa
- [ ] Adicionar diagrama de sequência se possível
- [ ] Documentar casos de erro e retry
- [ ] Adicionar exemplos de monitoramento e observabilidade
- [ ] Incluir na documentação principal (docs/api/ ou docs/examples/)

## Urgência
- **Nível (1–5):** 3 (melhoria de documentação, útil mas não bloqueante)

## Responsável sugerido
- Time de desenvolvimento ou documentação

## Dependências / Riscos
- Dependências: Implementação completa da API e Worker
- Riscos: Nenhum - apenas documentação
