# 02-load-chaos-performance

> **Tipo:** Testing | Referência
> **Status:** Em Revisão
> **Última atualização:** 2025-10-23
> **Responsável:** Equipe MVP Email Gateway

## Visão Geral

Este documento define estratégias de **teste de carga**, **engenharia de caos** e **monitoramento de performance** para o MVP de envio de boletos por e-mail. Cobre cenários de pico, fairness multi-tenant, resiliência a falhas e métricas de observabilidade.

## Índice

- [Visão Geral](#visão-geral)
- [Objetivos](#objetivos)
- [Contexto](#contexto)
- [1. Testes de Carga](#1-testes-de-carga)
  - [1.1 Dados Sintéticos](#11-dados-sintéticos)
  - [1.2 Cenários de Pico e Plateau](#12-cenários-de-pico-e-plateau)
  - [1.3 Multi-tenant com Fairness](#13-multi-tenant-com-fairness)
- [2. Engenharia de Caos](#2-engenharia-de-caos)
  - [2.1 Redis Down (60s)](#21-redis-down-60s)
  - [2.2 AWS SES 429 (Rate Limit)](#22-aws-ses-429-rate-limit)
  - [2.3 Disco 95% Cheio](#23-disco-95-cheio)
- [3. Métricas e Relatórios](#3-métricas-e-relatórios)
  - [3.1 Latência (P50/P95/P99)](#31-latência-p50p95p99)
  - [3.2 Taxa de Erro (error_rate)](#32-taxa-de-erro-error_rate)
  - [3.3 Idade da Fila (queue_age_p95)](#33-idade-da-fila-queue_age_p95)
- [4. Ferramentas e Setup](#4-ferramentas-e-setup)
- [5. Runbooks de Execução](#5-runbooks-de-execução)
- [Referências](#referências)

## Objetivos

Este documento tem como objetivos:

- Definir cenários de teste de carga para validar throughput e latência
- Estabelecer práticas de engenharia de caos para validar resiliência
- Especificar métricas de performance e SLIs para monitoramento contínuo
- Fornecer runbooks executáveis para testes de pré-produção

## Contexto

### MVP Requirements

**Volume esperado:**
- **40k emails/mês** (~1.300/dia)
- **Pico:** 2.000 emails/hora (0,56 req/s média)
- **Parceiros:** 5 empresas (M2, CodeWave, TrustCloud, CertShift, Pixel)

**SLIs (Service Level Indicators):**
- **Latência (ingestion):** P95 < 250ms
- **Latência (processing):** P95 < 60s da fila ao envio
- **Throughput:** ≥ 2.000 emails/hora em pico
- **Disponibilidade:** ≥ 99,5% (horário comercial)
- **Success Rate:** ≥ 99% (emails SENT vs FAILED)

### Quem deve usar este documento?

- **QA/Testers:** Executar testes de carga e caos antes do go-live
- **DevOps/SRE:** Validar infraestrutura sob estresse
- **Desenvolvedores:** Entender limites do sistema e pontos de falha
- **Product Owners:** Validar que o sistema atende SLAs de negócio

---

## 1. Testes de Carga

### 1.1 Dados Sintéticos

**Objetivo:** Gerar dados realistas para testes sem depender de dados de produção.

#### Gerador de Payloads Sintéticos

```typescript
// scripts/load-testing/generate-synthetic-data.ts
import { faker } from '@faker-js/faker';
import { randomUUID } from 'crypto';

interface SyntheticEmail {
  externalId: string;
  companyId: string;
  recipient: string;
  subject: string;
  html: string;
  cpfCnpj?: string;
}

const COMPANIES = ['m2', 'codewave', 'trustcloud', 'certshift', 'pixel'];

export function generateSyntheticEmail(companyId?: string): SyntheticEmail {
  const company = companyId || faker.helpers.arrayElement(COMPANIES);
  const cpfCnpj = faker.datatype.boolean()
    ? faker.string.numeric(11) // CPF
    : faker.string.numeric(14); // CNPJ

  return {
    externalId: `BOL-${company.toUpperCase()}-${randomUUID()}`,
    companyId: company,
    recipient: faker.internet.email(),
    subject: `Boleto ${faker.finance.accountNumber()} - Vencimento ${faker.date.soon().toISOString().split('T')[0]}`,
    html: generateBoletoHTML(cpfCnpj),
    cpfCnpj,
  };
}

function generateBoletoHTML(cpfCnpj: string): string {
  return `
<!DOCTYPE html>
<html>
<head><title>Boleto Bancário</title></head>
<body>
  <h1>Boleto Bancário</h1>
  <p><strong>Beneficiário:</strong> ${faker.company.name()}</p>
  <p><strong>CPF/CNPJ:</strong> ${cpfCnpj}</p>
  <p><strong>Valor:</strong> R$ ${faker.finance.amount(50, 5000, 2)}</p>
  <p><strong>Vencimento:</strong> ${faker.date.soon().toLocaleDateString('pt-BR')}</p>
  <p><strong>Código de Barras:</strong> ${faker.string.numeric(47)}</p>
  <div style="margin-top: 20px;">
    <img src="https://via.placeholder.com/600x100?text=CODIGO+DE+BARRAS" alt="Código de barras">
  </div>
</body>
</html>
  `.trim();
}

export function generateBatch(count: number, companyId?: string): SyntheticEmail[] {
  return Array.from({ length: count }, () => generateSyntheticEmail(companyId));
}
```

**Características dos dados sintéticos:**
- ✅ CPF/CNPJ realistas (11 ou 14 dígitos)
- ✅ Emails únicos por geração
- ✅ HTML com tamanho variável (500B - 50KB)
- ✅ Distribuição uniforme entre empresas (ou targeted)
- ✅ ExternalId único para idempotência

---

### 1.2 Cenários de Pico e Plateau

**Objetivo:** Validar comportamento do sistema em condições de carga normal, pico e sustentada.

#### Cenário 1: Carga Baseline (Plateau)

**Perfil:**
- **Throughput:** 500 req/hour (0,14 req/s)
- **Duração:** 1 hora
- **Objetivo:** Validar estabilidade em operação normal

**Script K6:**

```javascript
// scripts/load-testing/k6-baseline.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');
const API_KEY = __ENV.API_KEY;
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  vus: 5, // 5 virtual users
  duration: '1h',
  thresholds: {
    http_req_duration: ['p(95)<250'], // P95 < 250ms
    errors: ['rate<0.01'], // Error rate < 1%
  },
};

export default function () {
  const payload = JSON.stringify({
    externalId: `BOL-LOAD-${Date.now()}-${__VU}-${__ITER}`,
    recipient: `test${__VU}@example.com`,
    subject: 'Boleto de Teste',
    html: '<html><body><h1>Boleto</h1></body></html>',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      'X-Request-Id': `req-${__VU}-${__ITER}`,
    },
  };

  const res = http.post(`${BASE_URL}/v1/email/send`, payload, params);

  check(res, {
    'status is 201': (r) => r.status === 201,
    'has outboxId': (r) => JSON.parse(r.body).outboxId !== undefined,
    'response time < 250ms': (r) => r.timings.duration < 250,
  });

  errorRate.add(res.status !== 201);

  sleep(36); // 36s sleep for 5 VUs = 5 × 100 = ~500 req/hour
}
```

**Validação de sucesso:**
- ✅ P95 latency < 250ms
- ✅ Error rate < 1%
- ✅ CPU < 40%
- ✅ Memory stable (no leaks)
- ✅ Queue age < 5s

---

#### Cenário 2: Pico de Carga (Spike)

**Perfil:**
- **Throughput:** 2.000 req/hour (0,56 req/s) por 15 minutos
- **Duração:** 15 minutos
- **Objetivo:** Validar comportamento no limite do SLA

**Script K6:**

```javascript
// scripts/load-testing/k6-spike.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const queueAge = new Trend('queue_age', true);
const API_KEY = __ENV.API_KEY;
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '1m', target: 10 }, // Ramp up to 10 VUs
    { duration: '15m', target: 10 }, // Sustain 2000 req/hour
    { duration: '1m', target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<250'],
    errors: ['rate<0.01'],
    queue_age: ['p(95)<60000'], // P95 < 60s
  },
};

export default function () {
  const payload = JSON.stringify({
    externalId: `BOL-SPIKE-${Date.now()}-${__VU}-${__ITER}`,
    recipient: `spike${__VU}@example.com`,
    subject: 'Boleto Spike Test',
    html: generateLargeHTML(5000), // 5KB HTML
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
  };

  const res = http.post(`${BASE_URL}/v1/email/send`, payload, params);

  check(res, {
    'status is 201': (r) => r.status === 201,
    'rate limit not hit': (r) => r.status !== 429,
  });

  errorRate.add(res.status !== 201);

  sleep(18); // 18s sleep for 10 VUs = 10 × 200 = 2000 req/hour
}

function generateLargeHTML(sizeBytes) {
  return '<html><body>' + 'A'.repeat(sizeBytes) + '</body></html>';
}
```

**Validação de sucesso:**
- ✅ P95 latency < 250ms (pode degradar até 300ms aceitável)
- ✅ Error rate < 1%
- ✅ CPU < 70%
- ✅ Queue age P95 < 60s
- ✅ No rate limit 429 errors

---

### 1.3 Multi-tenant com Fairness

**Objetivo:** Garantir que nenhuma empresa monopoliza recursos, validando round-robin fairness.

#### Cenário 3: Multi-tenant Fairness Test

**Perfil:**
- **5 empresas** enviando simultaneamente
- **Distribuição desigual:** M2 (50%), CodeWave (20%), outros (10% cada)
- **Duração:** 30 minutos
- **Validação:** Nenhuma empresa deve ter queue age > 2x da média

**Script K6:**

```javascript
// scripts/load-testing/k6-fairness.js
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const companySent = {
  m2: new Counter('emails_sent_m2'),
  codewave: new Counter('emails_sent_codewave'),
  trustcloud: new Counter('emails_sent_trustcloud'),
  certshift: new Counter('emails_sent_certshift'),
  pixel: new Counter('emails_sent_pixel'),
};

const API_KEYS = {
  m2: __ENV.API_KEY_M2,
  codewave: __ENV.API_KEY_CODEWAVE,
  trustcloud: __ENV.API_KEY_TRUSTCLOUD,
  certshift: __ENV.API_KEY_CERTSHIFT,
  pixel: __ENV.API_KEY_PIXEL,
};

export const options = {
  scenarios: {
    m2_heavy: {
      executor: 'constant-arrival-rate',
      rate: 50, // 50 req/min
      duration: '30m',
      preAllocatedVUs: 10,
      exec: 'm2Scenario',
    },
    codewave_medium: {
      executor: 'constant-arrival-rate',
      rate: 20,
      duration: '30m',
      preAllocatedVUs: 5,
      exec: 'codewaveScenario',
    },
    trustcloud_light: {
      executor: 'constant-arrival-rate',
      rate: 10,
      duration: '30m',
      preAllocatedVUs: 3,
      exec: 'trustcloudScenario',
    },
    certshift_light: {
      executor: 'constant-arrival-rate',
      rate: 10,
      duration: '30m',
      preAllocatedVUs: 3,
      exec: 'certshiftScenario',
    },
    pixel_light: {
      executor: 'constant-arrival-rate',
      rate: 10,
      duration: '30m',
      preAllocatedVUs: 3,
      exec: 'pixelScenario',
    },
  },
};

export function m2Scenario() {
  sendEmail('m2');
}

export function codewaveScenario() {
  sendEmail('codewave');
}

export function trustcloudScenario() {
  sendEmail('trustcloud');
}

export function certshiftScenario() {
  sendEmail('certshift');
}

export function pixelScenario() {
  sendEmail('pixel');
}

function sendEmail(company) {
  const payload = JSON.stringify({
    externalId: `BOL-${company.toUpperCase()}-${Date.now()}-${__VU}-${__ITER}`,
    recipient: `${company}@example.com`,
    subject: `Boleto ${company}`,
    html: '<html><body>Test</body></html>',
  });

  const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
  const res = http.post(`${BASE_URL}/v1/email/send`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEYS[company],
    },
  });

  if (res.status === 201) {
    companySent[company].add(1);
  }
}
```

**Análise de Fairness:**

Após o teste, consultar métricas de processamento por empresa:

```sql
-- Query para validar fairness
SELECT
  company_id,
  COUNT(*) as total_emails,
  AVG(EXTRACT(EPOCH FROM (sent_at - created_at))) as avg_processing_time_sec,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (sent_at - created_at))) as p95_processing_time_sec
FROM email_outbox
WHERE created_at > NOW() - INTERVAL '30 minutes'
  AND status = 'SENT'
GROUP BY company_id
ORDER BY total_emails DESC;
```

**Critérios de sucesso:**
- ✅ P95 processing time de **qualquer empresa** não deve ser > 2x da média global
- ✅ Empresas menores (pixel, certshift) não devem ter starvation (queue age < 120s)
- ✅ Total de emails processados deve corresponder ao enviado (perda < 0,1%)

---

## 2. Engenharia de Caos

**Objetivo:** Validar resiliência do sistema a falhas de infraestrutura e dependências externas.

### 2.1 Redis Down (60s)

**Cenário:** Redis (fila BullMQ) fica indisponível por 60 segundos durante carga ativa.

**Hipótese:**
- Sistema deve rejeitar novos emails com **503 Service Unavailable**
- Jobs em execução devem falhar gracefully
- Após recuperação, sistema deve retomar processamento automaticamente

**Setup:**

```bash
# Usando Docker Compose para simular falha
docker-compose -f docker-compose.chaos.yml up -d

# Derrubar Redis por 60s
docker-compose -f docker-compose.chaos.yml stop redis
sleep 60
docker-compose -f docker-compose.chaos.yml start redis
```

**Script de Validação:**

```typescript
// scripts/chaos-testing/redis-down.ts
import axios from 'axios';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCb);
const sleep = (seconds: number) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

async function testRedisFailure() {
  console.log('[CHAOS] Iniciando teste: Redis Down 60s');

  // Fase 1: Sistema saudável
  console.log('[CHAOS] Fase 1: Sistema saudável (30s)');
  for (let i = 0; i < 30; i++) {
    const res = await sendEmail(`BOL-PRE-CHAOS-${i}`);
    if (res.status !== 201) {
      console.error(`[CHAOS] FAIL: Expected 201, got ${res.status}`);
    }
    await sleep(1);
  }

  // Fase 2: Derrubar Redis
  console.log('[CHAOS] Fase 2: Derrubando Redis...');
  await exec('docker-compose stop redis');

  // Fase 3: Validar erro 503
  console.log('[CHAOS] Fase 3: Validando erro 503 (60s)');
  for (let i = 0; i < 60; i++) {
    const res = await sendEmail(`BOL-CHAOS-${i}`);
    if (res.status !== 503) {
      console.error(`[CHAOS] FAIL: Expected 503 during Redis down, got ${res.status}`);
    }
    await sleep(1);
  }

  // Fase 4: Recuperar Redis
  console.log('[CHAOS] Fase 4: Recuperando Redis...');
  await exec('docker-compose start redis');
  await sleep(10); // Wait for Redis to be ready

  // Fase 5: Validar recuperação
  console.log('[CHAOS] Fase 5: Validando recuperação (30s)');
  for (let i = 0; i < 30; i++) {
    const res = await sendEmail(`BOL-POST-CHAOS-${i}`);
    if (res.status !== 201) {
      console.error(`[CHAOS] FAIL: Expected 201 after recovery, got ${res.status}`);
    }
    await sleep(1);
  }

  console.log('[CHAOS] Teste concluído. Validar métricas manualmente.');
}

async function sendEmail(externalId: string) {
  try {
    return await axios.post('http://localhost:3000/v1/email/send', {
      externalId,
      recipient: 'chaos@example.com',
      subject: 'Chaos Test',
      html: '<html><body>Chaos</body></html>',
    }, {
      headers: { 'X-API-Key': process.env.API_KEY },
      timeout: 5000,
    });
  } catch (error) {
    return { status: error.response?.status || 500 };
  }
}

testRedisFailure();
```

**Validação de sucesso:**
- ✅ Durante falha: API retorna **503 Service Unavailable**
- ✅ Durante falha: Logs indicam "Redis connection failed"
- ✅ Após recuperação: API retorna **201 Created** em < 10s
- ✅ Após recuperação: Jobs pendentes são processados automaticamente
- ✅ **Zero perda de dados** (todos emails pré-chaos eventualmente são SENT)

---

### 2.2 AWS SES 429 (Rate Limit)

**Cenário:** AWS SES retorna 429 (rate limit excedido) em 50% das requisições por 5 minutos.

**Hipótese:**
- Sistema deve fazer **backoff exponencial** e **retry**
- Emails não devem ir para DLQ imediatamente
- Queue age deve aumentar mas sistema deve se recuperar

**Setup (Mock SES):**

```typescript
// scripts/chaos-testing/mock-ses-429.ts
import express from 'express';
import { randomInt } from 'crypto';

const app = express();
app.use(express.json());

let chaosMode = false;

app.post('/mock-ses/send', (req, res) => {
  if (chaosMode && randomInt(0, 100) < 50) {
    // 50% chance of 429
    return res.status(429).json({
      Error: {
        Code: 'Throttling',
        Message: 'Maximum sending rate exceeded',
      },
    });
  }

  // Success
  res.status(200).json({ MessageId: `msg-${Date.now()}` });
});

app.post('/chaos/enable', (req, res) => {
  chaosMode = true;
  console.log('[CHAOS] SES 429 mode ENABLED');
  res.json({ chaosMode });
});

app.post('/chaos/disable', (req, res) => {
  chaosMode = false;
  console.log('[CHAOS] SES 429 mode DISABLED');
  res.json({ chaosMode });
});

app.listen(4000, () => console.log('Mock SES running on port 4000'));
```

**Configuração de Teste:**

```bash
# Terminal 1: Start mock SES
npm run chaos:mock-ses

# Terminal 2: Configure app to use mock SES
export AWS_SES_ENDPOINT=http://localhost:4000/mock-ses
npm run start:dev

# Terminal 3: Enable chaos mode
curl -X POST http://localhost:4000/chaos/enable

# Terminal 4: Run load test
k6 run scripts/load-testing/k6-spike.js

# Wait 5 minutes, then disable chaos
sleep 300
curl -X POST http://localhost:4000/chaos/disable
```

**Validação de sucesso:**
- ✅ Durante 429: Jobs vão para **RETRY_SCHEDULED** (não FAILED)
- ✅ Durante 429: Logs mostram "SES rate limit hit, retrying in Xs"
- ✅ Durante 429: Queue age P95 aumenta mas < 300s
- ✅ Após recuperação: Todos emails eventualmente SENT em < 10 minutos
- ✅ Backoff exponencial observado: 1min → 5min → 30min

---

### 2.3 Disco 95% Cheio

**Cenário:** Disco de logs/database atinge 95% de capacidade.

**Hipótese:**
- Sistema deve alertar via logs
- PostgreSQL pode degradar performance
- Sistema deve continuar operando (não crash)

**Setup:**

```bash
# Preencher disco com arquivo grande
dd if=/dev/zero of=/tmp/bigfile bs=1M count=10000  # 10GB

# Monitorar uso de disco
df -h /
```

**Script de Validação:**

```typescript
// scripts/chaos-testing/disk-full.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';

const execAsync = promisify(exec);

async function testDiskFull() {
  console.log('[CHAOS] Verificando espaço em disco...');
  const { stdout } = await execAsync('df -h / | tail -1');
  console.log('[CHAOS] Uso atual:', stdout);

  // Preencher disco até 95%
  console.log('[CHAOS] Preenchendo disco até 95%...');
  await execAsync('dd if=/dev/zero of=/tmp/chaos-bigfile bs=1M count=5000');

  // Enviar emails durante estresse de disco
  console.log('[CHAOS] Enviando 100 emails com disco 95% cheio...');
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < 100; i++) {
    try {
      const res = await axios.post('http://localhost:3000/v1/email/send', {
        externalId: `BOL-DISK-FULL-${i}`,
        recipient: 'disk@example.com',
        subject: 'Disk Full Test',
        html: '<html><body>Test</body></html>',
      }, {
        headers: { 'X-API-Key': process.env.API_KEY },
        timeout: 10000,
      });

      if (res.status === 201) successCount++;
    } catch (error) {
      errorCount++;
    }
  }

  console.log(`[CHAOS] Resultado: ${successCount} success, ${errorCount} errors`);

  // Limpar
  console.log('[CHAOS] Limpando disco...');
  await execAsync('rm -f /tmp/chaos-bigfile');
}

testDiskFull();
```

**Validação de sucesso:**
- ✅ Success rate > 90% (sistema degradado mas operando)
- ✅ Logs incluem warning "Disk usage above 90%"
- ✅ PostgreSQL queries degradam mas não falham (latência < 1s)
- ✅ Após cleanup: sistema retorna ao normal em < 30s

---

## 3. Métricas e Relatórios

### 3.1 Latência (P50/P95/P99)

**Métrica:** Tempo de resposta da API de ingestion.

**Coleta:**

```typescript
// apps/api/src/middleware/metrics.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Histogram } from 'prom-client';

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
});

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      httpRequestDuration
        .labels(req.method, req.route?.path || req.path, res.statusCode.toString())
        .observe(duration);
    });

    next();
  }
}
```

**Query Prometheus:**

```promql
# P50
histogram_quantile(0.50,
  rate(http_request_duration_ms_bucket{route="/v1/email/send"}[5m])
)

# P95
histogram_quantile(0.95,
  rate(http_request_duration_ms_bucket{route="/v1/email/send"}[5m])
)

# P99
histogram_quantile(0.99,
  rate(http_request_duration_ms_bucket{route="/v1/email/send"}[5m])
)
```

**Dashboard Grafana:**

```json
{
  "dashboard": {
    "title": "Email Gateway - Latency",
    "panels": [
      {
        "title": "API Ingestion Latency (P50/P95/P99)",
        "targets": [
          {
            "expr": "histogram_quantile(0.50, rate(http_request_duration_ms_bucket{route=\"/v1/email/send\"}[5m]))",
            "legendFormat": "P50"
          },
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_ms_bucket{route=\"/v1/email/send\"}[5m]))",
            "legendFormat": "P95"
          },
          {
            "expr": "histogram_quantile(0.99, rate(http_request_duration_ms_bucket{route=\"/v1/email/send\"}[5m]))",
            "legendFormat": "P99"
          }
        ],
        "yAxes": [{ "format": "ms", "label": "Latency" }]
      }
    ]
  }
}
```

**Alertas:**

```yaml
# prometheus/alerts.yml
groups:
  - name: latency
    rules:
      - alert: HighAPILatency
        expr: histogram_quantile(0.95, rate(http_request_duration_ms_bucket{route="/v1/email/send"}[5m])) > 250
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API P95 latency above 250ms"
          description: "P95 latency is {{ $value }}ms (threshold: 250ms)"
```

---

### 3.2 Taxa de Erro (error_rate)

**Métrica:** Percentual de emails que falharam definitivamente (status FAILED ou DLQ).

**Coleta:**

```typescript
// apps/worker/src/processors/email.processor.ts
import { Counter } from 'prom-client';

const emailProcessed = new Counter({
  name: 'email_processed_total',
  help: 'Total emails processed',
  labelNames: ['status', 'company_id'],
});

export class EmailProcessor {
  async process(job: Job) {
    try {
      // ... process email ...
      emailProcessed.labels('sent', job.data.companyId).inc();
    } catch (error) {
      emailProcessed.labels('failed', job.data.companyId).inc();
      throw error;
    }
  }
}
```

**Query Prometheus:**

```promql
# Error rate (últimos 5 minutos)
sum(rate(email_processed_total{status="failed"}[5m]))
/
sum(rate(email_processed_total[5m]))

# Por empresa
sum by (company_id) (rate(email_processed_total{status="failed"}[5m]))
/
sum by (company_id) (rate(email_processed_total[5m]))
```

**Alerta:**

```yaml
- alert: HighErrorRate
  expr: sum(rate(email_processed_total{status="failed"}[5m])) / sum(rate(email_processed_total[5m])) > 0.01
  for: 10m
  labels:
    severity: critical
  annotations:
    summary: "Email error rate above 1%"
    description: "Error rate is {{ $value | humanizePercentage }} (threshold: 1%)"
```

---

### 3.3 Idade da Fila (queue_age_p95)

**Métrica:** Tempo que um email permanece na fila antes de ser processado.

**Coleta:**

```typescript
// apps/worker/src/processors/email.processor.ts
import { Histogram } from 'prom-client';

const queueAge = new Histogram({
  name: 'email_queue_age_seconds',
  help: 'Time email spent in queue before processing',
  labelNames: ['company_id'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
});

export class EmailProcessor {
  async process(job: Job) {
    const queueTime = (Date.now() - job.timestamp) / 1000; // seconds
    queueAge.labels(job.data.companyId).observe(queueTime);

    // ... process email ...
  }
}
```

**Query Prometheus:**

```promql
# P95 queue age
histogram_quantile(0.95,
  rate(email_queue_age_seconds_bucket[5m])
)

# Por empresa
histogram_quantile(0.95,
  sum by (company_id, le) (rate(email_queue_age_seconds_bucket[5m]))
)
```

**Alerta:**

```yaml
- alert: HighQueueAge
  expr: histogram_quantile(0.95, rate(email_queue_age_seconds_bucket[5m])) > 60
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Queue age P95 above 60s"
    description: "P95 queue age is {{ $value }}s (threshold: 60s)"
```

---

## 4. Ferramentas e Setup

### 4.1 K6 (Load Testing)

**Instalação:**

```bash
# macOS
brew install k6

# Linux
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Docker
docker pull grafana/k6
```

**Uso:**

```bash
# Executar teste local
k6 run scripts/load-testing/k6-baseline.js

# Com output para Prometheus
k6 run --out prometheus scripts/load-testing/k6-spike.js

# Com relatório HTML
k6 run --out json=results.json scripts/load-testing/k6-fairness.js
k6-reporter results.json --output report.html
```

---

### 4.2 Prometheus + Grafana

**Docker Compose:**

```yaml
# docker-compose.monitoring.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./prometheus/alerts.yml:/etc/prometheus/alerts.yml
    ports:
      - "9090:9090"
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./grafana/datasources:/etc/grafana/provisioning/datasources

  node-exporter:
    image: prom/node-exporter:latest
    ports:
      - "9100:9100"
```

**Prometheus Config:**

```yaml
# prometheus/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'email-gateway-api'
    static_configs:
      - targets: ['host.docker.internal:3000']

  - job_name: 'email-gateway-worker'
    static_configs:
      - targets: ['host.docker.internal:3001']

  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - 'alerts.yml'
```

---

### 4.3 Chaos Toolkit

**Instalação:**

```bash
pip install chaostoolkit chaostoolkit-kubernetes
```

**Experimento de Caos (Redis Down):**

```yaml
# chaos-experiments/redis-down.yaml
version: 1.0.0
title: Redis Unavailability for 60 seconds
description: Validate system behavior when Redis is unavailable

steady-state-hypothesis:
  title: System is healthy
  probes:
    - type: probe
      name: api-is-responding
      tolerance: 200
      provider:
        type: http
        url: http://localhost:3000/health

method:
  - type: action
    name: stop-redis-container
    provider:
      type: process
      path: docker
      arguments: ["compose", "stop", "redis"]

  - type: probe
    name: verify-503-during-downtime
    provider:
      type: http
      url: http://localhost:3000/v1/email/send
      method: POST
      headers:
        Content-Type: application/json
        X-API-Key: ${API_KEY}
      body: '{"recipient": "test@example.com", "subject": "Test", "html": "Test"}'
      timeout: 5
      expected_status: 503

  - type: action
    name: wait-60-seconds
    provider:
      type: python
      module: time
      func: sleep
      arguments: [60]

  - type: action
    name: start-redis-container
    provider:
      type: process
      path: docker
      arguments: ["compose", "start", "redis"]

  - type: action
    name: wait-for-recovery
    provider:
      type: python
      module: time
      func: sleep
      arguments: [10]

rollbacks:
  - type: action
    name: ensure-redis-is-running
    provider:
      type: process
      path: docker
      arguments: ["compose", "start", "redis"]
```

**Executar:**

```bash
chaos run chaos-experiments/redis-down.yaml
```

---

## 5. Runbooks de Execução

### 5.1 Pré-go-live Load Testing Checklist

**Objetivo:** Validar sistema antes de produção.

**Checklist:**

- [ ] **1. Baseline Test (1 hora)**
  ```bash
  k6 run --vus 5 --duration 1h scripts/load-testing/k6-baseline.js
  ```
  - [ ] P95 latency < 250ms
  - [ ] Error rate < 1%
  - [ ] Memory stable (no leaks)

- [ ] **2. Spike Test (15 minutos)**
  ```bash
  k6 run scripts/load-testing/k6-spike.js
  ```
  - [ ] P95 latency < 300ms (acceptable degradation)
  - [ ] No 429 rate limit errors
  - [ ] Queue age P95 < 60s

- [ ] **3. Fairness Test (30 minutos)**
  ```bash
  export API_KEY_M2=xxx API_KEY_CODEWAVE=yyy API_KEY_TRUSTCLOUD=zzz
  k6 run scripts/load-testing/k6-fairness.js
  ```
  - [ ] Validate SQL query: no company has P95 > 2x average
  - [ ] Smallest company queue age < 120s

- [ ] **4. Redis Down Chaos Test**
  ```bash
  chaos run chaos-experiments/redis-down.yaml
  ```
  - [ ] API returns 503 during downtime
  - [ ] Automatic recovery in < 30s

- [ ] **5. SES 429 Chaos Test**
  ```bash
  npm run chaos:mock-ses
  npm run chaos:enable-429
  k6 run scripts/load-testing/k6-spike.js
  npm run chaos:disable-429
  ```
  - [ ] Jobs go to RETRY_SCHEDULED (not FAILED)
  - [ ] All emails eventually SENT

- [ ] **6. Disk Full Test**
  ```bash
  node scripts/chaos-testing/disk-full.ts
  ```
  - [ ] Success rate > 90%
  - [ ] Warning logs present

- [ ] **7. Validate Dashboards**
  - [ ] Grafana dashboards showing correct data
  - [ ] Prometheus alerts configured
  - [ ] All metrics endpoints responding

---

### 5.2 Continuous Load Testing

**Frequência:** Semanal em staging

**Script:**

```bash
#!/bin/bash
# scripts/weekly-load-test.sh

echo "=== Weekly Load Test - $(date) ==="

# Run baseline for 30 minutes
k6 run --vus 5 --duration 30m \
  --out json=results/baseline-$(date +%Y%m%d).json \
  scripts/load-testing/k6-baseline.js

# Generate report
k6-reporter results/baseline-$(date +%Y%m%d).json \
  --output reports/baseline-$(date +%Y%m%d).html

# Send to Slack
curl -X POST $SLACK_WEBHOOK_URL -d "{
  \"text\": \"Weekly load test completed. Report: $REPORT_URL\"
}"
```

---

## Referências

- [Pacote de Documentos de Arquitetura — MVP](docs/00-pacote-documentos-arquitetura-mvp.md)
- [Acceptance Criteria](docs/testing/01-acceptance-criteria.md)
- [K6 Documentation](https://k6.io/docs/)
- [Chaos Toolkit Documentation](https://chaostoolkit.org/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- [Google SRE Book - Load Balancing](https://sre.google/sre-book/load-balancing-frontend/)
- [AWS SES Error Handling](https://docs.aws.amazon.com/ses/latest/dg/send-email-api.html)

---

**Template version:** 1.0
**Last updated:** 2025-10-23
