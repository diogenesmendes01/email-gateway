# Email Gateway Monitoring

This document describes the monitoring setup for the Email Gateway using Prometheus and Grafana.

## Quick Start

Start the monitoring stack:

```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

Access:
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)
- **API Metrics**: http://localhost:3000/metrics
- **Worker Metrics**: http://localhost:3002/metrics

## Metrics Overview

### Business Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `email_sent_total` | Counter | Total emails successfully sent | `company_id`, `provider` |
| `email_failed_total` | Counter | Total failed emails | `company_id`, `reason`, `provider` |
| `email_retry_total` | Counter | Total email retries | `company_id`, `attempt` |
| `email_send_duration_seconds` | Histogram | Email send duration | `company_id` |
| `email_queue_size` | Gauge | Current queue size | `queue` |
| `encryption_duration_seconds` | Histogram | CPF/CNPJ encryption duration | - |

### System Metrics (Default)

All metrics prefixed with `email_gateway_api_`:
- `process_cpu_user_seconds_total`
- `process_resident_memory_bytes`
- `nodejs_heap_size_used_bytes`
- `nodejs_gc_duration_seconds`
- `http_request_duration_seconds`

## Alerts

### Critical Alerts

1. **HighEmailFailureRate**
   - Trigger: Failure rate > 5% for 5 minutes
   - Action: Check SES status, database, recent deployments

2. **CriticalQueueBacklog**
   - Trigger: Queue > 50k emails for 5 minutes
   - Action: IMMEDIATE - Scale workers or investigate failure

3. **APIDown / WorkerDown**
   - Trigger: Service down for 2 minutes
   - Action: IMMEDIATE - Check container/process status

### Warning Alerts

1. **QueueBacklog**
   - Trigger: Queue > 10k emails for 10 minutes
   - Action: Scale worker instances

2. **HighEncryptionLatency**
   - Trigger: p95 > 500ms for 5 minutes
   - Action: Check CPU usage, key rotation

3. **HighAPILatency**
   - Trigger: p95 > 2s for 5 minutes
   - Action: Check database, Redis, queue performance

4. **HighRetryRate**
   - Trigger: Retry rate > 20% for 10 minutes
   - Action: Check SES rate limits, network

## Grafana Dashboards

### Email Gateway Overview

Panels:
1. **Emails Sent (rate)** - Emails per minute by company
2. **Failure Rate** - Percentage of failed emails
3. **Queue Size** - Waiting, active, failed, delayed
4. **Send Duration** - p50, p95, p99 latencies
5. **Encryption Duration** - p95 encryption latency
6. **Failed by Reason** - Breakdown of failure reasons
7. **Retry Rate** - Retry attempts by number
8. **System Health** - API and Worker UP/DOWN status

## Querying Prometheus

### Common Queries

**Total emails sent in last hour:**
```promql
sum(increase(email_sent_total[1h]))
```

**Failure rate:**
```promql
rate(email_failed_total[5m]) / (rate(email_sent_total[5m]) + rate(email_failed_total[5m]))
```

**95th percentile latency:**
```promql
histogram_quantile(0.95, rate(email_send_duration_seconds_bucket[5m]))
```

**Queue backlog:**
```promql
email_queue_size{queue="email_queue_waiting"}
```

**Emails by company:**
```promql
sum(rate(email_sent_total[5m])) by (company_id)
```

## Architecture

```
┌─────────────┐     metrics      ┌────────────────┐
│  API :3000  │ ──────/metrics──>│                │
└─────────────┘                  │  Prometheus    │
                                 │    :9090       │
┌─────────────┐     metrics      │                │
│Worker :3002 │ ──────/metrics──>│                │
└─────────────┘                  └────────┬───────┘
                                          │
                                          │ scrapes
                                          │
                                 ┌────────v───────┐
                                 │   Grafana      │
                                 │    :3001       │
                                 └────────────────┘
```

## Retention

- **Prometheus**: 30 days (configurable in prometheus.yml)
- **Grafana**: Persistent volume (grafana_data)

## Production Recommendations

1. **Alert Routing**: Configure Alertmanager for Slack/PagerDuty/Email
2. **Authentication**: Enable Grafana OAuth/LDAP
3. **Backup**: Regular backups of Prometheus data and Grafana dashboards
4. **Scaling**: Use remote storage (Thanos, Cortex) for long-term retention
5. **Security**: Put behind reverse proxy with TLS

## Troubleshooting

### Metrics not showing in Prometheus

1. Check target status: http://localhost:9090/targets
2. Verify API/Worker are running: `curl http://localhost:3000/metrics`
3. Check Prometheus logs: `docker logs email-gateway-prometheus`

### Grafana dashboard empty

1. Verify Prometheus datasource: Grafana → Configuration → Data Sources
2. Check query syntax in panel editor
3. Adjust time range (top right in Grafana)

### High memory usage

1. Reduce retention period in `prometheus.yml`
2. Increase scrape interval to 30s or 60s
3. Use recording rules for expensive queries

## Cost Estimation

For 1M emails/month:
- **Prometheus storage**: ~1-2GB/month
- **Grafana storage**: ~100MB
- **CPU overhead**: ~5-10ms per request
- **Memory overhead**: ~50-100MB per service

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [NestJS Prometheus](https://github.com/willsoto/nestjs-prometheus)
