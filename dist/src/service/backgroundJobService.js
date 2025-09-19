"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const notificationService_1 = __importDefault(require("./notificationService"));
const Election_1 = __importDefault(require("../model/Election"));
const Voter_1 = __importDefault(require("../model/Voter"));
class BackgroundJobService {
    constructor() {
        this.cleanupInterval = null;
        this.scheduledNotificationInterval = null;
        this.reminderInterval = null;
        this.electionActivationInterval = null;
    }
    /**
     * Start all background jobs
     */
    start() {
        console.log('Starting background jobs...');
        // Clean up expired notifications every hour
        this.cleanupInterval = setInterval(async () => {
            await this.cleanupExpiredNotifications();
        }, 60 * 60 * 1000);
        // Process scheduled notifications every 5 minutes
        this.scheduledNotificationInterval = setInterval(async () => {
            await this.processScheduledNotifications();
        }, 5 * 60 * 1000);
        // Send reminder notifications every 6 hours
        this.reminderInterval = setInterval(async () => {
            await this.sendReminderNotifications();
        }, 6 * 60 * 60 * 1000);
        // Check for elections to activate every minute
        this.electionActivationInterval = setInterval(async () => {
            await this.activateElections();
        }, 60 * 1000);
        console.log('Background jobs started successfully');
    }
    /**
     * Stop all background jobs
     */
    stop() {
        console.log('Stopping background jobs...');
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        if (this.scheduledNotificationInterval) {
            clearInterval(this.scheduledNotificationInterval);
            this.scheduledNotificationInterval = null;
        }
        if (this.reminderInterval) {
            clearInterval(this.reminderInterval);
            this.reminderInterval = null;
        }
        if (this.electionActivationInterval) {
            clearInterval(this.electionActivationInterval);
            this.electionActivationInterval = null;
        }
        console.log('Background jobs stopped successfully');
    }
    /**
     * Clean up expired notifications
     */
    async cleanupExpiredNotifications() {
        try {
            const result = await notificationService_1.default.cleanupExpiredNotifications();
            if (result.deletedCount > 0) {
                console.log(`Cleaned up ${result.deletedCount} expired notifications`);
            }
        }
        catch (error) {
            console.error('Error cleaning up expired notifications:', error);
        }
    }
    /**
     * Process scheduled notifications
     */
    async processScheduledNotifications() {
        try {
            const result = await notificationService_1.default.processScheduledNotifications();
            if (result.processedCount > 0) {
                console.log(`Processed ${result.processedCount} scheduled notifications`);
            }
        }
        catch (error) {
            console.error('Error processing scheduled notifications:', error);
        }
    }
    /**
     * Send reminder notifications for upcoming elections
     */
    async sendReminderNotifications() {
        try {
            const now = new Date();
            const reminderThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
            // Find elections starting within the next 24 hours
            const upcomingElections = await Election_1.default.find({
                status: 'SCHEDULED',
                startTime: { $gte: now, $lte: reminderThreshold }
            });
            for (const election of upcomingElections) {
                await this.sendElectionReminders(election);
            }
            // Find elections ending within the next 24 hours
            const endingElections = await Election_1.default.find({
                status: 'ACTIVE',
                endTime: { $gte: now, $lte: reminderThreshold }
            });
            for (const election of endingElections) {
                await this.sendElectionEndingReminders(election);
            }
            if (upcomingElections.length > 0 || endingElections.length > 0) {
                console.log(`Sent reminders for ${upcomingElections.length} upcoming and ${endingElections.length} ending elections`);
            }
        }
        catch (error) {
            console.error('Error sending reminder notifications:', error);
        }
    }
    /**
     * Send reminders for upcoming elections
     */
    async sendElectionReminders(election) {
        try {
            // Get all voters for this election
            const voters = await Voter_1.default.find({ election: election._id, status: 'ACTIVE' });
            const voterIds = voters.map((v) => v.userId).filter(Boolean);
            if (voterIds.length === 0)
                return;
            const timeUntilStart = new Date(election.startTime).getTime() - Date.now();
            const hoursUntilStart = Math.floor(timeUntilStart / (1000 * 60 * 60));
            let message;
            if (hoursUntilStart < 1) {
                message = `Election "${election.title}" starts in less than 1 hour!`;
            }
            else if (hoursUntilStart < 6) {
                message = `Election "${election.title}" starts in ${hoursUntilStart} hours!`;
            }
            else {
                message = `Election "${election.title}" starts tomorrow!`;
            }
            await notificationService_1.default.createBulkNotifications(voterIds, {
                type: 'REMINDER',
                category: 'INFO',
                priority: 'MEDIUM',
                title: 'Election Reminder',
                message,
                actionUrl: `/vote/${election._id}`,
                actionText: 'Vote Now',
                metadata: {
                    electionId: election._id,
                    reminderType: 'START'
                }
            });
        }
        catch (error) {
            console.error(`Error sending election reminders for ${election._id}:`, error);
        }
    }
    /**
     * Activate elections that have reached their start time
     */
    async activateElections() {
        try {
            const now = new Date();
            // Find elections that should be activated (SCHEDULED status and start time has passed)
            const electionsToActivate = await Election_1.default.find({
                status: 'SCHEDULED',
                startTime: { $lte: now }
            });
            if (electionsToActivate.length > 0) {
                console.log(`Found ${electionsToActivate.length} elections to activate`);
                for (const election of electionsToActivate) {
                    try {
                        // Update election status to ACTIVE
                        election.status = 'ACTIVE';
                        election.startedAt = new Date();
                        await election.save();
                        console.log(`Election "${election.title}" (${election._id}) activated at ${election.startedAt}`);
                        // Send notification to election creator about activation
                        await this.sendElectionActivationNotification(election);
                    }
                    catch (error) {
                        console.error(`Error activating election ${election._id}:`, error);
                    }
                }
            }
        }
        catch (error) {
            console.error('Error in election activation job:', error);
        }
    }
    /**
     * Send notification when election is activated
     */
    async sendElectionActivationNotification(election) {
        try {
            // Get all voters for this election
            const voters = await Voter_1.default.find({ election: election._id, status: 'ACTIVE' });
            const voterIds = voters.map((v) => v.userId).filter(Boolean);
            if (voterIds.length > 0) {
                await notificationService_1.default.createBulkNotifications(voterIds, {
                    type: 'ELECTION',
                    category: 'SUCCESS',
                    priority: 'HIGH',
                    title: 'Election Started!',
                    message: `Election "${election.title}" is now active and you can vote!`,
                    actionUrl: `/vote/${election._id}`,
                    actionText: 'Vote Now',
                    metadata: {
                        electionId: election._id,
                        notificationType: 'ELECTION_ACTIVATED'
                    }
                });
                console.log(`Sent activation notifications to ${voterIds.length} voters for election ${election._id}`);
            }
        }
        catch (error) {
            console.error(`Error sending activation notifications for election ${election._id}:`, error);
        }
    }
    /**
     * Send reminders for elections ending soon
     */
    async sendElectionEndingReminders(election) {
        try {
            // Get all voters who haven't voted yet
            const voters = await Voter_1.default.find({
                election: election._id,
                status: 'ACTIVE',
                hasVoted: { $ne: true }
            });
            const voterIds = voters.map((v) => v.userId).filter(Boolean);
            if (voterIds.length === 0)
                return;
            const timeUntilEnd = new Date(election.endTime).getTime() - Date.now();
            const hoursUntilEnd = Math.floor(timeUntilEnd / (1000 * 60 * 60));
            let message;
            if (hoursUntilEnd < 1) {
                message = `Election "${election.title}" ends in less than 1 hour! Don't miss your chance to vote!`;
            }
            else if (hoursUntilEnd < 6) {
                message = `Election "${election.title}" ends in ${hoursUntilEnd} hours! Vote now before it's too late!`;
            }
            else {
                message = `Election "${election.title}" ends tomorrow! Make sure to cast your vote!`;
            }
            await notificationService_1.default.createBulkNotifications(voterIds, {
                type: 'REMINDER',
                category: 'WARNING',
                priority: 'HIGH',
                title: 'Election Ending Soon',
                message,
                actionUrl: `/vote/${election._id}`,
                actionText: 'Vote Now',
                metadata: {
                    electionId: election._id,
                    reminderType: 'END'
                }
            });
        }
        catch (error) {
            console.error(`Error sending election ending reminders for ${election._id}:`, error);
        }
    }
    /**
     * Send system maintenance notifications
     */
    async sendSystemMaintenanceNotification(message, scheduledFor, recipients = []) {
        try {
            if (recipients.length === 0) {
                // If no specific recipients, send to all active users
                // This would require a User model query
                console.log('No recipients specified for system maintenance notification');
                return;
            }
            await notificationService_1.default.createBulkNotifications(recipients, {
                type: 'SYSTEM',
                category: 'INFO',
                priority: 'MEDIUM',
                title: 'System Maintenance',
                message,
                actionUrl: '/app/dashboard',
                actionText: 'View Status',
                scheduledFor,
                metadata: {
                    maintenanceType: 'SYSTEM',
                    scheduled: !!scheduledFor
                }
            });
            console.log(`System maintenance notification sent to ${recipients.length} users`);
        }
        catch (error) {
            console.error('Error sending system maintenance notification:', error);
        }
    }
    /**
     * Send bulk system notifications
     */
    async sendBulkSystemNotification(title, message, recipients, priority = 'MEDIUM', category = 'INFO') {
        try {
            await notificationService_1.default.createBulkNotifications(recipients, {
                type: 'SYSTEM',
                category,
                priority,
                title,
                message,
                actionUrl: '/app/dashboard',
                actionText: 'View Details'
            });
            console.log(`Bulk system notification sent to ${recipients.length} users`);
        }
        catch (error) {
            console.error('Error sending bulk system notification:', error);
        }
    }
    /**
     * Get job status
     */
    getStatus() {
        return {
            isRunning: !!(this.cleanupInterval && this.scheduledNotificationInterval && this.reminderInterval),
            lastCleanup: null, // Could be enhanced to track actual execution times
            lastScheduledProcessing: null,
            lastReminderProcessing: null
        };
    }
}
exports.default = new BackgroundJobService();
