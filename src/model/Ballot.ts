import mongoose, { Document, Schema } from 'mongoose';

export interface IBallotQuestion extends Document {
  questionId: string;
  question: string;
  description?: string;
  type: 'single' | 'multiple' | 'ranking' | 'text' | 'file';
  options?: Array<{
    optionId: string;
    text: string;
    value: string;
    description?: string;
    imageUrl?: string;
  }>;
  required: boolean;
  order: number;
  validation: {
    minSelections?: number;
    maxSelections?: number;
    maxLength?: number;
    allowedFileTypes?: string[];
    maxFileSize?: number;
  };
  displayLogic?: {
    dependsOn?: string; // Question ID this depends on
    showWhen?: string; // Value that triggers this question
    hideWhen?: string; // Value that hides this question
  };
  metadata?: {
    category?: string;
    tags?: string[];
    customFields?: Record<string, any>;
  };
}

export interface IBallot extends Document {
  electionId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  questions: IBallotQuestion[];
  settings: {
    allowAbstention: boolean;
    requireAllQuestions: boolean;
    randomizeOrder: boolean;
    showProgressBar: boolean;
    allowReview: boolean;
    allowChange: boolean;
    maxTimePerQuestion?: number;
    totalTimeLimit?: number;
  };
  version: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

const BallotQuestionSchema = new Schema<IBallotQuestion>({
  questionId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  question: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  description: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  type: {
    type: String,
    enum: ['single', 'multiple', 'ranking', 'text', 'file'],
    required: true
  },
  options: [{
    optionId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    value: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    imageUrl: {
      type: String,
      trim: true,
      maxlength: 500
    }
  }],
  required: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    required: true,
    min: 1
  },
  validation: {
    minSelections: {
      type: Number,
      min: 0,
      max: 100
    },
    maxSelections: {
      type: Number,
      min: 1,
      max: 100
    },
    maxLength: {
      type: Number,
      min: 1,
      max: 10000
    },
    allowedFileTypes: [String],
    maxFileSize: {
      type: Number,
      min: 1,
      max: 100 * 1024 * 1024 // 100MB max
    }
  },
  displayLogic: {
    dependsOn: String,
    showWhen: String,
    hideWhen: String
  },
  metadata: {
    category: String,
    tags: [String],
    customFields: Schema.Types.Mixed
  }
});

const BallotSchema = new Schema<IBallot>({
  electionId: {
    type: Schema.Types.ObjectId,
    ref: 'Election',
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
    trim: true,
    maxlength: 2000
  },
  questions: [BallotQuestionSchema],
  settings: {
    allowAbstention: {
      type: Boolean,
      default: false
    },
    requireAllQuestions: {
      type: Boolean,
      default: true
    },
    randomizeOrder: {
      type: Boolean,
      default: false
    },
    showProgressBar: {
      type: Boolean,
      default: true
    },
    allowReview: {
      type: Boolean,
      default: true
    },
    allowChange: {
      type: Boolean,
      default: false
    },
    maxTimePerQuestion: {
      type: Number,
      min: 0,
      max: 3600 // 1 hour max per question
    },
    totalTimeLimit: {
      type: Number,
      min: 0,
      max: 86400 // 24 hours max total
    }
  },
  version: {
    type: Number,
    default: 1,
    min: 1
  },
  isActive: {
    type: Boolean,
    default: true
  },
  publishedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for better query performance
BallotSchema.index({ electionId: 1, isActive: 1 });
BallotSchema.index({ electionId: 1, version: 1 });
BallotSchema.index({ 'questions.questionId': 1 });

// Compound unique index to prevent multiple active ballots per election
BallotSchema.index({ electionId: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

// Pre-save middleware to validate ballot structure
BallotSchema.pre('save', function(next) {
  // Validate that questions have unique IDs
  const questionIds = this.questions.map(q => q.questionId);
  const uniqueIds = new Set(questionIds);
  
  if (questionIds.length !== uniqueIds.size) {
    return next(new Error('Question IDs must be unique'));
  }
  
  // Validate question order
  const sortedQuestions = [...this.questions].sort((a, b) => a.order - b.order);
  if (JSON.stringify(this.questions) !== JSON.stringify(sortedQuestions)) {
    this.questions = sortedQuestions;
  }
  
  // Validate question types and options
  for (const question of this.questions) {
    if (['single', 'multiple', 'ranking'].includes(question.type) && (!question.options || question.options.length === 0)) {
      return next(new Error(`Question type '${question.type}' requires options`));
    }
    
    if (question.type === 'single' && question.validation.maxSelections && question.validation.maxSelections > 1) {
      return next(new Error('Single choice questions cannot have maxSelections > 1'));
    }
    
    if (question.validation.minSelections && question.validation.maxSelections && 
        question.validation.minSelections > question.validation.maxSelections) {
      return next(new Error('minSelections cannot be greater than maxSelections'));
    }
  }
  
  next();
});

// Instance method to publish ballot
BallotSchema.methods.publish = function() {
  this.isActive = true;
  this.publishedAt = new Date();
  return this.save();
};

// Instance method to unpublish ballot
BallotSchema.methods.unpublish = function() {
  this.isActive = false;
  return this.save();
};

// Instance method to create new version
BallotSchema.methods.createNewVersion = function() {
  this.version += 1;
  this.isActive = false;
  this.publishedAt = undefined;
  return this.save();
};

// Static method to get active ballot for election
BallotSchema.statics.getActiveBallot = function(electionId: string) {
  return this.findOne({ electionId, isActive: true });
};

// Static method to get ballot version
BallotSchema.statics.getBallotVersion = function(electionId: string, version: number) {
  return this.findOne({ electionId, version });
};

const Ballot = mongoose.model<IBallot>('Ballot', BallotSchema);
export default Ballot;
