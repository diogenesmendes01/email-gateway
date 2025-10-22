# Email Gateway - Runbook de Operação

> **Versão:** 1.0.0  
> **Última Atualização:** 2025-01-20  
> **Responsável:** Equipe de Operações  
> **Status:** Ativo  

## Visão Geral

Este runbook contém procedimentos operacionais para o Email Gateway, incluindo monitoramento, backup, recuperação e manutenção do sistema.

## Índice

1. [Monitoramento do Sistema](#monitoramento-do-sistema)
2. [Backups e Recuperação](#backups-e-recuperação)
3. [Manutenção Preventiva](#manutenção-preventiva)
4. [Procedimentos de Emergência](#procedimentos-de-emergência)
5. [Contatos e Escalação](#contatos-e-escalação)

---

## Monitoramento do Sistema

### Verificações Diárias

#### 1. Status dos Serviços
```bash
# Verificar status dos containers
docker-compose ps

# Verificar logs dos serviços
docker-compose logs --tail=100 api
docker-compose logs --tail=100 worker
docker-compose logs --tail=100 postgres
docker-compose logs --tail=100 redis
docker-compose logs --tail=100 nginx
```

#### 2. Monitoramento de Recursos
```bash
# Executar monitoramento de sistema
./scripts/monitor-system.sh

# Verificar uso de recursos
docker stats --no-stream
```

#### 3. Verificação de Conectividade
```bash
# Testar endpoints de saúde
curl -f http://localhost/health/healthz
curl -f http://localhost/health/readyz

# Verificar conectividade com banco
docker-compose exec postgres pg_isready -U postgres

# Verificar conectividade com Redis
docker-compose exec redis redis-cli ping
```

### Alertas e Thresholds

| Métrica | Warning | Critical | Ação |
|---------|---------|----------|------|
| CPU | > 80% | > 90% | Investigar processos |
| Memória | > 85% | > 95% | Reiniciar serviços |
| Disco | > 80% | > 90% | Limpeza de logs |
| Latência API | > 500ms | > 2s | Verificar load balancer |

---

## Backups e Recuperação

### Backups Automáticos

#### PostgreSQL
- **Frequência:** Diário às 02:00
- **Retenção:** 7 dias (daily), 30 dias (weekly), 90 dias (monthly)
- **Localização:** `./backups/`
- **Validação:** Quinzenal

#### Redis
- **Frequência:** Manual ou sob demanda
- **Retenção:** 7 dias
- **Localização:** `./redis-backups/`

### Procedimentos de Backup

#### Backup Manual do PostgreSQL
```bash
# Configurar variáveis de ambiente
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=postgres
export DB_NAME=email_gateway
export DB_PASSWORD=your_password

# Executar backup
./scripts/backup-postgres.sh daily 7 ./backups
```

#### Backup Manual do Redis
```bash
# Executar backup do Redis
./scripts/backup-redis.sh localhost 6379 "" ./redis-backups 7
```

### Procedimentos de Recuperação

#### Restaurar PostgreSQL
```bash
# Parar serviços dependentes
docker-compose stop api worker

# Restaurar backup
gunzip -c ./backups/email-gateway-daily-YYYYMMDD-HHMMSS.sql.gz | \
docker-compose exec -T postgres psql -U postgres -d email_gateway

# Reiniciar serviços
docker-compose start api worker
```

#### Restaurar Redis
```bash
# Parar Redis
docker-compose stop redis

# Extrair backup
tar -xzf ./redis-backups/redis-backup-YYYYMMDD-HHMMSS.tar.gz

# Copiar arquivos de dados
cp redis-backup-YYYYMMDD-HHMMSS/*.rdb ./redis-data/
cp redis-backup-YYYYMMDD-HHMMSS/*.aof ./redis-data/

# Reiniciar Redis
docker-compose start redis
```

---

## Manutenção Preventiva

### Limpeza de Logs

#### Limpeza Automática
```bash
# Limpeza de logs antigos (executar semanalmente)
find ./logs -name "*.log" -mtime +30 -delete
find /var/log -name "email-gateway-*.log" -mtime +30 -delete
```

#### Limpeza Manual
```bash
# Limpar logs do Docker
docker system prune -f

# Limpar volumes não utilizados
docker volume prune -f
```

### Atualização de Certificados SSL

#### Verificar Validade
```bash
# Verificar certificados SSL
openssl x509 -in ./ssl/cert.pem -text -noout | grep -A2 "Validity"
```

#### Renovar Certificados (Let's Encrypt)
```bash
# Renovar certificados
certbot renew --nginx

# Reiniciar Nginx
docker-compose restart nginx
```

### Atualização de Dependências

#### Atualizar Imagens Docker
```bash
# Atualizar imagens
docker-compose pull

# Reiniciar serviços
docker-compose up -d
```

#### Atualizar Código
```bash
# Fazer backup antes da atualização
./scripts/backup-postgres.sh daily 7 ./backups

# Atualizar código
git pull origin main

# Aplicar migrações
docker-compose exec api npm run migrate

# Reiniciar serviços
docker-compose restart
```

---

## Procedimentos de Emergência

### Falha de Serviço

#### API Indisponível
1. Verificar logs: `docker-compose logs api`
2. Verificar recursos: `docker stats api`
3. Reiniciar serviço: `docker-compose restart api`
4. Se persistir, escalar para equipe de desenvolvimento

#### Worker Parado
1. Verificar logs: `docker-compose logs worker`
2. Verificar fila Redis: `docker-compose exec redis redis-cli LLEN bull:email:send:waiting`
3. Reiniciar worker: `docker-compose restart worker`
4. Monitorar processamento de jobs

#### Banco de Dados Indisponível
1. Verificar status: `docker-compose exec postgres pg_isready`
2. Verificar logs: `docker-compose logs postgres`
3. Verificar espaço em disco
4. Se necessário, restaurar backup

#### Redis Indisponível
1. Verificar status: `docker-compose exec redis redis-cli ping`
2. Verificar logs: `docker-compose logs redis`
3. Verificar memória disponível
4. Reiniciar Redis: `docker-compose restart redis`

### Falha de Recursos

#### Alto Uso de CPU
1. Identificar processo: `docker stats --no-stream`
2. Verificar logs do processo
3. Reiniciar serviço se necessário
4. Escalar recursos se persistir

#### Alto Uso de Memória
1. Verificar uso: `free -h`
2. Identificar processo: `docker stats --no-stream`
3. Reiniciar serviços com alto uso
4. Limpar caches se necessário

#### Espaço em Disco Baixo
1. Verificar uso: `df -h`
2. Limpar logs antigos
3. Limpar backups antigos
4. Limpar imagens Docker não utilizadas

### Incidentes de Segurança

#### Suspeita de Ataque
1. Verificar logs de acesso: `docker-compose logs nginx`
2. Verificar tentativas de login falhadas
3. Bloquear IPs suspeitos no Nginx
4. Escalar para equipe de segurança

#### Vazamento de Dados
1. Isolar sistema imediatamente
2. Preservar logs para investigação
3. Notificar equipe de segurança
4. Seguir procedimentos de resposta a incidentes

---

## Contatos e Escalação

### Equipe de Operações
- **Responsável Principal:** [Nome] - [email] - [telefone]
- **Responsável Secundário:** [Nome] - [email] - [telefone]

### Equipe de Desenvolvimento
- **Tech Lead:** [Nome] - [email] - [telefone]
- **DevOps:** [Nome] - [email] - [telefone]

### Equipe de Segurança
- **Security Lead:** [Nome] - [email] - [telefone]

### Fornecedores
- **AWS Support:** [Plano de suporte]
- **Provedor de Hospedagem:** [Contato]

### Procedimentos de Escalação

1. **Nível 1 (Operações):** Incidentes rotineiros, alertas de monitoramento
2. **Nível 2 (Desenvolvimento):** Falhas de aplicação, problemas de performance
3. **Nível 3 (Arquitetura):** Problemas críticos, falhas de infraestrutura
4. **Nível 4 (Executivo):** Incidentes de segurança, indisponibilidade prolongada

---

## Anexos

### Comandos Úteis

#### Docker
```bash
# Logs em tempo real
docker-compose logs -f [service]

# Executar comando em container
docker-compose exec [service] [command]

# Reiniciar serviço específico
docker-compose restart [service]

# Verificar status
docker-compose ps
```

#### Banco de Dados
```bash
# Conectar ao PostgreSQL
docker-compose exec postgres psql -U postgres -d email_gateway

# Verificar conexões ativas
docker-compose exec postgres psql -U postgres -c "SELECT * FROM pg_stat_activity;"

# Verificar tamanho do banco
docker-compose exec postgres psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('email_gateway'));"
```

#### Redis
```bash
# Conectar ao Redis
docker-compose exec redis redis-cli

# Verificar informações
docker-compose exec redis redis-cli INFO

# Verificar filas
docker-compose exec redis redis-cli KEYS "bull:*"
```

### Scripts de Monitoramento

- `./scripts/monitor-system.sh` - Monitoramento de sistema
- `./scripts/monitor-redis.sh` - Monitoramento do Redis
- `./scripts/monitor-backups.sh` - Monitoramento de backups

### Logs Importantes

- `/var/log/email-gateway-system-monitor.log` - Monitoramento de sistema
- `/var/log/email-gateway-backup.log` - Logs de backup
- `./logs/` - Logs da aplicação

---

**Última revisão:** 2025-01-20
**Próxima revisão:** 2025-02-20
**Aprovado por:** Equipe de Desenvolvimento
