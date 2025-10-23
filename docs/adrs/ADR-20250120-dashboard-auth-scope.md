# ADR-20250120-dashboard-auth-scope

## Status

**Status:** Aceito

**Data:** 2025-01-20

**Decisor(es):** Equipe de Arquitetura MVP

## Contexto

O projeto MVP de envio de boletos por e-mail necessita de um dashboard para operação interna, permitindo:

- **Auditoria completa** de envios e eventos
- **Métricas operacionais** (KPIs diários/semanais)
- **Investigação de falhas** por CPF/CNPJ, e-mail, externalId
- **Monitoramento** do estado da fila e entregas

**Problema:** Definir o escopo de autenticação do dashboard para o MVP, considerando:

- **Time to Market**: MVP deve ser entregue rapidamente
- **Custo**: Limite de US$10/mês para infraestrutura
- **Segurança**: Acesso restrito ao time interno
- **Operação**: Usuários limitados (time interno) com necessidade de auditoria

**Forças em jogo:**
- Necessidade de segurança adequada para dados sensíveis (PII)
- Simplicidade operacional para MVP
- Escalabilidade futura para múltiplos usuários
- Compliance com LGPD (auditoria de acessos)

## Decisão

**Implementar Basic Auth no Nginx para proteção do dashboard no MVP.**

### Características da Solução:

1. **Autenticação**: Basic Auth implementada no Nginx (fora do app React)
2. **Escopo**: Protege todo o dashboard (`/dashboard/**`)
3. **Usuários**: Time interno limitado com credenciais rotacionadas
4. **Auditoria**: Logs de acesso do Nginx retidos por 90 dias
5. **Operação**: Provisionamento via `htpasswd` com rotação trimestral

### Implementação:

```nginx
# nginx.conf
location /dashboard/ {
    auth_basic "Dashboard MVP - Acesso Restrito";
    auth_basic_user_file /etc/nginx/.htpasswd;
    
    proxy_pass http://dashboard-app;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## Alternativas Consideradas

### Alternativa 1: Autenticação Própria no Dashboard

- **Prós:**
  - Controle total sobre autenticação
  - Auditoria granular por usuário
  - Possibilidade de RBAC futuro
  - Interface de login customizada

- **Contras:**
  - Desenvolvimento adicional significativo
  - Complexidade de gerenciamento de sessões
  - Necessidade de banco de dados para usuários
  - Tempo de desenvolvimento incompatível com MVP

### Alternativa 2: SSO Corporativo

- **Prós:**
  - Integração com sistemas existentes
  - Segurança enterprise-grade
  - Centralização de identidades
  - Auditoria integrada

- **Contras:**
  - Complexidade de integração
  - Dependência de infraestrutura externa
  - Custo adicional de licenças/configuração
  - Overhead para MVP com usuários limitados

### Alternativa 3: Sem Autenticação (Apenas IP Allowlist)

- **Prós:**
  - Simplicidade máxima
  - Zero overhead de desenvolvimento
  - Acesso direto sem credenciais

- **Contras:**
  - Segurança inadequada para dados sensíveis
  - Sem auditoria de acessos individuais
  - Vulnerável a ataques internos
  - Não atende requisitos de compliance

## Consequências

### Positivas

- **Simplicidade operacional**: Implementação rápida e manutenção simples
- **Segurança adequada**: Proteção efetiva com Basic Auth
- **Auditoria**: Logs de acesso para compliance
- **Custo baixo**: Sem infraestrutura adicional
- **Time to Market**: Entrega rápida do MVP

### Negativas

- **Sem RBAC**: Todos os usuários têm acesso total ao dashboard
- **Auditoria limitada**: Apenas logs de Nginx, sem granularidade por usuário
- **Gerenciamento manual**: Rotação de credenciais via `htpasswd`
- **Escalabilidade limitada**: Não adequado para muitos usuários

### Neutras

- **Migração futura**: Solução temporária até implementação de autenticação própria
- **Complexidade**: Adiciona configuração no Nginx

## Impacto

### Performance
- **Positivo**: Zero overhead no app React (autenticação no Nginx)
- **Neutro**: Impacto mínimo na latência (verificação Basic Auth é rápida)

### Segurança
- **Positivo**: Proteção adequada para dados sensíveis
- **Neutro**: Basic Auth é seguro para uso interno com HTTPS
- **Negativo**: Sem auditoria granular por usuário

### Manutenibilidade
- **Positivo**: Implementação simples e bem documentada
- **Neutro**: Configuração centralizada no Nginx
- **Negativo**: Gerenciamento manual de usuários

### Escalabilidade
- **Negativo**: Não adequado para muitos usuários (limitação do Basic Auth)
- **Neutro**: Adequado para MVP com time interno limitado

### Custo
- **Positivo**: Zero custo adicional de infraestrutura
- **Positivo**: Sem licenças ou serviços externos

### Time to Market
- **Positivo**: Implementação rápida (1-2 dias)
- **Positivo**: Sem desenvolvimento adicional no app

## Critérios para Migração Futura

A migração para autenticação própria deve ser considerada quando:

1. **Usuários > 10**: Basic Auth torna-se impraticável
2. **RBAC necessário**: Diferentes níveis de acesso por usuário
3. **Auditoria granular**: Necessidade de logs detalhados por usuário
4. **Integração SSO**: Requisito de integração com sistemas corporativos
5. **Compliance avançado**: Requisitos específicos de auditoria

### Plano de Migração Futura

1. **Fase 1**: Implementar autenticação própria com sessões
2. **Fase 2**: Adicionar RBAC básico (admin, readonly)
3. **Fase 3**: Integração com SSO corporativo
4. **Fase 4**: Auditoria avançada e compliance

## Referências

- [Pacote de Documentos de Arquitetura — MVP Envio de Boletos](docs/00-pacote-documentos-arquitetura-mvp.md)
- [Frontend Architecture](docs/architecture/01-visao-geral-sistema.md#frontend-dashboard)
- [Access Control — Basic Auth](docs/00-pacote-documentos-arquitetura-mvp.md#32-access-control--basic-auth-05-access-control-basic-authmd)
- [ADR-0002 Autenticação por API Key + IP Allowlist](docs/adrs/ADR-20250120-auth-model-mvp.md)

## Notas

- **Implementação**: Configuração no Nginx com `htpasswd`
- **Monitoramento**: Logs de acesso devem ser monitorados para tentativas de acesso não autorizado
- **Rotação**: Credenciais devem ser rotacionadas trimestralmente
- **Backup**: Arquivo `.htpasswd` deve ser incluído nos backups de configuração
- **HTTPS**: Basic Auth deve ser usado apenas com HTTPS em produção

---

**Template version:** 1.0
**Last updated:** 2025-01-20
