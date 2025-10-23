# ADR-20250120-auth-model-mvp

## Status

**Status:** Aceito

**Data:** 2025-01-20

**Decisor(es):** Equipe de Desenvolvimento MVP

## Contexto

O projeto MVP de envio de boletos por e-mail necessita de um modelo de autenticação robusto e simples que atenda aos seguintes requisitos:

- **Parceiros externos** (M2, CodeWave, TrustCloud, CertShift, Pixel) precisam acessar a API de forma segura
- **Equipe interna** precisa de acesso ao dashboard para monitoramento e operação
- **Escalabilidade** para crescimento futuro (10x o volume atual)
- **Custo baixo** (≤ US$10/mês de infraestrutura)
- **Simplicidade operacional** para MVP
- **Segurança** adequada para dados de boletos e PII

### Forças em Jogo

- **Volume atual**: 40k e-mails/mês (~1.300/dia)
- **Parceiros**: 5 empresas iniciais
- **Usuários internos**: Time pequeno (< 10 pessoas)
- **Restrições**: VPS única, orçamento limitado, time reduzido
- **Compliance**: Necessidade de auditoria e rastreabilidade

## Decisão

**Implementamos um modelo de autenticação híbrido com duas camadas:**

### 1. API Key Authentication (Parceiros Externos)

- **Método**: API Key no header `X-API-Key`
- **Formato**: `sk_live_[token_32_bytes]` ou `sk_test_[token_32_bytes]`
- **Armazenamento**: Hash bcrypt no banco de dados
- **Escopo**: Uma chave por empresa parceira
- **Expiração**: 90 dias (rotacionável)
- **IP Allowlist**: Opcional por empresa
- **Rate Limiting**: Por empresa (60 RPS, burst 120)

### 2. Basic Authentication (Dashboard Interno)

- **Método**: HTTP Basic Auth
- **Usuários**: `admin` (full access) e `readonly` (read-only)
- **Armazenamento**: Hash bcrypt em variáveis de ambiente
- **Escopo**: Acesso ao dashboard de monitoramento
- **Rotação**: Manual via variáveis de ambiente

### 3. Auditoria e Observabilidade

- **Logs estruturados**: JSON com `requestId`, `companyId`, `userId`
- **Auditoria**: Todas as ações logadas com IP, User-Agent, timestamp
- **Correlação**: Request ID propagado através de toda a stack
- **Mascaramento**: PII mascarada em logs (CPF/CNPJ, emails)

## Alternativas Consideradas

### Alternativa 1: JWT Authentication

- **Prós:**
  - Stateless, escalável horizontalmente
  - Padrão da indústria
  - Suporte nativo a expiração e claims

- **Contras:**
  - Complexidade adicional para MVP
  - Necessidade de gerenciar secrets/keys
  - Overhead de validação em cada request
  - Não adequado para Basic Auth do dashboard

### Alternativa 2: OAuth 2.0 / OIDC

- **Prós:**
  - Padrão robusto e escalável
  - Suporte a múltiplos provedores
  - Granularidade de permissões

- **Contras:**
  - Complexidade excessiva para MVP
  - Overhead de infraestrutura
  - Dependência de provedores externos
  - Time de desenvolvimento maior

### Alternativa 3: Session-based Authentication

- **Prós:**
  - Simplicidade de implementação
  - Controle total sobre sessões

- **Contras:**
  - Não adequado para APIs REST
  - Problemas de escalabilidade
  - Complexidade de gerenciamento de estado

## Consequências

### Positivas

- **Simplicidade**: Modelo fácil de entender e implementar
- **Segurança adequada**: API Keys com hash, IP allowlist, rate limiting
- **Auditoria completa**: Rastreabilidade de todas as ações
- **Custo baixo**: Sem dependências externas caras
- **Flexibilidade**: IP allowlist opcional, rate limits configuráveis
- **MVP-ready**: Implementação rápida e funcional

### Negativas

- **Rotação manual**: API Keys precisam ser rotacionadas manualmente
- **Escalabilidade limitada**: Pode precisar de evolução para volumes maiores
- **Basic Auth**: Menos seguro que OAuth para dashboard (mitigado por acesso interno)
- **Gerenciamento**: Necessidade de scripts para gerenciar API Keys

### Neutras

- **Performance**: Validação de hash bcrypt em cada request (aceitável para volume atual)
- **Manutenção**: Código adicional para gerenciar autenticação
- **Documentação**: Necessidade de documentar processo de gerenciamento

## Impacto

### Performance

- **Latência**: +5-10ms por request devido à validação de hash
- **Throughput**: Adequado para 2.000 envios/hora (requisito atual)
- **Escalabilidade**: Limitado por validação síncrona de hash

### Segurança

- **API Keys**: Hash bcrypt (salt rounds 12) para armazenamento seguro
- **IP Allowlist**: Proteção adicional contra uso indevido
- **Rate Limiting**: Proteção contra abuso e DDoS
- **Auditoria**: Rastreabilidade completa de ações
- **PII**: Mascaramento em logs para compliance

### Manutenibilidade

- **Código**: Implementação clara e testável
- **Configuração**: Variáveis de ambiente para credenciais
- **Logs**: Estruturados para facilitar debugging
- **Testes**: Cobertura de testes para guards e services

### Escalabilidade

- **Volume atual**: Suporta facilmente 40k e-mails/mês
- **Crescimento 10x**: Pode precisar de otimizações (cache, async validation)
- **Múltiplas empresas**: Suporta centenas de empresas
- **Migração futura**: Arquitetura permite evolução para JWT/OAuth

### Custo

- **Infraestrutura**: Zero custo adicional (usa recursos existentes)
- **Licenças**: Sem dependências de terceiros pagas
- **Desenvolvimento**: Tempo mínimo de implementação
- **Operação**: Scripts simples para gerenciamento

### Time to Market

- **Implementação**: 2-3 dias de desenvolvimento
- **Testes**: 1 dia de testes e validação
- **Deploy**: Imediato após testes
- **Documentação**: 1 dia para documentar processo

## Referências

- [docs/00-pacote-documentos-arquitetura-mvp.md](../00-pacote-documentos-arquitetura-mvp.md) - Requisitos de segurança do MVP
- [docs/api/01-endpoints.md](../api/01-endpoints.md) - Especificação de autenticação da API
- [docs/architecture/01-visao-geral-sistema.md](../architecture/01-visao-geral-sistema.md) - Arquitetura geral do sistema
- [apps/api/src/modules/auth/auth.guard.ts](../../apps/api/src/modules/auth/auth.guard.ts) - Implementação do ApiKeyGuard
- [apps/api/src/modules/auth/basic-auth.guard.ts](../../apps/api/src/modules/auth/basic-auth.guard.ts) - Implementação do BasicAuthGuard

## Notas

### Critérios para Migração Futura

O modelo atual deve ser migrado para JWT/OAuth quando:

1. **Volume**: > 100k e-mails/mês
2. **Empresas**: > 50 parceiros
3. **Usuários internos**: > 20 pessoas
4. **Requisitos**: Necessidade de SSO ou integração com sistemas externos
5. **Performance**: Latência de autenticação > 50ms

### Processo de Gerenciamento

**API Keys:**
- Geração: Script `scripts/manage-api-keys.js`
- Rotação: Manual a cada 90 dias
- Revogação: Via banco de dados
- Monitoramento: Logs de uso e expiração

**Basic Auth:**
- Usuários: Definidos em variáveis de ambiente
- Senhas: Geradas com `BasicAuthGuard.generatePasswordHash()`
- Rotação: Manual via deploy

### Monitoramento e Alertas

- **API Key próxima do vencimento**: Alerta 7 dias antes
- **Tentativas de acesso inválidas**: Rate limit exceeded
- **IPs não autorizados**: Logs de auditoria
- **Uso anômalo**: Monitoramento de padrões de acesso

---

**Template version:** 1.0
**Last updated:** 2025-01-20
