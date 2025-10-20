## TASK 0.1 — Estrutura de diretórios e templates

**Contexto:** **Objetivo:** Base consistente para documentação técnica e decisões.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** criar pastas (`architecture/`, `api/`, `queue-redis/`, `worker/`, `data/`, `frontend/`, `adrs/`, `runbooks/`, `testing/`); naming `NN-nome-kebab.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 1.1 — Visão macro e NFRs

**Contexto:** **Saídas:** `architecture/01-system-design-overview.md` + diagrama.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Visão macro e NFRs.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 2.1 — `POST /v1/email/send` (contrato)

**Contexto:** **Escopo:** headers, autenticação, payload, validações, respostas, limites, idempotência, rate limit.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** `POST /v1/email/send` (contrato).

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 2.2 — `GET /v1/emails` e `GET /v1/emails/{id}`

**Contexto:** **Escopo:** filtros, paginação por cursor, ordenação, masking e limites.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** `GET /v1/emails` e `GET /v1/emails/{id}`.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 2.3 — Modelos de erro e políticas de retry do cliente

**Contexto:** **Saídas:** `api/05-error-models-retries.md`.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Modelos de erro e políticas de retry do cliente.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 3.1 — Contrato do Job `email:send`

**Contexto:** **Tarefas Técnicas:** payload mínimo (referência ao `outboxId` + snapshot crítico), **jobId = outboxId**; garantias pelo-menos-uma-vez; TTL 24h; PII mínima/criptografada.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Contrato do Job `email:send`.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 3.2 — Retry/backoff/DLQ e fairness por tenant

**Contexto:** **Tarefas Técnicas:** backoff exponencial com jitter (1s→60s); mover à **DLQ após 5 falhas**; TTL DLQ 7d; `lastFailureReason` obrigatório; AOF **everysec**, `maxmemory-policy noeviction`; **round-robin por tenant**.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Retry/backoff/DLQ e fairness por tenant.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 4.1 — Pipeline de estados, validações e envio SES

**Contexto:** **Tarefas Técnicas:** estados `RECEIVED→VALIDATED→SENT_ATTEMPT→SENT|FAILED|RETRY_SCHEDULED`; validações de integridade/outbox/recipient/template; mapeamento de erros SES → taxonomia interna; gravação `email_logs`/`email_events` com `requestId/jobId/messageId`; **ack/retry** conforme Trilha 3.2.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Pipeline de estados, validações e envio SES.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 4.2 — Concorrência, fairness e desligamento gracioso

**Contexto:** **Tarefas Técnicas:** `concurrency = min(CPU*2,16)`; **in-flight por tenant ≤ 50**; `SIGTERM` drena (parar intake, aguardar **30s**, re-enfileirar não-ackados).   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Concorrência, fairness e desligamento gracioso.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 4.3 — Falhas específicas e troubleshooting

**Contexto:** **Tarefas Técnicas:** catálogo de falhas (permanente/transiente, quota SES, DNS/SPF/DKIM, timeouts, rate limit); runbook de DLQ/reprocessamento; auditoria/masking.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Falhas específicas e troubleshooting.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 5.1 — ERD, esquema e índices/particionamento

**Contexto:** **Tarefas Técnicas:** entidades `recipients`, `email_outbox`, `email_logs`, `email_events`; índices por filtros (email_hash, cpfCnpj_hash, externalId, createdAt, status); **particionamento mensal** em logs/eventos; chaves de correlação (`requestId`, `outboxId`, `messageId`).   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** ERD, esquema e índices/particionamento.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 5.2 — PII, masking, criptografia, retenção e acesso

**Contexto:** **Tarefas Técnicas:** masking (email/CPF/CNPJ); retenção: `email_logs` 12m, `email_events` 18m; criptografia em repouso; **hash HMAC-SHA256** para chaves de busca; **perfis de acesso** (Ops mascarado, Auditoria desmascarado sob **break-glass** com justificativa e expiração); trilha de auditoria.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** PII, masking, criptografia, retenção e acesso.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 6.1 — Autenticação/Autorização, rate limit e auditoria

**Contexto:** **Tarefas Técnicas:** API-Key por tenant (prefixo, rotação 90d, revogação), armazenamento com hash e `lastUsedAt`; rate limit **60 RPS** (burst 120) por chave; **Basic Auth** no painel (hash forte, política de senha), IP allowlist opcional; auditoria de acesso a dados sensíveis.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Autenticação/Autorização, rate limit e auditoria.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 6.2 — SES, domínio e DNS (SPF/DKIM)

**Contexto:** **Tarefas Técnicas:** verificar domínio; criar SPF/DKIM; validar região/quota; checklist de sandbox→produção; **warm-up** de volumetria/tenant.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** criar SPF/DKIM; validar região/quota; checklist de sandbox→produção; **warm-up** de volumetria/tenant.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 7.1 — Métricas, logs e tracing

**Contexto:** **Tarefas Técnicas:** métricas: `queue_depth`, `queue_age_p95`, `send_latency_p50/p95/p99`, `error_rate`, `dlq_depth`, `tenant_fairness_ratio`; tracing por IDs padronizados; alertas: DLQ > **100** ou `queue_age_p95` > **120s** por 5min; throttling SES > **1 min**.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Métricas, logs e tracing.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 7.2 — SLO/Capacidade e DR/RTO

**Contexto:** **Tarefas Técnicas:** dimensionamento por picos/hora e nº de workers; metas de SLO; backup/restore (RPO/RTO); **testes periódicos de DR** e caos (Redis down 60s, SES 429, disco 95% cheio).   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** SLO/Capacidade e DR/RTO.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 8.1 — Arquitetura de Deploy, healthchecks e variáveis

**Contexto:** **Tarefas Técnicas:** topologia Nginx→API/Worker→Postgres/Redis→SES; healthchecks `/healthz` (leve) e `/readyz` (DB/Redis/SES quota); deploy via **Coolify** (branch `prod`); rollback < **5 min** com **2** releases anteriores; inventário de variáveis (segredos vs configs).   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Arquitetura de Deploy, healthchecks e variáveis.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 8.2 — Hardening e runbooks de operação

**Contexto:** **Tarefas Técnicas:** Nginx (TLS, headers de segurança, rate limit, IP allowlist); backups Postgres diário (retenção 7/30) + testes quinzenais; Redis AOF everysec + snapshot; monitoramento de CPU/mem/disk/I/O.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Hardening e runbooks de operação.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 9.1 — KPIs, estados e acesso

**Contexto:** **Tarefas Técnicas:** KPIs (total enviados, erro por categoria, DLQ, latências); estados vazio/erro/loading; filtros por `externalId`, email_hash, cpfCnpj_hash, status, período; Basic Auth; perfil read-only opcional.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** KPIs, estados e acesso.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 9.2 — Integração com logs/eventos e runbooks

**Contexto:** **Tarefas Técnicas:** endpoints para listagem/detalhe; colunas e ordenação; ações "copiar IDs"; deep-link para runbooks; **export CSV** (≤ **10k** linhas; mascarado; watermark).   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Integração com logs/eventos e runbooks.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 10.1 — Outbox+Fila vs SQS

**Contexto:** **Saídas:** `adrs/ADR-0001-outbox-queue-vs-sqs.md`.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Outbox+Fila vs SQS.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 10.2 — Modelo de Autenticação do MVP

**Contexto:** **Saídas:** `adrs/ADR-0002-auth-model-mvp.md`.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Modelo de Autenticação do MVP.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 10.3 — Dashboard sem login avançado (MVP)

**Contexto:** **Saídas:** `adrs/ADR-0003-dashboard-auth-scope.md`.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Dashboard sem login avançado (MVP).

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 10.4 — Cursor paging, particionamento e fairness

**Contexto:** **Saídas:** `adrs/ADR-0004-cursor-partition-fairness.md`.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Cursor paging, particionamento e fairness.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 11.1 — Critérios de aceitação

**Contexto:** **Funcionais:** envio idempotente; validações negativas; consulta por filtros; webhooks (quando habilitados).   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Critérios de aceitação.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 11.2 — Carga, caos e relatórios

**Contexto:** **Tarefas Técnicas:** dados sintéticos; cenários de pico/plateau; multi-tenant com fairness; caos (Redis down 60s, SES 429, disco 95%); relatórios P50/P95/P99, `error_rate`, `queue_age_p95`.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Carga, caos e relatórios.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 12.1 — Contrato de Webhooks

**Contexto:** **Tarefas Técnicas:** endpoint do cliente; **HMAC-SHA256** (`X-Signature`); headers `X-Event-Id`, `X-Retry-Count`, `X-Sent-At` (ms); idempotência por `eventId`/`dedupeKey`; ordering melhor-esforço por `outboxId`; retries (1m, 5m, 30m, 2h, 24h); DLQ do cliente.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Contrato de Webhooks.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 12.2 — Catálogo de eventos & Supressão

**Contexto:** **Tarefas Técnicas:** eventos `QUEUED`,`SENT`,`DELIVERED` (quando disponível),`BOUNCE`,`COMPLAINT`,`REJECTED`,`DLQ_MOVED`; política de **supressão** (janela configurável para hard bounces/complaints); métricas “suppression hit rate”; UI de revisão/auditoria.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Catálogo de eventos & Supressão.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 13.1 — Tipos, limites e antivírus

**Contexto:** **Tarefas Técnicas:** allowlist MIME (PDF, PNG, TXT, etc.); limites (5 anexos/512 KB cada); antivírus obrigatório antes do envio; armazenamento temporário criptografado (TTL 24h); nunca logar conteúdo.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Tipos, limites e antivírus.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
## TASK 14.1 — Perfis e “break-glass”

**Contexto:** **Tarefas Técnicas:** papéis “Ops (mascarado)” e “Auditoria (desmascarado)”; fluxo de **break-glass** com justificativa, aprovador e expiração; trilha de auditoria; relatórios mensais.   O projeto refere-se ao MVP de envio de boletos por e-mail, cujos detalhes técnicos e integrações estão definidos no documento 'Pacote de Documentos de Arquitetura — MVP Envio de Boletos'.

**Objetivo:** Perfis e “break-glass”.

### Restrições
- Seguir padrões técnicos definidos no documento de arquitetura.
- Evitar alterações fora do escopo da tarefa.

### Especificações
- Analisar detalhadamente os requisitos do card e os impactos no sistema.
- Aplicar boas práticas de versionamento, organização e documentação.

### Validação
- A tarefa será considerada concluída se o comportamento for compatível com a descrição da atividade e padrões do projeto.
- **OBRIGATÓRIO**: A entrega deve estar versionada corretamente e com cobertura de testes adequada:
  - **Testes unitários**: obrigatórios para serviços, utilitários e lógica de negócio
  - **Testes de integração**: obrigatórios para endpoints de API, jobs de fila e integrações externas
  - **Cobertura mínima**: 70% para novos códigos (medido por linha)
  - Seguir padrões definidos em `docs/testing/TESTING-STANDARDS.md`
  - Testes devem passar no CI antes do merge

### Arquivos
- Identificar os arquivos afetados com base na atividade descrita.

### Fallback
- Se encontrar ambiguidades, consulte o documento de arquitetura e sinalize a necessidade de refinamento.
- Em caso de erro estrutural, rever dependências, entradas e saídas esperadas.

---
