"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const voteController_1 = require("../controllers/voteController");
const router = express_1.default.Router();
// Validation middleware
const validateVoteSubmission = [
    (0, express_validator_1.body)('voterId').trim().isLength({ min: 1, max: 100 }).withMessage('Voter ID is required'),
    (0, express_validator_1.body)('voterKey').trim().isLength({ min: 1 }).withMessage('Voter key is required'),
    (0, express_validator_1.body)('choices').isArray({ min: 1 }).withMessage('At least one choice is required'),
    (0, express_validator_1.body)('choices.*.questionId').trim().isLength({ min: 1, max: 100 }).withMessage('Question ID is required'),
    (0, express_validator_1.body)('choices.*.selectedOptions').optional().isArray().withMessage('Selected options must be an array'),
    (0, express_validator_1.body)('choices.*.textAnswer').optional().trim().isLength({ max: 10000 }).withMessage('Text answer must be less than 10000 characters'),
    (0, express_validator_1.body)('choices.*.fileUrl').optional().trim().isURL().withMessage('File URL must be a valid URL'),
    (0, express_validator_1.body)('choices.*.rankingOrder').optional().isArray().withMessage('Ranking order must be an array'),
    (0, express_validator_1.body)('choices.*.rankingOrder.*').isInt({ min: 1 }).withMessage('Ranking values must be positive integers'),
    (0, express_validator_1.body)('metadata').optional().isObject().withMessage('Metadata must be an object')
];
const validateVoteQuery = [
    (0, express_validator_1.query)('voterKey').trim().isLength({ min: 1 }).withMessage('Voter key is required')
];
const validateElectionId = [
    (0, express_validator_1.param)('electionId').isMongoId().withMessage('Valid election ID is required')
];
const validateVoterId = [
    (0, express_validator_1.param)('voterId').trim().isLength({ min: 1, max: 100 }).withMessage('Valid voter ID is required')
];
const validateVoteId = [
    (0, express_validator_1.param)('voteId').isMongoId().withMessage('Valid vote ID is required')
];
const validateBlockchainConfirmation = [
    (0, express_validator_1.body)('blockchainTxHash').trim().isLength({ min: 64, max: 66 }).withMessage('Valid blockchain transaction hash is required'),
    (0, express_validator_1.body)('blockchainBlockNumber').optional().isInt({ min: 0 }).withMessage('Block number must be a non-negative integer'),
    (0, express_validator_1.body)('ipfsCid').optional().trim().isLength({ min: 1, max: 100 }).withMessage('IPFS CID must be less than 100 characters')
];
const validateVoteRejection = [
    (0, express_validator_1.body)('reason').trim().isLength({ min: 1, max: 1000 }).withMessage('Rejection reason is required and must be less than 1000 characters')
];
// Public routes (no authentication required)
// Submit a vote
router.post('/:electionId/vote', validateElectionId, validateVoteSubmission, voteController_1.submitVote);
// Submit a blockchain vote
router.post('/:electionId', validateElectionId, voteController_1.submitBlockchainVote);
// Get vote by voter
router.get('/:electionId/vote/:voterId', validateElectionId, validateVoterId, validateVoteQuery, voteController_1.getVoteByVoter);
// Get public election results
router.get('/:electionId/results/public', validateElectionId, voteController_1.getPublicElectionResults);
// Protected routes (require authentication)
// Get election results (creator only)
router.get('/:electionId/results', validateElectionId, auth_1.authenticateToken, voteController_1.getElectionResults);
// Confirm vote on blockchain
router.post('/vote/:voteId/confirm', validateVoteId, validateBlockchainConfirmation, auth_1.authenticateToken, voteController_1.confirmVoteOnBlockchain);
// Reject vote
router.post('/vote/:voteId/reject', validateVoteId, validateVoteRejection, auth_1.authenticateToken, voteController_1.rejectVote);
exports.default = router;
