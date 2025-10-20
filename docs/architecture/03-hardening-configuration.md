# Configuração de Hardening e Operações

> **Versão:** 1.0.0  
> **Última Atualização:** 2025-01-20  
> **Status:** Ativo  
> **TASK:** 8.2 - Hardening e runbooks de operação  

## Visão Geral

Este documento detalha as configurações de hardening e operações implementadas para o Email Gateway, incluindo segurança, backups, monitoramento e procedimentos operacionais.

## Índice

1. [Configuração de Segurança](#configuração-de-segurança)
2. [Configuração de Backups](#configuração-de-backups)
3. [Configuração de Monitoramento](#configuração-de-monitoramento)
4. [Configuração de Logs](#configuração-de-logs)
5. [Configuração de SSL/TLS](#configuração-de-ssltls)
6. [Configuração de Produção](#configuração-de-produção)

---

## Configuração de Segurança

### Nginx Security Headers

```nginx
# Headers de segurança globais
add_header X-Frame-Options DENY always;
add_header X-Content-Type-Options nosniff always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none';" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

### Rate Limiting

```nginx
# Zones de rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=health:10m rate=1r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=dashboard:10m rate=20r/m;

# Connection limiting
limit_conn_zone $binary_remote_addr zone=conn_limit_per_ip:10m;
limit_conn_zone $server_name zone=conn_limit_per_server:10m;
```

### SSL/TLS Configuration

```nginx
# SSL/TLS Security
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_session_tickets off;

# OCSP Stapling
ssl_stapling on;
ssl_stapling_verify on;
```

---

## Configuração de Backups

### PostgreSQL Backup Configuration

```bash
# Variáveis de ambiente para backup
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=postgres
export DB_NAME=email_gateway
export DB_PASSWORD=your_secure_password

# Configuração de retenção
DAILY_RETENTION_DAYS=7
WEEKLY_RETENTION_DAYS=30
MONTHLY_RETENTION_DAYS=90
```

### Redis Backup Configuration

```bash
# Configuração de backup do Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_BACKUP_RETENTION_DAYS=7
```

### Cron Schedule

```bash
# Backup diário às 02:00
0 2 * * * /path/to/scripts/backup-postgres.sh daily 7 ./backups

# Backup semanal aos domingos às 03:00
0 3 * * 0 /path/to/scripts/backup-postgres.sh weekly 30 ./backups

# Backup mensal no dia 1 às 04:00
0 4 1 * * /path/to/scripts/backup-postgres.sh monthly 90 ./backups

# Monitoramento de backups às 06:00
0 6 * * * /path/to/scripts/monitor-backups.sh ./backups
```

---

## Configuração de Monitoramento

### System Monitoring

```bash
# Thresholds de alerta
CPU_THRESHOLD=80          # % CPU para alerta
MEMORY_THRESHOLD=85       # % memória para alerta
DISK_THRESHOLD=90         # % disco para alerta

# Frequência de monitoramento
MONITORING_INTERVAL=5     # minutos
DAILY_REPORT_TIME=08:00   # hora do relatório diário
```

### Service Monitoring

```bash
# Verificações de saúde
HEALTH_CHECK_INTERVAL=30s
HEALTH_CHECK_TIMEOUT=10s
HEALTH_CHECK_RETRIES=3

# Endpoints de monitoramento
HEALTH_ENDPOINT=/health/healthz
READINESS_ENDPOINT=/health/readyz
```

### Log Monitoring

```bash
# Configuração de logs
LOG_LEVEL=info
LOG_FORMAT=json
LOG_RETENTION_DAYS=30
LOG_ROTATION_SIZE=100M
```

---

## Configuração de Logs

### Nginx Logging

```nginx
# Log format
log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                '$status $body_bytes_sent "$http_referer" '
                '"$http_user_agent" "$http_x_forwarded_for" '
                'rt=$request_time uct="$upstream_connect_time" '
                'uht="$upstream_header_time" urt="$upstream_response_time" '
                'ssl_protocol="$ssl_protocol" ssl_cipher="$ssl_cipher"';

# Log files
access_log /var/log/nginx/access.log main;
error_log /var/log/nginx/error.log warn;
```

### Application Logging

```typescript
// Configuração de logging da aplicação
const logger = new Logger(ServiceName.name);

// Structured logging
logger.log({
  message: 'Operation completed',
  requestId: req.headers['x-request-id'],
  companyId: req.user.companyId,
  duration: Date.now() - startTime,
  timestamp: new Date().toISOString()
});
```

### Log Rotation

```bash
# Configuração de rotação de logs
/var/log/email-gateway-*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
}
```

---

## Configuração de SSL/TLS

### Certificate Generation

```bash
# Gerar certificados auto-assinados (desenvolvimento)
./scripts/generate-ssl-certs.sh localhost

# Verificar certificados
openssl x509 -in ./ssl/cert.pem -text -noout
openssl rsa -in ./ssl/key.pem -check
```

### Certificate Validation

```bash
# Verificar validade
openssl x509 -in ./ssl/cert.pem -checkend 86400

# Verificar configuração SSL
sslscan localhost:443
```

### Let's Encrypt (Produção)

```bash
# Instalar certbot
sudo apt-get install certbot python3-certbot-nginx

# Obter certificado
sudo certbot --nginx -d yourdomain.com

# Renovação automática
sudo crontab -e
# Adicionar: 0 12 * * * /usr/bin/certbot renew --quiet
```

---

## Configuração de Produção

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=secure_password
POSTGRES_DB=email_gateway

# Redis
REDIS_URL=redis://host:port
REDIS_PASSWORD=secure_redis_password

# AWS SES
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_SES_REGION=us-east-1

# Security
ENCRYPTION_KEY=your_encryption_key
ENCRYPTION_SALT_SECRET=your_salt_secret

# Monitoring
CPU_THRESHOLD=80
MEMORY_THRESHOLD=85
DISK_THRESHOLD=90
```

### Docker Compose Production

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    restart: unless-stopped

  api:
    build: .
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --appendfsync everysec
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### Health Checks

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health/healthz"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

---

## Validação e Testes

### Security Tests

```bash
# Testar configuração de segurança
./scripts/test-security-config.sh

# Testar SSL/TLS
sslscan localhost:443

# Testar headers de segurança
curl -I https://localhost/health/healthz
```

### Backup Tests

```bash
# Testar scripts de backup
./scripts/test-backup-scripts.sh

# Testar monitoramento de backups
./scripts/monitor-backups.sh ./backups
```

### Integration Tests

```bash
# Testar integração completa
./scripts/test-integration.sh

# Testar conectividade
docker-compose exec postgres pg_isready -U postgres
docker-compose exec redis redis-cli ping
curl -f http://localhost/health/healthz
```

---

## Monitoramento e Alertas

### Metrics Collection

```bash
# System metrics
./scripts/monitor-system.sh 80 85 90

# Redis metrics
./scripts/monitor-redis.sh localhost 6379 ""

# Backup metrics
./scripts/monitor-backups.sh ./backups
```

### Alert Configuration

```bash
# CPU Alert
if cpu_usage > 80%; then
  echo "ALERT: High CPU usage: ${cpu_usage}%"
fi

# Memory Alert
if memory_usage > 85%; then
  echo "ALERT: High memory usage: ${memory_usage}%"
fi

# Disk Alert
if disk_usage > 90%; then
  echo "ALERT: High disk usage: ${disk_usage}%"
fi
```

---

## Troubleshooting

### Common Issues

#### Nginx Configuration Issues
```bash
# Test configuration
nginx -t

# Reload configuration
nginx -s reload

# Check logs
tail -f /var/log/nginx/error.log
```

#### Database Connection Issues
```bash
# Test connection
pg_isready -h localhost -p 5432 -U postgres

# Check logs
docker-compose logs postgres
```

#### Redis Connection Issues
```bash
# Test connection
redis-cli ping

# Check logs
docker-compose logs redis
```

#### Backup Issues
```bash
# Check backup logs
tail -f ./backups/backup.log

# Test backup manually
./scripts/backup-postgres.sh daily 7 ./test-backups
```

---

## Maintenance

### Regular Tasks

#### Daily
- [ ] Check system health
- [ ] Review logs for errors
- [ ] Verify backups completed

#### Weekly
- [ ] Review security logs
- [ ] Test backup restoration
- [ ] Update monitoring thresholds

#### Monthly
- [ ] Review and update runbooks
- [ ] Audit security configurations
- [ ] Update dependencies

#### Quarterly
- [ ] Review SSL certificates
- [ ] Update security policies
- [ ] Conduct security assessment

---

## References

### Documentation
- [Nginx Security](https://nginx.org/en/docs/http/security.html)
- [PostgreSQL Backup](https://www.postgresql.org/docs/current/backup.html)
- [Redis Persistence](https://redis.io/docs/manual/persistence/)
- [Docker Security](https://docs.docker.com/engine/security/)

### Tools
- [SSL Labs](https://www.ssllabs.com/ssltest/)
- [Security Headers](https://securityheaders.com/)
- [Mozilla SSL Config](https://ssl-config.mozilla.org/)

---

**Última atualização:** 2025-01-20  
**Próxima revisão:** 2025-02-20  
**Aprovado por:** [Nome do Aprovador]
