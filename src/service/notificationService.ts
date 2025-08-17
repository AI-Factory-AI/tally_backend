import { Notification, INotification } from '../model/Notification';
import { User } from '../model/User';
import { Election } from '../model/Election';
import { Voter } from '../model/Voter';
import { Ballot } from '../model/Ballot';

export interface CreateNotificationData {
  recipient: string;
  sender?: string;
  type: 'SYSTEM' | 'ELECTION' | 'VOTER' | 'BALLOT' | 'SECURITY' | 'REMINDER';
  category: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'DESTRUCTIVE';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  title: string;
  message: string;
  description?: string;
  actionUrl?: string;
  actionText?: string;
  metadata?: Record<string, any>;
  deliveryMethod?: 'IN_APP' | 'EMAIL' | 'PUSH' | 'SMS';
  scheduledFor?: Date;
  expiresAt?: Date;
}

export interface NotificationFilters {
  page?: number;
  limit?: number;
  read?: boolean;
  type?: string;
  category?: string;
  priority?: string;
}

export interface NotificationStats {
  total: number;
  unread: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
}

class NotificationService {
  /**
   * Create a single notification
   */
  async createNotification(data: CreateNotificationData): Promise<INotification> {
    try {
      const notification = new Notification({
        ...data,
        priority: data.priority || 'MEDIUM',
        deliveryMethod: data.deliveryMethod || 'IN_APP'
      });

      await notification.save();
      
      // If scheduled for future, don't deliver immediately
      if (data.scheduledFor && data.scheduledFor > new Date()) {
        return notification;
      }

      // Deliver immediately if not scheduled
      await this.deliverNotification(notification);
      
      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw new Error('Failed to create notification');
    }
  }

  /**
   * Create multiple notifications for multiple recipients
   */
  async createBulkNotifications(
    recipients: string[],
    data: Omit<CreateNotificationData, 'recipient'>
  ): Promise<INotification[]> {
    try {
      const notifications = recipients.map(recipientId => ({
        ...data,
        recipient: recipientId,
        priority: data.priority || 'MEDIUM',
        deliveryMethod: data.deliveryMethod || 'IN_APP'
      }));

      const createdNotifications = await Notification.insertMany(notifications);
      
      // Deliver immediate notifications
      const immediateNotifications = createdNotifications.filter(
        n => !n.scheduledFor || n.scheduledFor <= new Date()
      );

      for (const notification of immediateNotifications) {
        await this.deliverNotification(notification);
      }

      return createdNotifications;
    } catch (error) {
      console.error('Error creating bulk notifications:', error);
      throw new Error('Failed to create bulk notifications');
    }
  }

  /**
   * Get notifications for a user with filters and pagination
   */
  async getUserNotifications(
    userId: string,
    filters: NotificationFilters = {}
  ): Promise<{ notifications: INotification[]; pagination: any }> {
    try {
      const { page = 1, limit = 20 } = filters;
      
      const notifications = await Notification.getNotifications(userId, filters);
      const total = await Notification.countDocuments({ recipient: userId });
      
      return {
        notifications,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error getting user notifications:', error);
      throw new Error('Failed to get notifications');
    }
  }

  /**
   * Get notification statistics for a user
   */
  async getUserNotificationStats(userId: string): Promise<NotificationStats> {
    try {
      const [total, unread, byType, byCategory, byPriority] = await Promise.all([
        Notification.countDocuments({ recipient: userId }),
        Notification.getUnreadCount(userId),
        Notification.aggregate([
          { $match: { recipient: userId } },
          { $group: { _id: '$type', count: { $sum: 1 } } }
        ]),
        Notification.aggregate([
          { $match: { recipient: userId } },
          { $group: { _id: '$category', count: { $sum: 1 } } }
        ]),
        Notification.aggregate([
          { $match: { recipient: userId } },
          { $group: { _id: '$priority', count: { $sum: 1 } } }
        ])
      ]);

      return {
        total,
        unread,
        byType: byType.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
        byCategory: byCategory.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
        byPriority: byPriority.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {})
      };
    } catch (error) {
      console.error('Error getting notification stats:', error);
      throw new Error('Failed to get notification statistics');
    }
  }

  /**
   * Mark notifications as read
   */
  async markAsRead(userId: string, notificationIds?: string[]): Promise<{ message: string }> {
    try {
      await Notification.markAsRead(userId, notificationIds);
      return { message: 'Notifications marked as read' };
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      throw new Error('Failed to mark notifications as read');
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(userId: string, notificationId: string): Promise<{ message: string }> {
    try {
      const result = await Notification.findOneAndDelete({
        _id: notificationId,
        recipient: userId
      });

      if (!result) {
        throw new Error('Notification not found or access denied');
      }

      return { message: 'Notification deleted successfully' };
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw new Error('Failed to delete notification');
    }
  }

  /**
   * Deliver a notification based on its delivery method
   */
  private async deliverNotification(notification: INotification): Promise<void> {
    try {
      switch (notification.deliveryMethod) {
        case 'IN_APP':
          // In-app notifications are automatically delivered
          notification.delivered = true;
          notification.deliveredAt = new Date();
          break;
        
        case 'EMAIL':
          await this.sendEmailNotification(notification);
          break;
        
        case 'PUSH':
          await this.sendPushNotification(notification);
          break;
        
        case 'SMS':
          await this.sendSMSNotification(notification);
          break;
      }

      await notification.save();
    } catch (error) {
      console.error('Error delivering notification:', error);
      // Don't throw error to prevent notification creation from failing
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(notification: INotification): Promise<void> {
    try {
      const recipient = await User.findById(notification.recipient);
      if (!recipient?.email) return;

      // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
      console.log(`Sending email to ${recipient.email}: ${notification.title}`);
      
      notification.delivered = true;
      notification.deliveredAt = new Date();
    } catch (error) {
      console.error('Error sending email notification:', error);
    }
  }

  /**
   * Send push notification
   */
  private async sendPushNotification(notification: INotification): Promise<void> {
    try {
      // TODO: Integrate with push notification service (Firebase, OneSignal, etc.)
      console.log(`Sending push notification: ${notification.title}`);
      
      notification.delivered = true;
      notification.deliveredAt = new Date();
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }

  /**
   * Send SMS notification
   */
  private async sendSMSNotification(notification: INotification): Promise<void> {
    try {
      // TODO: Integrate with SMS service (Twilio, AWS SNS, etc.)
      console.log(`Sending SMS notification: ${notification.title}`);
      
      notification.delivered = true;
      notification.deliveredAt = new Date();
    } catch (error) {
      console.error('Error sending SMS notification:', error);
    }
  }

  /**
   * Create system notifications for common events
   */
  async createElectionNotification(
    electionId: string,
    type: 'CREATED' | 'UPDATED' | 'ACTIVATED' | 'COMPLETED' | 'CANCELLED',
    recipients: string[]
  ): Promise<void> {
    const election = await Election.findById(electionId);
    if (!election) return;

    const notificationData = {
      type: 'ELECTION' as const,
      category: 'INFO' as const,
      priority: 'MEDIUM' as const,
      title: `Election ${type.toLowerCase()}`,
      message: `Election "${election.title}" has been ${type.toLowerCase()}`,
      actionUrl: `/app/election/${electionId}`,
      actionText: 'View Election',
      metadata: { electionId, action: type }
    };

    await this.createBulkNotifications(recipients, notificationData);
  }

  async createVoterNotification(
    voterId: string,
    type: 'REGISTERED' | 'VERIFIED' | 'ACTIVATED' | 'SUSPENDED',
    recipients: string[]
  ): Promise<void> {
    const voter = await Voter.findById(voterId);
    if (!voter) return;

    const notificationData = {
      type: 'VOTER' as const,
      category: 'SUCCESS' as const,
      priority: 'MEDIUM' as const,
      title: `Voter ${type.toLowerCase()}`,
      message: `Voter ${voter.name} has been ${type.toLowerCase()}`,
      actionUrl: `/app/voter/${voterId}`,
      actionText: 'View Voter',
      metadata: { voterId, action: type }
    };

    await this.createBulkNotifications(recipients, notificationData);
  }

  async createSecurityNotification(
    userId: string,
    type: 'LOGIN_ATTEMPT' | 'PASSWORD_CHANGED' | 'ACCOUNT_LOCKED' | 'SUSPICIOUS_ACTIVITY',
    message: string
  ): Promise<void> {
    const notificationData = {
      recipient: userId,
      type: 'SECURITY' as const,
      category: 'WARNING' as const,
      priority: 'HIGH' as const,
      title: `Security Alert: ${type.replace('_', ' ')}`,
      message,
      actionUrl: '/app/settings',
      actionText: 'Review Settings'
    };

    await this.createNotification(notificationData);
  }

  /**
   * Clean up expired notifications
   */
  async cleanupExpiredNotifications(): Promise<{ deletedCount: number }> {
    try {
      const result = await Notification.deleteMany({
        expiresAt: { $lt: new Date() }
      });

      return { deletedCount: result.deletedCount || 0 };
    } catch (error) {
      console.error('Error cleaning up expired notifications:', error);
      throw new Error('Failed to cleanup expired notifications');
    }
  }

  /**
   * Process scheduled notifications
   */
  async processScheduledNotifications(): Promise<{ processedCount: number }> {
    try {
      const scheduledNotifications = await Notification.find({
        scheduledFor: { $lte: new Date() },
        delivered: false
      });

      let processedCount = 0;
      for (const notification of scheduledNotifications) {
        await this.deliverNotification(notification);
        processedCount++;
      }

      return { processedCount };
    } catch (error) {
      console.error('Error processing scheduled notifications:', error);
      throw new Error('Failed to process scheduled notifications');
    }
  }
}

export default new NotificationService();
