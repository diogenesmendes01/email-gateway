# Regras para Revisar uma PR

## Objetivo

Padronizar revisões para garantir qualidade, segurança e aderência ao escopo.

## Severidades (em inglês)

- **Critical**: quebra funcional, segurança, compliance ou performance grave. **Bloqueia merge**.  
- **Moderate**: precisa ser ajustado para manter qualidade/manutenibilidade/testabilidade antes do merge.  
- **Suggestion**: melhoria opcional (estilo, micro refactor, docs); **não bloqueia**.

> Observação de segurança (#11): exposição de segredos/credenciais em código é sempre **Critical**.

## Eixos mínimos de revisão

1. **Escopo** – Faz exatamente o que foi pedido no “Resumo do que foi pedido”. Sem scope creep.
2. **Qualidade & Padrões** – Estrutura, legibilidade, coesão, acoplamento, padrões do projeto.
3. **Testabilidade** – Há instruções claras para validar? (Mesmo sem suíte automatizada, a validação manual precisa estar descrita.)
4. **Segurança & Dados** – Segredos não expostos; validações de entrada; PII/credenciais; uso adequado de permissões.
5. **Performance** – Evitar N+1, loops desnecessários, alocações pesadas em caminhos críticos.
6. **Observabilidade** – Logs úteis (sem vazar dados sensíveis), métricas se fizer sentido.
7. **Documentação** – Link e referência à seção de arquitetura pertinente (quando aplicável).

## Sem SLA

Não há SLA obrigatório para tratamento de comentários (conforme alinhado). Use bom senso e priorização do time.

## Bloqueio de merge

- **Não pode** haver itens **Critical** abertos.
- Itens marcados como **Deve ser feito** (sejam Critical ou Moderate) devem estar resolvidos antes do merge.

## Hotfix

- `hotfix/*` pode reduzir exigências não críticas **sem** comprometer segurança.
- Qualquer risco deve estar explícito em **Riscos / rollback** da PR.

## Template de comentário (copiar/colar)
>
> Use este bloco no primeiro comentário da revisão para padronizar o feedback.

```text
[REVIEW SUMMARY]

CRITICAL
- [ ] (descrever claramente o problema e por que é Critical)

MODERATE
- [ ] (descrever o ajuste necessário e por que deve ser feito)

SUGGESTION
- [ ] (descrever sugestão e o benefício)
```

## Comentário geral obrigatório

Além dos comentários inline, publique **um comentário geral** consolidando:

- Referências a **todos** os pontos levantados (arquivo:linha) com severidade (Critical/Moderate/Suggestion);
- **MUST-FIX checklist** (Critical + Moderate que bloqueiam);
- Sugestões agregadas;
- Itens fora de escopo a enviar para `/task`;
- Plano de ação por papel (Autor/Reviewer/Maintainer) e **veredito**.
O comentário geral é a **fonte de verdade** para execução.
