"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Notification_1 = require("../model/Notification");
const User_1 = require("../model/User");
const Election_1 = require("../model/Election");
const Voter_1 = require("../model/Voter");
const mongoose_1 = require("mongoose");
class NotificationService {
    /**
     * Create a single notification
     */
    async createNotification(data) {
        try {
            const notification = new Notification_1.Notification({
                ...data,
                recipient: typeof data.recipient === 'string' ? new mongoose_1.Types.ObjectId(data.recipient) : data.recipient,
                priority: data.priority || 'MEDIUM',
                deliveryMethod: data.deliveryMethod || 'IN_APP'
            });
            await notification.save();
            if (data.scheduledFor && data.scheduledFor > new Date()) {
                return notification.toObject();
            }
            await this.deliverNotification(notification);
            return notification.toObject();
        }
        catch (error) {
            console.error('Error creating notification:', error);
            throw new Error('Failed to create notification');
        }
    }
    /**
     * Create multiple notifications for multiple recipients
     */
    async createBulkNotifications(recipients, data) {
        try {
            const notifications = recipients.map(recipientId => ({
                ...data,
                recipient: new mongoose_1.Types.ObjectId(recipientId),
                priority: data.priority || 'MEDIUM',
                deliveryMethod: data.deliveryMethod || 'IN_APP'
            }));
            const createdDocs = await Notification_1.Notification.insertMany(notifications);
            const createdNotifications = createdDocs.map(doc => doc.toObject());
            const immediateDocs = createdDocs.filter(n => !n.scheduledFor || n.scheduledFor <= new Date());
            for (const notificationDoc of immediateDocs) {
                await this.deliverNotification(notificationDoc);
            }
            return createdNotifications;
        }
        catch (error) {
            console.error('Error creating bulk notifications:', error);
            throw new Error('Failed to create bulk notifications');
        }
    }
    /**
     * Get notifications for a user with filters and pagination
     */
    async getUserNotifications(userId, filters = {}) {
        try {
            const { page = 1, limit = 20, read, type, category, priority } = filters;
            const userObjectId = new mongoose_1.Types.ObjectId(userId);
            const query = { recipient: userObjectId };
            if (typeof read === 'boolean')
                query.read = read;
            if (type)
                query.type = type;
            if (category)
                query.category = category;
            if (priority)
                query.priority = priority;
            const [notifications, total] = await Promise.all([
                Notification_1.Notification.find(query)
                    .sort({ createdAt: -1 })
                    .skip((page - 1) * limit)
                    .limit(limit)
                    .lean(),
                Notification_1.Notification.countDocuments({ recipient: userObjectId })
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
        }
        catch (error) {
            console.error('Error getting user notifications:', error);
            throw new Error('Failed to get notifications');
        }
    }
    /**
     * Get notification statistics for a user
     */
    async getUserNotificationStats(userId) {
        try {
            const userObjectId = new mongoose_1.Types.ObjectId(userId);
            const [total, unread, byType, byCategory, byPriority] = await Promise.all([
                Notification_1.Notification.countDocuments({ recipient: userObjectId }),
                Notification_1.Notification.countDocuments({ recipient: userObjectId, read: false }),
                Notification_1.Notification.aggregate([
                    { $match: { recipient: userObjectId } },
                    { $group: { _id: '$type', count: { $sum: 1 } } }
                ]),
                Notification_1.Notification.aggregate([
                    { $match: { recipient: userObjectId } },
                    { $group: { _id: '$category', count: { $sum: 1 } } }
                ]),
                Notification_1.Notification.aggregate([
                    { $match: { recipient: userObjectId } },
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
        }
        catch (error) {
            console.error('Error getting notification stats:', error);
            throw new Error('Failed to get notification statistics');
        }
    }
    /**
     * Mark notifications as read
     */
    async markAsRead(userId, notificationIds) {
        try {
            const filter = {
                recipient: new mongoose_1.Types.ObjectId(userId)
            };
            if (notificationIds && notificationIds.length > 0) {
                filter._id = { $in: notificationIds.map(id => new mongoose_1.Types.ObjectId(id)) };
            }
            await Notification_1.Notification.updateMany(filter, { $set: { read: true, readAt: new Date() } });
            return { message: 'Notifications marked as read' };
        }
        catch (error) {
            console.error('Error marking notifications as read:', error);
            throw new Error('Failed to mark notifications as read');
        }
    }
    /**
     * Delete a notification
     */
    async deleteNotification(userId, notificationId) {
        try {
            const result = await Notification_1.Notification.findOneAndDelete({
                _id: notificationId,
                recipient: new mongoose_1.Types.ObjectId(userId)
            });
            if (!result) {
                throw new Error('Notification not found or access denied');
            }
            return { message: 'Notification deleted successfully' };
        }
        catch (error) {
            console.error('Error deleting notification:', error);
            throw new Error('Failed to delete notification');
        }
    }
    /**
     * Deliver a notification based on its delivery method
     */
    async deliverNotification(notification) {
        try {
            const n = typeof notification.toObject === 'function' ? notification.toObject() : notification;
            switch (n.deliveryMethod) {
                case 'IN_APP':
                    n.delivered = true;
                    n.deliveredAt = new Date();
                    break;
                case 'EMAIL':
                    await this.sendEmailNotification(n);
                    break;
                case 'PUSH':
                    await this.sendPushNotification(n);
                    break;
                case 'SMS':
                    await this.sendSMSNotification(n);
                    break;
            }
            await Notification_1.Notification.updateOne({ _id: n._id }, { $set: { delivered: n.delivered, deliveredAt: n.deliveredAt } });
        }
        catch (error) {
            console.error('Error delivering notification:', error);
        }
    }
    /**
     * Send email notification
     */
    async sendEmailNotification(notification) {
        try {
            const recipient = await User_1.User.findById(notification.recipient);
            if (!recipient?.email)
                return;
            console.log(`Sending email to ${recipient.email}: ${notification.title}`);
            await Notification_1.Notification.updateOne({ _id: notification._id }, { $set: { delivered: true, deliveredAt: new Date() } });
        }
        catch (error) {
            console.error('Error sending email notification:', error);
        }
    }
    /**
     * Send push notification
     */
    async sendPushNotification(notification) {
        try {
            console.log(`Sending push notification: ${notification.title}`);
            await Notification_1.Notification.updateOne({ _id: notification._id }, { $set: { delivered: true, deliveredAt: new Date() } });
        }
        catch (error) {
            console.error('Error sending push notification:', error);
        }
    }
    /**
     * Send SMS notification
     */
    async sendSMSNotification(notification) {
        try {
            console.log(`Sending SMS notification: ${notification.title}`);
            await Notification_1.Notification.updateOne({ _id: notification._id }, { $set: { delivered: true, deliveredAt: new Date() } });
        }
        catch (error) {
            console.error('Error sending SMS notification:', error);
        }
    }
    /**
     * Create system notifications for common events
     */
    async createElectionNotification(electionId, type, recipients) {
        const election = await Election_1.Election.findById(electionId);
        if (!election)
            return;
        const notificationData = {
            type: 'ELECTION',
            category: 'INFO',
            priority: 'MEDIUM',
            title: `Election ${type.toLowerCase()}`,
            message: `Election \"${election.title}\" has been ${type.toLowerCase()}`,
            actionUrl: `/app/election/${electionId}`,
            actionText: 'View Election',
            metadata: { electionId, action: type }
        };
        await this.createBulkNotifications(recipients, notificationData);
    }
    async createVoterNotification(voterId, type, recipients) {
        const voter = await Voter_1.Voter.findById(voterId);
        if (!voter)
            return;
        const notificationData = {
            type: 'VOTER',
            category: 'SUCCESS',
            priority: 'MEDIUM',
            title: `Voter ${type.toLowerCase()}`,
            message: `Voter ${voter.name} has been ${type.toLowerCase()}`,
            actionUrl: `/app/voter/${voterId}`,
            actionText: 'View Voter',
            metadata: { voterId, action: type }
        };
        await this.createBulkNotifications(recipients, notificationData);
    }
    async createSecurityNotification(userId, type, message) {
        const notificationData = {
            recipient: userId,
            type: 'SECURITY',
            category: 'WARNING',
            priority: 'HIGH',
            title: `Security Alert: ${type.replace('_', ' ')}`,
            message,
            actionUrl: '/app/settings',
            actionText: 'Review Settings'
        };
        await this.createNotification(notificationData);
    }
    async cleanupExpiredNotifications() {
        try {
            const result = await Notification_1.Notification.deleteMany({
                expiresAt: { $lt: new Date() }
            });
            return { deletedCount: result.deletedCount || 0 };
        }
        catch (error) {
            console.error('Error cleaning up expired notifications:', error);
            throw new Error('Failed to cleanup expired notifications');
        }
    }
    async processScheduledNotifications() {
        try {
            const scheduledNotifications = await Notification_1.Notification.find({
                scheduledFor: { $lte: new Date() },
                delivered: false
            });
            let processedCount = 0;
            for (const notification of scheduledNotifications) {
                await this.deliverNotification(notification);
                processedCount++;
            }
            return { processedCount };
        }
        catch (error) {
            console.error('Error processing scheduled notifications:', error);
            throw new Error('Failed to process scheduled notifications');
        }
    }
}
exports.default = new NotificationService();
