import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  recipient: mongoose.Types.ObjectId;
  sender?: mongoose.Types.ObjectId;
  type: 'SYSTEM' | 'ELECTION' | 'VOTER' | 'BALLOT' | 'SECURITY' | 'REMINDER';
  category: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'DESTRUCTIVE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  title: string;
  message: string;
  description?: string;
  actionUrl?: string;
  actionText?: string;
  metadata?: Record<string, any>;
  read: boolean;
  delivered: boolean;
  deliveryMethod: 'IN_APP' | 'EMAIL' | 'PUSH' | 'SMS';
  scheduledFor?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  readAt?: Date;
  deliveredAt?: Date;
}

const notificationSchema = new Schema<INotification>({
  recipient: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sender: {
    type: Schema.Types.ObjectId,
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
    type: Schema.Types.Mixed,
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
notificationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - this.createdAt.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  return `${Math.floor(diffInSeconds / 2592000)} months ago`;
});

// Pre-save middleware to handle scheduling
notificationSchema.pre('save', function(next) {
  if (this.scheduledFor && this.scheduledFor > new Date()) {
    this.delivered = false;
  }
  next();
});

// Static method to get unread count
notificationSchema.statics.getUnreadCount = function(recipientId: string) {
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
notificationSchema.statics.markAsRead = function(recipientId: string, notificationIds?: string[]) {
  const query: any = { recipient: recipientId, read: false };
  if (notificationIds && notificationIds.length > 0) {
    query._id = { $in: notificationIds };
  }
  
  return this.updateMany(query, {
    read: true,
    readAt: new Date()
  });
};

// Static method to get notifications with pagination
notificationSchema.statics.getNotifications = function(
  recipientId: string,
  options: {
    page?: number;
    limit?: number;
    read?: boolean;
    type?: string;
    category?: string;
    priority?: string;
  } = {}
) {
  const { page = 1, limit = 20, read, type, category, priority } = options;
  const skip = (page - 1) * limit;
  
  const query: any = { recipient: recipientId };
  if (read !== undefined) query.read = read;
  if (type) query.type = type;
  if (category) query.category = category;
  if (priority) query.priority = priority;
  
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

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
export default Notification;
