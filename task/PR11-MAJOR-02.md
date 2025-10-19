# PR11 - MAJOR #2 - Corrigir timeout race condition no SESService

## Contexto
- Origem: PR #11 (MAJOR #2)
- Durante a revisão da PR #11 (TASK 4.1), foi identificado que o timeout do SES usando `Promise.race()` pode causar envio duplicado de emails.

## Problema

### Arquivo afetado
`apps/worker/src/services/ses.service.ts` linhas 89-97

### Issue
```typescript
const response = await Promise.race([
  this.client.send(command),
  this.createTimeoutPromise(PIPELINE_CONSTANTS.SES_SEND_TIMEOUT_MS),
]);

if (!response || !('MessageId' in response)) {
  throw new Error('SES request timeout');
}
```

**Problema:** Se o timeout vencer primeiro, `response` é `undefined` mas a requisição SES continua rodando em background. Isso pode resultar em:
- Email enviado mesmo após timeout
- Email duplicado se job for retentado
- Falta de cancelamento da requisição HTTP

## O que precisa ser feito
- [ ] Refatorar SESService para usar `AbortController`
- [ ] Implementar cancelamento real da requisição HTTP
- [ ] Adicionar testes para verificar que requisição é cancelada no timeout
- [ ] Atualizar documentação do SESService

## Solução proposta

```typescript
async sendEmail(jobData: EmailSendJobData): Promise<SESResult> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    PIPELINE_CONSTANTS.SES_SEND_TIMEOUT_MS
  );

  try {
    const command = new SendEmailCommand({
      Source: this.config.fromAddress,
      Destination: { ToAddresses: [jobData.to] },
      // ... outros campos
    });

    const response = await this.client.send(command, {
      abortSignal: abortController.signal
    });

    clearTimeout(timeoutId);

    return {
      success: true,
      messageId: response.MessageId
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('SES request timeout - request cancelled');
    }

    throw error;
  }
}
```

## Urgência
- **Nível (1–5):** 2 (alto - pode causar envio duplicado)

## Responsável sugerido
- Time de desenvolvimento (Backend/Worker)

## Dependências / Riscos
- Dependências: Nenhuma
- Riscos: Médio - mudança de comportamento que precisa ser bem testada
- Impacto: Pode afetar retry logic se não for bem implementado
