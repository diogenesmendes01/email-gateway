# TASK-033 — Envio em Massa UI (Feature - Priority 3)

## Contexto
- Origem: MULTI_TENANT_PLAN.md - Sprint 4
- Resumo: Adicionar tab "Envio em Massa" na página SendEmailPage. Permitir upload de CSV com destinatários + assunto/HTML único para todos.

## O que precisa ser feito
- [ ] Modificar SendEmailPage para ter tabs (Individual / Massa)
- [ ] Tab "Envio em Massa" com upload CSV
- [ ] Preview dos primeiros 5 destinatários
- [ ] Campos para assunto + HTML (mesmo para todos)
- [ ] Validação do CSV (formato, max 1000 linhas)
- [ ] Integração com POST /v1/email/batch/csv
- [ ] Mostrar feedback de progresso
- [ ] Link para acompanhar batch criado
- [ ] Testes E2E

## Urgência
- **Nível (1–5):** 3 (MODERADO - Nice to Have)

## Responsável sugerido
- Frontend (React + TypeScript)

## Dependências / Riscos
- Dependências:
  - TASK-025 (Batch Email API)
  - React Query
- Riscos:
  - BAIXO: Upload de arquivos grandes

## Detalhes Técnicos

Ver MULTI_TENANT_PLAN.md seção "4.2 Página de Envio em Massa".

### Formato CSV Esperado

```csv
email,nome,cpfCnpj,razaoSocial
user1@example.com,João Silva,12345678901,Empresa 1
user2@example.com,Maria Santos,98765432100,Empresa 2
```

### Implementação

```tsx
const BatchForm: React.FC = () => {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [preview, setPreview] = useState<any[]>([]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Parse CSV
    const text = await file.text();
    const lines = text.split('\n').slice(0, 6); // Header + 5 linhas
    const headers = lines[0].split(',');
    const rows = lines.slice(1).map(line => {
      const values = line.split(',');
      return headers.reduce((obj, header, i) => {
        obj[header.trim()] = values[i]?.trim();
        return obj;
      }, {});
    });

    setPreview(rows);
    setCsvFile(file);
  };

  const handleSubmit = async () => {
    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('subject', subject);
    formData.append('html', html);

    const res = await axios.post('/v1/email/batch/csv', formData);

    alert(`Batch criado! ${res.data.totalEmails} emails enfileirados`);
  };

  return (
    <div>
      <input type="file" accept=".csv" onChange={handleFileChange} />

      {preview.length > 0 && (
        <table>
          <thead><tr><th>Email</th><th>Nome</th><th>CPF/CNPJ</th></tr></thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i}>
                <td>{row.email}</td>
                <td>{row.nome}</td>
                <td>{row.cpfCnpj}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <input placeholder="Assunto" value={subject} onChange={e => setSubject(e.target.value)} />
      <textarea placeholder="HTML" value={html} onChange={e => setHtml(e.target.value)} />

      <button onClick={handleSubmit}>Enviar Batch</button>
    </div>
  );
};
```

## Categoria
**Feature - UI/UX + Performance**

## Bloqueador para Produção?
**NÃO - Nice to Have**

Sem UI:
- ⚠️ Clientes usam API ou scripts

Com UI:
- ✅ Self-service para campanhas
- ✅ Preview antes de enviar

## Checklist

- [ ] Tab "Envio em Massa" criado
- [ ] Upload CSV funcionando
- [ ] Preview implementado
- [ ] Integração com API
- [ ] Testes E2E
- [ ] PR revisado

## Próximos Passos

- **TASK-034:** Sistema de Curadoria
