# TASK-003 — Corrigir Dependencies do Dashboard

## Contexto
- Origem: Análise completa do código
- Resumo: Dashboard tem dependência quebrada do Rollup (`@rollup/rollup-win32-x64-msvc`), impedindo build e testes

## O que precisa ser feito
- [ ] Remover `node_modules` e `package-lock.json` do dashboard
- [ ] Reinstalar dependências com `npm install`
- [ ] Verificar se build funciona (`npm run build`)
- [ ] Rodar testes do dashboard (`npm test`)
- [ ] Validar que a aplicação inicia corretamente (`npm run dev`)
- [ ] Documentar dependências críticas no README se necessário

## Urgência
- **Nível (1–5):** 2 (IMPORTANTE - Build)

## Responsável sugerido
- Frontend/DevOps

## Dependências / Riscos
- Dependências: npm, node (versão 18+)
- Riscos:
  - Médio se não corrigido: Dashboard não pode ser buildado
  - Baixo após correção: Dependencies consistentes

## Detalhes Técnicos

**Erro encontrado:**

```
Error: Cannot find module @rollup/rollup-win32-x64-msvc.
npm has a bug related to optional dependencies
(https://github.com/npm/cli/issues/4828).
Please try `npm i` again after removing both
package-lock.json and node_modules directory.
```

**Solução:**

```bash
# 1. Navegar para o dashboard
cd apps/dashboard

# 2. Limpar instalação existente
rm -rf node_modules package-lock.json

# 3. Reinstalar dependências
npm install

# 4. Verificar build
npm run build

# 5. Rodar testes
npm test

# 6. Testar servidor de desenvolvimento
npm run dev
```

**Verificação de sucesso:**

```bash
# Build deve completar sem erros
✓ built in 2.5s

# Testes devem passar
Test Suites: X passed, X total
Tests: Y passed, Y total

# Dev server deve iniciar
VITE vX.X.X  ready in XXX ms
➜  Local:   http://localhost:5173/
```

**Prevenção futura:**

Adicionar ao `.gitignore` se não estiver:
```
node_modules/
package-lock.json  # (opcional, dependendo da política do projeto)
```

Considerar usar `npm ci` no CI/CD para builds determinísticos.

## Bloqueador para Produção?
**SIM** - Dashboard não pode ser buildado atualmente. Necessário para deploy de produção.
