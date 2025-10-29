# TASK-037: Company Profile Management

## Objetivo
Implementar sistema completo de gerenciamento de perfil da empresa, permitindo visualizar informações, editar configurações e regenerar API Key.

## Contexto
Após TASK-036 (registro), empresas precisam de uma interface para gerenciar seu perfil, visualizar status da conta, limites e métricas.

## Escopo

### Backend

#### 1. ProfileController (novo)
**Endpoint**: `GET /v1/company/profile`

**Response**:
```json
{
  "id": "company_abc123",
  "name": "Empresa Exemplo LTDA",
  "email": "contato@empresa.com",
  "status": {
    "isApproved": false,
    "isActive": true,
    "isSuspended": false,
    "approvedAt": null,
    "suspensionReason": null
  },
  "limits": {
    "dailyEmailLimit": 100,
    "monthlyEmailLimit": 3000,
    "emailsSentToday": 45,
    "emailsSentThisMonth": 823
  },
  "metrics": {
    "bounceRate": 0.8,
    "complaintRate": 0.02,
    "totalEmailsSent": 1520,
    "lastMetricsUpdate": "2025-10-29T10:00:00Z"
  },
  "config": {
    "defaultFromAddress": "noreply@empresa.com",
    "defaultFromName": "Empresa Exemplo",
    "domainId": null
  },
  "apiKey": {
    "prefix": "sk_live_abc1...",
    "createdAt": "2025-10-20T15:30:00Z",
    "expiresAt": "2026-10-20T15:30:00Z",
    "lastUsedAt": "2025-10-29T09:45:00Z"
  },
  "createdAt": "2025-10-20T15:30:00Z",
  "updatedAt": "2025-10-29T10:00:00Z"
}
```

**Endpoint**: `PUT /v1/company/profile`

**Request Body**:
```json
{
  "name": "Novo Nome da Empresa",
  "defaultFromAddress": "noreply@novodominio.com",
  "defaultFromName": "Novo Nome"
}
```

**Response**: Same as GET

**Endpoint**: `POST /v1/company/profile/regenerate-api-key`

**Request Body**:
```json
{
  "currentPassword": "senha123"
}
```

**Response**:
```json
{
  "apiKey": "sk_live_newkey123...",
  "apiKeyPrefix": "sk_live_newke...",
  "message": "API Key regenerada com sucesso! Guarde em local seguro - não será mostrada novamente.",
  "expiresAt": "2026-10-29T10:00:00Z"
}
```

#### 2. CompanyService (adicionar métodos)
- `getProfile(companyId: string): Promise<CompanyProfile>`
- `updateProfile(companyId: string, dto: UpdateProfileDto): Promise<CompanyProfile>`
- `regenerateApiKey(companyId: string, currentPassword: string): Promise<RegenerateApiKeyResponse>`
- `getEmailUsageStats(companyId: string): Promise<UsageStats>`

### Frontend

#### 1. ProfilePage.tsx
**Rota**: `/dashboard/profile`

**Seções**:

**1. Informações da Empresa**
- Nome da empresa (editável)
- Email (read-only)
- ID da empresa (copiável)
- Data de criação

**2. Status da Conta**
- Badge de status (Aprovado/Pendente/Suspenso)
- Data de aprovação (se aplicável)
- Motivo de suspensão (se aplicável)
- Dias em sandbox (se não aprovado)

**3. Limites de Envio**
- Limite diário (100 ou 5000)
- Limite mensal
- Uso hoje (progresso visual)
- Uso este mês (progresso visual)

**4. Métricas de Qualidade**
- Bounce Rate (com indicador de saúde)
- Complaint Rate (com indicador de saúde)
- Total de emails enviados
- Última atualização

**5. Configurações de Envio**
- From Address (editável)
- From Name (editável)
- Domínio padrão (se configurado)

**6. API Key Management**
- Prefix da API Key (sk_live_abc1...)
- Data de criação
- Data de expiração
- Último uso
- Botão "Regenerar API Key" (com modal de confirmação)

**7. Ações**
- Botão "Salvar Alterações" (editar perfil)
- Botão "Regenerar API Key" (modal com senha)

### DTOs

**UpdateProfileDto**:
```typescript
{
  name?: string;
  defaultFromAddress?: string;
  defaultFromName?: string;
}
```

**RegenerateApiKeyDto**:
```typescript
{
  currentPassword: string;
}
```

## Critérios de Aceite
- [ ] GET /v1/company/profile retorna dados completos
- [ ] PUT /v1/company/profile atualiza dados
- [ ] POST /v1/company/profile/regenerate-api-key funciona
- [ ] ProfilePage exibe todas informações
- [ ] Edição de perfil funcional
- [ ] Regeneração de API Key com modal
- [ ] Badges de status visuais
- [ ] Progress bars para limites
- [ ] Indicadores de saúde para métricas
- [ ] Menu item "Perfil" adicionado
- [ ] Todos os testes passando
- [ ] PR merged

## Segurança
- ✅ Endpoints protegidos com ApiKeyGuard
- ✅ Regeneração de API Key requer senha atual
- ✅ Nova API Key só mostrada uma vez
- ✅ Validação de input
- ✅ Rate limiting

## UI/UX Features
- Visual progress bars (limites)
- Health indicators (bounce/complaint rates)
- Status badges (aprovado/pendente/suspenso)
- Copy to clipboard (company ID, API Key prefix)
- Confirmation modal (regenerate API Key)
- Loading states
- Error handling
- Success messages

## Métricas Exibidas
- **Bounce Rate**: < 2% (verde), 2-5% (amarelo), > 5% (vermelho)
- **Complaint Rate**: < 0.1% (verde), 0.1-0.5% (amarelo), > 0.5% (vermelho)
- **Uso Diário**: progresso visual
- **Uso Mensal**: progresso visual

## Fluxo de Regeneração de API Key
1. Click em "Regenerar API Key"
2. Modal abre pedindo senha atual
3. Usuário digita senha
4. Backend valida senha
5. Gera nova API Key
6. Modal mostra nova key (ÚNICA VEZ!)
7. Usuário copia
8. Modal fecha
9. Prefix atualizado na página

## Notas
- Email não é editável (usado para login)
- API Key prefix é para referência (não a key completa)
- Regenerar API Key invalida a anterior
- Dados em tempo real (sem cache)
