# TASK-035 — Admin Dashboard UI (Feature - Priority 3)

## Contexto
- Origem: MULTI_TENANT_PLAN.md - Sprint 5
- Resumo: Criar interface visual para admins gerenciarem clientes: listar pendentes, aprovar, rejeitar, suspender, ver métricas.

## O que precisa ser feito
- [ ] Criar página AdminPage.tsx
- [ ] Listar empresas pendentes de aprovação
- [ ] Mostrar métricas (bounce rate, complaint rate, emails enviados)
- [ ] Botão "Aprovar" (com campo para daily limit)
- [ ] Botão "Rejeitar" (com campo para motivo)
- [ ] Botão "Suspender" empresa aprovada
- [ ] Botão "Reativar" empresa suspensa
- [ ] Filtros (status, bounce rate, etc)
- [ ] Adicionar rota protegida no App.tsx
- [ ] Guard para verificar admin token
- [ ] Testes E2E

## Urgência
- **Nível (1–5):** 3 (MODERADO - Nice to Have)

## Responsável sugerido
- Frontend (React + TypeScript)

## Dependências / Riscos
- Dependências:
  - TASK-034 (AdminController)
  - Admin authentication
- Riscos:
  - BAIXO: Segurança do admin token

## Detalhes Técnicos

### Implementação

```tsx
export const AdminPage: React.FC = () => {
  const [adminToken, setAdminToken] = useState('');

  // Configurar axios com admin token
  axios.defaults.headers.common['X-Admin-Token'] = adminToken;

  const { data: pending } = useQuery({
    queryKey: ['admin', 'pending'],
    queryFn: () => axios.get('/v1/admin/companies/pending'),
    enabled: !!adminToken,
  });

  const handleApprove = async (companyId: string, dailyLimit: number) => {
    await axios.post(`/v1/admin/companies/${companyId}/approve`, {
      adminUsername: 'admin',
      dailyLimit,
    });

    refetch();
  };

  const handleReject = async (companyId: string, reason: string) => {
    await axios.post(`/v1/admin/companies/${companyId}/reject`, {
      reason,
    });

    refetch();
  };

  return (
    <div>
      <h1>Admin - Curadoria de Clientes</h1>

      {!adminToken && (
        <input
          type="password"
          placeholder="Admin Token"
          onChange={(e) => setAdminToken(e.target.value)}
        />
      )}

      <table>
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Criada</th>
            <th>Emails</th>
            <th>Bounce %</th>
            <th>Complaint %</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {pending?.map(company => (
            <tr key={company.id}>
              <td>{company.name}</td>
              <td>{new Date(company.createdAt).toLocaleDateString()}</td>
              <td>{company._count.emailOutbox}</td>
              <td>{company.bounceRate.toFixed(2)}%</td>
              <td>{company.complaintRate.toFixed(2)}%</td>
              <td>
                <button onClick={() => handleApprove(company.id, 5000)}>
                  Aprovar
                </button>
                <button onClick={() => handleReject(company.id, 'Quality issues')}>
                  Rejeitar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

### Rota Protegida

```tsx
// App.tsx
<Route path="/admin" element={
  <ProtectedRoute requireAdmin>
    <AdminPage />
  </ProtectedRoute>
} />
```

### Features

- **Filtros:** Por status, bounce rate, data criação
- **Sort:** Por qualquer coluna
- **Paginação:** Para muitas empresas
- **Modal de aprovação:** Escolher daily limit
- **Modal de rejeição:** Escrever motivo

## Categoria
**Feature - UI/UX + Admin**

## Bloqueador para Produção?
**NÃO - Nice to Have**

Sem UI:
- ⚠️ Admin usa API diretamente
- ⚠️ Menos produtivo

Com UI:
- ✅ Aprovar/rejeitar visualmente
- ✅ Ver métricas de cada empresa
- ✅ Filtrar e ordenar

Recomendação: Implementar após backend funcionar.

## Checklist

- [ ] AdminPage criada
- [ ] Todos botões funcionando
- [ ] Filtros implementados
- [ ] Rota protegida
- [ ] Admin token funcionando
- [ ] Testes E2E
- [ ] PR revisado

## Conclusão do Planejamento

Com TASK-035 concluída, todas as 10 TASKs do MULTI_TENANT_PLAN.md estarão documentadas e prontas para implementação sequencial.
