# Email Gateway - Runbook de Backup e Recuperação

> **Versão:** 1.0.0  
> **Última Atualização:** 2025-01-20  
> **Responsável:** Equipe de Operações  
> **Status:** Ativo  

## Visão Geral

Este runbook detalha os procedimentos de backup e recuperação para o Email Gateway, incluindo PostgreSQL, Redis e configurações do sistema.

## Índice

1. [Estratégia de Backup](#estratégia-de-backup)
2. [Backup do PostgreSQL](#backup-do-postgresql)
3. [Backup do Redis](#backup-do-redis)
4. [Backup de Configurações](#backup-de-configurações)
5. [Procedimentos de Recuperação](#procedimentos-de-recuperação)
6. [Testes de Restauração](#testes-de-restauração)
7. [Monitoramento de Backups](#monitoramento-de-backups)

---

## Estratégia de Backup

### Objetivos de Recuperação
- **RPO (Recovery Point Objective):** 24 horas máximo
- **RTO (Recovery Time Objective):** 4 horas máximo
- **Retenção:** 7 dias (daily), 30 dias (weekly), 90 dias (monthly)

### Componentes Incluídos
- Banco de dados PostgreSQL
- Cache e filas Redis
- Configurações do sistema
- Certificados SSL
- Logs importantes

### Componentes Excluídos
- Logs de aplicação (exceto logs críticos)
- Arquivos temporários
- Cache de dependências

---

## Backup do PostgreSQL

### Backup Automático

#### Configuração
```bash
# Verificar se o agendamento está ativo
crontab -l | grep backup-postgres

# Executar backup manual para teste
./scripts/backup-postgres.sh daily 7 ./backups
```

#### Verificação de Backup
```bash
# Verificar backups disponíveis
ls -la ./backups/

# Verificar integridade do último backup
./scripts/monitor-backups.sh ./backups

# Testar restauração
./scripts/backup-postgres.sh daily 7 ./backups
```

### Backup Manual

#### Backup Completo
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

#### Backup Específico de Tabelas
```bash
# Backup de tabelas específicas
docker-compose exec postgres pg_dump -U postgres -t companies -t api_keys email_gateway > companies_backup.sql
```

#### Backup com Compressão
```bash
# Backup com compressão máxima
docker-compose exec postgres pg_dump -U postgres -Fc -Z9 email_gateway > backup.dump
```

### Validação de Backup

#### Verificação de Integridade
```bash
# Verificar se o arquivo não está corrompido
gzip -t ./backups/email-gateway-daily-YYYYMMDD-HHMMSS.sql.gz

# Verificar tamanho do arquivo
ls -lh ./backups/email-gateway-daily-YYYYMMDD-HHMMSS.sql.gz
```

#### Teste de Restauração
```bash
# Criar banco de teste
docker-compose exec postgres createdb -U postgres email_gateway_test

# Restaurar backup no banco de teste
gunzip -c ./backups/email-gateway-daily-YYYYMMDD-HHMMSS.sql.gz | \
docker-compose exec -T postgres psql -U postgres -d email_gateway_test

# Verificar se as tabelas foram criadas
docker-compose exec postgres psql -U postgres -d email_gateway_test -c "\dt"

# Limpar banco de teste
docker-compose exec postgres dropdb -U postgres email_gateway_test
```

---

## Backup do Redis

### Backup Automático

#### Configuração
```bash
# Executar backup manual para teste
./scripts/backup-redis.sh localhost 6379 "" ./redis-backups 7

# Verificar backup criado
ls -la ./redis-backups/
```

### Backup Manual

#### Backup Completo
```bash
# Executar backup
./scripts/backup-redis.sh localhost 6379 "" ./redis-backups 7

# Verificar conteúdo do backup
tar -tzf ./redis-backups/redis-backup-YYYYMMDD-HHMMSS.tar.gz
```

#### Backup de Dados Específicos
```bash
# Backup de chaves específicas
docker-compose exec redis redis-cli --rdb /data/backup.rdb

# Backup de configuração
docker-compose exec redis redis-cli CONFIG GET "*" > redis-config.txt
```

### Validação de Backup

#### Verificação de Integridade
```bash
# Verificar se o arquivo não está corrompido
tar -tzf ./redis-backups/redis-backup-YYYYMMDD-HHMMSS.tar.gz

# Extrair e verificar arquivos
tar -xzf ./redis-backups/redis-backup-YYYYMMDD-HHMMSS.tar.gz
ls -la redis-backup-YYYYMMDD-HHMMSS/
```

---

## Backup de Configurações

### Configurações do Sistema

#### Backup de Arquivos de Configuração
```bash
# Criar diretório de backup
mkdir -p ./config-backups/$(date +%Y%m%d)

# Backup de configurações
cp nginx.conf ./config-backups/$(date +%Y%m%d)/
cp redis.conf ./config-backups/$(date +%Y%m%d)/
cp docker-compose.yml ./config-backups/$(date +%Y%m%d)/
cp docker-compose.prod.yml ./config-backups/$(date +%Y%m%d)/
cp .env.example ./config-backups/$(date +%Y%m%d)/

# Backup de certificados SSL
cp -r ssl/ ./config-backups/$(date +%Y%m%d)/ssl/
```

#### Backup de Scripts
```bash
# Backup de scripts
cp -r scripts/ ./config-backups/$(date +%Y%m%d)/scripts/
```

### Configurações de Aplicação

#### Backup de Variáveis de Ambiente
```bash
# Backup de variáveis de ambiente (sem senhas)
grep -v "PASSWORD\|SECRET\|KEY" .env > ./config-backups/$(date +%Y%m%d)/env-template.txt
```

---

## Procedimentos de Recuperação

### Recuperação do PostgreSQL

#### Recuperação Completa
```bash
# 1. Parar serviços dependentes
docker-compose stop api worker

# 2. Fazer backup do estado atual (se possível)
./scripts/backup-postgres.sh recovery-backup 1 ./recovery-backups

# 3. Restaurar backup
gunzip -c ./backups/email-gateway-daily-YYYYMMDD-HHMMSS.sql.gz | \
docker-compose exec -T postgres psql -U postgres -d email_gateway

# 4. Verificar restauração
docker-compose exec postgres psql -U postgres -d email_gateway -c "\dt"

# 5. Reiniciar serviços
docker-compose start api worker
```

#### Recuperação de Tabelas Específicas
```bash
# Restaurar tabela específica
gunzip -c ./backups/email-gateway-daily-YYYYMMDD-HHMMSS.sql.gz | \
grep -A 1000 "CREATE TABLE companies" | \
docker-compose exec -T postgres psql -U postgres -d email_gateway
```

### Recuperação do Redis

#### Recuperação Completa
```bash
# 1. Parar Redis
docker-compose stop redis

# 2. Fazer backup do estado atual
./scripts/backup-redis.sh localhost 6379 "" ./recovery-backups 1

# 3. Extrair backup
tar -xzf ./redis-backups/redis-backup-YYYYMMDD-HHMMSS.tar.gz

# 4. Copiar arquivos de dados
cp redis-backup-YYYYMMDD-HHMMSS/*.rdb ./redis-data/
cp redis-backup-YYYYMMDD-HHMMSS/*.aof ./redis-data/

# 5. Reiniciar Redis
docker-compose start redis

# 6. Verificar restauração
docker-compose exec redis redis-cli ping
docker-compose exec redis redis-cli INFO keyspace
```

### Recuperação de Configurações

#### Restaurar Configurações do Sistema
```bash
# Restaurar configurações
cp ./config-backups/YYYYMMDD/nginx.conf ./
cp ./config-backups/YYYYMMDD/redis.conf ./
cp ./config-backups/YYYYMMDD/docker-compose.yml ./
cp ./config-backups/YYYYMMDD/docker-compose.prod.yml ./

# Reiniciar serviços
docker-compose restart nginx redis
```

---

## Testes de Restauração

### Teste Quinzenal Automático

#### Configuração
```bash
# O teste quinzenal é executado automaticamente pelo script de backup
# Verificar logs para confirmar execução
tail -f ./backups/backup.log | grep "teste de restauração"
```

### Teste Manual

#### Teste de Restauração do PostgreSQL
```bash
# Executar teste manual
./scripts/backup-postgres.sh daily 7 ./backups

# Verificar logs do teste
grep "Teste de restauração" ./backups/backup.log
```

#### Teste de Restauração do Redis
```bash
# Criar banco de teste
docker-compose exec redis redis-cli -n 15

# Adicionar dados de teste
docker-compose exec redis redis-cli -n 15 SET test_key "test_value"

# Fazer backup
./scripts/backup-redis.sh localhost 6379 "" ./redis-backups 7

# Limpar dados
docker-compose exec redis redis-cli -n 15 FLUSHDB

# Restaurar backup
# (seguir procedimento de recuperação)

# Verificar dados
docker-compose exec redis redis-cli -n 15 GET test_key
```

---

## Monitoramento de Backups

### Verificação Diária

#### Status dos Backups
```bash
# Executar monitoramento
./scripts/monitor-backups.sh ./backups

# Verificar logs
tail -f ./backups/backup.log
```

#### Verificação de Espaço
```bash
# Verificar espaço usado pelos backups
du -sh ./backups/
du -sh ./redis-backups/
du -sh ./config-backups/
```

### Alertas de Backup

#### Configuração de Alertas
```bash
# Adicionar ao crontab para verificação diária
0 6 * * * /path/to/scripts/monitor-backups.sh /path/to/backups
```

#### Verificação Manual
```bash
# Verificar backups mais recentes
find ./backups -name "*.sql.gz" -mtime -1 -exec ls -la {} \;

# Verificar integridade
for backup in ./backups/*.sql.gz; do
  echo "Verificando $backup"
  gzip -t "$backup" && echo "OK" || echo "ERRO"
done
```

---

## Procedimentos de Emergência

### Backup de Emergência

#### Quando o Sistema Está Instável
```bash
# Fazer backup imediato
./scripts/backup-postgres.sh emergency 1 ./emergency-backups

# Backup do Redis
./scripts/backup-redis.sh localhost 6379 "" ./emergency-backups 1

# Backup de configurações
mkdir -p ./emergency-backups/config
cp -r . ./emergency-backups/config/
```

### Recuperação de Emergência

#### Recuperação Rápida
```bash
# 1. Parar todos os serviços
docker-compose down

# 2. Restaurar backup mais recente
gunzip -c ./backups/email-gateway-daily-YYYYMMDD-HHMMSS.sql.gz | \
docker-compose exec -T postgres psql -U postgres -d email_gateway

# 3. Reiniciar serviços
docker-compose up -d

# 4. Verificar funcionamento
curl -f http://localhost/health/healthz
```

---

## Contatos de Emergência

### Equipe de Operações
- **Responsável Principal:** [Nome] - [email] - [telefone]
- **Responsável Secundário:** [Nome] - [email] - [telefone]

### Equipe de Desenvolvimento
- **Tech Lead:** [Nome] - [email] - [telefone]
- **DBA:** [Nome] - [email] - [telefone]

### Procedimentos de Escalação

1. **Nível 1:** Falha de backup automático
2. **Nível 2:** Falha de restauração
3. **Nível 3:** Perda de dados
4. **Nível 4:** Incidente crítico

---

## Anexos

### Comandos Úteis

#### PostgreSQL
```bash
# Verificar tamanho do banco
docker-compose exec postgres psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('email_gateway'));"

# Verificar tabelas
docker-compose exec postgres psql -U postgres -d email_gateway -c "\dt"

# Verificar conexões ativas
docker-compose exec postgres psql -U postgres -c "SELECT * FROM pg_stat_activity;"
```

#### Redis
```bash
# Verificar informações do Redis
docker-compose exec redis redis-cli INFO

# Verificar chaves
docker-compose exec redis redis-cli KEYS "*"

# Verificar filas
docker-compose exec redis redis-cli KEYS "bull:*"
```

### Logs Importantes

- `./backups/backup.log` - Logs de backup do PostgreSQL
- `./redis-backups/` - Backups do Redis
- `./config-backups/` - Backups de configurações

---

**Última revisão:** 2025-01-20
**Próxima revisão:** 2025-02-20
**Aprovado por:** Equipe de Desenvolvimento
