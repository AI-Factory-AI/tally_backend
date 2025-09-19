"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCandidateBallot = exports.unpublishCandidateBallot = exports.publishCandidateBallot = exports.getPublicCandidateBallot = exports.getElectionCandidateBallot = exports.createOrUpdateCandidateBallot = void 0;
const CandidateBallot_1 = __importDefault(require("../model/CandidateBallot"));
const Election_1 = __importDefault(require("../model/Election"));
const express_validator_1 = require("express-validator");
// Create or update candidate ballot for an election
const createOrUpdateCandidateBallot = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: errors.array()
            });
        }
        const { electionId } = req.params;
        const { candidates, type } = req.body;
        // Check if election exists and user owns it
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        if (election.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Access denied' });
        }
        // Check if election is in draft or scheduled status
        if (!['DRAFT', 'SCHEDULED', 'ACTIVE'].includes(election.status)) {
            return res.status(400).json({
                message: 'Can only modify ballot for elections in DRAFT, SCHEDULED, or ACTIVE status'
            });
        }
        // Check if active ballot exists
        let ballot = await CandidateBallot_1.default.findOne({ electionId, isActive: true });
        if (ballot) {
            // Update existing ballot
            ballot.candidates = candidates;
            ballot.type = type;
            ballot.updatedAt = new Date();
        }
        else {
            // Create new ballot
            ballot = new CandidateBallot_1.default({
                electionId,
                candidates,
                type: type || 'single-choice'
            });
        }
        await ballot.save();
        res.status(200).json({
            message: ballot.isNew ? 'Candidate ballot created successfully' : 'Candidate ballot updated successfully',
            ballot: {
                _id: ballot._id,
                candidates: ballot.candidates,
                type: ballot.type,
                isActive: ballot.isActive,
                createdAt: ballot.createdAt,
                updatedAt: ballot.updatedAt
            }
        });
    }
    catch (error) {
        console.error('Create/Update candidate ballot error:', error);
        res.status(500).json({
            message: 'Failed to create/update candidate ballot',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.createOrUpdateCandidateBallot = createOrUpdateCandidateBallot;
// Get candidate ballot for an election
const getElectionCandidateBallot = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const { electionId } = req.params;
        // Check if election exists and user owns it
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        if (election.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Access denied' });
        }
        // Get active ballot
        const ballot = await CandidateBallot_1.default.findOne({ electionId, isActive: true });
        if (!ballot) {
            return res.status(404).json({ message: 'No active candidate ballot found for this election' });
        }
        res.status(200).json({
            ballot: {
                _id: ballot._id,
                candidates: ballot.candidates,
                type: ballot.type,
                isActive: ballot.isActive,
                createdAt: ballot.createdAt,
                updatedAt: ballot.updatedAt
            }
        });
    }
    catch (error) {
        console.error('Get election candidate ballot error:', error);
        res.status(500).json({
            message: 'Failed to get candidate ballot',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.getElectionCandidateBallot = getElectionCandidateBallot;
// Get public candidate ballot for voting (no authentication required)
const getPublicCandidateBallot = async (req, res) => {
    try {
        const { electionId } = req.params;
        // Check if election exists and is active
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        if (election.status !== 'ACTIVE') {
            return res.status(400).json({ message: 'Election is not active for voting' });
        }
        // Get active ballot
        const ballot = await CandidateBallot_1.default.findOne({ electionId, isActive: true });
        if (!ballot) {
            return res.status(404).json({ message: 'No active candidate ballot found for this election' });
        }
        // Return ballot without sensitive information
        res.status(200).json({
            ballot: {
                _id: ballot._id,
                candidates: ballot.candidates,
                type: ballot.type
            }
        });
    }
    catch (error) {
        console.error('Get public candidate ballot error:', error);
        res.status(500).json({
            message: 'Failed to get candidate ballot',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.getPublicCandidateBallot = getPublicCandidateBallot;
// Publish candidate ballot
const publishCandidateBallot = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const { electionId } = req.params;
        // Check if election exists and user owns it
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        if (election.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Access denied' });
        }
        // Get active ballot
        const ballot = await CandidateBallot_1.default.findOne({ electionId, isActive: true });
        if (!ballot) {
            return res.status(404).json({ message: 'No active candidate ballot found for this election' });
        }
        // Validate ballot has candidates
        if (!ballot.candidates || ballot.candidates.length < 2) {
            return res.status(400).json({ message: 'Ballot must have at least 2 candidates' });
        }
        // Publish ballot
        await ballot.publish();
        res.status(200).json({
            message: 'Candidate ballot published successfully',
            ballot: {
                _id: ballot._id,
                isActive: ballot.isActive,
                publishedAt: ballot.publishedAt
            }
        });
    }
    catch (error) {
        console.error('Publish candidate ballot error:', error);
        res.status(500).json({
            message: 'Failed to publish candidate ballot',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.publishCandidateBallot = publishCandidateBallot;
// Unpublish candidate ballot
const unpublishCandidateBallot = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const { electionId } = req.params;
        // Check if election exists and user owns it
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        if (election.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Access denied' });
        }
        // Get active ballot
        const ballot = await CandidateBallot_1.default.findOne({ electionId, isActive: true });
        if (!ballot) {
            return res.status(404).json({ message: 'No active candidate ballot found for this election' });
        }
        // Unpublish ballot
        await ballot.unpublish();
        res.status(200).json({
            message: 'Candidate ballot unpublished successfully',
            ballot: {
                _id: ballot._id,
                isActive: ballot.isActive
            }
        });
    }
    catch (error) {
        console.error('Unpublish candidate ballot error:', error);
        res.status(500).json({
            message: 'Failed to unpublish candidate ballot',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.unpublishCandidateBallot = unpublishCandidateBallot;
// Delete candidate ballot
const deleteCandidateBallot = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const { electionId } = req.params;
        // Check if election exists and user owns it
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        if (election.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Access denied' });
        }
        // Check if election is in draft status
        if (election.status !== 'DRAFT') {
            return res.status(400).json({
                message: 'Can only delete ballot for elections in DRAFT status'
            });
        }
        // Delete ballot
        const result = await CandidateBallot_1.default.deleteOne({ electionId });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'No candidate ballot found for this election' });
        }
        res.status(200).json({
            message: 'Candidate ballot deleted successfully'
        });
    }
    catch (error) {
        console.error('Delete candidate ballot error:', error);
        res.status(500).json({
            message: 'Failed to delete candidate ballot',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.deleteCandidateBallot = deleteCandidateBallot;
