# PR11 - MAJOR #4 - Adicionar validação de tamanho total da mensagem SES

## Contexto
- Origem: PR #11 (MAJOR #4)
- Durante a revisão da PR #11 (TASK 4.1), foi identificado que a validação atual não verifica o tamanho total da mensagem antes de enviar ao SES.

## Problema

### Limite do SES
AWS SES tem limite de **10 MB** para o tamanho total da mensagem (incluindo headers, body, attachments).

### Validação atual
`apps/worker/src/services/ses.service.ts` linhas 54-112

**Issue:** A validação atual checa apenas:
- HTML individual: 512KB (via schema)
- Mas não considera:
  - Tamanho do subject
  - Headers customizados
  - Overhead de encoding (Base64, MIME)
  - Soma total de todos os componentes

**Resultado:** Email pode ser rejeitado pelo SES com erro pouco claro, desperdiçando tentativa de envio.

## O que precisa ser feito
- [ ] Implementar validação de tamanho total ANTES do envio
- [ ] Calcular overhead de encoding
- [ ] Considerar todos os componentes (subject, headers, HTML, attachments)
- [ ] Retornar erro claro se exceder limite
- [ ] Adicionar métrica de tamanho de mensagem
- [ ] Adicionar testes

## Solução proposta

### No SESService, antes de enviar:

```typescript
private validateMessageSize(jobData: EmailSendJobData, htmlContent: string): void {
  // Calcula tamanho aproximado da mensagem
  const subjectSize = Buffer.byteLength(jobData.subject, 'utf8');
  const htmlSize = Buffer.byteLength(htmlContent, 'utf8');
  const headersSize = jobData.headers
    ? JSON.stringify(jobData.headers).length
    : 0;

  // Overhead estimado para encoding e headers automáticos
  const ENCODING_OVERHEAD = 1.33; // Base64 overhead ~33%
  const AUTO_HEADERS_OVERHEAD = 1024; // Headers automáticos do SES

  const estimatedSize =
    (subjectSize + htmlSize + headersSize) * ENCODING_OVERHEAD +
    AUTO_HEADERS_OVERHEAD;

  const SES_MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10 MB

  if (estimatedSize > SES_MAX_MESSAGE_SIZE) {
    throw new Error(
      `Message size (${Math.round(estimatedSize / 1024)} KB) exceeds SES limit (10 MB). ` +
      `HTML: ${Math.round(htmlSize / 1024)} KB, ` +
      `Subject: ${subjectSize} bytes, ` +
      `Headers: ${headersSize} bytes`
    );
  }

  // Métrica de tamanho
  this.metrics?.histogram('email.message.size_bytes', estimatedSize, {
    companyId: jobData.companyId,
  });
}
```

### Integrar no fluxo de envio:

```typescript
async sendEmail(jobData: EmailSendJobData): Promise<SESResult> {
  // 1. Obter HTML
  const htmlContent = await this.getHtmlContent(jobData.htmlRef);

  // 2. VALIDAR TAMANHO (NOVO)
  this.validateMessageSize(jobData, htmlContent);

  // 3. Enviar
  const command = new SendEmailCommand({
    // ...
  });

  // ...
}
```

## Urgência
- **Nível (1–5):** 2 (alto - previne falhas no SES)

## Responsável sugerido
- Time de desenvolvimento (Backend/Worker)

## Dependências / Riscos
- Dependências: Nenhuma
- Riscos: Baixo - adiciona validação preventiva
- Impacto: Previne tentativas de envio fadadas ao fracasso, economiza retries
