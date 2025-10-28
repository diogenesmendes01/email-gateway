# TASK-031 — Content Validation Service (Feature - Priority 2)

## Contexto
- Origem: MULTI_TENANT_PLAN.md - Sprint 2 (Proteções)
- Resumo: Validar conteúdo dos emails ANTES de enviar. Detectar spam words, links suspeitos, emails descartáveis. Prevenir que conteúdo problemático seja enviado.

## O que precisa ser feito
- [ ] Criar ContentValidationService
- [ ] Detectar spam words (lista configurável)
- [ ] Detectar links suspeitos (URL encurtadas, IPs, etc)
- [ ] Bloquear emails descartáveis (temp-mail.com, etc)
- [ ] Validar proporção texto/HTML
- [ ] Validar tags HTML proibidas (script, iframe)
- [ ] Calcular spam score (0-100)
- [ ] Integrar no EmailSendService
- [ ] Retornar erro 400 se score > 50
- [ ] Testes unitários

## Urgência
- **Nível (1–5):** 4 (ALTO - Qualidade)

## Responsável sugerido
- Backend (API)

## Dependências / Riscos
- Dependências: Nenhuma
- Riscos:
  - MÉDIO: Falsos positivos → ajustar thresholds
  - BAIXO: Validação pode adicionar latência (~50-100ms)

## Detalhes Técnicos

Ver MULTI_TENANT_PLAN.md seção "2.3 Content Validation Service".

### Validações

1. **Spam words:** "click here", "buy now", "free money", etc
2. **Links suspeitos:** bit.ly, tinyurl, IPs em vez de domínios
3. **Emails descartáveis:** temp-mail.com, guerrillamail.com
4. **HTML:** script tags, iframe tags, proporção texto < 10%
5. **Score:** Soma de pontos (> 50 = rejeitar)

### Implementação

```typescript
@Injectable()
export class ContentValidationService {
  private readonly SPAM_WORDS = [
    'click here', 'buy now', 'limited time', 'free money',
    'viagra', 'casino', 'lottery', 'nigerian prince',
  ];

  private readonly DISPOSABLE_DOMAINS = [
    'temp-mail.com', 'guerrillamail.com', '10minutemail.com',
    'mailinator.com', 'throwaway.email',
  ];

  async validateEmail(email: { to: string; subject: string; html: string }) {
    const errors: string[] = [];
    const warnings: string[] = [];
    let score = 0;

    // 1. Email descartável
    if (this.isDisposableEmail(email.to)) {
      errors.push('Disposable email domain not allowed');
      score += 50;
    }

    // 2. Spam words
    const spamWords = this.detectSpamWords(email.subject + ' ' + email.html);
    if (spamWords.length > 0) {
      warnings.push(`Spam words: ${spamWords.join(', ')}`);
      score += spamWords.length * 5;
    }

    // 3. Links suspeitos
    const suspiciousLinks = this.detectSuspiciousLinks(email.html);
    if (suspiciousLinks.length > 0) {
      warnings.push(`Suspicious links: ${suspiciousLinks.length}`);
      score += suspiciousLinks.length * 10;
    }

    // 4. Tags proibidas
    if (/<script|<iframe/i.test(email.html)) {
      errors.push('Script/iframe tags not allowed');
      score += 50;
    }

    // 5. Proporção texto/HTML
    const textRatio = this.calculateTextRatio(email.html);
    if (textRatio < 0.1) {
      warnings.push('Low text-to-HTML ratio');
      score += 15;
    }

    return {
      valid: errors.length === 0 && score < 50,
      errors,
      warnings,
      score,
    };
  }
}
```

### Integração

```typescript
async sendEmail(companyId: string, dto: EmailSendDto) {
  // Verificar quota...

  // NOVO: Validar conteúdo
  const validation = await this.contentValidationService.validateEmail({
    to: dto.recipient.email,
    subject: dto.subject,
    html: dto.html,
  });

  if (!validation.valid) {
    throw new BadRequestException({
      code: 'CONTENT_VALIDATION_FAILED',
      errors: validation.errors,
      warnings: validation.warnings,
      score: validation.score,
    });
  }

  // ... processar email
}
```

## Categoria
**Feature - Protection + Quality**

## Bloqueador para Produção?
**NÃO - Nice to Have**

Sem validação:
- ⚠️ Conteúdo spam pode ser enviado
- ⚠️ Risco de bounce/complaint alto

Com validação:
- ✅ Qualidade garantida
- ✅ Menos bounces
- ✅ Melhor reputação

Recomendação: Implementar após TASK-029 e TASK-030.

## Checklist

- [ ] ContentValidationService implementado
- [ ] Todas validações funcionando
- [ ] Integrado no EmailSendService
- [ ] Testes com spam words
- [ ] Testes com links suspeitos
- [ ] PR revisado

## Próximos Passos

- **TASK-032:** Dashboard de Domínios (UI)
