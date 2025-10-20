/**
 * @email-gateway/shared - Access Control Utilities Tests
 *
 * Testes para sistema de controle de acesso e auditoria
 *
 * TASK 5.2 — PII, masking, criptografia, retenção e acesso
 */

import {
  hasPermission,
  getDataAccessLevel,
  isSessionValid,
  calculateSessionExpiration,
  createBreakGlassRequest,
  isBreakGlassRequestValid,
  createAuditEvent,
  validateBreakGlassJustification,
  generateAuditReport,
  AccessProfile,
  DataAccessLevel,
  DEFAULT_ACCESS_CONFIGS,
  BreakGlassRequest,
  AuditEvent,
  UserSession,
} from '../access-control.util';

describe('Access Control Utilities', () => {
  describe('hasPermission', () => {
    it('should allow operations for admin profile', () => {
      expect(hasPermission(AccessProfile.ADMIN, 'read')).toBe(true);
      expect(hasPermission(AccessProfile.ADMIN, 'delete')).toBe(true);
      expect(hasPermission(AccessProfile.ADMIN, 'export')).toBe(true);
    });

    it('should allow limited operations for operations profile', () => {
      expect(hasPermission(AccessProfile.OPERATIONS, 'read')).toBe(true);
      expect(hasPermission(AccessProfile.OPERATIONS, 'search')).toBe(true);
      expect(hasPermission(AccessProfile.OPERATIONS, 'delete')).toBe(false);
    });

    it('should allow only read for readonly profile', () => {
      expect(hasPermission(AccessProfile.READONLY, 'read')).toBe(true);
      expect(hasPermission(AccessProfile.READONLY, 'search')).toBe(false);
      expect(hasPermission(AccessProfile.READONLY, 'delete')).toBe(false);
    });

    it('should allow audit operations for audit profile', () => {
      expect(hasPermission(AccessProfile.AUDIT, 'read')).toBe(true);
      expect(hasPermission(AccessProfile.AUDIT, 'export')).toBe(true);
      expect(hasPermission(AccessProfile.AUDIT, 'delete')).toBe(false);
    });
  });

  describe('getDataAccessLevel', () => {
    it('should return masked for operations without break-glass', () => {
      const level = getDataAccessLevel(AccessProfile.OPERATIONS, false);
      
      expect(level).toBe(DataAccessLevel.MASKED);
    });

    it('should return unmasked for audit with break-glass', () => {
      const level = getDataAccessLevel(AccessProfile.AUDIT, true);
      
      expect(level).toBe(DataAccessLevel.UNMASKED);
    });

    it('should return masked for audit without break-glass', () => {
      const level = getDataAccessLevel(AccessProfile.AUDIT, false);
      
      expect(level).toBe(DataAccessLevel.MASKED);
    });

    it('should return unmasked for admin', () => {
      const level = getDataAccessLevel(AccessProfile.ADMIN, false);
      
      expect(level).toBe(DataAccessLevel.UNMASKED);
    });
  });

  describe('isSessionValid', () => {
    it('should validate active session', () => {
      const session: UserSession = {
        id: 'session-1',
        userId: 'user-1',
        profile: AccessProfile.OPERATIONS,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        lastActivity: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
        isActive: true,
      };
      
      const isValid = isSessionValid(session);
      
      expect(isValid).toBe(true);
    });

    it('should invalidate expired session', () => {
      const session: UserSession = {
        id: 'session-1',
        userId: 'user-1',
        profile: AccessProfile.OPERATIONS,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        lastActivity: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
        isActive: true,
      };
      
      const isValid = isSessionValid(session);
      
      expect(isValid).toBe(false);
    });

    it('should invalidate inactive session', () => {
      const session: UserSession = {
        id: 'session-1',
        userId: 'user-1',
        profile: AccessProfile.OPERATIONS,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        lastActivity: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
        isActive: false,
      };
      
      const isValid = isSessionValid(session);
      
      expect(isValid).toBe(false);
    });
  });

  describe('calculateSessionExpiration', () => {
    it('should calculate expiration for operations profile', () => {
      const startTime = new Date('2023-01-01T00:00:00Z');
      const expiration = calculateSessionExpiration(AccessProfile.OPERATIONS, startTime);
      
      const expectedExpiration = new Date('2023-01-01T08:00:00Z'); // 8 hours later
      expect(expiration).toEqual(expectedExpiration);
    });

    it('should calculate expiration for audit profile', () => {
      const startTime = new Date('2023-01-01T00:00:00Z');
      const expiration = calculateSessionExpiration(AccessProfile.AUDIT, startTime);
      
      const expectedExpiration = new Date('2023-01-01T01:00:00Z'); // 1 hour later
      expect(expiration).toEqual(expectedExpiration);
    });

    it('should use current time if no start time provided', () => {
      const before = new Date();
      const expiration = calculateSessionExpiration(AccessProfile.OPERATIONS);
      
      // Verificar se a expiração está no futuro (8 horas depois)
      const expectedMinTime = before.getTime() + (8 * 60 * 60 * 1000); // 8 horas em ms
      const expectedMaxTime = before.getTime() + (8 * 60 * 60 * 1000) + 1000; // +1 segundo de margem
      
      expect(expiration.getTime()).toBeGreaterThanOrEqual(expectedMinTime);
      expect(expiration.getTime()).toBeLessThanOrEqual(expectedMaxTime);
    });
  });

  describe('createBreakGlassRequest', () => {
    it('should create break-glass request with correct properties', () => {
      const request = createBreakGlassRequest(
        'user-1',
        AccessProfile.AUDIT,
        'Need to investigate security incident',
        '192.168.1.1',
        'test-agent',
        60
      );
      
      expect(request.userId).toBe('user-1');
      expect(request.profile).toBe(AccessProfile.AUDIT);
      expect(request.justification).toBe('Need to investigate security incident');
      expect(request.status).toBe('pending');
      expect(request.ipAddress).toBe('192.168.1.1');
      expect(request.userAgent).toBe('test-agent');
      expect(request.id).toMatch(/^break-glass-/);
    });

    it('should set correct expiration time', () => {
      const before = new Date();
      const request = createBreakGlassRequest(
        'user-1',
        AccessProfile.AUDIT,
        'Test justification',
        '192.168.1.1',
        'test-agent',
        30
      );
      const after = new Date();
      
      const expectedMinExpiration = new Date(before.getTime() + 30 * 60000);
      const expectedMaxExpiration = new Date(after.getTime() + 30 * 60000);
      
      expect(request.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinExpiration.getTime());
      expect(request.expiresAt.getTime()).toBeLessThanOrEqual(expectedMaxExpiration.getTime());
    });
  });

  describe('isBreakGlassRequestValid', () => {
    it('should validate approved and non-expired request', () => {
      const request: BreakGlassRequest = {
        id: 'break-glass-1',
        userId: 'user-1',
        profile: AccessProfile.AUDIT,
        justification: 'Test justification',
        requestedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        status: 'approved',
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
      };
      
      const isValid = isBreakGlassRequestValid(request);
      
      expect(isValid).toBe(true);
    });

    it('should invalidate expired request', () => {
      const request: BreakGlassRequest = {
        id: 'break-glass-1',
        userId: 'user-1',
        profile: AccessProfile.AUDIT,
        justification: 'Test justification',
        requestedAt: new Date(),
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        status: 'approved',
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
      };
      
      const isValid = isBreakGlassRequestValid(request);
      
      expect(isValid).toBe(false);
    });

    it('should invalidate non-approved request', () => {
      const request: BreakGlassRequest = {
        id: 'break-glass-1',
        userId: 'user-1',
        profile: AccessProfile.AUDIT,
        justification: 'Test justification',
        requestedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        status: 'pending',
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
      };
      
      const isValid = isBreakGlassRequestValid(request);
      
      expect(isValid).toBe(false);
    });
  });

  describe('createAuditEvent', () => {
    it('should create audit event with correct properties', () => {
      const event = createAuditEvent(
        'user-1',
        AccessProfile.OPERATIONS,
        'read',
        'email_logs',
        '192.168.1.1',
        'test-agent',
        true,
        'log-123'
      );
      
      expect(event.userId).toBe('user-1');
      expect(event.profile).toBe(AccessProfile.OPERATIONS);
      expect(event.action).toBe('read');
      expect(event.resource).toBe('email_logs');
      expect(event.resourceId).toBe('log-123');
      expect(event.success).toBe(true);
      expect(event.ipAddress).toBe('192.168.1.1');
      expect(event.userAgent).toBe('test-agent');
      expect(event.id).toMatch(/^audit-/);
    });

    it('should create failed audit event', () => {
      const event = createAuditEvent(
        'user-1',
        AccessProfile.OPERATIONS,
        'delete',
        'email_logs',
        '192.168.1.1',
        'test-agent',
        false,
        'log-123',
        'Permission denied'
      );
      
      expect(event.success).toBe(false);
      expect(event.errorMessage).toBe('Permission denied');
    });
  });

  describe('validateBreakGlassJustification', () => {
    it('should validate good justification', () => {
      const justification = 'Need to investigate security incident reported by customer';
      
      const isValid = validateBreakGlassJustification(justification);
      
      expect(isValid).toBe(true);
    });

    it('should reject short justification', () => {
      const justification = 'Security issue';
      
      const isValid = validateBreakGlassJustification(justification);
      
      expect(isValid).toBe(false);
    });

    it('should reject empty justification', () => {
      const isValid = validateBreakGlassJustification('');
      
      expect(isValid).toBe(false);
    });

    it('should reject justification with only spaces', () => {
      const justification = '   \n\t   ';
      
      const isValid = validateBreakGlassJustification(justification);
      
      expect(isValid).toBe(false);
    });

    it('should reject very long justification', () => {
      const justification = 'a'.repeat(501);
      
      const isValid = validateBreakGlassJustification(justification);
      
      expect(isValid).toBe(false);
    });
  });

  describe('generateAuditReport', () => {
    it('should generate audit report', () => {
      const now = new Date();
      const events: AuditEvent[] = [
        createAuditEvent('user-1', AccessProfile.OPERATIONS, 'read', 'logs', '192.168.1.1', 'agent', true),
        createAuditEvent('user-2', AccessProfile.AUDIT, 'export', 'logs', '192.168.1.2', 'agent', true),
        createAuditEvent('user-1', AccessProfile.OPERATIONS, 'delete', 'logs', '192.168.1.1', 'agent', false),
      ];
      
      // Usar datas que incluam os eventos criados
      const startDate = new Date(now.getTime() - 3600000); // 1 hora atrás
      const endDate = new Date(now.getTime() + 3600000);   // 1 hora no futuro
      
      const report = generateAuditReport(events, startDate, endDate);
      
      expect(report.totalEvents).toBe(3);
      expect(report.successfulEvents).toBe(2);
      expect(report.failedEvents).toBe(1);
      expect(report.eventsByProfile[AccessProfile.OPERATIONS]).toBe(2);
      expect(report.eventsByProfile[AccessProfile.AUDIT]).toBe(1);
      expect(report.eventsByAction.read).toBe(1);
      expect(report.eventsByAction.export).toBe(1);
      expect(report.eventsByAction.delete).toBe(1);
      expect(report.topUsers).toHaveLength(2);
      expect(report.topUsers[0]?.userId).toBe('user-1');
      expect(report.topUsers[0]?.count).toBe(2);
    });
  });

  describe('DEFAULT_ACCESS_CONFIGS', () => {
    it('should have correct configurations for all profiles', () => {
      expect(DEFAULT_ACCESS_CONFIGS[AccessProfile.OPERATIONS].dataAccessLevel).toBe(DataAccessLevel.MASKED);
      expect(DEFAULT_ACCESS_CONFIGS[AccessProfile.OPERATIONS].requiresBreakGlass).toBe(false);
      expect(DEFAULT_ACCESS_CONFIGS[AccessProfile.OPERATIONS].maxSessionDuration).toBe(480);
      
      expect(DEFAULT_ACCESS_CONFIGS[AccessProfile.AUDIT].dataAccessLevel).toBe(DataAccessLevel.UNMASKED);
      expect(DEFAULT_ACCESS_CONFIGS[AccessProfile.AUDIT].requiresBreakGlass).toBe(true);
      expect(DEFAULT_ACCESS_CONFIGS[AccessProfile.AUDIT].maxSessionDuration).toBe(60);
      
      expect(DEFAULT_ACCESS_CONFIGS[AccessProfile.ADMIN].dataAccessLevel).toBe(DataAccessLevel.UNMASKED);
      expect(DEFAULT_ACCESS_CONFIGS[AccessProfile.ADMIN].requiresBreakGlass).toBe(false);
      expect(DEFAULT_ACCESS_CONFIGS[AccessProfile.ADMIN].maxSessionDuration).toBe(240);
      
      expect(DEFAULT_ACCESS_CONFIGS[AccessProfile.READONLY].dataAccessLevel).toBe(DataAccessLevel.MASKED);
      expect(DEFAULT_ACCESS_CONFIGS[AccessProfile.READONLY].requiresBreakGlass).toBe(false);
      expect(DEFAULT_ACCESS_CONFIGS[AccessProfile.READONLY].maxSessionDuration).toBe(120);
    });
  });
});
