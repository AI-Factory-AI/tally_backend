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
  // Email delivery tracking
  emailDeliveryStatus?: 'PENDING' | 'SENT' | 'FAILED';
  emailSentAt?: Date;
  lastEmailError?: string;
  inviteCount?: number;
  lastInviteAt?: Date;
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
  
  // Instance methods
  decryptVoterKey(): string | null;
}

// Interface for the Voter model with static methods
export interface IVoterModel extends mongoose.Model<IVoter> {
  generateVoterKey(): string;
  generateVerificationToken(): string;
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
    required: false,
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
    required: false, // Make it optional, we'll generate it in controller
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
  emailDeliveryStatus: {
    type: String,
    enum: ['PENDING', 'SENT', 'FAILED'],
    default: 'PENDING'
  },
  emailSentAt: {
    type: Date
  },
  lastEmailError: {
    type: String
  },
  inviteCount: {
    type: Number,
    default: 0
  },
  lastInviteAt: {
    type: Date
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
  try {
    console.log('Pre-save hook running...');
    console.log('voterKey exists:', !!this.voterKey);
    console.log('voterKeyHash exists:', !!this.voterKeyHash);
    console.log('isModified voterKey:', this.isModified('voterKey'));
    console.log('isNew:', this.isNew);
    
    if (this.isModified('voterKey') || (this.voterKey && !this.voterKeyHash)) {
      console.log('Processing voterKey encryption and hash generation...');
      // Check if encryption key is properly set
      const encryptionKey = process.env.VOTER_KEY_ENCRYPTION_KEY;
      if (!encryptionKey) {
        throw new Error('Missing VOTER_KEY_ENCRYPTION_KEY');
      }
      const keyToUse = encryptionKey;
      const iv = crypto.randomBytes(16);
      
      // Use modern crypto methods (scrypt + createCipheriv)
      const derivedKey = crypto.scryptSync(keyToUse, 'salt', 32);
      const cipher = crypto.createCipheriv('aes-256-cbc', derivedKey, iv);
      
      let encrypted = cipher.update(this.voterKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Store encrypted key with IV
      const encryptedWithIv = `${iv.toString('hex')}:${encrypted}`;
      this.voterKey = encryptedWithIv;
      
      // Do not overwrite voterKeyHash if already provided by controller
      if (!this.voterKeyHash) {
        // WARNING: Without plaintext we cannot derive correct hash here.
        // Leave hash unset to be handled by controller when creating the voter.
      }
      console.log('voterKeyHash generated:', this.voterKeyHash);
    } else {
      console.log('Skipping voterKey processing...');
    }
    
    if (this.isModified('status') && this.status === 'VERIFIED') {
      this.verifiedAt = new Date();
    }
    
    next();
  } catch (error) {
    console.error('Error in Voter pre-save middleware:', error);
    next(error as Error);
  }
});

// Instance method to decrypt voter key (only for verification purposes)
VoterSchema.methods.decryptVoterKey = function(): string | null {
  try {
    if (!this.voterKey) {
      return null;
    }
    // If there's no IV delimiter, assume the key is already plaintext (legacy/bulk insert)
    if (!this.voterKey.includes(':')) {
      return this.voterKey;
    }

    const encryptionKey = process.env.VOTER_KEY_ENCRYPTION_KEY as string;
    if (!encryptionKey) {
      throw new Error('Missing VOTER_KEY_ENCRYPTION_KEY');
    }
    const [ivHex, encrypted] = this.voterKey.split(':');
    if (!ivHex || !encrypted) {
      console.error('Invalid voter key format');
      return null;
    }
    
    const iv = Buffer.from(ivHex, 'hex');
    
    // Use modern crypto methods (scrypt + createDecipheriv)
    const derivedKey = crypto.scryptSync(encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, iv);
    
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
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
  const length = 10;
  let code = '';
  for (let i = 0; i < length; i++) {
    const idx = crypto.randomInt(0, alphabet.length);
    code += alphabet[idx];
  }
  return code; // 10-char human-friendly key
};

// Static method to generate verification token
VoterSchema.statics.generateVerificationToken = function(): string {
  return crypto.randomBytes(32).toString('hex');
};

const Voter = mongoose.model<IVoter, IVoterModel>('Voter', VoterSchema);
export default Voter;
