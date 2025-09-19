"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const candidateBallotController_1 = require("../controllers/candidateBallotController");
const router = express_1.default.Router();
// Apply authentication middleware to protected routes
router.use(auth_1.authenticateToken);
// Validation middleware
const validateCandidateBallotData = [
    (0, express_validator_1.body)('candidates').isArray({ min: 2 }).withMessage('At least 2 candidates are required'),
    (0, express_validator_1.body)('candidates.*.id').trim().isLength({ min: 1, max: 100 }).withMessage('Candidate ID is required and must be less than 100 characters'),
    (0, express_validator_1.body)('candidates.*.name').trim().isLength({ min: 1, max: 200 }).withMessage('Candidate name is required and must be less than 200 characters'),
    (0, express_validator_1.body)('candidates.*.portfolio').trim().isLength({ min: 1, max: 200 }).withMessage('Portfolio is required and must be less than 200 characters'),
    (0, express_validator_1.body)('candidates.*.description').trim().isLength({ min: 1, max: 2000 }).withMessage('Description is required and must be less than 2000 characters'),
    (0, express_validator_1.body)('candidates.*.order').isInt({ min: 1 }).withMessage('Order must be a positive integer'),
    (0, express_validator_1.body)('candidates.*.imageUrl').optional().trim().isLength({ max: 500 }).withMessage('Image URL must be less than 500 characters'),
    (0, express_validator_1.body)('type').optional().isIn(['single-choice', 'multiple-choice']).withMessage('Type must be either single-choice or multiple-choice')
];
const validateElectionId = [
    (0, express_validator_1.param)('electionId').isMongoId().withMessage('Valid election ID is required')
];
// Protected routes (require authentication)
// Create or update candidate ballot for an election
router.post('/:electionId/candidate-ballot', validateElectionId, validateCandidateBallotData, candidateBallotController_1.createOrUpdateCandidateBallot);
// Get candidate ballot for an election (creator only)
router.get('/:electionId/candidate-ballot', validateElectionId, candidateBallotController_1.getElectionCandidateBallot);
// Publish candidate ballot
router.post('/:electionId/candidate-ballot/publish', validateElectionId, candidateBallotController_1.publishCandidateBallot);
// Unpublish candidate ballot
router.post('/:electionId/candidate-ballot/unpublish', validateElectionId, candidateBallotController_1.unpublishCandidateBallot);
// Delete candidate ballot
router.delete('/:electionId/candidate-ballot', validateElectionId, candidateBallotController_1.deleteCandidateBallot);
// Public routes (no authentication required)
// Get public candidate ballot for voting
router.get('/:electionId/candidate-ballot/public', validateElectionId, candidateBallotController_1.getPublicCandidateBallot);
exports.default = router;
