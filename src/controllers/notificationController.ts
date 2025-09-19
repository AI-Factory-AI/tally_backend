import { Request, Response } from 'express';
import notificationService, { CreateNotificationData, NotificationFilters } from '../service/notificationService';
import User from '../model/User';

export interface AuthRequest extends Request {
  user?: {
    _id: string;
    email: string;
    name: string;
    role: string;
  };
}

/**
 * Get user notifications with filters and pagination
 */
export const getUserNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const filters: NotificationFilters = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      read: req.query.read === 'true' ? true : req.query.read === 'false' ? false : undefined,
      type: req.query.type as string,
      category: req.query.category as string,
      priority: req.query.priority as string
    };

    const result = await notificationService.getUserNotifications(userId, filters);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting user notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notifications'
    });
  }
};

/**
 * Get notification statistics for a user
 */
export const getNotificationStats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const stats = await notificationService.getUserNotificationStats(userId);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notification statistics'
    });
  }
};

/**
 * Mark notifications as read
 */
export const markNotificationsAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { notificationIds } = req.body;
    
    // Validate notificationIds if provided
    if (notificationIds && (!Array.isArray(notificationIds) || !notificationIds.every(id => typeof id === 'string'))) {
      return res.status(400).json({
        success: false,
        message: 'notificationIds must be an array of strings'
      });
    }

    const result = await notificationService.markAsRead(userId, notificationIds);
    
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read'
    });
  }
};

/**
 * Delete a notification
 */
export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { notificationId } = req.params;
    if (!notificationId) {
      return res.status(400).json({
        success: false,
        message: 'Notification ID is required'
      });
    }

    const result = await notificationService.deleteNotification(userId, notificationId);
    
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification'
    });
  }
};

/**
 * Create a notification (admin/system use)
 */
export const createNotification = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Check if user has permission to create notifications
    const user = await User.findById(userId);
    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to create notifications'
      });
    }

    const notificationData: CreateNotificationData = req.body;
    
    // Validate required fields
    if (!notificationData.recipient || !notificationData.title || !notificationData.message) {
      return res.status(400).json({
        success: false,
        message: 'Recipient, title, and message are required'
      });
    }

    // Validate enum values
    const validTypes = ['SYSTEM', 'ELECTION', 'VOTER', 'BALLOT', 'SECURITY', 'REMINDER'];
    const validCategories = ['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'DESTRUCTIVE'];
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
    const validDeliveryMethods = ['IN_APP', 'EMAIL', 'PUSH', 'SMS'];

    if (!validTypes.includes(notificationData.type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    if (!validCategories.includes(notificationData.category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${validCategories.join(', ')}`
      });
    }

    if (notificationData.priority && !validPriorities.includes(notificationData.priority)) {
      return res.status(400).json({
        success: false,
        message: `Invalid priority. Must be one of: ${validPriorities.join(', ')}`
      });
    }

    if (notificationData.deliveryMethod && !validDeliveryMethods.includes(notificationData.deliveryMethod)) {
      return res.status(400).json({
        success: false,
        message: `Invalid delivery method. Must be one of: ${validDeliveryMethods.join(', ')}`
      });
    }

    // Validate dates
    if (notificationData.scheduledFor) {
      const scheduledDate = new Date(notificationData.scheduledFor);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid scheduledFor date'
        });
      }
    }

    if (notificationData.expiresAt) {
      const expiresDate = new Date(notificationData.expiresAt);
      if (isNaN(expiresDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid expiresAt date'
        });
      }
    }

    const notification = await notificationService.createNotification(notificationData);
    
    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      data: notification
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create notification'
    });
  }
};

/**
 * Create bulk notifications (admin/system use)
 */
export const createBulkNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Check if user has permission to create bulk notifications
    const user = await User.findById(userId);
    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to create bulk notifications'
      });
    }

    const { recipients, notificationData } = req.body;
    
    // Validate required fields
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Recipients array is required and must not be empty'
      });
    }

    if (!notificationData || !notificationData.title || !notificationData.message) {
      return res.status(400).json({
        success: false,
        message: 'Notification data with title and message is required'
      });
    }

    // Validate recipient IDs
    if (!recipients.every(id => typeof id === 'string')) {
      return res.status(400).json({
        success: false,
        message: 'All recipient IDs must be strings'
      });
    }

    const notifications = await notificationService.createBulkNotifications(recipients, notificationData);
    
    res.status(201).json({
      success: true,
      message: `Successfully created ${notifications.length} notifications`,
      data: {
        count: notifications.length,
        notifications
      }
    });
  } catch (error) {
    console.error('Error creating bulk notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create bulk notifications'
    });
  }
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const count = await notificationService.getUserNotificationStats(userId);
    
    res.json({
      success: true,
      data: { unreadCount: count.unread }
    });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count'
    });
  }
};

/**
 * Mark all notifications as read for a user
 */
export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const result = await notificationService.markAsRead(userId);
    
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read'
    });
  }
};

/**
 * Health check endpoint for notifications
 */
export const healthCheck = async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      message: 'Notification service is healthy',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Notification service health check failed'
    });
  }
};
