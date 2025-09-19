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
const ElectionSchema = new mongoose_1.Schema({
    creator: {
        type: mongoose_1.Schema.Types.ObjectId,
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
ElectionSchema.virtual('duration').get(function () {
    if (this.startTime && this.endTime) {
        return this.endTime.getTime() - this.startTime.getTime();
    }
    return 0;
});
// Virtual for isActive
ElectionSchema.virtual('isActive').get(function () {
    if (this.status !== 'ACTIVE')
        return false;
    const now = new Date();
    return now >= this.startTime && now <= this.endTime;
});
// Virtual for isUpcoming
ElectionSchema.virtual('isUpcoming').get(function () {
    if (this.status !== 'SCHEDULED')
        return false;
    const now = new Date();
    return now < this.startTime;
});
const Election = mongoose_1.default.model('Election', ElectionSchema);
exports.default = Election;
