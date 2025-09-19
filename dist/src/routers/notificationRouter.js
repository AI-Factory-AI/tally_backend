"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const notificationController_1 = require("../controllers/notificationController");
const router = express_1.default.Router();
// Apply authentication middleware to all routes
router.use(auth_1.authenticateToken);
// Health check (public)
router.get('/health', notificationController_1.healthCheck);
// User notification routes
router.get('/user', notificationController_1.getUserNotifications);
router.get('/user/stats', notificationController_1.getNotificationStats);
router.get('/user/unread-count', notificationController_1.getUnreadCount);
router.post('/user/mark-read', notificationController_1.markNotificationsAsRead);
router.post('/user/mark-all-read', notificationController_1.markAllAsRead);
router.delete('/user/:notificationId', notificationController_1.deleteNotification);
// Admin routes (require admin role)
router.post('/admin/create', notificationController_1.createNotification);
router.post('/admin/bulk-create', notificationController_1.createBulkNotifications);
exports.default = router;
