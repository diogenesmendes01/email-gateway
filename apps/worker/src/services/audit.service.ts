/**
 * @email-gateway/worker - Audit Service
 *
 * Serviço de auditoria para trilha de acesso e break-glass
 *
 * TASK 5.2 — PII, masking, criptografia, retenção e acesso
 * Implementação de trilha de auditoria no worker
 */

import { PrismaClient } from '@prisma/client';
import {
  AccessProfile,
  DataAccessLevel,
  createAuditEvent,
  createBreakGlassRequest,
  isBreakGlassRequestValid,
  validateBreakGlassJustification,
  AuditEvent,
  BreakGlassRequest,
} from '@email-gateway/shared';
import { createLogger } from '../utils/logger';

const log = createLogger('AuditService');

export interface AuditServiceConfig {
  enableAuditTrail: boolean;
  enableBreakGlass: boolean;
  auditRetentionDays: number;
}

export class AuditService {
  private prisma: PrismaClient;
  private config: AuditServiceConfig;

  constructor(prisma: PrismaClient, config: AuditServiceConfig) {
    this.prisma = prisma;
    this.config = config;
  }

  /**
   * Registra evento de auditoria
   */
  async logAuditEvent(
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
  ): Promise<void> {
    if (!this.config.enableAuditTrail) {
      return;
    }

    try {
      const auditEvent = createAuditEvent(
        userId,
        profile,
        action,
        resource,
        ipAddress,
        userAgent,
        success,
        resourceId,
        errorMessage,
        metadata,
        breakGlassRequestId
      );

      // Em um sistema real, você salvaria no banco de dados
      // Por agora, vamos apenas logar
      log.info('Audit event recorded', {
        id: auditEvent.id,
        userId: auditEvent.userId,
        profile: auditEvent.profile,
        action: auditEvent.action,
        resource: auditEvent.resource,
        success: auditEvent.success,
      });

      // Salva no banco de dados
      await this.prisma.auditLog.create({
        data: {
          id: auditEvent.id,
          companyId: auditEvent.userId, // Assumindo que userId é companyId
          userId: auditEvent.userId,
          action: auditEvent.action,
          resource: auditEvent.resource,
          resourceId: auditEvent.resourceId,
          ipAddress: auditEvent.ipAddress,
          userAgent: auditEvent.userAgent,
          metadata: {
            ...auditEvent.metadata,
            profile: auditEvent.profile,
            success: auditEvent.success,
            errorMessage: auditEvent.errorMessage,
            breakGlassRequestId: auditEvent.breakGlassRequestId,
            timestamp: auditEvent.timestamp,
          },
        },
      });
    } catch (error) {
      log.error('Failed to record audit event', { error: (error as Error).message });
      // Não falhar a operação principal por erro de auditoria
    }
  }

  /**
   * Cria solicitação de break-glass
   */
  async createBreakGlassRequest(
    userId: string,
    profile: AccessProfile,
    justification: string,
    ipAddress: string,
    userAgent: string,
    durationMinutes: number = 60
  ): Promise<BreakGlassRequest | null> {
    if (!this.config.enableBreakGlass) {
      log.warn('Break-glass is disabled');
      return null;
    }

    if (!validateBreakGlassJustification(justification)) {
      throw new Error('Justificativa de break-glass inválida');
    }

    try {
      const request = createBreakGlassRequest(
        userId,
        profile,
        justification,
        ipAddress,
        userAgent,
        durationMinutes
      );

      log.warn('Break-glass request created', {
        id: request.id,
        userId: request.userId,
        profile: request.profile,
      });

      // Salva solicitação break-glass como evento de auditoria
      await this.prisma.auditLog.create({
        data: {
          id: request.id,
          companyId: request.userId,
          userId: request.userId,
          action: 'break_glass_request',
          resource: 'break_glass',
          resourceId: request.id,
          ipAddress: request.ipAddress,
          userAgent: request.userAgent,
          metadata: {
            profile: request.profile,
            justification: request.justification,
            requestedAt: request.requestedAt,
            expiresAt: request.expiresAt,
            status: request.status,
            durationMinutes: 60, // Default duration
          },
        },
      });

      return request;
    } catch (error) {
      log.error('Failed to create break-glass request', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Aprova solicitação de break-glass
   */
  async approveBreakGlassRequest(
    requestId: string,
    approvedBy: string
  ): Promise<boolean> {
    try {
      log.info('Break-glass request approved', { requestId, approvedBy });

      // Atualiza solicitação break-glass no audit log
      await this.prisma.auditLog.update({
        where: { id: requestId },
        data: {
          metadata: {
            ...(await this.prisma.auditLog.findUnique({
              where: { id: requestId },
              select: { metadata: true },
            }))?.metadata as any,
            status: 'approved',
            approvedBy,
            approvedAt: new Date(),
          },
        },
      });

      return true;
    } catch (error) {
      log.error('Failed to approve break-glass request', { error: (error as Error).message });
      return false;
    }
  }

  /**
   * Verifica se uma solicitação de break-glass é válida
   */
  async validateBreakGlassRequest(requestId: string): Promise<boolean> {
    try {
      // Busca solicitação break-glass no audit log
      const request = await this.prisma.auditLog.findUnique({
        where: { id: requestId },
      });

      if (!request || request.action !== 'break_glass_request') {
        return false;
      }

      // Verifica se a solicitação é válida
      const metadata = request.metadata as any;
      if (!metadata || !metadata.expiresAt) {
        return false;
      }

      const expiresAt = new Date(metadata.expiresAt);
      const now = new Date();
      
      return expiresAt > now && metadata.status === 'approved';
    } catch (error) {
      log.error('Failed to validate break-glass request', { error: (error as Error).message });
      return false;
    }
  }

  /**
   * Registra acesso a dados sensíveis
   */
  async logSensitiveDataAccess(
    userId: string,
    profile: AccessProfile,
    dataType: string,
    resourceId: string,
    ipAddress: string,
    userAgent: string,
    breakGlassRequestId?: string
  ): Promise<void> {
    await this.logAuditEvent(
      userId,
      profile,
      'access_sensitive_data',
      dataType,
      ipAddress,
      userAgent,
      true,
      resourceId,
      undefined,
      {
        dataType,
        accessLevel: breakGlassRequestId ? 'unmasked' : 'masked',
      },
      breakGlassRequestId
    );
  }

  /**
   * Registra operação de exportação de dados
   */
  async logDataExport(
    userId: string,
    profile: AccessProfile,
    exportType: string,
    recordCount: number,
    ipAddress: string,
    userAgent: string,
    breakGlassRequestId?: string
  ): Promise<void> {
    await this.logAuditEvent(
      userId,
      profile,
      'export_data',
      exportType,
      ipAddress,
      userAgent,
      true,
      undefined,
      undefined,
      {
        recordCount,
        exportType,
        accessLevel: breakGlassRequestId ? 'unmasked' : 'masked',
      },
      breakGlassRequestId
    );
  }

  /**
   * Registra operação de limpeza de dados
   */
  async logDataCleanup(
    userId: string,
    profile: AccessProfile,
    tableName: string,
    recordCount: number,
    ipAddress: string,
    userAgent: string
  ): Promise<void> {
    await this.logAuditEvent(
      userId,
      profile,
      'cleanup_data',
      tableName,
      ipAddress,
      userAgent,
      true,
      undefined,
      undefined,
      {
        tableName,
        recordCount,
        cleanupType: 'retention_policy',
      }
    );
  }

  /**
   * Registra falha de autenticação/autorização
   */
  async logAuthFailure(
    userId: string,
    profile: AccessProfile,
    action: string,
    resource: string,
    ipAddress: string,
    userAgent: string,
    errorMessage: string
  ): Promise<void> {
    await this.logAuditEvent(
      userId,
      profile,
      action,
      resource,
      ipAddress,
      userAgent,
      false,
      undefined,
      errorMessage,
      {
        failureType: 'authentication',
      }
    );
  }

  /**
   * Limpa eventos de auditoria antigos
   */
  async cleanupOldAuditEvents(): Promise<number> {
    if (!this.config.enableAuditTrail) {
      return 0;
    }

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.auditRetentionDays);

      log.info('Cleaning old audit events', { cutoffDate: cutoffDate.toISOString() });

      // Limpa eventos de auditoria antigos
      const result = await this.prisma.auditLog.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      return result.count;
    } catch (error) {
      log.error('Failed to clean audit events', { error: (error as Error).message });
      return 0;
    }
  }

  /**
   * Gera relatório de auditoria
   */
  async generateAuditReport(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalEvents: number;
    successfulEvents: number;
    failedEvents: number;
    breakGlassEvents: number;
    eventsByProfile: Record<AccessProfile, number>;
    eventsByAction: Record<string, number>;
  }> {
    try {
      log.info('Generating audit report', { startDate: startDate.toISOString(), endDate: endDate.toISOString() });

      // Gera relatório de auditoria do banco de dados
      const events = await this.prisma.auditLog.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      // Processa os dados para gerar o relatório
      const totalEvents = events.length;
      const successfulEvents = events.filter(e => {
        const metadata = e.metadata as any;
        return metadata?.success === true;
      }).length;
      const failedEvents = totalEvents - successfulEvents;
      const breakGlassEvents = events.filter(e => e.action === 'break_glass_request').length;

      const eventsByProfile = {
        [AccessProfile.OPERATIONS]: 0,
        [AccessProfile.AUDIT]: 0,
        [AccessProfile.ADMIN]: 0,
        [AccessProfile.READONLY]: 0,
      };

      const eventsByAction: Record<string, number> = {};

      events.forEach(event => {
        const metadata = event.metadata as any;
        const profile = metadata?.profile;
        if (profile && eventsByProfile.hasOwnProperty(profile)) {
          eventsByProfile[profile as AccessProfile]++;
        }

        eventsByAction[event.action] = (eventsByAction[event.action] || 0) + 1;
      });

      return {
        totalEvents,
        successfulEvents,
        failedEvents,
        breakGlassEvents,
        eventsByProfile,
        eventsByAction,
      };
    } catch (error) {
      log.error('Failed to generate audit report', { error: (error as Error).message });
      throw error;
    }
  }
}
