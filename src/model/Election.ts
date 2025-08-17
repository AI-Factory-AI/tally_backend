import mongoose, { Document, Schema } from 'mongoose';

export interface IElection extends Document {
  creator: mongoose.Types.ObjectId;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  maxVotersCount: number;
  loginInstructions: string;
  voteConfirmation: string;
  afterElectionMessage: string;
  realTimeResults: boolean;
  resultsReleaseTime?: Date;
  status: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  blockchainAddress?: string;
  blockchainTxHash?: string;
  previewUrl: string;
  liveUrl?: string;
  ballotConfig?: {
    questions: Array<{
      question: string;
      type: 'single' | 'multiple' | 'text';
      options?: string[];
      required: boolean;
    }>;
  };
  voterSettings?: {
    allowAnonymous: boolean;
    requireVerification: boolean;
    maxVotesPerVoter: number;
  };
  metadata?: {
    tags: string[];
    category: string;
    institution?: string;
    isPublic: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
  deployedAt?: Date;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
}

const ElectionSchema = new Schema<IElection>({
  creator: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  timezone: {
    type: String,
    required: true,
    default: 'UTC'
  },
  maxVotersCount: {
    type: Number,
    required: true,
    min: 1,
    max: 1000000
  },
  loginInstructions: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  voteConfirmation: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  afterElectionMessage: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  realTimeResults: {
    type: Boolean,
    default: false
  },
  resultsReleaseTime: {
    type: Date
  },
  status: {
    type: String,
    enum: ['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
    default: 'DRAFT',
    index: true
  },
  blockchainAddress: {
    type: String,
    sparse: true
  },
  blockchainTxHash: {
    type: String
  },
  previewUrl: {
    type: String,
    required: false, // Not required for now
    unique: false // Temporarily not unique to avoid conflicts
  },
  liveUrl: {
    type: String,
    sparse: true
  },
  ballotConfig: {
    questions: [{
      question: {
        type: String,
        required: true,
        maxlength: 500
      },
      type: {
        type: String,
        enum: ['single', 'multiple', 'text'],
        required: true
      },
      options: [String],
      required: {
        type: Boolean,
        default: true
      }
    }]
  },
  voterSettings: {
    allowAnonymous: {
      type: Boolean,
      default: false
    },
    requireVerification: {
      type: Boolean,
      default: true
    },
    maxVotesPerVoter: {
      type: Number,
      default: 1
    }
  },
  metadata: {
    tags: [String],
    category: {
      type: String,
      default: 'General'
    },
    institution: String,
    isPublic: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
ElectionSchema.index({ creator: 1, status: 1 });
ElectionSchema.index({ status: 1, startTime: 1 });
ElectionSchema.index({ status: 1, endTime: 1 });
ElectionSchema.index({ 'metadata.isPublic': 1, status: 1 });

// Virtual for election duration
ElectionSchema.virtual('duration').get(function() {
  if (this.startTime && this.endTime) {
    return this.endTime.getTime() - this.startTime.getTime();
  }
  return 0;
});

// Virtual for isActive
ElectionSchema.virtual('isActive').get(function() {
  if (this.status !== 'ACTIVE') return false;
  const now = new Date();
  return now >= this.startTime && now <= this.endTime;
});

// Virtual for isUpcoming
ElectionSchema.virtual('isUpcoming').get(function() {
  if (this.status !== 'SCHEDULED') return false;
  const now = new Date();
  return now < this.startTime;
});

const Election = mongoose.model<IElection>('Election', ElectionSchema);
export default Election;
