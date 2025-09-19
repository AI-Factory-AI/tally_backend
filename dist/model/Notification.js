"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notification = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const notificationSchema = new mongoose_1.Schema({
    recipient: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    sender: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    type: {
        type: String,
        enum: ['SYSTEM', 'ELECTION', 'VOTER', 'BALLOT', 'SECURITY', 'REMINDER'],
        required: true,
        index: true
    },
    category: {
        type: String,
        enum: ['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'DESTRUCTIVE'],
        required: true,
        index: true
    },
    priority: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        default: 'MEDIUM',
        index: true
    },
    title: {
        type: String,
        required: true,
        maxlength: 100
    },
    message: {
        type: String,
        required: true,
        maxlength: 500
    },
    description: {
        type: String,
        maxlength: 1000
    },
    actionUrl: {
        type: String,
        maxlength: 500
    },
    actionText: {
        type: String,
        maxlength: 50
    },
    metadata: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {}
    },
    read: {
        type: Boolean,
        default: false,
        index: true
    },
    delivered: {
        type: Boolean,
        default: false,
        index: true
    },
    deliveryMethod: {
        type: String,
        enum: ['IN_APP', 'EMAIL', 'PUSH', 'SMS'],
        default: 'IN_APP',
        index: true
    },
    scheduledFor: {
        type: Date,
        index: true
    },
    expiresAt: {
        type: Date,
        index: true
    },
    readAt: {
        type: Date
    },
    deliveredAt: {
        type: Date
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});
// Indexes for efficient querying
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, priority: 1, createdAt: -1 });
notificationSchema.index({ scheduledFor: 1, delivered: 1 });
notificationSchema.index({ expiresAt: 1, createdAt: 1 });
// Virtual for time ago
notificationSchema.virtual('timeAgo').get(function () {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - this.createdAt.getTime()) / 1000);
    if (diffInSeconds < 60)
        return 'Just now';
    if (diffInSeconds < 3600)
        return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400)
        return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 2592000)
        return `${Math.floor(diffInSeconds / 86400)} days ago`;
    return `${Math.floor(diffInSeconds / 2592000)} months ago`;
});
// Pre-save middleware to handle scheduling
notificationSchema.pre('save', function (next) {
    if (this.scheduledFor && this.scheduledFor > new Date()) {
        this.delivered = false;
    }
    next();
});
// Static method to get unread count
notificationSchema.statics.getUnreadCount = function (recipientId) {
    return this.countDocuments({
        recipient: recipientId,
        read: false,
        $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: { $gt: new Date() } }
        ]
    });
};
// Static method to mark notifications as read
notificationSchema.statics.markAsRead = function (recipientId, notificationIds) {
    const query = { recipient: recipientId, read: false };
    if (notificationIds && notificationIds.length > 0) {
        query._id = { $in: notificationIds };
    }
    return this.updateMany(query, {
        read: true,
        readAt: new Date()
    });
};
// Static method to get notifications with pagination
notificationSchema.statics.getNotifications = function (recipientId, options = {}) {
    const { page = 1, limit = 20, read, type, category, priority } = options;
    const skip = (page - 1) * limit;
    const query = { recipient: recipientId };
    if (read !== undefined)
        query.read = read;
    if (type)
        query.type = type;
    if (category)
        query.category = category;
    if (priority)
        query.priority = priority;
    // Don't show expired notifications
    query.$or = [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
    ];
    return this.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sender', 'name email')
        .lean();
};
exports.Notification = mongoose_1.default.model('Notification', notificationSchema);
exports.default = exports.Notification;
