# TASK-036: Company Registration System

## Objetivo
Implementar sistema completo de auto-registro de empresas, permitindo que novos clientes se cadastrem na plataforma sem intervenção manual.

## Contexto
Atualmente não existe forma de empresas se registrarem. Elas precisam ser criadas manualmente no banco de dados. Esta task implementa o fluxo completo de registro.

## Escopo

### Backend

#### 1. CompanyController (novo)
**Endpoint**: `POST /v1/auth/register`

**Request Body**:
```json
{
  "name": "Empresa Exemplo LTDA",
  "email": "contato@empresa.com",
  "password": "senhaSegura123!",
  "fromAddress": "noreply@empresa.com",
  "fromName": "Empresa Exemplo"
}
```

**Validações**:
- `name`: obrigatório, 3-100 caracteres
- `email`: obrigatório, email válido, único no sistema
- `password`: obrigatório, min 8 caracteres, 1 maiúscula, 1 número
- `fromAddress`: opcional, email válido
- `fromName`: opcional, 3-100 caracteres

**Response** (201 Created):
```json
{
  "id": "company_abc123",
  "name": "Empresa Exemplo LTDA",
  "email": "contato@empresa.com",
  "apiKey": "sk_live_abc123...",
  "status": "pending_approval",
  "message": "Registro realizado com sucesso! Sua conta está em análise e será aprovada em até 7 dias."
}
```

**Lógica**:
1. Validar dados de entrada
2. Verificar se email já existe
3. Criar hash da senha (bcrypt)
4. Gerar API Key única e segura
5. Criar Company com:
   - `isApproved: false` (sandbox mode)
   - `dailyEmailLimit: 100` (limite inicial baixo)
   - `isActive: true`
   - `isSuspended: false`
6. Retornar dados + API Key (mostrar apenas uma vez!)

#### 2. CompanyService (novo)
Métodos:
- `register(dto: RegisterCompanyDto): Promise<CompanyRegistrationResponse>`
- `generateSecureApiKey(): { apiKey: string; apiKeyHash: string; prefix: string }`
- `validatePassword(password: string): boolean`
- `checkEmailExists(email: string): Promise<boolean>`

### Frontend

#### 1. RegisterPage.tsx
**Rota**: `/register`

**Componentes**:
- Formulário de registro com campos:
  - Nome da empresa
  - Email
  - Senha (com confirmação)
  - From Address (opcional)
  - From Name (opcional)
- Validação client-side
- Loading states
- Mensagens de erro/sucesso
- Link para login
- Modal de API Key (mostrar após sucesso)

**Features**:
- Validação em tempo real
- Strength indicator de senha
- Confirmação de senha
- Termos de uso checkbox
- Success modal com API Key (IMPORTANTE: avisar que só será mostrada uma vez)
- Redirect para login após 5 segundos

#### 2. Updates em App.tsx
- Adicionar rota `/register`

#### 3. Updates em LoginForm
- Adicionar link "Não tem conta? Cadastre-se"

### Testes

#### Backend
- ✅ Registro com dados válidos
- ✅ Email duplicado (409 Conflict)
- ✅ Senha fraca (400 Bad Request)
- ✅ Email inválido (400 Bad Request)
- ✅ API Key gerada é única
- ✅ Senha é hasheada corretamente
- ✅ Company criada com isApproved=false

#### Frontend
- ✅ Renderização do formulário
- ✅ Validação de campos
- ✅ Submit com sucesso
- ✅ Tratamento de erros

## Critérios de Aceite
- [ ] Endpoint POST /v1/auth/register funcional
- [ ] Validações robustas (backend + frontend)
- [ ] API Key gerada automaticamente (formato: sk_live_...)
- [ ] Senha hasheada com bcrypt
- [ ] Empresa criada em sandbox mode (isApproved=false)
- [ ] RegisterPage funcional e responsiva
- [ ] Modal mostrando API Key após registro
- [ ] Link de registro na LoginForm
- [ ] Todos os testes passando
- [ ] Build success
- [ ] PR merged

## Segurança
- ✅ Senha hasheada com bcrypt (10 rounds)
- ✅ API Key com crypto.randomBytes (32 bytes)
- ✅ Email único (constraint no banco)
- ✅ Rate limiting no endpoint
- ✅ Validação de input (sanitização)

## Fluxo do Usuário
1. Acessa /register
2. Preenche formulário
3. Clica em "Registrar"
4. Modal mostra API Key gerada
5. Usuário copia API Key (IMPORTANTE!)
6. Redirect para login
7. Faz login com email/senha
8. Empresa fica em sandbox até aprovação admin

## Notas
- Empresa inicia com limite de 100 emails/dia
- Após aprovação via AdminPage, limite aumenta para 5000
- API Key só é mostrada uma vez no registro
- Se perder API Key, precisa regenerar no perfil (TASK-037)
