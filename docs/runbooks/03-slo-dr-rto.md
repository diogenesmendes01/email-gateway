# Runbook — SLO/Capacidade e DR/RTO (TASK 7.2)

## SLOs

- Taxa de sucesso P95 ≥ 95%
- P95 de idade na fila ≤ 120s

### Como avaliar

```bash
# Via logs do worker a cada 5 min (SLOService)
# Também disponível via métricas agregadas (MetricsService)
```

## Ações Automáticas

- Auto-throttle de concorrência no worker quando houver violação de SLO
- Alertas quando DLQ > 100 ou QueueAgeP95 > 120s

## DR/RTO

- Redis:
  - AOF everysec + noeviction (ver `redis.conf`)
- Postgres:
  - Backup: `scripts/backup-postgres.sh`
  - Restore: `scripts/restore-postgres.sh`

## Testes de Caos (periódicos)

- SES 429 (throttling): `CHAOS_SES_429=true`
- Redis down 60s: `scripts/chaos-redis-down-60s.sh`
- Disco 95%: `scripts/chaos-disk-fill.sh 95`

## Procedimentos

1) Validar SLO manualmente
```bash
# Verifique logs e métricas geradas pelo worker
```

2) Executar backup antes de janelas de risco
```bash
DATABASE_URL=... ./scripts/backup-postgres.sh ./backups
```

3) Restaurar em DR
```bash
DATABASE_URL=... ./scripts/restore-postgres.sh ./backups/<arquivo>.sql.gz
```

4) Rodar caos controlado fora de horário de pico
```bash
export CHAOS_DISK_FILL=true
./scripts/chaos-disk-fill.sh 95

export CHAOS_REDIS_DOWN_60S=true
./scripts/chaos-redis-down-60s.sh

# Simular 429 no SES
export CHAOS_SES_429=true
# (rodar worker/testes e observar retries/backoff)
```

## Variáveis de Ambiente

- `SLO_TARGET_SUCCESS_RATE_PCT` (default: 95)
- `SLO_MAX_ERROR_RATE_PCT` (default: 5)
- `SLO_MAX_QUEUE_AGE_P95_MS` (default: 120000)
- `CHAOS_SES_429`, `CHAOS_DISK_FILL`, `CHAOS_REDIS_DOWN_60S`

## Observações

- Executar testes de caos com cautela; evitar janelas de pico.
- Documentar resultados e ações corretivas.


