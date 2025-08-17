import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import {
  addVoter,
  bulkImportVoters,
  getElectionVoters,
  getVoterStats,
  updateVoterStatus,
  deleteVoter,
  verifyVoter,
  exportVotersForDeployment
} from '../controllers/voterController';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Validation middleware
const validateVoterData = [
  body('name').trim().isLength({ min: 1, max: 200 }).withMessage('Name is required and must be less than 200 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('uniqueId').trim().isLength({ min: 1, max: 100 }).withMessage('Unique ID is required and must be less than 100 characters'),
  body('voteWeight').optional().isInt({ min: 1, max: 1000 }).withMessage('Vote weight must be between 1 and 1000'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object')
];

const validateBulkImport = [
  body('voters').isArray({ min: 1 }).withMessage('Voters array is required with at least one voter'),
  body('voters.*.name').trim().isLength({ min: 1, max: 200 }).withMessage('Each voter must have a valid name'),
  body('voters.*.email').isEmail().normalizeEmail().withMessage('Each voter must have a valid email'),
  body('voters.*.uniqueId').trim().isLength({ min: 1, max: 100 }).withMessage('Each voter must have a valid unique ID'),
  body('voters.*.voteWeight').optional().isInt({ min: 1, max: 1000 }).withMessage('Vote weight must be between 1 and 1000')
];

const validateStatusUpdate = [
  body('status').isIn(['PENDING', 'VERIFIED', 'ACTIVE', 'SUSPENDED']).withMessage('Invalid status')
];

const validateElectionId = [
  param('electionId').isMongoId().withMessage('Valid election ID is required')
];

const validateVoterId = [
  param('voterId').isMongoId().withMessage('Valid voter ID is required')
];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['PENDING', 'VERIFIED', 'ACTIVE', 'SUSPENDED']).withMessage('Invalid status filter'),
  query('search').optional().trim().isLength({ min: 1 }).withMessage('Search query must not be empty')
];

// Routes

// Add a single voter to an election
router.post('/:electionId/voters', validateElectionId, validateVoterData, addVoter);

// Bulk import voters to an election
router.post('/:electionId/voters/bulk', validateElectionId, validateBulkImport, bulkImportVoters);

// Get all voters for an election (with pagination and filtering)
router.get('/:electionId/voters', validateElectionId, validatePagination, getElectionVoters);

// Get voter statistics for an election
router.get('/:electionId/voters/stats', validateElectionId, getVoterStats);

// Update voter status
router.patch('/:electionId/voters/:voterId/status', validateElectionId, validateVoterId, validateStatusUpdate, updateVoterStatus);

// Delete a voter
router.delete('/:electionId/voters/:voterId', validateElectionId, validateVoterId, deleteVoter);

// Export voters for blockchain deployment
router.get('/:electionId/voters/export', validateElectionId, exportVotersForDeployment);

// Public route for voter verification (no authentication required)
router.post('/verify/:token', verifyVoter);

export default router;
