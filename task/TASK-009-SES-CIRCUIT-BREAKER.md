# TASK-009 — Circuit Breaker para SES (Resiliência)

## Contexto
- Origem: PR-BACKLOG (PR11-MAJOR-03)
- Resumo: Worker não tem circuit breaker para SES. Se SES ficar indisponível, jobs continuarão falhando e retentando indefinidamente, desperdiçando recursos

## O que precisa ser feito
- [ ] Implementar circuit breaker pattern (lib: opossum)
- [ ] Configurar thresholds: 50% erro rate em 10 requisições → abre circuito
- [ ] Timeout de 30s quando circuito aberto
- [ ] Retry exponencial quando circuito meio-aberto
- [ ] Métricas de estado do circuit breaker
- [ ] Logs quando circuito muda de estado
- [ ] Testes unitários do comportamento

## Urgência
- **Nível (1–5):** 3 (MODERADO - Resiliência)

## Responsável sugerido
- Backend

## Dependências / Riscos
- Dependências: `opossum` library
- Riscos:
  - Médio: Pode impactar throughput durante falhas transitórias
  - Baixo: Protege sistema de overload
  - Mitigação: Configurar thresholds adequadamente

## Detalhes Técnicos

**Instalar dependência:**

```bash
npm install opossum
npm install -D @types/opossum
```

**Atualizar:** `apps/worker/src/services/ses.service.ts`

```typescript
import CircuitBreaker from 'opossum';
import { Logger } from '@nestjs/common';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

interface CircuitBreakerOptions {
  timeout: number;              // Tempo máximo para operação (ms)
  errorThresholdPercentage: number; // % de erros para abrir circuito
  resetTimeout: number;         // Tempo antes de tentar fechar circuito (ms)
  rollingCountTimeout: number;  // Janela de tempo para contar erros (ms)
  rollingCountBuckets: number;  // Número de buckets na janela
  volumeThreshold: number;      // Mínimo de chamadas antes de avaliar
}

@Injectable()
export class SESService {
  private readonly logger = new Logger(SESService.name);
  private sesClient: SESClient;
  private circuitBreaker: CircuitBreaker;

  constructor(private configService: ConfigService) {
    this.initializeSESClient();
    this.initializeCircuitBreaker();
  }

  private initializeSESClient() {
    this.sesClient = new SESClient({
      region: this.configService.get('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  private initializeCircuitBreaker() {
    const options: CircuitBreakerOptions = {
      timeout: 5000,                    // 5s timeout
      errorThresholdPercentage: 50,     // Abre após 50% de erros
      resetTimeout: 30000,              // Tenta fechar após 30s
      rollingCountTimeout: 10000,       // Janela de 10s
      rollingCountBuckets: 10,          // 10 buckets de 1s cada
      volumeThreshold: 10,              // Mínimo 10 chamadas para avaliar
    };

    this.circuitBreaker = new CircuitBreaker(
      this.sendEmailInternal.bind(this),
      options
    );

    // Eventos do circuit breaker
    this.circuitBreaker.on('open', () => {
      this.logger.error({
        message: 'Circuit breaker OPEN - SES unavailable',
        state: 'OPEN',
        errorRate: this.circuitBreaker.stats.failures,
      });
    });

    this.circuitBreaker.on('halfOpen', () => {
      this.logger.warn({
        message: 'Circuit breaker HALF-OPEN - Testing SES',
        state: 'HALF_OPEN',
      });
    });

    this.circuitBreaker.on('close', () => {
      this.logger.log({
        message: 'Circuit breaker CLOSED - SES recovered',
        state: 'CLOSED',
      });
    });

    this.circuitBreaker.on('fallback', (result) => {
      this.logger.warn({
        message: 'Circuit breaker fallback triggered',
        result,
      });
    });

    // Fallback quando circuito aberto
    this.circuitBreaker.fallback(() => {
      throw new Error('SES temporarily unavailable (circuit breaker open)');
    });
  }

  /**
   * Send email through circuit breaker
   */
  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    try {
      return await this.circuitBreaker.fire(params);
    } catch (error) {
      // Se circuito aberto, classificar como erro transitório
      if (error.message.includes('circuit breaker open')) {
        throw new SESTransientError('SES_CIRCUIT_OPEN', error.message);
      }
      throw error;
    }
  }

  /**
   * Internal method wrapped by circuit breaker
   */
  private async sendEmailInternal(
    params: SendEmailParams
  ): Promise<SendEmailResult> {
    const command = new SendEmailCommand({
      Source: params.from,
      Destination: {
        ToAddresses: [params.to],
        CcAddresses: params.cc,
        BccAddresses: params.bcc,
      },
      Message: {
        Subject: { Data: params.subject },
        Body: {
          Html: { Data: params.html },
          Text: { Data: params.text },
        },
      },
      ConfigurationSetName: this.configService.get('SES_CONFIGURATION_SET_NAME'),
      Tags: params.tags,
    });

    const response = await this.sesClient.send(command);

    return {
      messageId: response.MessageId,
      success: true,
    };
  }

  /**
   * Get circuit breaker stats for monitoring
   */
  getCircuitBreakerStats() {
    return {
      state: this.circuitBreaker.opened ? 'OPEN' : 'CLOSED',
      stats: this.circuitBreaker.stats,
    };
  }
}
```

**Endpoint de health check:**

```typescript
// apps/worker/src/controllers/worker-health.controller.ts
@Get('circuit-breaker')
getCircuitBreakerStatus() {
  return this.sesService.getCircuitBreakerStats();
}
```

**Métricas (se usar Prometheus):**

```typescript
// Adicionar métricas ao circuit breaker
this.circuitBreaker.on('success', () => {
  // metricsService.incrementCounter('ses_circuit_breaker_success');
});

this.circuitBreaker.on('failure', () => {
  // metricsService.incrementCounter('ses_circuit_breaker_failure');
});

this.circuitBreaker.on('open', () => {
  // metricsService.setGauge('ses_circuit_breaker_state', 2); // 0=closed, 1=half-open, 2=open
});

this.circuitBreaker.on('close', () => {
  // metricsService.setGauge('ses_circuit_breaker_state', 0);
});
```

**Testes:**

```typescript
describe('SESService - Circuit Breaker', () => {
  it('should open circuit after threshold errors', async () => {
    mockSesClient.send.mockRejectedValue(new Error('SES Error'));

    // Provocar erros até abrir circuito
    for (let i = 0; i < 10; i++) {
      try {
        await service.sendEmail({ to: 'test@example.com', ... });
      } catch (error) {
        // Expected
      }
    }

    // Circuito deve estar aberto
    const stats = service.getCircuitBreakerStats();
    expect(stats.state).toBe('OPEN');
  });

  it('should reject requests immediately when circuit open', async () => {
    // Abrir circuito artificialmente
    for (let i = 0; i < 10; i++) {
      mockSesClient.send.mockRejectedValue(new Error('SES Error'));
      try {
        await service.sendEmail({ to: 'test@example.com', ... });
      } catch {}
    }

    // Próxima chamada deve falhar imediatamente
    const startTime = Date.now();
    try {
      await service.sendEmail({ to: 'test@example.com', ... });
    } catch (error) {
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Falha rápida
      expect(error.message).toContain('circuit breaker open');
    }
  });

  it('should half-open circuit after reset timeout', async () => {
    jest.useFakeTimers();

    // Abrir circuito
    for (let i = 0; i < 10; i++) {
      mockSesClient.send.mockRejectedValue(new Error('SES Error'));
      try {
        await service.sendEmail({ to: 'test@example.com', ... });
      } catch {}
    }

    // Avançar tempo
    jest.advanceTimersByTime(30000);

    // SES recuperou
    mockSesClient.send.mockResolvedValue({ MessageId: 'test-123' });

    // Deve permitir tentativa (half-open)
    await service.sendEmail({ to: 'test@example.com', ... });

    const stats = service.getCircuitBreakerStats();
    expect(stats.state).toBe('CLOSED');

    jest.useRealTimers();
  });
});
```

**Configuração (.env):**

```bash
# Circuit Breaker Configuration
CIRCUIT_BREAKER_TIMEOUT=5000
CIRCUIT_BREAKER_ERROR_THRESHOLD=50
CIRCUIT_BREAKER_RESET_TIMEOUT=30000
CIRCUIT_BREAKER_VOLUME_THRESHOLD=10
```

## Categoria
**Resiliência - Proteção contra falhas em cascata**

## Bloqueador para Produção?
**NÃO** - Mas fortemente recomendado para produção. Protege sistema de overload quando SES falha.
