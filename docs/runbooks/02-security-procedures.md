# Email Gateway - Runbook de Segurança

> **Versão:** 1.0.0  
> **Última Atualização:** 2025-01-20  
> **Responsável:** Equipe de Segurança  
> **Status:** Ativo  

## Visão Geral

Este runbook contém procedimentos de segurança para o Email Gateway, incluindo monitoramento de segurança, resposta a incidentes e manutenção de certificados.

## Índice

1. [Monitoramento de Segurança](#monitoramento-de-segurança)
2. [Procedimentos de Autenticação](#procedimentos-de-autenticação)
3. [Monitoramento de Acesso](#monitoramento-de-acesso)
4. [Resposta a Incidentes de Segurança](#resposta-a-incidentes-de-segurança)
5. [Manutenção de Certificados](#manutenção-de-certificados)
6. [Auditoria de Segurança](#auditoria-de-segurança)

---

## Monitoramento de Segurança

### Verificações Diárias

#### 1. Logs de Acesso
```bash
# Verificar logs de acesso do Nginx
docker-compose logs nginx | grep -E "(40[1-5]|50[0-5])"

# Verificar tentativas de login falhadas
docker-compose logs api | grep -i "unauthorized\|forbidden\|invalid"

# Verificar tentativas de acesso suspeitas
docker-compose logs nginx | grep -E "(bot|crawler|spider|scanner)"
```

#### 2. Status dos Serviços
```bash
# Verificar se todos os serviços estão rodando
docker-compose ps

# Verificar se não há containers comprometidos
docker-compose ps | grep -v "Up"
```

#### 3. Verificação de Certificados SSL
```bash
# Verificar validade dos certificados
openssl x509 -in ./ssl/cert.pem -text -noout | grep -A2 "Validity"

# Verificar se os certificados não expiraram
openssl x509 -in ./ssl/cert.pem -checkend 86400
```

### Alertas de Segurança

| Tipo de Alerta | Threshold | Ação |
|----------------|-----------|------|
| Tentativas de login falhadas | > 10 em 5 min | Bloquear IP |
| Requests 4xx/5xx | > 50% em 10 min | Investigar |
| Uso de CPU anômalo | > 90% por 5 min | Verificar processos |
| Acesso a arquivos sensíveis | Qualquer tentativa | Bloquear IP |

---

## Procedimentos de Autenticação

### Gerenciamento de API Keys

#### Criar Nova API Key
```bash
# Usar script de gerenciamento
./scripts/manage-api-keys.js create --company-id "company-123" --description "Production API Key"

# Verificar criação
./scripts/manage-api-keys.js list --company-id "company-123"
```

#### Revogar API Key
```bash
# Revogar API Key
./scripts/manage-api-keys.js revoke --api-key "key-to-revoke"

# Verificar revogação
./scripts/manage-api-keys.js list --api-key "key-to-revoke"
```

#### Rotação de API Keys
```bash
# Listar API Keys antigas (> 90 dias)
./scripts/manage-api-keys.js list --older-than 90

# Rotacionar API Keys
./scripts/manage-api-keys.js rotate --company-id "company-123"
```

### Gerenciamento de Domínios

#### Adicionar Domínio
```bash
# Adicionar domínio
./scripts/manage-domains.js add --domain "example.com" --company-id "company-123"

# Verificar adição
./scripts/manage-domains.js list --company-id "company-123"
```

#### Remover Domínio
```bash
# Remover domínio
./scripts/manage-domains.js remove --domain "example.com"

# Verificar remoção
./scripts/manage-domains.js list
```

---

## Monitoramento de Acesso

### Análise de Logs

#### Identificar IPs Suspeitos
```bash
# IPs com mais tentativas de acesso
docker-compose logs nginx | awk '{print $1}' | sort | uniq -c | sort -nr | head -10

# IPs com mais erros 4xx/5xx
docker-compose logs nginx | grep -E "(40[1-5]|50[0-5])" | awk '{print $1}' | sort | uniq -c | sort -nr | head -10
```

#### Análise de User Agents
```bash
# User agents suspeitos
docker-compose logs nginx | grep -E "(bot|crawler|spider|scanner)" | awk -F'"' '{print $6}' | sort | uniq -c | sort -nr
```

### Bloqueio de IPs

#### Bloquear IP Manualmente
```bash
# Adicionar IP à lista de bloqueio
echo "192.168.1.100 0;" >> nginx-allowlist.conf

# Reiniciar Nginx
docker-compose restart nginx
```

#### Bloqueio Automático
```bash
# Configurar bloqueio automático no Nginx
# (configuração já implementada no nginx.conf)
```

---

## Resposta a Incidentes de Segurança

### Procedimentos de Emergência

#### 1. Isolamento do Sistema
```bash
# Parar todos os serviços
docker-compose down

# Bloquear acesso externo
iptables -A INPUT -p tcp --dport 80 -j DROP
iptables -A INPUT -p tcp --dport 443 -j DROP
```

#### 2. Preservação de Evidências
```bash
# Fazer backup dos logs
mkdir -p ./security-incident-$(date +%Y%m%d-%H%M%S)
cp -r ./logs ./security-incident-$(date +%Y%m%d-%H%M%S)/
docker-compose logs > ./security-incident-$(date +%Y%m%d-%H%M%S)/docker-logs.txt

# Fazer backup do estado atual
./scripts/backup-postgres.sh incident 1 ./security-incident-$(date +%Y%m%d-%H%M%S)
```

#### 3. Análise de Comprometimento
```bash
# Verificar processos suspeitos
docker-compose ps
docker stats --no-stream

# Verificar arquivos modificados recentemente
find . -type f -mtime -1 -exec ls -la {} \;

# Verificar conexões de rede
netstat -tulpn | grep LISTEN
```

### Tipos de Incidentes

#### Tentativa de Ataque DDoS
1. Verificar logs do Nginx
2. Identificar IPs de origem
3. Bloquear IPs suspeitos
4. Aumentar rate limiting se necessário

#### Tentativa de Acesso Não Autorizado
1. Verificar logs de autenticação
2. Identificar método de ataque
3. Bloquear IPs suspeitos
4. Revisar configurações de segurança

#### Vazamento de Dados
1. Isolar sistema imediatamente
2. Preservar evidências
3. Notificar equipe de segurança
4. Seguir procedimentos de resposta a incidentes

---

## Manutenção de Certificados

### Renovação de Certificados

#### Verificar Validade
```bash
# Verificar validade dos certificados
openssl x509 -in ./ssl/cert.pem -text -noout | grep -A2 "Validity"

# Verificar dias até expiração
openssl x509 -in ./ssl/cert.pem -checkend 86400
```

#### Renovar Certificados (Let's Encrypt)
```bash
# Renovar certificados
certbot renew --nginx

# Verificar renovação
openssl x509 -in ./ssl/cert.pem -text -noout | grep -A2 "Validity"

# Reiniciar Nginx
docker-compose restart nginx
```

#### Gerar Certificados Auto-assinados (Desenvolvimento)
```bash
# Gerar certificados para desenvolvimento
./scripts/generate-ssl-certs.sh localhost

# Verificar certificados gerados
ls -la ./ssl/
```

### Configuração de SSL

#### Verificar Configuração SSL
```bash
# Verificar configuração SSL do Nginx
nginx -t

# Verificar ciphers suportados
openssl ciphers -v | grep -E "(ECDHE|DHE)"
```

#### Atualizar Configuração SSL
```bash
# Atualizar configuração SSL no nginx.conf
# (configuração já implementada)

# Reiniciar Nginx
docker-compose restart nginx
```

---

## Auditoria de Segurança

### Verificação Semanal

#### 1. Revisão de Logs
```bash
# Revisar logs de acesso da semana
docker-compose logs nginx --since 7d | grep -E "(40[1-5]|50[0-5])"

# Revisar tentativas de login falhadas
docker-compose logs api --since 7d | grep -i "unauthorized\|forbidden"
```

#### 2. Verificação de Configurações
```bash
# Verificar configurações de segurança
grep -E "(add_header|limit_req|limit_conn)" nginx.conf

# Verificar configurações do Redis
grep -E "(requirepass|protected-mode)" redis.conf
```

#### 3. Verificação de Dependências
```bash
# Verificar vulnerabilidades conhecidas
npm audit

# Verificar imagens Docker
docker-compose images
```

### Verificação Mensal

#### 1. Auditoria de Acessos
```bash
# Revisar API Keys ativas
./scripts/manage-api-keys.js list

# Revisar domínios autorizados
./scripts/manage-domains.js list
```

#### 2. Teste de Penetração
```bash
# Teste básico de segurança
nmap -sS -O localhost

# Teste de SSL
sslscan localhost:443
```

#### 3. Revisão de Políticas
- Revisar políticas de senha
- Revisar políticas de acesso
- Revisar políticas de backup
- Revisar políticas de monitoramento

---

## Contatos de Segurança

### Equipe de Segurança
- **Security Lead:** [Nome] - [email] - [telefone]
- **Security Analyst:** [Nome] - [email] - [telefone]

### Equipe de Operações
- **Ops Lead:** [Nome] - [email] - [telefone]
- **On-call:** [Nome] - [email] - [telefone]

### Fornecedores de Segurança
- **Provedor de SSL:** [Contato]
- **Provedor de Monitoramento:** [Contato]

### Procedimentos de Escalação

1. **Nível 1 (Operações):** Alertas de segurança, tentativas de acesso
2. **Nível 2 (Segurança):** Incidentes de segurança, ataques
3. **Nível 3 (Executivo):** Vazamento de dados, comprometimento crítico
4. **Nível 4 (Legal):** Incidentes com impacto legal

---

## Anexos

### Comandos Úteis

#### Análise de Logs
```bash
# Top IPs por requisições
awk '{print $1}' access.log | sort | uniq -c | sort -nr | head -10

# Top URLs acessadas
awk '{print $7}' access.log | sort | uniq -c | sort -nr | head -10

# Status codes
awk '{print $9}' access.log | sort | uniq -c | sort -nr
```

#### Monitoramento de Rede
```bash
# Verificar conexões ativas
netstat -tulpn | grep LISTEN

# Verificar conexões por IP
netstat -tulpn | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -nr
```

### Ferramentas de Segurança

- **Nmap:** Escaneamento de portas
- **SSLScan:** Teste de SSL/TLS
- **Fail2ban:** Bloqueio automático de IPs
- **Logwatch:** Análise de logs

### Logs Importantes

- `./logs/nginx-access.log` - Logs de acesso do Nginx
- `./logs/nginx-error.log` - Logs de erro do Nginx
- `./logs/api.log` - Logs da API
- `./logs/worker.log` - Logs do Worker

---

**Última revisão:** 2025-01-20  
**Próxima revisão:** 2025-02-20  
**Aprovado por:** [Nome do Aprovador]
