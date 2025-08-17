import mongoose, { Document, Schema } from 'mongoose';
import crypto from 'crypto';

export interface IVoter extends Document {
  electionId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  uniqueId: string;
  status: 'PENDING' | 'VERIFIED' | 'ACTIVE' | 'SUSPENDED';
  voterKey: string; // Encrypted voter key
  voterKeyHash: string; // Hashed version for blockchain
  blockchainAddress?: string;
  voteWeight: number;
  hasVoted: boolean;
  verificationToken?: string;
  verificationExpires?: Date;
  registeredAt: Date;
  verifiedAt?: Date;
  lastActivity?: Date;
  metadata?: {
    department?: string;
    role?: string;
    organization?: string;
    customFields?: Record<string, any>;
  };
}

const VoterSchema = new Schema<IVoter>({
  electionId: {
    type: Schema.Types.ObjectId,
    ref: 'Election',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 255
  },
  uniqueId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  status: {
    type: String,
    enum: ['PENDING', 'VERIFIED', 'ACTIVE', 'SUSPENDED'],
    default: 'PENDING',
    index: true
  },
  voterKey: {
    type: String,
    required: true,
    select: false // Never return this field in queries
  },
  voterKeyHash: {
    type: String,
    required: true,
    index: true
  },
  blockchainAddress: {
    type: String,
    sparse: true,
    maxlength: 42
  },
  voteWeight: {
    type: Number,
    default: 1,
    min: 1,
    max: 1000
  },
  hasVoted: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String,
    select: false
  },
  verificationExpires: {
    type: Date
  },
  registeredAt: {
    type: Date,
    default: Date.now
  },
  verifiedAt: {
    type: Date
  },
  lastActivity: {
    type: Date
  },
  metadata: {
    department: String,
    role: String,
    organization: String,
    customFields: Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes for better query performance
VoterSchema.index({ electionId: 1, status: 1 });
VoterSchema.index({ electionId: 1, email: 1 });
VoterSchema.index({ electionId: 1, uniqueId: 1 });
VoterSchema.index({ voterKeyHash: 1 });

// Compound unique index to prevent duplicate voters per election
VoterSchema.index({ electionId: 1, email: 1 }, { unique: true });
VoterSchema.index({ electionId: 1, uniqueId: 1 }, { unique: true });

// Pre-save middleware to encrypt voter key and generate hash
VoterSchema.pre('save', async function(next) {
  if (this.isModified('voterKey')) {
    // Encrypt the voter key using environment variable
    const encryptionKey = process.env.VOTER_KEY_ENCRYPTION_KEY || 'default-key-change-in-production';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
    
    let encrypted = cipher.update(this.voterKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Store encrypted key with IV
    this.voterKey = `${iv.toString('hex')}:${encrypted}`;
    
    // Generate hash for blockchain (this will be visible)
    this.voterKeyHash = crypto.createHash('sha256').update(this.voterKey).digest('hex');
  }
  
  if (this.isModified('status') && this.status === 'VERIFIED') {
    this.verifiedAt = new Date();
  }
  
  next();
});

// Instance method to decrypt voter key (only for verification purposes)
VoterSchema.methods.decryptVoterKey = function(): string | null {
  try {
    const encryptionKey = process.env.VOTER_KEY_ENCRYPTION_KEY || 'default-key-change-in-production';
    const [ivHex, encrypted] = this.voterKey.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = crypto.createDecipher('aes-256-cbc', encryptionKey);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Error decrypting voter key:', error);
    return null;
  }
};

// Static method to generate secure voter key
VoterSchema.statics.generateVoterKey = function(): string {
  return crypto.randomBytes(32).toString('hex');
};

// Static method to generate verification token
VoterSchema.statics.generateVerificationToken = function(): string {
  return crypto.randomBytes(32).toString('hex');
};

const Voter = mongoose.model<IVoter>('Voter', VoterSchema);
export default Voter;
