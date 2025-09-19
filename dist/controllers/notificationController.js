"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthCheck = exports.markAllAsRead = exports.getUnreadCount = exports.createBulkNotifications = exports.createNotification = exports.deleteNotification = exports.markNotificationsAsRead = exports.getNotificationStats = exports.getUserNotifications = void 0;
const notificationService_1 = __importDefault(require("../service/notificationService"));
const User_1 = require("../model/User");
/**
 * Get user notifications with filters and pagination
 */
const getUserNotifications = async (req, res) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }
        const filters = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 20,
            read: req.query.read === 'true' ? true : req.query.read === 'false' ? false : undefined,
            type: req.query.type,
            category: req.query.category,
            priority: req.query.priority
        };
        const result = await notificationService_1.default.getUserNotifications(userId, filters);
        res.json({
            success: true,
            data: result
        });
    }
    catch (error) {
        console.error('Error getting user notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get notifications'
        });
    }
};
exports.getUserNotifications = getUserNotifications;
/**
 * Get notification statistics for a user
 */
const getNotificationStats = async (req, res) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }
        const stats = await notificationService_1.default.getUserNotificationStats(userId);
        res.json({
            success: true,
            data: stats
        });
    }
    catch (error) {
        console.error('Error getting notification stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get notification statistics'
        });
    }
};
exports.getNotificationStats = getNotificationStats;
/**
 * Mark notifications as read
 */
const markNotificationsAsRead = async (req, res) => {
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
        const result = await notificationService_1.default.markAsRead(userId, notificationIds);
        res.json({
            success: true,
            message: result.message
        });
    }
    catch (error) {
        console.error('Error marking notifications as read:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark notifications as read'
        });
    }
};
exports.markNotificationsAsRead = markNotificationsAsRead;
/**
 * Delete a notification
 */
const deleteNotification = async (req, res) => {
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
        const result = await notificationService_1.default.deleteNotification(userId, notificationId);
        res.json({
            success: true,
            message: result.message
        });
    }
    catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete notification'
        });
    }
};
exports.deleteNotification = deleteNotification;
/**
 * Create a notification (admin/system use)
 */
const createNotification = async (req, res) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }
        // Check if user has permission to create notifications
        const user = await User_1.User.findById(userId);
        if (!user || user.role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions to create notifications'
            });
        }
        const notificationData = req.body;
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
        const notification = await notificationService_1.default.createNotification(notificationData);
        res.status(201).json({
            success: true,
            message: 'Notification created successfully',
            data: notification
        });
    }
    catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create notification'
        });
    }
};
exports.createNotification = createNotification;
/**
 * Create bulk notifications (admin/system use)
 */
const createBulkNotifications = async (req, res) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }
        // Check if user has permission to create bulk notifications
        const user = await User_1.User.findById(userId);
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
        const notifications = await notificationService_1.default.createBulkNotifications(recipients, notificationData);
        res.status(201).json({
            success: true,
            message: `Successfully created ${notifications.length} notifications`,
            data: {
                count: notifications.length,
                notifications
            }
        });
    }
    catch (error) {
        console.error('Error creating bulk notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create bulk notifications'
        });
    }
};
exports.createBulkNotifications = createBulkNotifications;
/**
 * Get unread notification count
 */
const getUnreadCount = async (req, res) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }
        const count = await notificationService_1.default.getUserNotificationStats(userId);
        res.json({
            success: true,
            data: { unreadCount: count.unread }
        });
    }
    catch (error) {
        console.error('Error getting unread count:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get unread count'
        });
    }
};
exports.getUnreadCount = getUnreadCount;
/**
 * Mark all notifications as read for a user
 */
const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }
        const result = await notificationService_1.default.markAsRead(userId);
        res.json({
            success: true,
            message: result.message
        });
    }
    catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark all notifications as read'
        });
    }
};
exports.markAllAsRead = markAllAsRead;
/**
 * Health check endpoint for notifications
 */
const healthCheck = async (req, res) => {
    try {
        res.json({
            success: true,
            message: 'Notification service is healthy',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Notification service health check failed'
        });
    }
};
exports.healthCheck = healthCheck;
