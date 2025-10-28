export declare enum AccessProfile {
    OPERATIONS = "operations",
    AUDIT = "audit",
    ADMIN = "admin",
    READONLY = "readonly"
}
export declare enum DataAccessLevel {
    MASKED = "masked",
    UNMASKED = "unmasked",
    ENCRYPTED = "encrypted",
    DENIED = "denied"
}
export interface AccessConfig {
    profile: AccessProfile;
    dataAccessLevel: DataAccessLevel;
    requiresBreakGlass: boolean;
    maxSessionDuration: number;
    allowedOperations: string[];
}
export declare const DEFAULT_ACCESS_CONFIGS: Record<AccessProfile, AccessConfig>;
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
export declare function hasPermission(profile: AccessProfile, operation: string): boolean;
export declare function getDataAccessLevel(profile: AccessProfile, hasBreakGlass?: boolean): DataAccessLevel;
export declare function isSessionValid(session: UserSession): boolean;
export declare function calculateSessionExpiration(profile: AccessProfile, startTime?: Date): Date;
export declare function createBreakGlassRequest(userId: string, profile: AccessProfile, justification: string, ipAddress: string, userAgent: string, durationMinutes?: number): BreakGlassRequest;
export declare function isBreakGlassRequestValid(request: BreakGlassRequest): boolean;
export declare function createAuditEvent(userId: string, profile: AccessProfile, action: string, resource: string, ipAddress: string, userAgent: string, success: boolean, resourceId?: string, errorMessage?: string, metadata?: Record<string, any>, breakGlassRequestId?: string): AuditEvent;
export declare function validateBreakGlassJustification(justification: string): boolean;
export declare function generateAuditReport(events: AuditEvent[], startDate: Date, endDate: Date): {
    totalEvents: number;
    successfulEvents: number;
    failedEvents: number;
    breakGlassEvents: number;
    eventsByProfile: Record<AccessProfile, number>;
    eventsByAction: Record<string, number>;
    topUsers: Array<{
        userId: string;
        count: number;
    }>;
};
