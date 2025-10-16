# 01-configuracao-workers

> **Tipo:** Configuração
> **Status:** Rascunho
> **Última atualização:** 2025-01-16
> **Responsável:** Equipe de DevOps

## Visão Geral

Guia de configuração dos workers responsáveis pelo processamento de jobs de envio de e-mail.

## Configuração de Ambiente

### Variáveis Obrigatórias

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `REDIS_URL` | URL de conexão com Redis | `redis://localhost:6379` |
| `DATABASE_URL` | URL de conexão com PostgreSQL | `postgresql://user:pass@localhost:5432/email_gateway` |
| `SMTP_HOST` | Servidor SMTP | `smtp.gmail.com` |
| `SMTP_PORT` | Porta SMTP | `587` |
| `SMTP_USER` | Usuário SMTP | `noreply@empresa.com` |
| `SMTP_PASS` | Senha SMTP | `senha-segura` |

### Variáveis Opcionais

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `WORKER_CONCURRENCY` | Número de jobs simultâneos | `5` |
| `WORKER_RETRY_ATTEMPTS` | Tentativas de retry | `5` |
| `WORKER_RETRY_DELAY` | Delay inicial entre retries (ms) | `1000` |
| `LOG_LEVEL` | Nível de log | `info` |

## Configuração do Worker

### Bull Queue Configuration

```typescript
const queueConfig = {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: parseInt(process.env.WORKER_RETRY_ATTEMPTS || '5'),
    backoff: {
      type: 'exponential',
      delay: parseInt(process.env.WORKER_RETRY_DELAY || '1000'),
    },
  },
};
```

### SMTP Configuration

```typescript
const smtpConfig = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
};
```

## Processamento de Jobs

### Fluxo de Processamento

1. **Consumo**: Worker consome job da fila
2. **Validação**: Valida dados do job
3. **Envio**: Envia e-mail via SMTP
4. **Atualização**: Atualiza status no banco
5. **Log**: Registra resultado

### Tratamento de Erros

- **Erros Temporários**: Job é reenfileirado com backoff
- **Erros Permanentes**: Job é movido para DLQ
- **Timeouts**: Job é reprocessado após timeout

## Monitoramento

### Health Checks

- `/health`: Status geral do worker
- `/health/queue`: Status da conexão com Redis
- `/health/database`: Status da conexão com PostgreSQL
- `/health/smtp`: Status da conexão SMTP

### Métricas

- Jobs processados por minuto
- Taxa de sucesso/falha
- Tempo médio de processamento
- Tamanho da fila

## Escalabilidade

### Horizontal Scaling

Para escalar horizontalmente:

1. Aumente o número de instâncias do worker
2. Configure load balancer se necessário
3. Monitore utilização de recursos

### Vertical Scaling

Para melhorar performance:

1. Aumente `WORKER_CONCURRENCY`
2. Otimize queries do banco
3. Use Redis Cluster para alta disponibilidade

## Troubleshooting

### Problemas Comuns

**Worker não processa jobs:**

- Verifique conexão com Redis
- Confirme configuração de fila
- Verifique logs de erro

**Falhas de SMTP:**

- Valide credenciais SMTP
- Verifique configuração de TLS
- Confirme conectividade de rede

**Alto uso de memória:**

- Reduza `WORKER_CONCURRENCY`
- Configure cleanup de jobs
- Monitore vazamentos de memória

---

**Template version:** 1.0
**Last updated:** 2025-01-16
