import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getUserNotifications,
  getNotificationStats,
  markNotificationsAsRead,
  markAllAsRead,
  deleteNotification,
  createNotification,
  createBulkNotifications,
  getUnreadCount,
  healthCheck
} from '../controllers/notificationController';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Health check (public)
router.get('/health', healthCheck);

// User notification routes
router.get('/user', getUserNotifications);
router.get('/user/stats', getNotificationStats);
router.get('/user/unread-count', getUnreadCount);
router.post('/user/mark-read', markNotificationsAsRead);
router.post('/user/mark-all-read', markAllAsRead);
router.delete('/user/:notificationId', deleteNotification);

// Admin routes (require admin role)
router.post('/admin/create', createNotification);
router.post('/admin/bulk-create', createBulkNotifications);

export default router;
