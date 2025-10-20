# PR16 - TASK 7.2 - Auto-throttle Improvements

## Contexto
- Origem: PR #16
- Descrição: Current auto-throttle implementation only reduces concurrency when SLO is violated, but never increases it back automatically when SLO recovers. This creates a one-way throttle that can permanently reduce throughput even after system recovers.

## O que precisa ser feito
- [ ] Implement bi-directional auto-throttle with recovery mechanism
- [ ] Add configurable throttle steps (not just fixed 50% reduction)
- [ ] Implement circuit breaker pattern for consecutive SLO violations
- [ ] Add metrics for throttle effectiveness (throttle_events, concurrency_changes)
- [ ] Create dashboard panel for SLO monitoring and auto-throttle status
- [ ] Add alerts for prolonged throttled state (> 30 minutes)
- [ ] Document throttle behavior in runbook

## Urgência
- **Nível (1–5):** 3

**Justificativa:** Medium priority. Current implementation works but lacks recovery, which could impact long-term throughput. Should be addressed after initial deployment proves SLO monitoring stability.

## Responsável sugerido
- Worker team / Backend team

## Dependências / Riscos
- **Dependências:**
  - MetricsService improvements for more granular metrics
  - Observability dashboard (TASK 7.1 metrics)

- **Riscos:**
  - Over-aggressive throttling could unnecessarily impact throughput
  - Too-fast recovery could trigger rapid oscillation (flapping)
  - Need careful tuning of recovery thresholds

## Referências
- PR #16 review comments
- Auto-scaling best practices: https://aws.amazon.com/blogs/compute/auto-scaling-best-practices/
- Circuit breaker pattern: https://martinfowler.com/bliki/CircuitBreaker.html
