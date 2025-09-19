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
const mongoose_1 = __importStar(require("mongoose"));
const VoteChoiceSchema = new mongoose_1.Schema({
    questionId: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    selectedOptions: [{
            type: String,
            trim: true,
            maxlength: 100
        }],
    textAnswer: {
        type: String,
        trim: true,
        maxlength: 10000
    },
    fileUrl: {
        type: String,
        trim: true,
        maxlength: 500
    },
    rankingOrder: [{
            type: Number,
            min: 1
        }],
    timestamp: {
        type: Date,
        default: Date.now
    }
});
const VoteSchema = new mongoose_1.Schema({
    electionId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Election',
        required: true,
        index: true
    },
    voterId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Voter',
        required: true,
        index: true
    },
    ballotId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Ballot',
        required: true,
        index: true
    },
    choices: [VoteChoiceSchema],
    status: {
        type: String,
        enum: ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'],
        default: 'PENDING',
        index: true
    },
    blockchainTxHash: {
        type: String,
        sparse: true,
        maxlength: 66
    },
    blockchainBlockNumber: {
        type: Number,
        min: 0
    },
    ipfsCid: {
        type: String,
        trim: true,
        maxlength: 100
    },
    metadata: {
        userAgent: {
            type: String,
            trim: true,
            maxlength: 500
        },
        ipAddress: {
            type: String,
            trim: true,
            maxlength: 45
        },
        deviceInfo: {
            type: String,
            trim: true,
            maxlength: 200
        },
        location: {
            type: String,
            trim: true,
            maxlength: 200
        },
        votingMethod: {
            type: String,
            enum: ['WEB', 'MOBILE', 'API', 'BLOCKCHAIN'],
            default: 'WEB'
        }
    },
    submittedAt: {
        type: Date,
        default: Date.now
    },
    confirmedAt: {
        type: Date
    },
    rejectedAt: {
        type: Date
    },
    rejectionReason: {
        type: String,
        trim: true,
        maxlength: 1000
    }
}, {
    timestamps: true
});
// Indexes for better query performance
VoteSchema.index({ electionId: 1, status: 1 });
VoteSchema.index({ voterId: 1, electionId: 1 });
VoteSchema.index({ blockchainTxHash: 1 }, { sparse: true });
VoteSchema.index({ submittedAt: 1 });
// Compound unique index to prevent duplicate votes per voter per election
VoteSchema.index({ electionId: 1, voterId: 1 }, { unique: true });
// Pre-save middleware to validate vote data
VoteSchema.pre('save', function (next) {
    // Validate that choices are not empty
    if (!this.choices || this.choices.length === 0) {
        return next(new Error('Vote must contain at least one choice'));
    }
    // Validate that all choices have questionId
    for (const choice of this.choices) {
        if (!choice.questionId) {
            return next(new Error('All choices must have a questionId'));
        }
    }
    // Set timestamps based on status changes
    if (this.isModified('status')) {
        if (this.status === 'CONFIRMED' && !this.confirmedAt) {
            this.confirmedAt = new Date();
        }
        else if (this.status === 'REJECTED' && !this.rejectedAt) {
            this.rejectedAt = new Date();
        }
    }
    next();
});
// Instance method to confirm vote
VoteSchema.methods.confirm = function (blockchainTxHash, blockchainBlockNumber) {
    this.status = 'CONFIRMED';
    this.confirmedAt = new Date();
    if (blockchainTxHash)
        this.blockchainTxHash = blockchainTxHash;
    if (blockchainBlockNumber)
        this.blockchainBlockNumber = blockchainBlockNumber;
    return this.save();
};
// Instance method to reject vote
VoteSchema.methods.reject = function (reason) {
    this.status = 'REJECTED';
    this.rejectedAt = new Date();
    this.rejectionReason = reason;
    return this.save();
};
// Instance method to cancel vote
VoteSchema.methods.cancel = function () {
    this.status = 'CANCELLED';
    return this.save();
};
// Static method to get votes by election
VoteSchema.statics.getVotesByElection = function (electionId, status) {
    const filter = { electionId };
    if (status)
        filter.status = status;
    return this.find(filter).populate('voterId', 'name email uniqueId');
};
// Static method to get vote by voter and election
VoteSchema.statics.getVoteByVoter = function (electionId, voterId) {
    return this.findOne({ electionId, voterId });
};
// Static method to get vote statistics
VoteSchema.statics.getVoteStats = function (electionId) {
    return this.aggregate([
        { $match: { electionId: new mongoose_1.default.Types.ObjectId(electionId) } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);
};
const Vote = mongoose_1.default.model('Vote', VoteSchema);
exports.default = Vote;
