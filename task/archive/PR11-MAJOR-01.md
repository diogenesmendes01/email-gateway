# PR11 - MAJOR #1 - Melhorar .env.example com placeholders seguros

## Contexto
- Origem: PR #11 (MAJOR #1)
- Durante a revisão da PR #11 (TASK 4.1), foi identificado que o `.env.example` usa placeholders genéricos (`your_access_key_id`) que podem levar desenvolvedores a commitar credenciais reais acidentalmente.

## O que precisa ser feito
- [ ] Substituir placeholders genéricos por EXAMPLE credentials oficiais da AWS
- [ ] Adicionar comentários de aviso sobre nunca commitar credenciais reais
- [ ] Recomendar IAM roles para produção
- [ ] Recomendar AWS_PROFILE para desenvolvimento local

## Detalhes técnicos

### Arquivo afetado
`.env.example` linhas 25-26

### Mudança necessária
```diff
-AWS_ACCESS_KEY_ID=your_access_key_id
-AWS_SECRET_ACCESS_KEY=your_secret_access_key
+# IMPORTANTE: NUNCA commite credenciais reais!
+# Em produção, use IAM roles. Localmente, use AWS_PROFILE ou credenciais temporárias.
+# Credenciais AWS (use placeholders EXAMPLE - não funcionam de verdade)
+AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
+AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

### Referência
- AWS Documentation: https://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html#access-keys-and-secret-access-keys
- As credenciais EXAMPLE são oficiais da AWS e claramente não funcionam

## Urgência
- **Nível (1–5):** 3 (médio - segurança preventiva)

## Responsável sugerido
- Time de DevOps/Segurança

## Dependências / Riscos
- Dependências: Nenhuma
- Riscos: Baixo - apenas documentação, não afeta código em produção
