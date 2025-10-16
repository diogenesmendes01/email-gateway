# ADR-20250116-escolha-redis-queue

## Status

**Status:** Aceito

**Data:** 2025-01-16

**Decisor(es):** Equipe de Arquitetura, Tech Lead

## Contexto

O sistema de envio de boletos por e-mail precisa processar grandes volumes de mensagens de forma assíncrona, confiável e escalável. A escolha da solução de fila de mensagens é crítica para:

- Garantir que nenhum e-mail seja perdido
- Permitir processamento assíncrono e desacoplado
- Suportar retry automático em caso de falhas
- Escalar horizontalmente conforme demanda
- Manter baixa latência no enfileiramento

**Requisitos principais:**

1. Alta disponibilidade e persistência de mensagens
2. Suporte nativo a retry com backoff exponencial
3. Dead Letter Queue (DLQ) para mensagens com falha permanente
4. Baixa latência de enfileiramento (< 100ms)
5. Facilidade de operação e monitoramento
6. Custo operacional adequado para MVP

## Decisão

**Decidimos utilizar Redis com Bull como solução de fila de mensagens.**

Bull é uma biblioteca Node.js que implementa um sistema robusto de filas sobre Redis, fornecendo:

- Filas com prioridade
- Retry automático configurável
- Dead Letter Queue (DLQ)
- Rate limiting
- Jobs recorrentes
- UI de monitoramento (Bull Board)
- Eventos e hooks para observabilidade

**Configuração:**

- Redis 7.x com persistência AOF + RDB
- Bull 4.x para gerenciamento de filas
- Bull Board para dashboard de monitoramento
- Redis Sentinel para alta disponibilidade (futuro)

## Alternativas Consideradas

### Alternativa 1: RabbitMQ

- **Prós:**
  - Protocolo AMQP robusto e padronizado
  - Suporte nativo a múltiplos padrões de mensageria
  - Dead letter exchanges e routing complexo
  - Clusterização nativa
  - Ferramentas de monitoramento maduras

- **Contras:**
  - Maior complexidade operacional
  - Curva de aprendizado mais acentuada
  - Overhead de protocolo para casos simples
  - Requer infraestrutura adicional
  - Maior consumo de recursos para baixo volume inicial

### Alternativa 2: AWS SQS

- **Prós:**
  - Totalmente gerenciado (zero operação)
  - Escalabilidade automática
  - Alta disponibilidade integrada
  - Pricing por uso (econômico em baixo volume)
  - DLQ nativo

- **Contras:**
  - Latência mais alta (~100-200ms)
  - Vendor lock-in com AWS
  - Custo crescente com volume
  - Menos controle sobre comportamento
  - Visibilidade timeout pode causar duplicação

### Alternativa 3: Apache Kafka

- **Prós:**
  - Throughput extremamente alto
  - Persistência durável de longo prazo
  - Replay de mensagens
  - Ecossistema rico

- **Contras:**
  - Overkill para caso de uso simples
  - Complexidade operacional significativa
  - Curva de aprendizado alta
  - Requer cluster (mínimo 3 nós)
  - Overhead de recursos considerável

## Consequências

### Positivas

- **Simplicidade**: Redis já é usado no projeto (cache), aproveitamos infraestrutura existente
- **Performance**: Latência de enfileiramento < 10ms, suficiente para nossos SLAs
- **Developer Experience**: Bull tem API simples e bem documentada, familiar para time Node.js
- **Observabilidade**: Bull Board fornece dashboard pronto para monitoramento
- **Custo**: Sem custo adicional de infraestrutura ou licenças
- **Ecosistema**: Grande comunidade e suporte para Redis + Bull
- **Flexibilidade**: Fácil adicionar features como job scheduling, priorização

### Negativas

- **Limitações de escala**: Redis single-instance tem limites (~100k ops/s)
  - *Mitigação*: Suficiente para MVP; podemos migrar para Redis Cluster se necessário
- **Persistência**: Redis não é database; risco de perda em crash sem AOF
  - *Mitigação*: Configurar AOF + RDB com fsync every second
- **Não é message broker nativo**: Bull é abstração sobre Redis, não protocolo específico
  - *Mitigação*: Suficiente para comunicação interna; não precisamos de features avançadas
- **Single point of failure**: Redis sem cluster é SPOF
  - *Mitigação*: Roadmap inclui Redis Sentinel para HA

### Neutras

- Time precisará aprender conceitos específicos do Bull (jobs, processors, eventos)
- Monitoramento requer configuração de Bull Board
- Precisamos definir estratégia de backup do Redis

## Impacto

- **Performance:**
  - Latência de enqueue: < 10ms
  - Throughput: ~50k jobs/segundo (suficiente para MVP)
  - Latência de processamento: depende do worker, não da fila

- **Segurança:**
  - Redis deve ter autenticação configurada (requirepass)
  - Conexão TLS para ambientes produção
  - ACLs do Redis 6+ para limitar comandos

- **Manutenibilidade:**
  - Bull tem API estável e bem documentada
  - Configuração simples e declarativa
  - Fácil adicionar novos tipos de jobs

- **Escalabilidade:**
  - Workers escaláveis horizontalmente sem limite
  - Redis pode escalar verticalmente até limites de hardware
  - Migração para Redis Cluster é path conhecido

- **Custo:**
  - MVP: ~$20-50/mês (Redis gerenciado small instance)
  - Produção: ~$100-200/mês (Redis com HA)
  - Escala: Custo cresce linearmente com carga

- **Time to Market:**
  - Setup rápido: ~1-2 dias para implementação completa
  - Zero overhead de aprendizado de novo protocolo
  - Aproveitamento de conhecimento existente de Redis

## Referências

- [Bull Documentation](https://github.com/OptimalBits/bull)
- [Redis Persistence](https://redis.io/docs/management/persistence/)
- [Bull Board - Monitoring UI](https://github.com/felixmosh/bull-board)
- [Comparison: Redis vs RabbitMQ vs Kafka](https://stackshare.io/stackups/kafka-vs-rabbitmq-vs-redis)

## Notas

- Esta decisão é adequada para MVP e escala moderada (< 1M jobs/dia)
- Se crescimento exceder capacidade do Redis single-instance, revisitar com ADR para Redis Cluster ou migração para RabbitMQ/Kafka
- Monitorar métricas de latência e throughput mensalmente
- Planejar implementação de Redis Sentinel em Q2 2025

---

**Template version:** 1.0
**Last updated:** 2025-01-16
