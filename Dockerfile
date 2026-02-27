# Multi-stage build para otimizar tamanho da imagem
FROM node:18-alpine AS base

# Instalar dependências necessárias
RUN apk add --no-cache \
    dumb-init \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nestjs -u 1001

# Habilitar corepack para pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de configuração do workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/*/package.json ./packages/*/
COPY apps/api/package.json ./apps/api/

# Instalar dependências
FROM base AS deps
RUN pnpm install --frozen-lockfile --prod && pnpm store prune

# Build da aplicação
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Imagem de produção
FROM node:18-alpine AS production

# Instalar dumb-init para signal handling
RUN apk add --no-cache dumb-init

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs \
    && adduser -S nestjs -u 1001

WORKDIR /app

# Copiar dependências de produção
COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=nestjs:nodejs /app/packages ./packages

# Copiar aplicação buildada
COPY --from=build --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nestjs:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=build --chown=nestjs:nodejs /app/packages/shared/dist ./packages/shared/dist

# Copiar arquivos necessários
COPY --chown=nestjs:nodejs package.json ./
COPY --chown=nestjs:nodejs apps/api/package.json ./apps/api/
COPY --chown=nestjs:nodejs packages/*/package.json ./packages/*/

# Configurar permissões
RUN chown -R nestjs:nodejs /app
USER nestjs

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/v1/health/healthz', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Comando de inicialização
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/main.js"]
