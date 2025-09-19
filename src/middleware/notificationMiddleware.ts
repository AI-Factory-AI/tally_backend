import { Request, Response, NextFunction } from 'express';
import notificationService from '../service/notificationService';
import { IUser } from '../model/User';

export interface NotificationEvent {
  type: 'ELECTION_CREATED' | 'ELECTION_UPDATED' | 'ELECTION_ACTIVATED' | 'ELECTION_COMPLETED' | 'ELECTION_CANCELLED' |
        'VOTER_REGISTERED' | 'VOTER_VERIFIED' | 'VOTER_ACTIVATED' | 'VOTER_SUSPENDED' | 'VOTER_DELETED' | 'VOTER_UPDATED' | 'VOTER_EXPORTED' |
        'BALLOT_CREATED' | 'BALLOT_UPDATED' | 'BALLOT_PUBLISHED' |
        'VOTE_CAST' | 'VOTE_VERIFIED' |
        'SECURITY_ALERT' | 'SYSTEM_MAINTENANCE';
  electionId?: string;
  voterId?: string;
  ballotId?: string;
  userId?: string;
  message: string;
  recipients: string[];
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  category?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'DESTRUCTIVE';
}

/**
 * Middleware to send notifications after successful operations
 */
export const sendNotificationAfterOperation = (event: NotificationEvent) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store the original send method
    const originalSend = res.send;
    
    // Override the send method to intercept the response
    res.send = function(data: any) {
      // Restore the original send method
      res.send = originalSend;
      
      // Check if the operation was successful
      try {
        const responseData = typeof data === 'string' ? JSON.parse(data) : data;
        
        if (responseData.success || responseData.message) {
          // Operation was successful, send notification
          sendNotification(event).catch(error => {
            console.error('Error sending notification:', error);
            // Don't fail the main operation if notification fails
          });
        }
      } catch (error) {
        console.error('Error parsing response data for notification:', error);
      }
      
      // Call the original send method
      return originalSend.call(this, data);
    };
    
    next();
  };
};

/**
 * Send notification based on event type
 */
export const sendNotification = async (event: NotificationEvent): Promise<void> => {
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

    await notificationService.createBulkNotifications(event.recipients, notificationData);
  } catch (error) {
    console.error('Error sending notification:', error);
    throw error;
  }
};

/**
 * Get notification type based on event
 */
const getNotificationType = (eventType: string): 'SYSTEM' | 'ELECTION' | 'VOTER' | 'BALLOT' | 'SECURITY' | 'REMINDER' => {
  if (eventType.startsWith('ELECTION_')) return 'ELECTION';
  if (eventType.startsWith('VOTER_')) return 'VOTER';
  if (eventType.startsWith('BALLOT_')) return 'BALLOT';
  if (eventType.startsWith('VOTE_')) return 'BALLOT';
  if (eventType.startsWith('SECURITY_')) return 'SECURITY';
  if (eventType.startsWith('SYSTEM_')) return 'SYSTEM';
  return 'SYSTEM';
};

/**
 * Get default category based on event type
 */
const getDefaultCategory = (eventType: string): 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'DESTRUCTIVE' => {
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
const getDefaultPriority = (eventType: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' => {
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
const getNotificationTitle = (eventType: string): string => {
  const action = eventType.split('_')[1]?.toLowerCase() || 'updated';
  const entity = eventType.split('_')[0]?.toLowerCase() || 'item';
  return `${entity.charAt(0).toUpperCase() + entity.slice(1)} ${action}`;
};

/**
 * Get action URL based on event
 */
const getActionUrl = (event: NotificationEvent): string => {
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
const getActionText = (eventType: string): string => {
  if (eventType.includes('ELECTION')) return 'View Election';
  if (eventType.includes('VOTER')) return 'View Voter';
  if (eventType.includes('BALLOT')) return 'View Ballot';
  if (eventType.includes('SECURITY')) return 'Review Settings';
  return 'View Details';
};

/**
 * Middleware to automatically send election notifications
 */
export const electionNotificationMiddleware = {
  onCreated: (electionId: string, creatorId: string) => 
    sendNotificationAfterOperation({
      type: 'ELECTION_CREATED',
      electionId,
      userId: creatorId,
      message: 'New election has been created successfully',
      recipients: [creatorId]
    }),

  onUpdated: (electionId: string, updaterId: string) =>
    sendNotificationAfterOperation({
      type: 'ELECTION_UPDATED',
      electionId,
      userId: updaterId,
      message: 'Election has been updated successfully',
      recipients: [updaterId]
    }),

  onActivated: (electionId: string, adminIds: string[]) =>
    sendNotificationAfterOperation({
      type: 'ELECTION_ACTIVATED',
      electionId,
      message: 'Election has been activated and is now live',
      recipients: adminIds
    }),

  onCompleted: (electionId: string, adminIds: string[]) =>
    sendNotificationAfterOperation({
      type: 'ELECTION_COMPLETED',
      electionId,
      message: 'Election has been completed successfully',
      recipients: adminIds
    })
};

/**
 * Middleware to automatically send voter notifications
 */
export const voterNotificationMiddleware = {
  onRegistered: (voterId: string, adminIds: string[]) =>
    sendNotificationAfterOperation({
      type: 'VOTER_REGISTERED',
      voterId,
      message: 'New voter has been registered',
      recipients: adminIds
    }),

  onVerified: (voterId: string, adminIds: string[]) =>
    sendNotificationAfterOperation({
      type: 'VOTER_VERIFIED',
      voterId,
      message: 'Voter has been verified successfully',
      recipients: adminIds
    }),

  onActivated: (voterId: string, adminIds: string[]) =>
    sendNotificationAfterOperation({
      type: 'VOTER_ACTIVATED',
      voterId,
      message: 'Voter has been activated and can now vote',
      recipients: adminIds
    }),

  onSuspended: (voterId: string, adminIds: string[]) =>
    sendNotificationAfterOperation({
      type: 'VOTER_SUSPENDED',
      voterId,
      message: 'Voter has been suspended',
      recipients: adminIds
    }),

  onDeleted: (voterId: string, adminIds: string[]) =>
    sendNotificationAfterOperation({
      type: 'VOTER_DELETED',
      voterId,
      message: 'Voter has been removed',
      recipients: adminIds
    }),

  onExported: (electionId: string, adminIds: string[]) =>
    sendNotificationAfterOperation({
      type: 'VOTER_EXPORTED',
      electionId,
      message: 'Voters have been exported for blockchain deployment',
      recipients: adminIds
    })
};

/**
 * Middleware to automatically send security notifications
 */
export const securityNotificationMiddleware = {
  onLoginAttempt: (userId: string, message: string) =>
    sendNotification({
      type: 'SECURITY_ALERT',
      userId,
      message,
      recipients: [userId],
      priority: 'HIGH',
      category: 'WARNING'
    }),

  onPasswordChanged: (userId: string) =>
    sendNotification({
      type: 'SECURITY_ALERT',
      userId,
      message: 'Your password has been changed successfully',
      recipients: [userId],
      priority: 'MEDIUM',
      category: 'SUCCESS'
    }),

  onAccountLocked: (userId: string) =>
    sendNotification({
      type: 'SECURITY_ALERT',
      userId,
      message: 'Your account has been locked due to suspicious activity',
      recipients: [userId],
      priority: 'URGENT',
      category: 'ERROR'
    })
};

export default {
  sendNotificationAfterOperation,
  sendNotification,
  electionNotificationMiddleware,
  voterNotificationMiddleware,
  securityNotificationMiddleware
};
