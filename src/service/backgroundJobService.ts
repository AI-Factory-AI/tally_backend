import notificationService from './notificationService';
import { Election } from '../model/Election';
import { Voter } from '../model/Voter';

class BackgroundJobService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private scheduledNotificationInterval: NodeJS.Timeout | null = null;
  private reminderInterval: NodeJS.Timeout | null = null;

  /**
   * Start all background jobs
   */
  start(): void {
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

    console.log('Background jobs started successfully');
  }

  /**
   * Stop all background jobs
   */
  stop(): void {
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
    
    console.log('Background jobs stopped successfully');
  }

  /**
   * Clean up expired notifications
   */
  private async cleanupExpiredNotifications(): Promise<void> {
    try {
      const result = await notificationService.cleanupExpiredNotifications();
      if (result.deletedCount > 0) {
        console.log(`Cleaned up ${result.deletedCount} expired notifications`);
      }
    } catch (error) {
      console.error('Error cleaning up expired notifications:', error);
    }
  }

  /**
   * Process scheduled notifications
   */
  private async processScheduledNotifications(): Promise<void> {
    try {
      const result = await notificationService.processScheduledNotifications();
      if (result.processedCount > 0) {
        console.log(`Processed ${result.processedCount} scheduled notifications`);
      }
    } catch (error) {
      console.error('Error processing scheduled notifications:', error);
    }
  }

  /**
   * Send reminder notifications for upcoming elections
   */
  private async sendReminderNotifications(): Promise<void> {
    try {
      const now = new Date();
      const reminderThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

      // Find elections starting within the next 24 hours
      const upcomingElections = await Election.find({
        status: 'SCHEDULED',
        startTime: { $gte: now, $lte: reminderThreshold }
      });

      for (const election of upcomingElections) {
        await this.sendElectionReminders(election);
      }

      // Find elections ending within the next 24 hours
      const endingElections = await Election.find({
        status: 'ACTIVE',
        endTime: { $gte: now, $lte: reminderThreshold }
      });

      for (const election of endingElections) {
        await this.sendElectionEndingReminders(election);
      }

      if (upcomingElections.length > 0 || endingElections.length > 0) {
        console.log(`Sent reminders for ${upcomingElections.length} upcoming and ${endingElections.length} ending elections`);
      }
    } catch (error) {
      console.error('Error sending reminder notifications:', error);
    }
  }

  /**
   * Send reminders for upcoming elections
   */
  private async sendElectionReminders(election: any): Promise<void> {
    try {
      // Get all voters for this election
      const voters = await Voter.find({ election: election._id, status: 'ACTIVE' });
      const voterIds = voters.map(v => v.userId).filter(Boolean);

      if (voterIds.length === 0) return;

      const timeUntilStart = new Date(election.startTime).getTime() - Date.now();
      const hoursUntilStart = Math.floor(timeUntilStart / (1000 * 60 * 60));

      let message: string;
      if (hoursUntilStart < 1) {
        message = `Election "${election.title}" starts in less than 1 hour!`;
      } else if (hoursUntilStart < 6) {
        message = `Election "${election.title}" starts in ${hoursUntilStart} hours!`;
      } else {
        message = `Election "${election.title}" starts tomorrow!`;
      }

      await notificationService.createBulkNotifications(voterIds, {
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
    } catch (error) {
      console.error(`Error sending election reminders for ${election._id}:`, error);
    }
  }

  /**
   * Send reminders for elections ending soon
   */
  private async sendElectionEndingReminders(election: any): Promise<void> {
    try {
      // Get all voters who haven't voted yet
      const voters = await Voter.find({ 
        election: election._id, 
        status: 'ACTIVE',
        hasVoted: { $ne: true }
      });
      const voterIds = voters.map(v => v.userId).filter(Boolean);

      if (voterIds.length === 0) return;

      const timeUntilEnd = new Date(election.endTime).getTime() - Date.now();
      const hoursUntilEnd = Math.floor(timeUntilEnd / (1000 * 60 * 60));

      let message: string;
      if (hoursUntilEnd < 1) {
        message = `Election "${election.title}" ends in less than 1 hour! Don't miss your chance to vote!`;
      } else if (hoursUntilEnd < 6) {
        message = `Election "${election.title}" ends in ${hoursUntilEnd} hours! Vote now before it's too late!`;
      } else {
        message = `Election "${election.title}" ends tomorrow! Make sure to cast your vote!`;
      }

      await notificationService.createBulkNotifications(voterIds, {
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
    } catch (error) {
      console.error(`Error sending election ending reminders for ${election._id}:`, error);
    }
  }

  /**
   * Send system maintenance notifications
   */
  async sendSystemMaintenanceNotification(
    message: string,
    scheduledFor?: Date,
    recipients: string[] = []
  ): Promise<void> {
    try {
      if (recipients.length === 0) {
        // If no specific recipients, send to all active users
        // This would require a User model query
        console.log('No recipients specified for system maintenance notification');
        return;
      }

      await notificationService.createBulkNotifications(recipients, {
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
    } catch (error) {
      console.error('Error sending system maintenance notification:', error);
    }
  }

  /**
   * Send bulk system notifications
   */
  async sendBulkSystemNotification(
    title: string,
    message: string,
    recipients: string[],
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' = 'MEDIUM',
    category: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'DESTRUCTIVE' = 'INFO'
  ): Promise<void> {
    try {
      await notificationService.createBulkNotifications(recipients, {
        type: 'SYSTEM',
        category,
        priority,
        title,
        message,
        actionUrl: '/app/dashboard',
        actionText: 'View Details'
      });

      console.log(`Bulk system notification sent to ${recipients.length} users`);
    } catch (error) {
      console.error('Error sending bulk system notification:', error);
    }
  }

  /**
   * Get job status
   */
  getStatus(): {
    isRunning: boolean;
    lastCleanup: Date | null;
    lastScheduledProcessing: Date | null;
    lastReminderProcessing: Date | null;
  } {
    return {
      isRunning: !!(this.cleanupInterval && this.scheduledNotificationInterval && this.reminderInterval),
      lastCleanup: null, // Could be enhanced to track actual execution times
      lastScheduledProcessing: null,
      lastReminderProcessing: null
    };
  }
}

export default new BackgroundJobService();
