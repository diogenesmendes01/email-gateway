/**
 * @email-gateway/shared - Access Control and Audit Trail
 *
 * Sistema de perfis de acesso e trilha de auditoria
 *
 * TASK 5.2 — PII, masking, criptografia, retenção e acesso
 * Implementação de controle de acesso e auditoria
 */

/**
 * Perfis de acesso do sistema
 */
export enum AccessProfile {
  OPERATIONS = 'operations',     // Ops: dados mascarados
  AUDIT = 'audit',              // Auditoria: dados desmascarados (break-glass)
  ADMIN = 'admin',              // Admin: acesso total
  READONLY = 'readonly',        // Somente leitura
}

/**
 * Níveis de acesso para dados sensíveis
 */
export enum DataAccessLevel {
  MASKED = 'masked',           // Dados mascarados
  UNMASKED = 'unmasked',       // Dados em texto claro
  ENCRYPTED = 'encrypted',     // Dados criptografados
  DENIED = 'denied',           // Acesso negado
}

/**
 * Configuração de acesso por perfil
 */
export interface AccessConfig {
  profile: AccessProfile;
  dataAccessLevel: DataAccessLevel;
  requiresBreakGlass: boolean;
  maxSessionDuration: number; // em minutos
  allowedOperations: string[];
}

/**
 * Configurações padrão de acesso
 */
export const DEFAULT_ACCESS_CONFIGS: Record<AccessProfile, AccessConfig> = {
  [AccessProfile.OPERATIONS]: {
    profile: AccessProfile.OPERATIONS,
    dataAccessLevel: DataAccessLevel.MASKED,
    requiresBreakGlass: false,
    maxSessionDuration: 480, // 8 horas
    allowedOperations: ['read', 'search', 'filter'],
  },
  [AccessProfile.AUDIT]: {
    profile: AccessProfile.AUDIT,
    dataAccessLevel: DataAccessLevel.UNMASKED,
    requiresBreakGlass: true,
    maxSessionDuration: 60, // 1 hora
    allowedOperations: ['read', 'search', 'filter', 'export'],
  },
  [AccessProfile.ADMIN]: {
    profile: AccessProfile.ADMIN,
    dataAccessLevel: DataAccessLevel.UNMASKED,
    requiresBreakGlass: false,
    maxSessionDuration: 240, // 4 horas
    allowedOperations: ['read', 'search', 'filter', 'export', 'delete', 'update'],
  },
  [AccessProfile.READONLY]: {
    profile: AccessProfile.READONLY,
    dataAccessLevel: DataAccessLevel.MASKED,
    requiresBreakGlass: false,
    maxSessionDuration: 120, // 2 horas
    allowedOperations: ['read'],
  },
};

/**
 * Solicitação de break-glass
 */
export interface BreakGlassRequest {
  id: string;
  userId: string;
  profile: AccessProfile;
  justification: string;
  requestedAt: Date;
  expiresAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  ipAddress: string;
  userAgent: string;
}

/**
 * Evento de auditoria
 */
export interface AuditEvent {
  id: string;
  userId: string;
  profile: AccessProfile;
  action: string;
  resource: string;
  resourceId?: string;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
  breakGlassRequestId?: string;
}

/**
 * Sessão de usuário
 */
export interface UserSession {
  id: string;
  userId: string;
  profile: AccessProfile;
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
  ipAddress: string;
  userAgent: string;
  breakGlassRequestId?: string;
  isActive: boolean;
}

/**
 * Valida se um perfil tem permissão para uma operação
 *
 * @param profile - Perfil do usuário
 * @param operation - Operação solicitada
 * @returns True se permitido
 */
export function hasPermission(profile: AccessProfile, operation: string): boolean {
  const config = DEFAULT_ACCESS_CONFIGS[profile];
  return config.allowedOperations.includes(operation);
}

/**
 * Determina o nível de acesso para dados sensíveis baseado no perfil
 *
 * @param profile - Perfil do usuário
 * @param hasBreakGlass - Se tem break-glass ativo
 * @returns Nível de acesso aos dados
 */
export function getDataAccessLevel(profile: AccessProfile, hasBreakGlass: boolean = false): DataAccessLevel {
  const config = DEFAULT_ACCESS_CONFIGS[profile];
  
  if (config.requiresBreakGlass && !hasBreakGlass) {
    return DataAccessLevel.MASKED;
  }
  
  return config.dataAccessLevel;
}

/**
 * Valida se uma sessão ainda é válida
 *
 * @param session - Sessão do usuário
 * @returns True se válida
 */
export function isSessionValid(session: UserSession): boolean {
  const now = new Date();
  return session.isActive && session.expiresAt > now;
}

/**
 * Calcula nova data de expiração baseada no perfil
 *
 * @param profile - Perfil do usuário
 * @param startTime - Tempo de início da sessão
 * @returns Data de expiração
 */
export function calculateSessionExpiration(profile: AccessProfile, startTime: Date = new Date()): Date {
  const config = DEFAULT_ACCESS_CONFIGS[profile];
  const expirationTime = new Date(startTime);
  expirationTime.setMinutes(expirationTime.getMinutes() + config.maxSessionDuration);
  return expirationTime;
}

/**
 * Cria uma solicitação de break-glass
 *
 * @param userId - ID do usuário
 * @param profile - Perfil solicitado
 * @param justification - Justificativa
 * @param ipAddress - Endereço IP
 * @param userAgent - User agent
 * @param durationMinutes - Duração em minutos (padrão: 60)
 * @returns Solicitação de break-glass
 */
export function createBreakGlassRequest(
  userId: string,
  profile: AccessProfile,
  justification: string,
  ipAddress: string,
  userAgent: string,
  durationMinutes: number = 60
): BreakGlassRequest {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setMinutes(expiresAt.getMinutes() + durationMinutes);

  return {
    id: `break-glass-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    profile,
    justification,
    requestedAt: now,
    expiresAt,
    status: 'pending',
    ipAddress,
    userAgent,
  };
}

/**
 * Valida se uma solicitação de break-glass ainda é válida
 *
 * @param request - Solicitação de break-glass
 * @returns True se válida
 */
export function isBreakGlassRequestValid(request: BreakGlassRequest): boolean {
  const now = new Date();
  return request.status === 'approved' && request.expiresAt > now;
}

/**
 * Cria um evento de auditoria
 *
 * @param userId - ID do usuário
 * @param profile - Perfil do usuário
 * @param action - Ação realizada
 * @param resource - Recurso acessado
 * @param ipAddress - Endereço IP
 * @param userAgent - User agent
 * @param success - Se a ação foi bem-sucedida
 * @param resourceId - ID do recurso (opcional)
 * @param errorMessage - Mensagem de erro (opcional)
 * @param metadata - Metadados adicionais (opcional)
 * @param breakGlassRequestId - ID da solicitação break-glass (opcional)
 * @returns Evento de auditoria
 */
export function createAuditEvent(
  userId: string,
  profile: AccessProfile,
  action: string,
  resource: string,
  ipAddress: string,
  userAgent: string,
  success: boolean,
  resourceId?: string,
  errorMessage?: string,
  metadata?: Record<string, any>,
  breakGlassRequestId?: string
): AuditEvent {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    profile,
    action,
    resource,
    resourceId,
    timestamp: new Date(),
    ipAddress,
    userAgent,
    success,
    errorMessage,
    metadata,
    breakGlassRequestId,
  };
}

/**
 * Valida justificativa de break-glass
 *
 * @param justification - Justificativa fornecida
 * @returns True se válida
 */
export function validateBreakGlassJustification(justification: string): boolean {
  if (!justification || typeof justification !== 'string') {
    return false;
  }

  // Mínimo de 20 caracteres
  if (justification.trim().length < 20) {
    return false;
  }

  // Máximo de 500 caracteres
  if (justification.length > 500) {
    return false;
  }

  // Não pode conter apenas espaços ou caracteres especiais
  const meaningfulChars = justification.replace(/[\s\W]/g, '');
  if (meaningfulChars.length < 10) {
    return false;
  }

  return true;
}

/**
 * Gera relatório de auditoria para um período
 *
 * @param events - Eventos de auditoria
 * @param startDate - Data de início
 * @param endDate - Data de fim
 * @returns Relatório resumido
 */
export function generateAuditReport(
  events: AuditEvent[],
  startDate: Date,
  endDate: Date
): {
  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  breakGlassEvents: number;
  eventsByProfile: Record<AccessProfile, number>;
  eventsByAction: Record<string, number>;
  topUsers: Array<{ userId: string; count: number }>;
} {
  const filteredEvents = events.filter(
    event => event.timestamp >= startDate && event.timestamp <= endDate
  );

  const eventsByProfile: Record<AccessProfile, number> = {
    [AccessProfile.OPERATIONS]: 0,
    [AccessProfile.AUDIT]: 0,
    [AccessProfile.ADMIN]: 0,
    [AccessProfile.READONLY]: 0,
  };

  const eventsByAction: Record<string, number> = {};
  const userCounts: Record<string, number> = {};

  let successfulEvents = 0;
  let failedEvents = 0;
  let breakGlassEvents = 0;

  for (const event of filteredEvents) {
    eventsByProfile[event.profile]++;
    eventsByAction[event.action] = (eventsByAction[event.action] || 0) + 1;
    userCounts[event.userId] = (userCounts[event.userId] || 0) + 1;

    if (event.success) {
      successfulEvents++;
    } else {
      failedEvents++;
    }

    if (event.breakGlassRequestId) {
      breakGlassEvents++;
    }
  }

  const topUsers = Object.entries(userCounts)
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalEvents: filteredEvents.length,
    successfulEvents,
    failedEvents,
    breakGlassEvents,
    eventsByProfile,
    eventsByAction,
    topUsers,
  };
}
