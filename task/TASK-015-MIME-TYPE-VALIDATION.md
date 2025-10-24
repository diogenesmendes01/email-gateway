# TASK-015 — Validação de MIME Types para Anexos (Segurança)

## Contexto
- Origem: PR-BACKLOG (PR8-TASK-3.3)
- Resumo: Schema aceita attachments mas não valida MIME types. Isso pode permitir arquivos maliciosos ou inesperados

## O que precisa ser feito
- [ ] Criar lista de MIME types permitidos (allowlist)
- [ ] Validar MIME type de cada attachment
- [ ] Rejeitar attachments com MIME type não permitido
- [ ] Adicionar mensagem de erro clara listando tipos aceitos
- [ ] Documentar MIME types aceitos na API docs
- [ ] Adicionar testes para validação

## Urgência
- **Nível (1–5):** 3 (MODERADO - Segurança)

## Responsável sugerido
- Backend

## Dependências / Riscos
- Dependências: Nenhuma
- Riscos:
  - Médio: Pode quebrar integrações existentes se já enviarem tipos não permitidos
  - Mitigação: Documentar claramente quais tipos são aceitos
  - Considerar fazer opt-in inicialmente (warning ao invés de erro)

## Detalhes Técnicos

**Atualizar:** `packages/shared/src/schemas/email-job.schema.ts`

```typescript
// MIME types permitidos (allowlist)
export const ALLOWED_MIME_TYPES = [
  // Documentos
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-powerpoint', // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx

  // Texto
  'text/plain', // .txt
  'text/csv', // .csv
  'text/html', // .html
  'text/calendar', // .ics

  // Imagens
  'image/jpeg', // .jpg, .jpeg
  'image/png', // .png
  'image/gif', // .gif
  'image/webp', // .webp
  'image/svg+xml', // .svg

  // Arquivos compactados
  'application/zip', // .zip
  'application/x-rar-compressed', // .rar
  'application/x-7z-compressed', // .7z

  // Outros
  'application/json', // .json
  'application/xml', // .xml
  'text/xml', // .xml
] as const;

// Type helper
export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];

export class AttachmentSchema {
  @IsString()
  @MaxLength(EMAIL_JOB_VALIDATION.ATTACHMENT_FILENAME_MAX_LENGTH, {
    message: `Attachment filename too long (max ${EMAIL_JOB_VALIDATION.ATTACHMENT_FILENAME_MAX_LENGTH} characters)`,
  })
  filename: string;

  @IsString()
  @IsNotEmpty()
  content: string; // Base64 encoded

  @IsString()
  @IsIn(ALLOWED_MIME_TYPES, {
    message: (args) => {
      const types = ALLOWED_MIME_TYPES.join(', ');
      return `Invalid MIME type "${args.value}". Allowed types: ${types}`;
    },
  })
  mimeType: AllowedMimeType;
}
```

**Validação adicional - Magic bytes (opcional, mais seguro):**

```typescript
import * as fileType from 'file-type';

// Mapa de MIME types para magic bytes esperados
const MIME_TYPE_SIGNATURES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47]],
  'application/zip': [[0x50, 0x4B, 0x03, 0x04], [0x50, 0x4B, 0x05, 0x06]],
  // ... adicionar mais conforme necessário
};

/**
 * Valida que o MIME type declarado corresponde ao conteúdo real do arquivo
 * Previne ataques onde usuário renomeia malware.exe para document.pdf
 */
export async function validateFileMimeType(
  base64Content: string,
  declaredMimeType: string
): Promise<{ valid: boolean; actualType?: string; error?: string }> {
  try {
    // Decode base64
    const buffer = Buffer.from(base64Content, 'base64');

    // Detectar tipo real via magic bytes
    const detectedType = await fileType.fromBuffer(buffer);

    if (!detectedType) {
      return {
        valid: false,
        error: 'Unable to detect file type from content',
      };
    }

    // Verificar se tipo detectado corresponde ao declarado
    if (detectedType.mime !== declaredMimeType) {
      return {
        valid: false,
        actualType: detectedType.mime,
        error: `MIME type mismatch: declared "${declaredMimeType}" but detected "${detectedType.mime}"`,
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Failed to validate MIME type: ${error.message}`,
    };
  }
}

// Usar no EmailSendService
async validateAttachment(attachment: AttachmentSchema): Promise<void> {
  // Validação 1: MIME type na allowlist
  if (!ALLOWED_MIME_TYPES.includes(attachment.mimeType)) {
    throw new BadRequestException(
      `MIME type "${attachment.mimeType}" is not allowed`
    );
  }

  // Validação 2: Conteúdo corresponde ao MIME type declarado
  const validation = await validateFileMimeType(
    attachment.content,
    attachment.mimeType
  );

  if (!validation.valid) {
    throw new BadRequestException(
      `Attachment validation failed: ${validation.error}`
    );
  }
}
```

**Documentação da API:**

```markdown
## POST /v1/email/send

### Attachments

The API supports the following MIME types for attachments:

**Documents:**
- `application/pdf` - PDF files
- `application/msword` - Word documents (.doc)
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` - Word documents (.docx)
- `application/vnd.ms-excel` - Excel spreadsheets (.xls)
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` - Excel spreadsheets (.xlsx)
- `application/vnd.ms-powerpoint` - PowerPoint presentations (.ppt)
- `application/vnd.openxmlformats-officedocument.presentationml.presentation` - PowerPoint presentations (.pptx)

**Text:**
- `text/plain` - Text files (.txt)
- `text/csv` - CSV files
- `text/html` - HTML files

**Images:**
- `image/jpeg` - JPEG images
- `image/png` - PNG images
- `image/gif` - GIF images
- `image/webp` - WebP images

**Archives:**
- `application/zip` - ZIP archives
- `application/x-rar-compressed` - RAR archives

**Other:**
- `application/json` - JSON files
- `application/xml` - XML files

### Size Limits
- Maximum attachment size: **10 MB** per file
- Maximum attachments per email: **10 files**
- Total size: **40 MB** (all attachments combined)

### Example

```json
{
  "to": "recipient@example.com",
  "subject": "Invoice",
  "html": "<p>Please find attached invoice</p>",
  "attachments": [
    {
      "filename": "invoice.pdf",
      "mimeType": "application/pdf",
      "content": "JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBl..." // Base64
    }
  ]
}
```

### Errors

```json
{
  "statusCode": 400,
  "message": "Invalid MIME type \"application/x-executable\". Allowed types: application/pdf, image/png, ..."
}
```
```

**Testes:**

```typescript
describe('MIME Type Validation', () => {
  it('should accept PDF attachment', () => {
    const attachment = {
      filename: 'document.pdf',
      mimeType: 'application/pdf',
      content: 'base64content',
    };

    expect(() => validate(attachment)).not.toThrow();
  });

  it('should reject executable file', () => {
    const attachment = {
      filename: 'virus.exe',
      mimeType: 'application/x-msdownload',
      content: 'base64content',
    };

    expect(() => validate(attachment)).toThrow(
      'Invalid MIME type "application/x-msdownload"'
    );
  });

  it('should reject when MIME type doesn\'t match content', async () => {
    // PDF content mas declarado como image/png
    const pdfContent = Buffer.from('%PDF-1.4\n...').toString('base64');

    const attachment = {
      filename: 'fake.png',
      mimeType: 'image/png',
      content: pdfContent,
    };

    await expect(validateAttachment(attachment)).rejects.toThrow(
      'MIME type mismatch'
    );
  });

  it('should list all allowed types in error message', () => {
    const attachment = {
      filename: 'file.xyz',
      mimeType: 'application/unknown',
      content: 'base64',
    };

    try {
      validate(attachment);
    } catch (error) {
      expect(error.message).toContain('Allowed types:');
      expect(error.message).toContain('application/pdf');
      expect(error.message).toContain('image/png');
    }
  });
});
```

**Configuração (se quiser tornar configurável):**

```.env
# Comma-separated list of additional allowed MIME types
ADDITIONAL_MIME_TYPES=application/x-custom,text/markdown
```

## Categoria
**Segurança - Validação de Input**

## Bloqueador para Produção?
**NÃO** - Mas recomendado. Previne upload de arquivos potencialmente maliciosos.

## Notas de Implementação

**Fase 1 (Recomendado para MVP):**
- Implementar allowlist básica
- Validar apenas MIME type declarado
- Logging quando tipo não permitido

**Fase 2 (Pós-MVP):**
- Validação de magic bytes (file-type library)
- Scan antivírus (ClamAV, VirusTotal API)
- Content validation específica por tipo
