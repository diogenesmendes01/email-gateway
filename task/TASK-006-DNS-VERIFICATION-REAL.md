# TASK-006 — Implementar DNS Verification Real

## Contexto
- Origem: Análise completa do código
- Resumo: Função de validação de DNS em `domain-management.service.ts` está como stub (TODO), retornando sempre `true`. Necessário implementar verificação real de registros DNS

## O que precisa ser feito
- [ ] Implementar verificação real de registros DNS (SPF, DKIM, DMARC)
- [ ] Usar biblioteca `dns` nativa do Node.js ou `dns-lookup`
- [ ] Validar que registros TXT existem e possuem valores corretos
- [ ] Tratar timeouts e falhas de DNS gracefully
- [ ] Adicionar retry logic para queries DNS
- [ ] Adicionar testes unitários com mocks de DNS
- [ ] Documentar requisitos de DNS no README

## Urgência
- **Nível (1–5):** 3 (MODERADO - Feature)

## Responsável sugerido
- Backend

## Dependências / Riscos
- Dependências:
  - `dns` (módulo nativo do Node.js)
  - Ou `dns-promises` para API async/await
- Riscos:
  - Médio: DNS queries podem ser lentas ou falhar
  - Mitigação: Timeout de 5 segundos, retry logic
  - Baixo: Propagação de DNS pode levar até 48h

## Detalhes Técnicos

**Local a implementar:**

```typescript
// apps/worker/src/services/domain-management.service.ts:301
// TODO: Implementar verificação real de DNS
```

**Implementação sugerida:**

```typescript
import { promises as dns } from 'dns';

async verifyDnsRecords(domain: string): Promise<{
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  details: any;
}> {
  const results = {
    spf: false,
    dkim: false,
    dmarc: false,
    details: {},
  };

  try {
    // 1. Verificar SPF
    const spfRecords = await this.queryTxtRecords(domain, 5000);
    const spfRecord = spfRecords.find(r => r.startsWith('v=spf1'));
    results.spf = !!spfRecord;
    results.details.spf = spfRecord || 'Not found';

    // 2. Verificar DKIM
    // Nota: Precisa do selector DKIM do SES
    const dkimSelector = await this.getDkimSelector(domain);
    if (dkimSelector) {
      const dkimDomain = `${dkimSelector}._domainkey.${domain}`;
      const dkimRecords = await this.queryTxtRecords(dkimDomain, 5000);
      results.dkim = dkimRecords.some(r => r.includes('v=DKIM1'));
      results.details.dkim = dkimRecords;
    }

    // 3. Verificar DMARC
    const dmarcDomain = `_dmarc.${domain}`;
    const dmarcRecords = await this.queryTxtRecords(dmarcDomain, 5000);
    const dmarcRecord = dmarcRecords.find(r => r.startsWith('v=DMARC1'));
    results.dmarc = !!dmarcRecord;
    results.details.dmarc = dmarcRecord || 'Not found';

  } catch (error) {
    this.logger.error({
      message: 'DNS verification failed',
      domain,
      error: error.message,
    });
    throw new Error(`DNS verification failed: ${error.message}`);
  }

  return results;
}

private async queryTxtRecords(
  domain: string,
  timeoutMs: number = 5000
): Promise<string[]> {
  try {
    // Implementar timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DNS query timeout')), timeoutMs)
    );

    const queryPromise = dns.resolveTxt(domain);

    const records = await Promise.race([queryPromise, timeoutPromise]);

    // DNS retorna array de arrays, flatten
    return records.flat();
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return []; // Registro não encontrado
    }
    throw error;
  }
}

private async getDkimSelector(domain: string): Promise<string | null> {
  // Obter DKIM selector do SES para o domínio
  try {
    const identity = await this.sesClient.send(
      new GetIdentityDkimAttributesCommand({
        Identities: [domain],
      })
    );

    const dkimTokens = identity.DkimAttributes?.[domain]?.DkimTokens;
    if (dkimTokens && dkimTokens.length > 0) {
      // SES usa o primeiro token como selector
      return dkimTokens[0];
    }
  } catch (error) {
    this.logger.warn({
      message: 'Could not get DKIM selector from SES',
      domain,
      error: error.message,
    });
  }

  return null;
}
```

**Validação adicional - Verificar valores corretos:**

```typescript
async validateSpfRecord(spfRecord: string, domain: string): Promise<boolean> {
  // SPF deve incluir amazonses.com
  const hasAmazonSes = spfRecord.includes('amazonses.com');

  // SPF deve terminar com -all ou ~all
  const hasPolicy = /[~-]all$/.test(spfRecord);

  if (!hasAmazonSes) {
    this.logger.warn({
      message: 'SPF record does not include amazonses.com',
      domain,
      spfRecord,
    });
  }

  return hasAmazonSes && hasPolicy;
}

async validateDkimRecord(dkimRecord: string): Promise<boolean> {
  // DKIM deve ter v=DKIM1 e chave pública (p=...)
  const hasDkimVersion = dkimRecord.includes('v=DKIM1');
  const hasPublicKey = /p=[A-Za-z0-9+/]+=*/.test(dkimRecord);

  return hasDkimVersion && hasPublicKey;
}

async validateDmarcRecord(dmarcRecord: string): Promise<boolean> {
  // DMARC deve ter v=DMARC1 e política (p=...)
  const hasDmarcVersion = dmarcRecord.startsWith('v=DMARC1');
  const hasPolicy = /p=(none|quarantine|reject)/.test(dmarcRecord);

  return hasDmarcVersion && hasPolicy;
}
```

**Testes unitários:**

```typescript
import { jest } from '@jest/globals';
import { promises as dns } from 'dns';

jest.mock('dns', () => ({
  promises: {
    resolveTxt: jest.fn(),
  },
}));

describe('DomainManagementService - DNS Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should verify SPF record exists', async () => {
    (dns.resolveTxt as jest.Mock).mockResolvedValue([
      ['v=spf1 include:amazonses.com -all'],
    ]);

    const result = await service.verifyDnsRecords('example.com');

    expect(result.spf).toBe(true);
    expect(result.details.spf).toContain('v=spf1');
  });

  it('should handle DNS query timeout', async () => {
    (dns.resolveTxt as jest.Mock).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 10000))
    );

    await expect(service.verifyDnsRecords('example.com'))
      .rejects
      .toThrow('DNS query timeout');
  });

  it('should return false when SPF record not found', async () => {
    (dns.resolveTxt as jest.Mock).mockRejectedValue({
      code: 'ENODATA',
    });

    const result = await service.verifyDnsRecords('example.com');

    expect(result.spf).toBe(false);
  });

  it('should validate DKIM record with SES', async () => {
    // Mock SES response with DKIM tokens
    mockSesClient.send.mockResolvedValue({
      DkimAttributes: {
        'example.com': {
          DkimTokens: ['abc123', 'def456', 'ghi789'],
        },
      },
    });

    // Mock DNS response for DKIM
    (dns.resolveTxt as jest.Mock).mockResolvedValue([
      ['v=DKIM1; k=rsa; p=MIGfMA0GCSqGSI...'],
    ]);

    const result = await service.verifyDnsRecords('example.com');

    expect(result.dkim).toBe(true);
  });

  it('should verify DMARC record', async () => {
    (dns.resolveTxt as jest.Mock).mockResolvedValue([
      ['v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com'],
    ]);

    const result = await service.verifyDnsRecords('_dmarc.example.com');

    expect(result.dmarc).toBe(true);
  });
});
```

**Considerações:**

1. **Propagação de DNS:** Alterações de DNS podem levar até 48h para propagar globalmente
2. **Cache DNS:** Implementar cache local de resultados de verificação (TTL: 1 hora)
3. **Retry Logic:** Se verificação falhar, retry com backoff exponencial
4. **Timeout:** Sempre usar timeout para queries DNS (5 segundos recomendado)

## Bloqueador para Produção?
**NÃO** - Feature nice-to-have. Sistema funciona sem validação automática de DNS (administrador pode verificar manualmente). Pode ser implementado pós-MVP para melhor UX.
