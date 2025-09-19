"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.securityNotificationMiddleware = exports.voterNotificationMiddleware = exports.electionNotificationMiddleware = exports.sendNotification = exports.sendNotificationAfterOperation = void 0;
const notificationService_1 = __importDefault(require("../service/notificationService"));
/**
 * Middleware to send notifications after successful operations
 */
const sendNotificationAfterOperation = (event) => {
    return async (req, res, next) => {
        // Store the original send method
        const originalSend = res.send;
        // Override the send method to intercept the response
        res.send = function (data) {
            // Restore the original send method
            res.send = originalSend;
            // Check if the operation was successful
            try {
                const responseData = typeof data === 'string' ? JSON.parse(data) : data;
                if (responseData.success || responseData.message) {
                    // Operation was successful, send notification
                    (0, exports.sendNotification)(event).catch(error => {
                        console.error('Error sending notification:', error);
                        // Don't fail the main operation if notification fails
                    });
                }
            }
            catch (error) {
                console.error('Error parsing response data for notification:', error);
            }
            // Call the original send method
            return originalSend.call(this, data);
        };
        next();
    };
};
exports.sendNotificationAfterOperation = sendNotificationAfterOperation;
/**
 * Send notification based on event type
 */
const sendNotification = async (event) => {
    try {
        const notificationData = {
            type: getNotificationType(event.type),
            category: event.category || getDefaultCategory(event.type),
            priority: event.priority || getDefaultPriority(event.type),
            title: getNotificationTitle(event.type),
            message: event.message,
            actionUrl: getActionUrl(event),
            actionText: getActionText(event.type),
            metadata: {
                eventType: event.type,
                electionId: event.electionId,
                voterId: event.voterId,
                ballotId: event.ballotId,
                userId: event.userId
            }
        };
        await notificationService_1.default.createBulkNotifications(event.recipients, notificationData);
    }
    catch (error) {
        console.error('Error sending notification:', error);
        throw error;
    }
};
exports.sendNotification = sendNotification;
/**
 * Get notification type based on event
 */
const getNotificationType = (eventType) => {
    if (eventType.startsWith('ELECTION_'))
        return 'ELECTION';
    if (eventType.startsWith('VOTER_'))
        return 'VOTER';
    if (eventType.startsWith('BALLOT_'))
        return 'BALLOT';
    if (eventType.startsWith('VOTE_'))
        return 'BALLOT';
    if (eventType.startsWith('SECURITY_'))
        return 'SECURITY';
    if (eventType.startsWith('SYSTEM_'))
        return 'SYSTEM';
    return 'SYSTEM';
};
/**
 * Get default category based on event type
 */
const getDefaultCategory = (eventType) => {
    if (eventType.includes('CREATED') || eventType.includes('VERIFIED') || eventType.includes('ACTIVATED')) {
        return 'SUCCESS';
    }
    if (eventType.includes('UPDATED') || eventType.includes('PUBLISHED') || eventType.includes('EXPORTED')) {
        return 'INFO';
    }
    if (eventType.includes('SUSPENDED') || eventType.includes('CANCELLED') || eventType.includes('DELETED')) {
        return 'WARNING';
    }
    if (eventType.includes('ALERT')) {
        return 'ERROR';
    }
    return 'INFO';
};
/**
 * Get default priority based on event type
 */
const getDefaultPriority = (eventType) => {
    if (eventType.includes('SECURITY_') || eventType.includes('ALERT')) {
        return 'HIGH';
    }
    if (eventType.includes('ACTIVATED') || eventType.includes('COMPLETED')) {
        return 'MEDIUM';
    }
    if (eventType.includes('CREATED') || eventType.includes('UPDATED')) {
        return 'LOW';
    }
    return 'MEDIUM';
};
/**
 * Get notification title based on event type
 */
const getNotificationTitle = (eventType) => {
    const action = eventType.split('_')[1]?.toLowerCase() || 'updated';
    const entity = eventType.split('_')[0]?.toLowerCase() || 'item';
    return `${entity.charAt(0).toUpperCase() + entity.slice(1)} ${action}`;
};
/**
 * Get action URL based on event
 */
const getActionUrl = (event) => {
    if (event.electionId) {
        return `/app/election/${event.electionId}`;
    }
    if (event.voterId) {
        return `/app/voter/${event.voterId}`;
    }
    if (event.ballotId) {
        return `/app/ballot/${event.ballotId}`;
    }
    if (event.userId) {
        return `/app/settings`;
    }
    return '/app/dashboard';
};
/**
 * Get action text based on event type
 */
const getActionText = (eventType) => {
    if (eventType.includes('ELECTION'))
        return 'View Election';
    if (eventType.includes('VOTER'))
        return 'View Voter';
    if (eventType.includes('BALLOT'))
        return 'View Ballot';
    if (eventType.includes('SECURITY'))
        return 'Review Settings';
    return 'View Details';
};
/**
 * Middleware to automatically send election notifications
 */
exports.electionNotificationMiddleware = {
    onCreated: (electionId, creatorId) => (0, exports.sendNotificationAfterOperation)({
        type: 'ELECTION_CREATED',
        electionId,
        userId: creatorId,
        message: 'New election has been created successfully',
        recipients: [creatorId]
    }),
    onUpdated: (electionId, updaterId) => (0, exports.sendNotificationAfterOperation)({
        type: 'ELECTION_UPDATED',
        electionId,
        userId: updaterId,
        message: 'Election has been updated successfully',
        recipients: [updaterId]
    }),
    onActivated: (electionId, adminIds) => (0, exports.sendNotificationAfterOperation)({
        type: 'ELECTION_ACTIVATED',
        electionId,
        message: 'Election has been activated and is now live',
        recipients: adminIds
    }),
    onCompleted: (electionId, adminIds) => (0, exports.sendNotificationAfterOperation)({
        type: 'ELECTION_COMPLETED',
        electionId,
        message: 'Election has been completed successfully',
        recipients: adminIds
    })
};
/**
 * Middleware to automatically send voter notifications
 */
exports.voterNotificationMiddleware = {
    onRegistered: (voterId, adminIds) => (0, exports.sendNotificationAfterOperation)({
        type: 'VOTER_REGISTERED',
        voterId,
        message: 'New voter has been registered',
        recipients: adminIds
    }),
    onVerified: (voterId, adminIds) => (0, exports.sendNotificationAfterOperation)({
        type: 'VOTER_VERIFIED',
        voterId,
        message: 'Voter has been verified successfully',
        recipients: adminIds
    }),
    onActivated: (voterId, adminIds) => (0, exports.sendNotificationAfterOperation)({
        type: 'VOTER_ACTIVATED',
        voterId,
        message: 'Voter has been activated and can now vote',
        recipients: adminIds
    }),
    onSuspended: (voterId, adminIds) => (0, exports.sendNotificationAfterOperation)({
        type: 'VOTER_SUSPENDED',
        voterId,
        message: 'Voter has been suspended',
        recipients: adminIds
    }),
    onDeleted: (voterId, adminIds) => (0, exports.sendNotificationAfterOperation)({
        type: 'VOTER_DELETED',
        voterId,
        message: 'Voter has been removed',
        recipients: adminIds
    }),
    onExported: (electionId, adminIds) => (0, exports.sendNotificationAfterOperation)({
        type: 'VOTER_EXPORTED',
        electionId,
        message: 'Voters have been exported for blockchain deployment',
        recipients: adminIds
    })
};
/**
 * Middleware to automatically send security notifications
 */
exports.securityNotificationMiddleware = {
    onLoginAttempt: (userId, message) => (0, exports.sendNotification)({
        type: 'SECURITY_ALERT',
        userId,
        message,
        recipients: [userId],
        priority: 'HIGH',
        category: 'WARNING'
    }),
    onPasswordChanged: (userId) => (0, exports.sendNotification)({
        type: 'SECURITY_ALERT',
        userId,
        message: 'Your password has been changed successfully',
        recipients: [userId],
        priority: 'MEDIUM',
        category: 'SUCCESS'
    }),
    onAccountLocked: (userId) => (0, exports.sendNotification)({
        type: 'SECURITY_ALERT',
        userId,
        message: 'Your account has been locked due to suspicious activity',
        recipients: [userId],
        priority: 'URGENT',
        category: 'ERROR'
    })
};
exports.default = {
    sendNotificationAfterOperation: exports.sendNotificationAfterOperation,
    sendNotification: exports.sendNotification,
    electionNotificationMiddleware: exports.electionNotificationMiddleware,
    voterNotificationMiddleware: exports.voterNotificationMiddleware,
    securityNotificationMiddleware: exports.securityNotificationMiddleware
};
