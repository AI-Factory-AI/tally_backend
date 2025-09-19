"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateLiveUrl = exports.getPreviewStatistics = exports.validatePreviewAccess = exports.getElectionPreviewMobile = exports.getElectionPreview = exports.generatePreviewUrl = void 0;
const Election_1 = __importDefault(require("../model/Election"));
const Ballot_1 = __importDefault(require("../model/Ballot"));
const Voter_1 = __importDefault(require("../model/Voter"));
// Generate preview URL for an election
const generatePreviewUrl = async (req, res) => {
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
        // Generate unique preview URL
        const previewUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/preview/${electionId}/${generatePreviewToken()}`;
        // Update election with preview URL
        election.previewUrl = previewUrl;
        await election.save();
        res.status(200).json({
            message: 'Preview URL generated successfully',
            previewUrl,
            electionId
        });
    }
    catch (error) {
        console.error('Generate preview URL error:', error);
        res.status(500).json({
            message: 'Failed to generate preview URL',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.generatePreviewUrl = generatePreviewUrl;
// Get election preview data
const getElectionPreview = async (req, res) => {
    try {
        const { electionId, previewToken } = req.params;
        // Check if election exists
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        // Validate preview token (simple validation for now)
        if (!previewToken || previewToken.length < 10) {
            return res.status(401).json({ message: 'Invalid preview token' });
        }
        // Get ballot if exists
        const ballot = await Ballot_1.default.findOne({ electionId, isActive: true });
        // Get voter count
        const voterCount = await Voter_1.default.countDocuments({ electionId });
        // Return preview data
        res.status(200).json({
            election: {
                _id: election._id,
                title: election.title,
                description: election.description,
                startTime: election.startTime,
                endTime: election.endTime,
                timezone: election.timezone,
                maxVotersCount: election.maxVotersCount,
                status: election.status,
                metadata: election.metadata,
                voterSettings: election.voterSettings
            },
            ballot: ballot ? {
                title: ballot.title,
                description: ballot.description,
                questions: ballot.questions.map(q => ({
                    questionId: q.questionId,
                    question: q.question,
                    description: q.description,
                    type: q.type,
                    options: q.options?.map(o => ({
                        optionId: o.optionId,
                        text: o.text,
                        description: o.description
                    })) || [],
                    required: q.required,
                    order: q.order
                })),
                settings: {
                    allowAbstention: ballot.settings.allowAbstention,
                    requireAllQuestions: ballot.settings.requireAllQuestions,
                    randomizeOrder: ballot.settings.randomizeOrder,
                    showProgressBar: ballot.settings.showProgressBar,
                    allowReview: ballot.settings.allowReview,
                    allowChange: ballot.settings.allowChange
                }
            } : null,
            statistics: {
                totalVoters: voterCount,
                participationRate: election.maxVotersCount > 0 ? (voterCount / election.maxVotersCount) * 100 : 0
            },
            preview: {
                isPreview: true,
                previewToken,
                generatedAt: new Date()
            }
        });
    }
    catch (error) {
        console.error('Get election preview error:', error);
        res.status(500).json({
            message: 'Failed to get election preview',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.getElectionPreview = getElectionPreview;
// Get election preview for mobile/API
const getElectionPreviewMobile = async (req, res) => {
    try {
        const { electionId } = req.params;
        const { previewToken } = req.headers;
        // Check if election exists
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        // Validate preview token
        if (!previewToken || previewToken !== election.previewUrl?.split('/').pop()) {
            return res.status(401).json({ message: 'Invalid preview token' });
        }
        // Get ballot if exists
        const ballot = await Ballot_1.default.findOne({ electionId, isActive: true });
        // Return mobile-optimized preview data
        res.status(200).json({
            success: true,
            data: {
                election: {
                    id: election._id,
                    title: election.title,
                    description: election.description,
                    startTime: election.startTime,
                    endTime: election.endTime,
                    timezone: election.timezone,
                    maxVoters: election.maxVotersCount,
                    status: election.status,
                    category: election.metadata?.category,
                    isPublic: election.metadata?.isPublic
                },
                ballot: ballot ? {
                    title: ballot.title,
                    questions: ballot.questions.map(q => ({
                        id: q.questionId,
                        question: q.question,
                        type: q.type,
                        options: q.options?.map(o => ({
                            id: o.optionId,
                            text: o.text
                        })) || [],
                        required: q.required
                    }))
                } : null
            }
        });
    }
    catch (error) {
        console.error('Get election preview mobile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get election preview',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.getElectionPreviewMobile = getElectionPreviewMobile;
// Validate preview access
const validatePreviewAccess = async (req, res) => {
    try {
        const { electionId, previewToken } = req.params;
        // Check if election exists
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        // Check if preview URL exists
        if (!election.previewUrl) {
            return res.status(404).json({ message: 'Preview not available for this election' });
        }
        // Validate preview token
        const isValidToken = election.previewUrl.includes(previewToken);
        if (!isValidToken) {
            return res.status(401).json({ message: 'Invalid preview token' });
        }
        res.status(200).json({
            valid: true,
            message: 'Preview access granted',
            election: {
                id: election._id,
                title: election.title,
                status: election.status
            }
        });
    }
    catch (error) {
        console.error('Validate preview access error:', error);
        res.status(500).json({
            valid: false,
            message: 'Failed to validate preview access',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.validatePreviewAccess = validatePreviewAccess;
// Get preview statistics
const getPreviewStatistics = async (req, res) => {
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
        // Get preview statistics
        const hasPreviewUrl = !!election.previewUrl;
        const hasBallot = !!(await Ballot_1.default.findOne({ electionId, isActive: true }));
        const voterCount = await Voter_1.default.countDocuments({ electionId });
        const verifiedVoterCount = await Voter_1.default.countDocuments({
            electionId,
            status: { $in: ['VERIFIED', 'ACTIVE'] }
        });
        // Calculate readiness score
        let readinessScore = 0;
        if (election.title && election.description)
            readinessScore += 20;
        if (election.startTime && election.endTime)
            readinessScore += 20;
        if (election.maxVotersCount > 0)
            readinessScore += 20;
        if (hasBallot)
            readinessScore += 20;
        if (voterCount > 0)
            readinessScore += 20;
        res.status(200).json({
            preview: {
                hasPreviewUrl,
                previewUrl: election.previewUrl,
                readinessScore
            },
            ballot: {
                hasBallot,
                questionCount: hasBallot ? (await Ballot_1.default.findOne({ electionId, isActive: true }))?.questions?.length || 0 : 0
            },
            voters: {
                total: voterCount,
                verified: verifiedVoterCount,
                pending: voterCount - verifiedVoterCount
            },
            status: {
                election: election.status,
                ballot: hasBallot ? 'READY' : 'NOT_CREATED',
                voters: voterCount > 0 ? 'READY' : 'NOT_ADDED'
            }
        });
    }
    catch (error) {
        console.error('Get preview statistics error:', error);
        res.status(500).json({
            message: 'Failed to get preview statistics',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.getPreviewStatistics = getPreviewStatistics;
// Generate live URL for deployed election
const generateLiveUrl = async (req, res) => {
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
        // Check if election is deployed
        if (!election.blockchainAddress) {
            return res.status(400).json({ message: 'Election must be deployed to blockchain first' });
        }
        // Generate live URL
        const liveUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/vote/${electionId}`;
        // Update election with live URL
        election.liveUrl = liveUrl;
        await election.save();
        res.status(200).json({
            message: 'Live URL generated successfully',
            liveUrl,
            electionId
        });
    }
    catch (error) {
        console.error('Generate live URL error:', error);
        res.status(500).json({
            message: 'Failed to generate live URL',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.generateLiveUrl = generateLiveUrl;
// Helper function to generate preview token
function generatePreviewToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
