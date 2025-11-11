# 📧 Guia Completo: Configuração SMTP Self-Hosted

**Data:** 11 de Novembro de 2025
**Objetivo:** Configurar servidor SMTP próprio como provider principal do Email Gateway

---

## 📋 Índice

1. [Opções de Servidores SMTP](#opções-de-servidores-smtp)
2. [Opção Recomendada: Postal](#opção-1-postal-recomendado)
3. [Opção Alternativa: MailU](#opção-2-mailu-alternativa-simples)
4. [Configuração de DNS](#configuração-de-dns)
5. [Integração com Email Gateway](#integração-com-email-gateway)
6. [Testes e Validação](#testes-e-validação)
7. [Troubleshooting](#troubleshooting)

---

## 🎯 Opções de Servidores SMTP

### Comparação Rápida

| Servidor | Complexidade | Recursos | Recomendado Para |
|----------|--------------|----------|------------------|
| **Postal** | Média | Completo, Webhooks, UI | Produção profissional |
| **MailU** | Baixa | Simples, Web UI | Pequeno/médio porte |
| **Postfix** | Alta | Máximo controle | Experts em Linux |
| **Maddy** | Média | Moderno, Go | Desenvolvedores |

**Nossa recomendação:** **Postal** - melhor custo-benefício entre recursos e facilidade

---

## ✅ Opção 1: Postal (Recomendado)

### Por que Postal?
- ✅ Interface web completa
- ✅ Webhooks para tracking
- ✅ Gestão de múltiplos domínios
- ✅ Statistics e relatórios
- ✅ API REST integrada
- ✅ Suporte a IP pools
- ✅ Bounce/complaint handling

### Pré-requisitos
- Ubuntu 20.04+ ou Debian 11+
- 2GB RAM mínimo (4GB recomendado)
- 20GB disco
- Domínio próprio configurado
- Acesso root (sudo)

---

### 🚀 Passo 1: Preparar o Servidor

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências básicas
sudo apt install -y curl git build-essential

# Verificar se porta 25 está aberta (IMPORTANTE!)
sudo netstat -tulpn | grep :25

# Se porta 25 estiver bloqueada pelo provedor, será necessário
# solicitar desbloqueio (AWS EC2, DigitalOcean, etc)
```

**⚠️ IMPORTANTE:** Muitos provedores de cloud (AWS, GCP, Azure) bloqueiam porta 25 por padrão. Você precisará:
- AWS: Solicitar remoção do throttling via formulário
- DigitalOcean: Criar ticket de suporte
- Vultr/Linode: Geralmente não bloqueiam

---

### 🐳 Passo 2: Instalar Docker e Docker Compose

```bash
# Instalar Docker
curl -fsSL https://get.docker.com | sudo sh

# Adicionar seu usuário ao grupo docker
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verificar instalação
docker --version
docker-compose --version

# IMPORTANTE: Logout e login novamente para aplicar grupo docker
exit
# Fazer SSH novamente
```

---

### 📦 Passo 3: Instalar Postal

```bash
# Clone o repositório oficial
git clone https://postalserver.io/start/install /opt/postal/install
sudo ln -s /opt/postal/install/bin/postal /usr/bin/postal

# Inicializar Postal
sudo postal bootstrap

# O comando acima irá:
# 1. Baixar imagens Docker
# 2. Criar arquivos de configuração
# 3. Inicializar banco de dados
# 4. Gerar chaves de segurança
```

---

### ⚙️ Passo 4: Configurar Postal

```bash
# Editar configuração principal
sudo nano /opt/postal/config/postal.yml
```

**Configuração mínima necessária:**

```yaml
# /opt/postal/config/postal.yml
web:
  host: mail.seudominio.com  # ← ALTERAR para seu domínio
  protocol: https             # Use HTTPS em produção

main_db:
  # Postal cria automaticamente, não precisa alterar

message_db:
  # Postal cria automaticamente, não precisa alterar

rabbitmq:
  # Postal cria automaticamente, não precisa alterar

dns:
  # Configurações de DNS (preencher após configurar DNS)
  mx_records:
    - mx1.seudominio.com
    - mx2.seudominio.com
  smtp_server_hostname: mail.seudominio.com
  spf_include: spf.seudominio.com
  return_path_domain: rp.seudominio.com
  route_domain: routes.seudominio.com
  track_domain: track.seudominio.com

smtp_server:
  port: 25
  tls_enabled: true
  # Certificados SSL serão configurados depois

web_server:
  bind_address: "0.0.0.0"
  port: 5000

logging:
  stdout: true
  level: info
```

Salvar: `Ctrl+O`, Enter, `Ctrl+X`

---

### 🔐 Passo 5: Criar Usuário Admin e Organização

```bash
# Iniciar Postal
sudo postal start

# Aguardar ~30 segundos para subir completamente
# Verificar se está rodando
sudo postal status

# Criar usuário admin
sudo postal make-user
# Email: admin@seudominio.com
# First Name: Admin
# Last Name: User
# Password: (senha forte)

# O comando retornará algo como:
# User created with ID 1
# API Key: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**⚠️ ANOTAR:**
- Email do admin
- Senha
- API Key (precisaremos depois)

---

### 🌐 Passo 6: Acessar Interface Web

```bash
# Abrir firewall para porta 5000 (temporariamente)
sudo ufw allow 5000/tcp

# Ou no seu provedor de cloud, adicionar regra de firewall
# para liberar porta 5000 do seu IP
```

**Acessar:** `http://IP-DO-SERVIDOR:5000`

1. Fazer login com email/senha do admin
2. Criar organização:
   - Name: Sua Empresa
   - Short Name: empresa (sem espaços)
3. Criar servidor de email:
   - Name: Production
   - Mode: Live
   - Click "Build Server"

---

### 📨 Passo 7: Configurar Servidor SMTP no Postal

Na interface web do Postal:

1. **Servers** → Seu servidor → **Settings**
2. **SMTP** tab:
   - Enable SMTP: ✅
   - Port: 2525 (Postal usa porta diferente para receber)
   - Authentication Required: ✅
3. **Criar credenciais SMTP**:
   - Click "Credentials" → "Create New Credential"
   - Name: email-gateway
   - Type: SMTP
   - Click "Create"
   - **ANOTAR**: Username e Password gerados

---

## 🌍 Configuração de DNS

### Registros DNS Necessários

Adicione os seguintes registros no seu provedor de DNS (GoDaddy, Cloudflare, etc):

```dns
# 1. Apontar domínio para servidor
mail.seudominio.com.     A      IP-DO-SERVIDOR

# 2. Registro MX (se quiser receber emails)
seudominio.com.          MX     10 mail.seudominio.com.

# 3. SPF - Autoriza seu servidor a enviar
seudominio.com.          TXT    "v=spf1 mx ip4:IP-DO-SERVIDOR ~all"

# 4. DMARC - Política de autenticação
_dmarc.seudominio.com.   TXT    "v=DMARC1; p=none; rua=mailto:dmarc@seudominio.com"

# 5. Reverso DNS (PTR) - Configurar no provedor de VPS
IP-DO-SERVIDOR           PTR    mail.seudominio.com.
```

### Configurar DKIM

No Postal:
1. **Servers** → Seu servidor → **DKIM**
2. Click "Generate New DKIM Key"
3. Copiar registro DNS mostrado
4. Adicionar no seu DNS:

```dns
# Exemplo do que o Postal gera:
postal._domainkey.seudominio.com.  TXT  "v=DKIM1; k=rsa; p=MIGfMA0GCS..."
```

### Validar DNS

```bash
# Verificar SPF
dig TXT seudominio.com +short

# Verificar DKIM
dig TXT postal._domainkey.seudominio.com +short

# Verificar MX
dig MX seudominio.com +short

# Verificar reverso
dig -x IP-DO-SERVIDOR +short
```

Todos devem retornar os valores configurados.

---

## 🔗 Integração com Email Gateway

### Passo 1: Configurar .env

```bash
cd /caminho/para/email-gateway
nano .env
```

Adicionar/modificar:

```env
# SMTP Configuration (Postal)
SMTP_HOST=mail.seudominio.com
SMTP_PORT=2525                    # Postal usa 2525 para envio
SMTP_SECURE=false                 # false = usa STARTTLS
SMTP_USER=USERNAME_DO_POSTAL      # Do passo 7
SMTP_PASSWORD=PASSWORD_DO_POSTAL  # Do passo 7
SMTP_FROM_ADDRESS=noreply@seudominio.com
SMTP_FROM_NAME=Sua Empresa

# Opcional: AWS SES como backup
# AWS_REGION=us-east-1
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
```

### Passo 2: Verificar Configuração

```bash
# Rebuild do projeto
npm run build

# Testar conexão SMTP
node -e "
const nodemailer = require('nodemailer');
const transport = nodemailer.createTransport({
  host: 'mail.seudominio.com',
  port: 2525,
  secure: false,
  auth: {
    user: 'USERNAME_DO_POSTAL',
    pass: 'PASSWORD_DO_POSTAL'
  }
});
transport.verify().then(console.log).catch(console.error);
"
```

Deve retornar: `true` (conexão OK)

---

## 🧪 Testes e Validação

### Teste 1: Envio Manual via cURL

```bash
curl -X POST http://localhost:3000/v1/email/send \
  -H "x-api-key: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "seu-email-pessoal@gmail.com",
    "subject": "Teste SMTP Postal",
    "html": "<h1>Funcionou!</h1><p>Email enviado via Postal SMTP</p>"
  }'
```

### Teste 2: Verificar Logs

```bash
# Logs do worker
tail -f logs/worker.log

# Logs do Postal
sudo postal logs
```

### Teste 3: Verificar no Postal

1. Acesse interface web do Postal
2. **Messages** → Ver emails enviados
3. Verificar status: "Sent" ✅

### Teste 4: Verificar Recebimento

1. Checar inbox do email de teste
2. Verificar:
   - Email chegou? ✅
   - Não foi para spam? ✅
   - Headers corretos? ✅

---

## 🔍 Troubleshooting

### Problema: "Connection timeout"

**Causa:** Porta 25 bloqueada ou firewall

**Solução:**
```bash
# Verificar firewall
sudo ufw status

# Liberar portas necessárias
sudo ufw allow 25/tcp
sudo ufw allow 2525/tcp
sudo ufw allow 587/tcp
sudo ufw allow 5000/tcp

# Verificar se Postal está escutando
sudo netstat -tulpn | grep postal
```

### Problema: "Authentication failed"

**Causa:** Credenciais incorretas

**Solução:**
1. No Postal web, **Servers** → **Credentials**
2. Deletar credencial antiga
3. Criar nova credencial
4. Atualizar `.env` com novos valores

### Problema: Emails vão para SPAM

**Causa:** DNS não configurado corretamente

**Solução:**
```bash
# Testar configuração em:
# https://mxtoolbox.com/SuperTool.aspx

# Verificar:
# 1. SPF Pass
# 2. DKIM Pass
# 3. DMARC Pass
# 4. Reverso DNS configurado
# 5. IP não está em blacklist (https://mxtoolbox.com/blacklists.aspx)
```

### Problema: "SSL certificate error"

**Causa:** Certificado SSL não configurado

**Solução:**
```bash
# Instalar Let's Encrypt
sudo apt install certbot

# Gerar certificado
sudo certbot certonly --standalone -d mail.seudominio.com

# Configurar Postal para usar
sudo nano /opt/postal/config/postal.yml

# Adicionar:
# web:
#   tls_certificate_path: /etc/letsencrypt/live/mail.seudominio.com/fullchain.pem
#   tls_private_key_path: /etc/letsencrypt/live/mail.seudominio.com/privkey.pem

# Reiniciar Postal
sudo postal restart
```

---

## 📊 Monitoramento

### Logs Importantes

```bash
# Logs em tempo real
sudo postal logs --tail

# Logs de envio
tail -f /opt/postal/log/smtp.log

# Status dos serviços
sudo postal status

# Estatísticas
sudo postal stats
```

### Métricas para Monitorar

- Taxa de entrega (delivery rate) > 95%
- Taxa de bounce < 5%
- Taxa de spam complaints < 0.1%
- Latência de envio < 2s

---

## 🔒 Segurança

### Checklist de Segurança

- [ ] Firewall configurado (apenas portas necessárias)
- [ ] SSL/TLS habilitado
- [ ] Senhas fortes (min 16 caracteres)
- [ ] Backup automático configurado
- [ ] Fail2ban instalado (proteção contra brute force)
- [ ] Rate limiting configurado
- [ ] Logs sendo monitorados
- [ ] Reverso DNS configurado
- [ ] SPF, DKIM, DMARC configurados

### Fail2ban (Opcional mas Recomendado)

```bash
# Instalar
sudo apt install fail2ban

# Configurar
sudo nano /etc/fail2ban/jail.local
```

Adicionar:

```ini
[postal-smtp]
enabled = true
port = 2525
filter = postal-smtp
logpath = /opt/postal/log/smtp.log
maxretry = 5
bantime = 3600
```

---

## 📈 Próximos Passos

1. ✅ Postal configurado e funcionando
2. ⏭️ Configurar warm-up (enviar emails gradualmente)
3. ⏭️ Configurar webhooks do Postal para tracking
4. ⏭️ Implementar monitoramento (Grafana + Prometheus)
5. ⏭️ Configurar backup automático
6. ⏭️ Escalar para múltiplos servidores (se necessário)

---

## 🆘 Suporte

**Documentação Oficial:**
- Postal: https://docs.postalserver.io/
- Email Gateway: `/docs` na raiz do projeto

**Comunidade:**
- GitHub Issues: https://github.com/postalserver/postal/issues
- Discord: (verificar no site oficial)

---

## 📝 Resumo dos Comandos

```bash
# Instalação
git clone https://postalserver.io/start/install /opt/postal/install
sudo postal bootstrap
sudo postal start

# Gerenciamento
sudo postal stop
sudo postal restart
sudo postal status
sudo postal logs

# Manutenção
sudo postal upgrade
sudo postal database-migrate

# Troubleshooting
sudo postal console  # Console interativo Rails
sudo postal test-smtp  # Testar SMTP
```

---

**✅ Configuração Completa!**

Seu Email Gateway agora está rodando com SMTP próprio (Postal) como provider principal! 🎉

**Próximo passo:** Testar envio de emails em produção e monitorar métricas de entrega.

---

**Atualizado em:** 11/11/2025
**Versão:** 1.0
