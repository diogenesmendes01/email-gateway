# PR11 - MAJOR #3 - Corrigir memory leak em graceful shutdown

## Contexto
- Origem: PR #11 (MAJOR #3)
- Durante a revisão da PR #11 (TASK 4.1), foi identificado que o loop de graceful shutdown pode causar memory leak e queries Redis excessivas.

## Problema

### Arquivo afetado
`apps/worker/src/index.ts` linhas 165-177

### Issue
```typescript
while (Date.now() - startTime < shutdownTimeout) {
  const activeCount = await this.worker.getActiveCount();
  if (activeCount === 0) break;

  await new Promise((resolve) => setTimeout(resolve, 1000));
}
```

**Problemas:**
1. Checa a cada 1 segundo durante 30s = **30 queries Redis** mesmo se não houver jobs
2. Sem logging de progresso
3. Se jobs estiverem travados, o loop roda até timeout sem liberar memória
4. `getActiveCount()` pode ser custoso em Redis com muitas conexões

## O que precisa ser feito
- [ ] Reduzir frequência de checagem (1s → 2s ou 3s)
- [ ] Adicionar logging de progresso
- [ ] Adicionar limite de checagens em vez de tempo contínuo
- [ ] Considerar timeout individual por job ativo
- [ ] Adicionar testes de graceful shutdown

## Solução proposta

```typescript
async gracefulShutdown(): Promise<void> {
  console.log('[EmailWorker] Graceful shutdown initiated');

  // Para de aceitar novos jobs
  await this.worker.pause();

  // Configuração
  const checkInterval = 2000; // 2s em vez de 1s
  const shutdownTimeout = 30000;
  const maxChecks = Math.ceil(shutdownTimeout / checkInterval);

  // Loop de espera com limite de checagens
  for (let i = 0; i < maxChecks; i++) {
    const activeCount = await this.worker.getActiveCount();

    if (activeCount === 0) {
      console.log('[EmailWorker] All active jobs completed');
      break;
    }

    console.log(
      `[EmailWorker] Waiting for ${activeCount} active job(s)... ` +
      `(check ${i + 1}/${maxChecks})`
    );

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  // Fecha worker e conexões
  await this.worker.close();
  await this.prisma.$disconnect();

  console.log('[EmailWorker] Shutdown complete');
}
```

**Melhorias:**
- Reduz queries Redis de 30 para ~15
- Logging de progresso claro
- Limite explícito de checagens
- Feedback melhor para debugging

## Urgência
- **Nível (1–5):** 3 (médio - performance e recursos)

## Responsável sugerido
- Time de desenvolvimento (Backend/Worker)

## Dependências / Riscos
- Dependências: Nenhuma
- Riscos: Baixo - melhoria de implementação existente
- Impacto: Reduz uso de recursos durante shutdown
