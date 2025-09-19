import { Notification, INotification } from '../model/Notification';
import { User } from '../model/User';
import { Election } from '../model/Election';
import { Voter } from '../model/Voter';
import { Ballot } from '../model/Ballot';
import { Types } from 'mongoose';

export interface CreateNotificationData {
  recipient: string | Types.ObjectId;
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
        recipient: typeof data.recipient === 'string' ? new Types.ObjectId(data.recipient) : data.recipient,
        priority: data.priority || 'MEDIUM',
        deliveryMethod: data.deliveryMethod || 'IN_APP'
      });

      await notification.save();
      
      if (data.scheduledFor && data.scheduledFor > new Date()) {
        return notification.toObject() as INotification;
      }

      await this.deliverNotification(notification);
      
      return notification.toObject() as INotification;
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
        recipient: new Types.ObjectId(recipientId),
        priority: data.priority || 'MEDIUM',
        deliveryMethod: data.deliveryMethod || 'IN_APP'
      }));

      const createdDocs = await Notification.insertMany(notifications);
      
      const createdNotifications = createdDocs.map(doc => doc.toObject() as INotification);
      
      const immediateDocs = createdDocs.filter(
        n => !n.scheduledFor || n.scheduledFor <= new Date()
      );

      for (const notificationDoc of immediateDocs) {
        await this.deliverNotification(notificationDoc as INotification);
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
      const { page = 1, limit = 20, read, type, category, priority } = filters;
      const userObjectId = new Types.ObjectId(userId);

      const query: Record<string, any> = { recipient: userObjectId };
      if (typeof read === 'boolean') query.read = read;
      if (type) query.type = type;
      if (category) query.category = category;
      if (priority) query.priority = priority;

      const [notifications, total] = await Promise.all([
        Notification.find(query)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean<INotification[]>(),
        Notification.countDocuments({ recipient: userObjectId })
      ]);
      
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
      const userObjectId = new Types.ObjectId(userId);
      const [total, unread, byType, byCategory, byPriority] = await Promise.all([
        Notification.countDocuments({ recipient: userObjectId }),
        Notification.countDocuments({ recipient: userObjectId, read: false }),
        Notification.aggregate([
          { $match: { recipient: userObjectId } },
          { $group: { _id: '$type', count: { $sum: 1 } } }
        ]),
        Notification.aggregate([
          { $match: { recipient: userObjectId } },
          { $group: { _id: '$category', count: { $sum: 1 } } }
        ]),
        Notification.aggregate([
          { $match: { recipient: userObjectId } },
          { $group: { _id: '$priority', count: { $sum: 1 } } }
        ])
      ]);

      return {
        total,
        unread,
        byType: byType.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {} as Record<string, number>),
        byCategory: byCategory.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {} as Record<string, number>),
        byPriority: byPriority.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {} as Record<string, number>)
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
      const filter: Record<string, any> = {
        recipient: new Types.ObjectId(userId)
      };
      if (notificationIds && notificationIds.length > 0) {
        filter._id = { $in: notificationIds.map(id => new Types.ObjectId(id)) };
      }

      await Notification.updateMany(filter, { $set: { read: true, readAt: new Date() } });
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
        recipient: new Types.ObjectId(userId)
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
  private async deliverNotification(notification: INotification | (INotification & { toObject?: () => INotification })) : Promise<void> {
    try {
      const n: any = typeof (notification as any).toObject === 'function' ? (notification as any).toObject() : notification;

      switch (n.deliveryMethod) {
        case 'IN_APP':
          n.delivered = true;
          n.deliveredAt = new Date();
          break;
        case 'EMAIL':
          await this.sendEmailNotification(n as INotification);
          break;
        case 'PUSH':
          await this.sendPushNotification(n as INotification);
          break;
        case 'SMS':
          await this.sendSMSNotification(n as INotification);
          break;
      }

      await Notification.updateOne({ _id: (n as any)._id }, { $set: { delivered: n.delivered, deliveredAt: n.deliveredAt } });
    } catch (error) {
      console.error('Error delivering notification:', error);
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(notification: INotification): Promise<void> {
    try {
      const recipient = await User.findById(notification.recipient);
      if (!recipient?.email) return;

      console.log(`Sending email to ${recipient.email}: ${notification.title}`);
      
      await Notification.updateOne({ _id: (notification as any)._id }, { $set: { delivered: true, deliveredAt: new Date() } });
    } catch (error) {
      console.error('Error sending email notification:', error);
    }
  }

  /**
   * Send push notification
   */
  private async sendPushNotification(notification: INotification): Promise<void> {
    try {
      console.log(`Sending push notification: ${notification.title}`);
      await Notification.updateOne({ _id: (notification as any)._id }, { $set: { delivered: true, deliveredAt: new Date() } });
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }

  /**
   * Send SMS notification
   */
  private async sendSMSNotification(notification: INotification): Promise<void> {
    try {
      console.log(`Sending SMS notification: ${notification.title}`);
      await Notification.updateOne({ _id: (notification as any)._id }, { $set: { delivered: true, deliveredAt: new Date() } });
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
      message: `Election \"${election.title}\" has been ${type.toLowerCase()}`,
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
