# Regras para Ajustes da PR

## Ordem de tratamento

1. **Critical** → corrigir imediatamente (bloqueia merge).
2. **Moderate** → corrigir antes do merge (Deve ser feito).
3. **Suggestion** → avaliar.  
   - Se **importante** e **aderente ao escopo**, implementar.
   - Se **fora do escopo** ou **pouco relevante agora**, registrar em `/task`.

## Itens “Deve ser feito”

- Tudo classificado como **Critical** e os **Moderate** indicados como “Deve ser feito” pelo reviewer são obrigatórios antes do merge.

## Registro do que fica para depois (fora de escopo)

- **Onde:** `/task/PR<numero>-TASK<id>.md`
- **Quando:** sempre que surgir algo que **não** faça parte do escopo atual ou **não** seja importante o suficiente agora.
- **Por quê:** garante rastreabilidade e planejamento, sem inchar a PR.

## Como criar o arquivo em /task

Use o template abaixo (substitua `<placeholders>`):

```markdown
# <PR<numero> - TASK <id> - <resumo curto>>

## Contexto
- Origem: PR #<numero>
- Descrição breve do contexto e por que isso ficou fora do escopo atual.

## O que precisa ser feito
- [ ] Item 1
- [ ] Item 2
- [ ] Item 3

## Urgência
- **Nível (1–5):** <1 é mais urgente; 5 menos urgente>

## Responsável sugerido
- <nome ou time> (opcional)

## Dependências / Riscos
- Dependências: <listar se houver>
- Riscos: <listar se houver>
```

## Regras de merge

- Merge permitido **apenas** quando **não houver Critical** e todos os **Deve ser feito** (Critical/Moderate) estiverem resolvidos.

## Hotfix

- Para `hotfix/*`, foque em resolver o problema com segurança.  
- Itens não críticos que surgirem durante a revisão devem ir para `/task` conforme template.
