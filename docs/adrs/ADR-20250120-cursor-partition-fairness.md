# ADR-20250120-cursor-partition-fairness

## Status

**Status:** Aceito

**Data:** 2025-01-20

**Decisor(es):** Equipe de Arquitetura MVP

## Contexto

O sistema MVP de envio de boletos por e-mail precisa lidar com múltiplas empresas parceiras (M2, CodeWave, TrustCloud, CertShift, Pixel) processando **40k e-mails/mês (~1.300/dia)** de forma justa e eficiente.

**Problemas identificados:**

1. **Paginação Ineficiente**: Uso atual de `page`/`pageSize` pode ser lenta com grandes datasets
2. **Fairness Ausente**: Sem garantia de fairness entre empresas na fila de processamento
3. **Particionamento Limitado**: Sem estratégia clara de particionamento por empresa
4. **Escalabilidade**: Crescimento planejado 10x requer estratégia de particionamento

**Requisitos principais:**

- **Paginação eficiente**: Suporte a grandes volumes de dados
- **Fairness**: Garantir processamento justo entre empresas
- **Particionamento**: Isolamento e escalabilidade por empresa
- **Performance**: Manter latência < 250ms para ingestão
- **Throughput**: Suportar ≥ 2.000 envios/hora

**Forças em jogo:**
- Múltiplas empresas com volumes diferentes
- Necessidade de isolamento entre empresas
- Crescimento planejado 10x
- Limitação de custo (≤ US$10/mês)
- Operação em VPS única

## Decisão

**Implementar cursor-based pagination com particionamento por empresa e fairness via round-robin.**

### Características da Solução:

1. **Cursor-based Pagination**: Substituir `page`/`pageSize` por cursor-based pagination
2. **Particionamento por Empresa**: Jobs enfileirados com prioridade baseada em empresa
3. **Fairness Round-robin**: Workers processam jobs de forma round-robin entre empresas
4. **Índices Otimizados**: Índices compostos para suporte eficiente à paginação

### Implementação:

#### 1. Cursor-based Pagination

```typescript
// API Response
interface PaginatedResponse<T> {
  data: T[];
  cursor?: string; // Base64 encoded cursor
  hasMore: boolean;
  total?: number; // Optional, only when needed
}

// Cursor structure
interface Cursor {
  id: string;
  createdAt: string;
  companyId?: string; // For company-specific queries
}
```

#### 2. Particionamento por Empresa

```typescript
// Job enqueueing with company priority
await queue.add('email:send', jobData, {
  priority: this.getCompanyPriority(companyId),
  delay: this.calculateFairnessDelay(companyId),
});
```

#### 3. Fairness Round-robin

```typescript
// Worker fairness logic
class FairnessProcessor {
  private companyLastProcessed = new Map<string, number>();
  
  async processJob(job: Job) {
    const companyId = job.data.companyId;
    const now = Date.now();
    const lastProcessed = this.companyLastProcessed.get(companyId) || 0;
    
    // Ensure minimum delay between jobs from same company
    const minDelay = 100; // 100ms
    if (now - lastProcessed < minDelay) {
      await this.delay(minDelay - (now - lastProcessed));
    }
    
    this.companyLastProcessed.set(companyId, Date.now());
    return this.processEmail(job);
  }
}
```

#### 4. Índices Otimizados

```sql
-- Email logs with cursor support
CREATE INDEX idx_email_logs_cursor ON email_logs (created_at DESC, id DESC);
CREATE INDEX idx_email_logs_company_cursor ON email_logs (company_id, created_at DESC, id DESC);

-- Outbox with company partitioning
CREATE INDEX idx_email_outbox_company_status ON email_outbox (company_id, status, created_at);
```

## Alternativas Consideradas

### Alternativa 1: Offset Pagination com Cache

- **Prós:**
  - Implementação simples
  - Compatibilidade com sistemas existentes
  - Fácil de entender

- **Contras:**
  - Performance degradada com grandes offsets
  - Inconsistência com dados em mutação
  - Não resolve problemas de fairness

### Alternativa 2: Particionamento Completo por Empresa

- **Prós:**
  - Isolamento total entre empresas
  - Escalabilidade independente
  - Controle granular de recursos

- **Contras:**
  - Complexidade operacional alta
  - Custo de infraestrutura elevado
  - Overhead para MVP com poucas empresas

### Alternativa 3: Fairness por Rate Limiting

- **Prós:**
  - Controle preciso de throughput
  - Prevenção de abuso
  - Implementação relativamente simples

- **Contras:**
  - Não garante fairness em baixo volume
  - Complexidade de configuração
  - Pode limitar empresas legítimas

### Alternativa 4: Sem Particionamento (Status Quo)

- **Prós:**
  - Simplicidade máxima
  - Zero overhead de desenvolvimento
  - Funciona para volumes baixos

- **Contras:**
  - Sem garantia de fairness
  - Problemas de escalabilidade
  - Possível starvation de empresas menores

## Consequências

### Positivas

- **Performance melhorada**: Cursor pagination é O(1) independente da posição
- **Fairness garantida**: Round-robin garante processamento justo
- **Escalabilidade**: Particionamento suporta crescimento 10x
- **Consistência**: Cursor-based evita problemas de dados em mutação
- **Isolamento**: Empresas não afetam umas às outras

### Negativas

- **Complexidade**: Implementação mais complexa que offset pagination
- **Desenvolvimento**: Requer refatoração de endpoints existentes
- **Curva de aprendizado**: Equipe precisa entender cursor pagination
- **Compatibilidade**: Clientes precisam adaptar para cursor-based

### Neutras

- **Migração gradual**: Pode ser implementado incrementalmente
- **Backward compatibility**: Manter suporte a offset durante transição

## Impacto

### Performance
- **Positivo**: Cursor pagination é O(1) vs O(n) do offset
- **Positivo**: Índices otimizados melhoram queries
- **Neutro**: Fairness adiciona pequeno overhead (~100ms)

### Escalabilidade
- **Positivo**: Suporta crescimento 10x sem degradação
- **Positivo**: Particionamento permite escala horizontal futura
- **Neutro**: Requer monitoramento de fairness metrics

### Manutenibilidade
- **Negativo**: Código mais complexo para manter
- **Positivo**: Estrutura mais robusta para crescimento
- **Neutro**: Requer documentação adicional

### Custo
- **Neutro**: Sem impacto significativo no custo atual
- **Positivo**: Evita necessidade de infraestrutura adicional

### Time to Market
- **Negativo**: Desenvolvimento adicional necessário
- **Positivo**: Base sólida para futuras funcionalidades

## Critérios para Implementação

A implementação deve ser considerada quando:

1. **Volume > 10k emails/dia**: Offset pagination torna-se ineficiente
2. **Múltiplas empresas**: Necessidade de fairness entre empresas
3. **Crescimento planejado**: Preparação para escala 10x
4. **Performance degradada**: Queries de dashboard > 1s
5. **Reclamações de fairness**: Empresas reportando processamento desigual

### Plano de Implementação

1. **Fase 1**: Implementar cursor pagination no dashboard
2. **Fase 2**: Adicionar fairness round-robin nos workers
3. **Fase 3**: Otimizar índices para suporte eficiente
4. **Fase 4**: Monitoramento e métricas de fairness

## Referências

- [Pacote de Documentos de Arquitetura — MVP Envio de Boletos](docs/00-pacote-documentos-arquitetura-mvp.md)
- [ADR-20250116-escolha-redis-queue](docs/adrs/ADR-20250116-escolha-redis-queue.md)
- [Frontend Architecture](docs/00-pacote-documentos-arquitetura-mvp.md#30-frontend-architecture-03-frontend-architecturemd)
- [Queue Overview](docs/00-pacote-documentos-arquitetura-mvp.md#14-queue-overview-01-queue-overviewmd)

## Notas

- **Implementação gradual**: Pode ser implementado incrementalmente
- **Métricas**: Monitorar fairness ratio entre empresas
- **Fallback**: Manter offset pagination como fallback durante transição
- **Documentação**: Atualizar documentação da API com exemplos de cursor pagination
- **Testes**: Implementar testes de fairness e performance

---

**Template version:** 1.0
**Last updated:** 2025-01-20
