# PR2 - TASK 01 - Melhorias de validação e documentação

## Contexto
- Origem: PR #2
- Durante a revisão da PR de documentação, foram identificadas melhorias que não são críticas para o MVP mas agregam valor ao projeto. Estas melhorias foram classificadas como SUGGESTION e ficam registradas aqui para implementação futura.

## O que precisa ser feito
- [ ] Melhorar validação de Mermaid usando `@mermaid-js/mermaid-cli` para validação real da sintaxe (atualmente é apenas validação básica de blocos)
- [ ] Mudar `continue-on-error: true` para `false` no link checking quando a documentação amadurecer (atualmente links quebrados não impedem merge)
- [ ] Adicionar diagramas coloridos nos Mermaid de `architecture/01-visao-geral-sistema.md` usando `style` para diferenciar layers visualmente
- [ ] Completar seção truncada do documento `00-pacote-documentos-arquitetura-mvp.md` (seção 29 sobre IA/Navegação que termina na linha 604)
- [ ] Criar documento dedicado `data/03-data-retention-privacy.md` expandido com exemplos práticos de mascaramento de PII/LGPD

## Urgência
- **Nível (1–5):** 4 (baixa urgência - melhorias incrementais)

## Responsável sugerido
- Equipe de documentação / DevOps (para itens de CI/CD)

## Dependências / Riscos
- Dependências: Nenhuma crítica, todos os itens são independentes
- Riscos: Nenhum - são melhorias incrementais que não afetam funcionalidade existente
