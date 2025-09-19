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
const CandidateSchema = new mongoose_1.Schema({
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
const CandidateBallotSchema = new mongoose_1.Schema({
    electionId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
CandidateBallotSchema.pre('save', function (next) {
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
CandidateBallotSchema.methods.publish = function () {
    this.isActive = true;
    this.publishedAt = new Date();
    return this.save();
};
// Instance method to unpublish ballot
CandidateBallotSchema.methods.unpublish = function () {
    this.isActive = false;
    return this.save();
};
// Static method to get active ballot for election
CandidateBallotSchema.statics.getActiveBallot = function (electionId) {
    return this.findOne({ electionId, isActive: true });
};
const CandidateBallot = mongoose_1.default.model('CandidateBallot', CandidateBallotSchema);
exports.default = CandidateBallot;
