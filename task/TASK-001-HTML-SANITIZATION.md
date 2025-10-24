# TASK-001 — HTML Sanitization (CRÍTICO - Vulnerabilidade XSS)

## Contexto
- Origem: Análise completa do código
- Resumo: Sistema aceita HTML sem sanitização no campo `html` dos emails, criando potencial vulnerabilidade XSS. TODO encontrado em `packages/shared/src/schemas/email-send.schema.ts:326`

## O que precisa ser feito
- [ ] Instalar biblioteca de sanitização HTML (`dompurify` ou `sanitize-html`)
- [ ] Implementar função de sanitização em `email-send.schema.ts`
- [ ] Adicionar validação que remove scripts, iframes e elementos perigosos
- [ ] Manter tags HTML seguras (p, div, span, a, img, etc.)
- [ ] Adicionar testes unitários para sanitização
- [ ] Testar com payloads XSS conhecidos
- [ ] Documentar regras de sanitização no README

## Urgência
- **Nível (1–5):** 1 (CRÍTICO - Segurança)

## Responsável sugerido
- Backend/Segurança

## Dependências / Riscos
- Dependências: `dompurify` ou `sanitize-html` (escolher um)
- Riscos:
  - ALTO se não implementado: Sistema vulnerável a XSS
  - Baixo após implementação: Pode remover HTML legítimo se configuração muito restritiva
  - Mitigação: Usar allowlist de tags seguras

## Detalhes Técnicos

**Biblioteca recomendada:** `sanitize-html` (funciona em Node.js)

```bash
npm install sanitize-html
npm install -D @types/sanitize-html
```

**Implementação em `packages/shared/src/schemas/email-send.schema.ts`:**

```typescript
import sanitizeHtml from 'sanitize-html';

// Configuração de tags permitidas
const ALLOWED_HTML_TAGS = [
  'p', 'div', 'span', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'u', 'b', 'i',
  'ul', 'ol', 'li',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

const ALLOWED_HTML_ATTRIBUTES = {
  'a': ['href', 'title', 'target'],
  'img': ['src', 'alt', 'width', 'height'],
  '*': ['style', 'class'],
};

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_HTML_TAGS,
    allowedAttributes: ALLOWED_HTML_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
  });
}

// Adicionar validação no schema
@IsString()
@Transform(({ value }) => sanitizeEmailHtml(value))
html?: string;
```

**Testes unitários necessários:**

```typescript
describe('sanitizeEmailHtml', () => {
  it('should remove script tags', () => {
    const input = '<p>Hello</p><script>alert("xss")</script>';
    const output = sanitizeEmailHtml(input);
    expect(output).toBe('<p>Hello</p>');
  });

  it('should remove onclick handlers', () => {
    const input = '<a href="#" onclick="alert(1)">Click</a>';
    const output = sanitizeEmailHtml(input);
    expect(output).not.toContain('onclick');
  });

  it('should allow safe HTML', () => {
    const input = '<p><strong>Bold</strong> and <em>italic</em></p>';
    const output = sanitizeEmailHtml(input);
    expect(output).toBe(input);
  });

  it('should remove iframe tags', () => {
    const input = '<iframe src="evil.com"></iframe>';
    const output = sanitizeEmailHtml(input);
    expect(output).toBe('');
  });
});
```

## Bloqueador para Produção?
**SIM** - Este é um bloqueador crítico de segurança. Não pode ir para produção sem esta correção.
