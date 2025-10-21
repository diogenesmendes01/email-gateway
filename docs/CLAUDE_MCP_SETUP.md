# 🔌 Guia de Instalação de MCPs - Claude Code

Este guia detalha como instalar e configurar os Model Context Protocol (MCP) servers para maximizar produtividade com Claude Code.

---

## 📋 MCPs Recomendados para Este Projeto

### **TIER S - Essenciais**
- ✅ **postgres** - Acesso ao banco de dados
- ✅ **redis** - Debug de filas BullMQ
- ✅ **github** - PRs, issues, releases
- ✅ **filesystem** - Navegação no monorepo
- ✅ **aws** - SES, CloudWatch logs
- ✅ **memory** - Contexto persistente
- ✅ **brave-search** - Docs atualizadas

### **TIER A - Altamente Recomendados**
- 🟡 **notion** - Gerenciar backlog
- 🟡 **sequential-thinking** - Debugging complexo
- 🟡 **github-actions** - CI/CD pipelines

### **TIER B - Específicos**
- 🔵 **gpt-researcher** - Research aprofundado
- 🔵 **context7** - Busca semântica
- 🔵 **archon** - Orquestração de agentes

---

## 🚀 Método 1: Instalação Automática (Recomendado)

### **Passo 1: Configure Variáveis de Ambiente**

Crie um arquivo `.env.claude` na raiz do projeto:

```bash
# Database
POSTGRES_URL=postgresql://user:password@localhost:5432/email_gateway
REDIS_URL=redis://localhost:6379

# GitHub
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_seu_token_aqui

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=sua_key_aqui
AWS_SECRET_ACCESS_KEY=sua_secret_aqui

# Brave Search (opcional)
BRAVE_API_KEY=sua_key_aqui

# Notion (opcional)
NOTION_API_KEY=sua_key_aqui
```

### **Passo 2: Atualize .mcp.json**

O arquivo `.mcp.json` já está configurado no projeto. Atualize as variáveis de ambiente:

```bash
# Substitua as envs vazias no .mcp.json com suas credenciais
# Ou use o arquivo .env.claude (melhor opção)
```

### **Passo 3: Inicie o Claude CLI**

```bash
# Na próxima vez que abrir o Claude CLI:
cd /Users/diogenesmendesbatista/Documents/GitHub/site-certshift/email-gateway
claude

# O Claude vai detectar .mcp.json e perguntar:
# "Would you like to install these MCP servers? (Y/n)"
# Digite: Y
```

---

## 🔧 Método 2: Instalação Manual (Passo a Passo)

Se preferir instalar um por um:

### **1. PostgreSQL MCP**
```bash
claude
# Dentro do Claude:
/mcp install postgres

# Configure:
Database URL: postgresql://user:password@localhost:5432/email_gateway
```

### **2. Redis MCP**
```bash
/mcp install redis

# Configure:
Redis URL: redis://localhost:6379
```

### **3. GitHub MCP**
```bash
/mcp install github

# Configure:
Personal Access Token: ghp_seu_token_aqui
```

### **4. Filesystem MCP**
```bash
/mcp install filesystem

# Configure:
Root Path: /Users/diogenesmendesbatista/Documents/GitHub/site-certshift/email-gateway
```

### **5. AWS MCP**
```bash
/mcp install aws

# Configure:
Region: us-east-1
Access Key ID: sua_key_aqui
Secret Access Key: sua_secret_aqui
```

### **6. Memory MCP**
```bash
/mcp install memory
# Sem configuração necessária
```

### **7. Brave Search MCP**
```bash
/mcp install brave-search

# Configure:
API Key: sua_brave_api_key
# Obtenha em: https://brave.com/search/api/
```

---

## 🔑 Obtendo Credenciais

### **GitHub Personal Access Token**

1. Acesse: https://github.com/settings/tokens
2. Clique em "Generate new token (classic)"
3. Selecione scopes:
   - `repo` (acesso a repositórios)
   - `read:org` (ler organizações)
   - `workflow` (GitHub Actions)
4. Copie o token

### **Brave Search API Key**

1. Acesse: https://brave.com/search/api/
2. Cadastre-se no plano gratuito (2k queries/mês)
3. Copie a API key

### **Notion Integration Token**

1. Acesse: https://www.notion.so/my-integrations
2. Crie uma nova integration
3. Copie o "Internal Integration Token"
4. Compartilhe as páginas/databases com a integration

### **AWS Credentials**

```bash
# Opção 1: Use credenciais já configuradas
cat ~/.aws/credentials

# Opção 2: Crie novas no IAM Console
# Permissões necessárias:
# - SES: ses:SendEmail, ses:GetSendStatistics
# - CloudWatch: logs:FilterLogEvents, logs:GetLogEvents
```

---

## ✅ Verificar Instalação

Depois de instalar, teste no Claude CLI:

```bash
claude

# Teste Postgres:
you> "Liste as últimas 10 linhas da tabela email_outbox"

# Teste Redis:
you> "Mostre os jobs na fila BullMQ"

# Teste GitHub:
you> "Liste os PRs abertos neste repositório"

# Teste AWS:
you> "Mostre estatísticas de envio SES das últimas 24h"

# Teste Filesystem:
you> "Mostre a estrutura do monorepo"

# Teste Brave Search:
you> "Qual a última versão do NestJS?"
```

---

## 🐛 Troubleshooting

### **MCP não aparece após instalação**

```bash
# Reinicie o Claude CLI:
exit
claude
```

### **Erro de conexão com Postgres/Redis**

```bash
# Verifique se os serviços estão rodando:
docker-compose ps

# Verifique a URL de conexão:
echo $POSTGRES_URL
echo $REDIS_URL
```

### **GitHub MCP não funciona**

```bash
# Verifique o token:
curl -H "Authorization: token ghp_seu_token" \
  https://api.github.com/user

# Deve retornar seus dados
```

### **AWS MCP não encontra recursos**

```bash
# Verifique credenciais:
aws sts get-caller-identity

# Verifique região:
echo $AWS_REGION
```

---

## 📚 Documentação Oficial

- **MCP Marketplace:** https://mcpmarket.com/
- **Anthropic MCP Docs:** https://docs.anthropic.com/en/docs/mcp
- **GitHub MCP:** https://github.com/modelcontextprotocol/servers
- **Claude Code Docs:** https://docs.claude.com/claude-code

---

## 🎯 Próximos Passos

Após instalar os MCPs:

1. ✅ **Criar agentes especializados** usando Archon
2. ✅ **Configurar Notion** para backlog
3. ✅ **Testar workflows** completos
4. ✅ **Documentar** padrões de uso da equipe

---

**Dúvidas?** Abra uma issue ou consulte o time.

**Última atualização:** 2025-10-21
