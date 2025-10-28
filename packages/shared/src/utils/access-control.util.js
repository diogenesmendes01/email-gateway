"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ACCESS_CONFIGS = exports.DataAccessLevel = exports.AccessProfile = void 0;
exports.hasPermission = hasPermission;
exports.getDataAccessLevel = getDataAccessLevel;
exports.isSessionValid = isSessionValid;
exports.calculateSessionExpiration = calculateSessionExpiration;
exports.createBreakGlassRequest = createBreakGlassRequest;
exports.isBreakGlassRequestValid = isBreakGlassRequestValid;
exports.createAuditEvent = createAuditEvent;
exports.validateBreakGlassJustification = validateBreakGlassJustification;
exports.generateAuditReport = generateAuditReport;
var AccessProfile;
(function (AccessProfile) {
    AccessProfile["OPERATIONS"] = "operations";
    AccessProfile["AUDIT"] = "audit";
    AccessProfile["ADMIN"] = "admin";
    AccessProfile["READONLY"] = "readonly";
})(AccessProfile || (exports.AccessProfile = AccessProfile = {}));
var DataAccessLevel;
(function (DataAccessLevel) {
    DataAccessLevel["MASKED"] = "masked";
    DataAccessLevel["UNMASKED"] = "unmasked";
    DataAccessLevel["ENCRYPTED"] = "encrypted";
    DataAccessLevel["DENIED"] = "denied";
})(DataAccessLevel || (exports.DataAccessLevel = DataAccessLevel = {}));
exports.DEFAULT_ACCESS_CONFIGS = {
    [AccessProfile.OPERATIONS]: {
        profile: AccessProfile.OPERATIONS,
        dataAccessLevel: DataAccessLevel.MASKED,
        requiresBreakGlass: false,
        maxSessionDuration: 480,
        allowedOperations: ['read', 'search', 'filter'],
    },
    [AccessProfile.AUDIT]: {
        profile: AccessProfile.AUDIT,
        dataAccessLevel: DataAccessLevel.UNMASKED,
        requiresBreakGlass: true,
        maxSessionDuration: 60,
        allowedOperations: ['read', 'search', 'filter', 'export'],
    },
    [AccessProfile.ADMIN]: {
        profile: AccessProfile.ADMIN,
        dataAccessLevel: DataAccessLevel.UNMASKED,
        requiresBreakGlass: false,
        maxSessionDuration: 240,
        allowedOperations: ['read', 'search', 'filter', 'export', 'delete', 'update'],
    },
    [AccessProfile.READONLY]: {
        profile: AccessProfile.READONLY,
        dataAccessLevel: DataAccessLevel.MASKED,
        requiresBreakGlass: false,
        maxSessionDuration: 120,
        allowedOperations: ['read'],
    },
};
function hasPermission(profile, operation) {
    const config = exports.DEFAULT_ACCESS_CONFIGS[profile];
    return config.allowedOperations.includes(operation);
}
function getDataAccessLevel(profile, hasBreakGlass = false) {
    const config = exports.DEFAULT_ACCESS_CONFIGS[profile];
    if (config.requiresBreakGlass && !hasBreakGlass) {
        return DataAccessLevel.MASKED;
    }
    return config.dataAccessLevel;
}
function isSessionValid(session) {
    const now = new Date();
    return session.isActive && session.expiresAt > now;
}
function calculateSessionExpiration(profile, startTime = new Date()) {
    const config = exports.DEFAULT_ACCESS_CONFIGS[profile];
    const expirationTime = new Date(startTime);
    expirationTime.setMinutes(expirationTime.getMinutes() + config.maxSessionDuration);
    return expirationTime;
}
function createBreakGlassRequest(userId, profile, justification, ipAddress, userAgent, durationMinutes = 60) {
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
function isBreakGlassRequestValid(request) {
    const now = new Date();
    return request.status === 'approved' && request.expiresAt > now;
}
function createAuditEvent(userId, profile, action, resource, ipAddress, userAgent, success, resourceId, errorMessage, metadata, breakGlassRequestId) {
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
function validateBreakGlassJustification(justification) {
    if (!justification || typeof justification !== 'string') {
        return false;
    }
    if (justification.trim().length < 20) {
        return false;
    }
    if (justification.length > 500) {
        return false;
    }
    const meaningfulChars = justification.replace(/[\s\W]/g, '');
    if (meaningfulChars.length < 10) {
        return false;
    }
    return true;
}
function generateAuditReport(events, startDate, endDate) {
    const filteredEvents = events.filter(event => event.timestamp >= startDate && event.timestamp <= endDate);
    const eventsByProfile = {
        [AccessProfile.OPERATIONS]: 0,
        [AccessProfile.AUDIT]: 0,
        [AccessProfile.ADMIN]: 0,
        [AccessProfile.READONLY]: 0,
    };
    const eventsByAction = {};
    const userCounts = {};
    let successfulEvents = 0;
    let failedEvents = 0;
    let breakGlassEvents = 0;
    for (const event of filteredEvents) {
        eventsByProfile[event.profile]++;
        eventsByAction[event.action] = (eventsByAction[event.action] || 0) + 1;
        userCounts[event.userId] = (userCounts[event.userId] || 0) + 1;
        if (event.success) {
            successfulEvents++;
        }
        else {
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
//# sourceMappingURL=access-control.util.js.map