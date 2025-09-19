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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const crypto_1 = __importDefault(require("crypto"));
const VoterSchema = new mongoose_1.Schema({
    electionId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
        customFields: mongoose_1.Schema.Types.Mixed
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
VoterSchema.pre('save', async function (next) {
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
            const iv = crypto_1.default.randomBytes(16);
            // Use modern crypto methods (scrypt + createCipheriv)
            const derivedKey = crypto_1.default.scryptSync(keyToUse, 'salt', 32);
            const cipher = crypto_1.default.createCipheriv('aes-256-cbc', derivedKey, iv);
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
        }
        else {
            console.log('Skipping voterKey processing...');
        }
        if (this.isModified('status') && this.status === 'VERIFIED') {
            this.verifiedAt = new Date();
        }
        next();
    }
    catch (error) {
        console.error('Error in Voter pre-save middleware:', error);
        next(error);
    }
});
// Instance method to decrypt voter key (only for verification purposes)
VoterSchema.methods.decryptVoterKey = function () {
    try {
        if (!this.voterKey) {
            return null;
        }
        // If there's no IV delimiter, assume the key is already plaintext (legacy/bulk insert)
        if (!this.voterKey.includes(':')) {
            return this.voterKey;
        }
        const encryptionKey = process.env.VOTER_KEY_ENCRYPTION_KEY;
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
        const derivedKey = crypto_1.default.scryptSync(encryptionKey, 'salt', 32);
        const decipher = crypto_1.default.createDecipheriv('aes-256-cbc', derivedKey, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (error) {
        console.error('Error decrypting voter key:', error);
        return null;
    }
};
// Static method to generate secure voter key
VoterSchema.statics.generateVoterKey = function () {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const length = 10;
    let code = '';
    for (let i = 0; i < length; i++) {
        const idx = crypto_1.default.randomInt(0, alphabet.length);
        code += alphabet[idx];
    }
    return code; // 10-char human-friendly key
};
// Static method to generate verification token
VoterSchema.statics.generateVerificationToken = function () {
    return crypto_1.default.randomBytes(32).toString('hex');
};
const Voter = mongoose_1.default.model('Voter', VoterSchema);
exports.default = Voter;
