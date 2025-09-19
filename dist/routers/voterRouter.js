"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const voterController_1 = require("../controllers/voterController");
const router = express_1.default.Router();
// Apply authentication middleware to all routes
router.use(auth_1.authenticateToken);
// Validation middleware
const validateVoterData = [
    (0, express_validator_1.body)('name').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Name must be less than 200 characters if provided'),
    (0, express_validator_1.body)('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('uniqueId').trim().isLength({ min: 1, max: 100 }).withMessage('Unique ID is required and must be less than 100 characters'),
    (0, express_validator_1.body)('voteWeight').optional().isInt({ min: 1, max: 1000 }).withMessage('Vote weight must be between 1 and 1000'),
    (0, express_validator_1.body)('metadata').optional().isObject().withMessage('Metadata must be an object')
];
const validateBulkImport = [
    (0, express_validator_1.body)('voters').isArray({ min: 1 }).withMessage('Voters array is required with at least one voter'),
    (0, express_validator_1.body)('voters.*.name').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Name must be less than 200 characters if provided'),
    (0, express_validator_1.body)('voters.*.email').isEmail().normalizeEmail().withMessage('Each voter must have a valid email'),
    (0, express_validator_1.body)('voters.*.uniqueId').trim().isLength({ min: 1, max: 100 }).withMessage('Each voter must have a valid unique ID'),
    (0, express_validator_1.body)('voters.*.voteWeight').optional().isInt({ min: 1, max: 1000 }).withMessage('Vote weight must be between 1 and 1000')
];
const validateStatusUpdate = [
    (0, express_validator_1.body)('status').isIn(['PENDING', 'VERIFIED', 'ACTIVE', 'SUSPENDED']).withMessage('Invalid status')
];
const validateElectionId = [
    (0, express_validator_1.param)('electionId').isMongoId().withMessage('Valid election ID is required')
];
const validateVoterId = [
    (0, express_validator_1.param)('voterId').isMongoId().withMessage('Valid voter ID is required')
];
const validatePagination = [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    (0, express_validator_1.query)('status').optional().isIn(['PENDING', 'VERIFIED', 'ACTIVE', 'SUSPENDED']).withMessage('Invalid status filter'),
    (0, express_validator_1.query)('search').optional().trim().isLength({ min: 1 }).withMessage('Search query must not be empty')
];
// Routes
// Add a single voter to an election
router.post('/:electionId/voters', validateElectionId, validateVoterData, voterController_1.addVoter);
// Bulk import voters to an election
router.post('/:electionId/voters/bulk', validateElectionId, validateBulkImport, voterController_1.bulkImportVoters);
// Get all voters for an election (with pagination and filtering)
router.get('/:electionId/voters', validateElectionId, validatePagination, voterController_1.getElectionVoters);
// Get voter statistics for an election
router.get('/:electionId/voters/stats', validateElectionId, voterController_1.getVoterStats);
// Update voter status
router.patch('/:electionId/voters/:voterId/status', validateElectionId, validateVoterId, validateStatusUpdate, voterController_1.updateVoterStatus);
// Delete a voter
router.delete('/:electionId/voters/:voterId', validateElectionId, validateVoterId, voterController_1.deleteVoter);
// Export voters for blockchain deployment
router.get('/:electionId/voters/export', validateElectionId, voterController_1.exportVotersForDeployment);
// Send emails to all pending voters and activate them
router.post('/:electionId/voters/send-emails', validateElectionId, voterController_1.sendEmailsToPendingVoters);
// Public route for voter verification (no authentication required)
router.post('/verify/:token', voterController_1.verifyVoter);
exports.default = router;
