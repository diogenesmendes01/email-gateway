# TASK-032 — Dashboard de Gerenciamento de Domínios (Feature - Priority 3)

## Contexto
- Origem: MULTI_TENANT_PLAN.md - Sprint 3
- Resumo: Criar interface visual no dashboard para empresas gerenciarem domínios: adicionar, listar, ver tokens DNS, verificar status, definir como padrão.

## O que precisa ser feito
- [ ] Criar página DomainsPage.tsx
- [ ] Listar domínios da empresa (tabela)
- [ ] Botão "Adicionar Domínio" (modal)
- [ ] Mostrar status (PENDING, VERIFIED, FAILED)
- [ ] Modal "Ver Tokens DNS" com DKIM, SPF, DMARC
- [ ] Botão "Verificar" (forçar verificação)
- [ ] Botão "Definir como Padrão"
- [ ] Botão "Remover"
- [ ] Copiar tokens DNS (clipboard)
- [ ] Polling de status a cada 30s
- [ ] Adicionar rota no App.tsx
- [ ] Adicionar item no menu

## Urgência
- **Nível (1–5):** 4 (ALTO - UX essencial)

## Responsável sugerido
- Frontend (React + TypeScript)

## Dependências / Riscos
- Dependências:
  - TASK-028 (API de domínios)
  - React Query
  - Tailwind CSS
- Riscos:
  - BAIXO: UX complexa para DNS

## Detalhes Técnicos

Ver MULTI_TENANT_PLAN.md seção "4.1 Página de Gerenciamento de Domínios".

### Estrutura

```
apps/dashboard/src/pages/DomainsPage.tsx
apps/dashboard/src/components/domains/
├── DomainList.tsx
├── AddDomainModal.tsx
├── DNSTokensModal.tsx
└── StatusBadge.tsx
```

### Implementação Resumida

```tsx
export const DomainsPage: React.FC = () => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);

  // Buscar domínios
  const { data: domains, refetch } = useQuery({
    queryKey: ['domains'],
    queryFn: () => axios.get<Domain[]>('/v1/company/domains'),
    refetchInterval: 30000, // Polling a cada 30s
  });

  // Adicionar domínio
  const handleAddDomain = async (domain: string) => {
    await axios.post('/v1/company/domains', { domain });
    refetch();
  };

  // Verificar domínio
  const handleVerify = async (domainId: string) => {
    await axios.post(`/v1/company/domains/${domainId}/verify`);
    refetch();
  };

  // Definir como padrão
  const handleSetDefault = async (domainId: string) => {
    await axios.patch(`/v1/company/domains/${domainId}/default`);
    refetch();
  };

  return (
    <div>
      <h1>Meus Domínios</h1>
      <button onClick={() => setShowAddModal(true)}>+ Adicionar</button>

      <DomainList
        domains={domains}
        onVerify={handleVerify}
        onSetDefault={handleSetDefault}
        onShowDNS={(domain) => setSelectedDomain(domain)}
      />

      {showAddModal && (
        <AddDomainModal
          onAdd={handleAddDomain}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {selectedDomain && (
        <DNSTokensModal
          domain={selectedDomain}
          onClose={() => setSelectedDomain(null)}
        />
      )}
    </div>
  );
};
```

### Features

- **Polling:** Status atualiza automaticamente a cada 30s
- **Copy to Clipboard:** Botão para copiar tokens DNS
- **Status Visual:** Badges coloridos (verde=VERIFIED, amarelo=PENDING, vermelho=FAILED)
- **Responsive:** Funciona em mobile e desktop

## Categoria
**Feature - UI/UX**

## Bloqueador para Produção?
**NÃO - Nice to Have**

Sem UI:
- ⚠️ Clientes precisam usar API diretamente
- ⚠️ UX ruim

Com UI:
- ✅ Self-service visual
- ✅ Fácil copiar tokens DNS
- ✅ Ver status em tempo real

Recomendação: Implementar após TASKs de backend.

## Checklist

- [ ] DomainsPage criada
- [ ] Todos componentes implementados
- [ ] Rota adicionada
- [ ] Item no menu
- [ ] Polling funcionando
- [ ] Testes E2E
- [ ] PR revisado

## Próximos Passos

- **TASK-033:** Envio em Massa UI (CSV Upload)
