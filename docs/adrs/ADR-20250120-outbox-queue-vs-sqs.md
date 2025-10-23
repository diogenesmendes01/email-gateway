# ADR-0001-outbox-queue-vs-sqs

## Status

**Status:** Aceito

**Data:** 2025-01-20

**Decisor(es):** Equipe de Arquitetura, Tech Lead

## Contexto

O sistema de envio de boletos por e-mail atualmente utiliza o padrão **Outbox + Redis/BullMQ** para garantir entrega confiável de mensagens. Com o crescimento planejado de 10x (de 40k para 400k e-mails/mês), surge a questão se migrar para **AWS SQS** seria mais adequado para os requisitos de escala e operação.

**Requisitos específicos do sistema:**

1. **Confiabilidade**: Zero perda aceitável de pedidos já persistidos em outbox
2. **Disponibilidade**: ≥ 99,5% (horário comercial)
3. **Latência de ingestão (P95)**: ≤ 250ms para aceitar e enfileirar
4. **Tempo médio fila→envio (P95)**: ≤ 60s com fila nominal
5. **Throughput**: ≥ 2.000 envios/hora em pico curto
6. **Custo**: ≤ US$10/mês infra de produção (MVP atual)
7. **Operação**: VPS única com backups automatizados

**Cenário atual (Outbox + Redis/BullMQ):**

- API recebe requisição → persiste em `email_outbox` → enfileira job no Redis/BullMQ
- Worker consome job → envia via SES → atualiza status
- Retry automático com backoff exponencial
- DLQ para falhas permanentes
- Bull Board para monitoramento

## Decisão

**Decidimos manter a arquitetura atual Outbox + Redis/BullMQ e NÃO migrar para SQS.**

Esta decisão é baseada na análise detalhada dos requisitos específicos do sistema de boletos e nas características operacionais do MVP.

## Análise Comparativa

### Outbox + Redis/BullMQ (Atual)

#### Vantagens

**Performance e Latência:**
- Latência de enfileiramento: < 10ms (vs ~100-200ms do SQS)
- Throughput: ~50k jobs/segundo (suficiente para escala 10x)
- Processamento local sem latência de rede adicional

**Controle e Flexibilidade:**
- Controle total sobre comportamento de retry e DLQ
- Configuração customizada de backoff exponencial
- Bull Board para monitoramento em tempo real
- Fácil debugging e troubleshooting local

**Custo Operacional:**
- Custo fixo baixo: ~$20-50/mês para Redis gerenciado
- Sem custos por mensagem processada
- Aproveitamento da infraestrutura VPS existente

**Simplicidade Operacional:**
- Redis já configurado e operacional
- Time familiarizado com Bull/BullMQ
- Zero curva de aprendizado adicional
- Backup/restore já implementado

**Idempotência e Consistência:**
- Padrão Outbox garante consistência transacional
- `jobId = outboxId` para idempotência perfeita
- Controle granular sobre reprocessamento

#### Desvantagens

**Escalabilidade:**
- Redis single-instance: limite ~100k ops/s
- Requer Redis Cluster para escala muito alta
- Single point of failure sem cluster

**Operação:**
- Requer manutenção do Redis
- Backup/restore manual
- Monitoramento customizado

### AWS SQS (Alternativa)

#### Vantagens

**Escalabilidade:**
- Escalabilidade automática ilimitada
- Alta disponibilidade nativa
- Zero operação de infraestrutura

**Confiabilidade:**
- SLA 99.9% de disponibilidade
- Persistência garantida pela AWS
- DLQ nativo integrado

**Custo com Volume:**
- Econômico para volumes muito altos
- Pricing por uso sem custos fixos

#### Desvantagens

**Performance:**
- Latência de enfileiramento: ~100-200ms
- Visibilidade timeout pode causar duplicação
- Menos controle sobre timing de retry

**Custo para MVP:**
- Custo crescente com volume: ~$0.40 por 1M requests
- Para 400k e-mails/mês: ~$0.16/mês apenas em enfileiramento
- Custos adicionais de Lambda/EC2 para workers

**Vendor Lock-in:**
- Dependência total da AWS
- Migração complexa se necessário
- Menos flexibilidade para customizações

**Operação:**
- Debugging mais complexo (logs distribuídos)
- Menos visibilidade sobre comportamento interno
- Dependência de ferramentas AWS para monitoramento

## Análise de Cenários

### Cenário 1: MVP Atual (40k e-mails/mês)

**Outbox + Redis/BullMQ:**
- Custo: ~$20-50/mês (Redis gerenciado)
- Performance: Excelente (< 10ms latência)
- Operação: Simples e conhecida
- **Recomendação: Manter atual**

**AWS SQS:**
- Custo: ~$0.02/mês (enfileiramento) + infraestrutura
- Performance: Adequada (~100ms latência)
- Operação: Mais complexa para debugging
- **Recomendação: Não migrar**

### Cenário 2: Crescimento 10x (400k e-mails/mês)

**Outbox + Redis/BullMQ:**
- Custo: ~$50-100/mês (Redis com HA)
- Performance: Ainda excelente
- Operação: Pode requerer Redis Cluster
- **Recomendação: Manter com Redis Cluster**

**AWS SQS:**
- Custo: ~$0.16/mês (enfileiramento) + infraestrutura
- Performance: Adequada
- Operação: Mais complexa
- **Recomendação: Considerar apenas se operação Redis se tornar problemática**

### Cenário 3: Crescimento 100x (4M e-mails/mês)

**Outbox + Redis/BullMQ:**
- Custo: ~$200-500/mês (Redis Cluster)
- Performance: Pode requerer otimizações
- Operação: Complexa (Redis Cluster)
- **Recomendação: Reavaliar migração**

**AWS SQS:**
- Custo: ~$1.60/mês (enfileiramento) + infraestrutura
- Performance: Escalável automaticamente
- Operação: Mais simples em alta escala
- **Recomendação: Migração pode ser justificada**

## Consequências

### Positivas (Manter Outbox + Redis/BullMQ)

- **Performance mantida**: Latência < 10ms para enfileiramento
- **Custo controlado**: Custo fixo previsível
- **Operação simplificada**: Time já conhece a stack
- **Flexibilidade**: Controle total sobre comportamento
- **Time to market**: Zero tempo de migração
- **Debugging**: Ferramentas locais para troubleshooting

### Negativas (Não migrar para SQS)

- **Limitação de escala**: Redis single-instance tem limites
- **Operação manual**: Requer manutenção do Redis
- **Single point of failure**: Sem cluster é SPOF
- **Escalabilidade limitada**: Pode requerer Redis Cluster

### Mitigações

**Para limitações de escala:**
- Implementar Redis Cluster quando necessário
- Monitorar métricas de throughput mensalmente
- Planejar migração para SQS apenas em escala muito alta (> 1M e-mails/mês)

**Para operação:**
- Automatizar backup/restore do Redis
- Implementar monitoramento proativo
- Documentar procedimentos operacionais

**Para SPOF:**
- Implementar Redis Sentinel para HA
- Configurar failover automático
- Backup frequente com RTO < 1h

## Critérios para Revisão

Esta decisão deve ser reavaliada quando:

1. **Volume**: > 1M e-mails/mês (25x crescimento)
2. **Custo**: Custo operacional Redis > $500/mês
3. **Operação**: Complexidade operacional Redis se tornar problemática
4. **Disponibilidade**: Requisitos de SLA > 99.9%
5. **Time**: Time não conseguir manter operação Redis

## Plano de Migração (Futuro)

Se migração para SQS se tornar necessária:

### Fase 1: Preparação
- Implementar abstração de queue (QueueService interface)
- Criar testes de integração para ambos os providers
- Documentar processo de migração

### Fase 2: Implementação Paralela
- Implementar SQS provider mantendo Redis
- Feature flag para alternar entre providers
- Testes A/B em ambiente de staging

### Fase 3: Migração Gradual
- Migrar por empresa/tenant
- Monitorar métricas comparativas
- Rollback rápido se necessário

### Fase 4: Descomissionamento
- Remover código Redis/BullMQ
- Limpar infraestrutura Redis
- Documentar lições aprendidas

## Referências

- [ADR-20250116-escolha-redis-queue](./ADR-20250116-escolha-redis-queue.md)
- [AWS SQS Pricing](https://aws.amazon.com/sqs/pricing/)
- [Redis Cluster Documentation](https://redis.io/docs/management/scaling/)
- [Bull Queue Documentation](https://github.com/OptimalBits/bull)
- [Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)

## Notas

- Esta decisão é adequada para escala atual e crescimento 10x planejado
- Redis Cluster deve ser implementado antes de atingir limites de single-instance
- Monitorar métricas mensalmente para detectar necessidade de migração
- Manter documentação atualizada sobre limitações e planos de migração

---

**Template version:** 1.0
**Last updated:** 2025-01-20
