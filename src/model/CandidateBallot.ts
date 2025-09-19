import mongoose, { Document, Schema } from 'mongoose';

export interface ICandidate extends Document {
  id: string;
  name: string;
  portfolio: string;
  description: string;
  imageUrl?: string;
  order: number;
}

export interface ICandidateBallot extends Document {
  electionId: mongoose.Types.ObjectId;
  candidates: ICandidate[];
  type: 'single-choice' | 'multiple-choice';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  
  // Instance methods
  publish(): Promise<ICandidateBallot>;
  unpublish(): Promise<ICandidateBallot>;
}

const CandidateSchema = new Schema<ICandidate>({
  id: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  portfolio: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  imageUrl: {
    type: String,
    trim: true,
    maxlength: 500
  },
  order: {
    type: Number,
    required: true,
    min: 1
  }
});

const CandidateBallotSchema = new Schema<ICandidateBallot>({
  electionId: {
    type: Schema.Types.ObjectId,
    ref: 'Election',
    required: true,
    index: true
  },
  candidates: [CandidateSchema],
  type: {
    type: String,
    enum: ['single-choice', 'multiple-choice'],
    required: true,
    default: 'single-choice'
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
CandidateBallotSchema.index({ electionId: 1, isActive: 1 });

// Compound unique index to prevent multiple active ballots per election
CandidateBallotSchema.index({ electionId: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

// Pre-save middleware to validate ballot structure
CandidateBallotSchema.pre('save', function(next) {
  // Validate that candidates have unique IDs
  const candidateIds = this.candidates.map(c => c.id);
  const uniqueIds = new Set(candidateIds);
  
  if (candidateIds.length !== uniqueIds.size) {
    return next(new Error('Candidate IDs must be unique'));
  }
  
  // Validate that we have at least 2 candidates
  if (this.candidates.length < 2) {
    return next(new Error('At least 2 candidates are required'));
  }
  
  // Validate candidate order
  const sortedCandidates = [...this.candidates].sort((a, b) => a.order - b.order);
  if (JSON.stringify(this.candidates) !== JSON.stringify(sortedCandidates)) {
    this.candidates = sortedCandidates;
  }
  
  next();
});

// Instance method to publish ballot
CandidateBallotSchema.methods.publish = function() {
  this.isActive = true;
  this.publishedAt = new Date();
  return this.save();
};

// Instance method to unpublish ballot
CandidateBallotSchema.methods.unpublish = function() {
  this.isActive = false;
  return this.save();
};

// Static method to get active ballot for election
CandidateBallotSchema.statics.getActiveBallot = function(electionId: string) {
  return this.findOne({ electionId, isActive: true });
};

const CandidateBallot = mongoose.model<ICandidateBallot>('CandidateBallot', CandidateBallotSchema);
export default CandidateBallot;
