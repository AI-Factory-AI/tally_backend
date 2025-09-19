import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import {
  submitVote,
  submitBlockchainVote,
  getVoteByVoter,
  getElectionResults,
  getPublicElectionResults,
  confirmVoteOnBlockchain,
  rejectVote,
  prepareBlockchainVote,
  recordBlockchainVote
} from '../controllers/voteController';

const router = express.Router();

// Validation middleware
const validateVoteSubmission = [
  body('voterId').trim().isLength({ min: 1, max: 100 }).withMessage('Voter ID is required'),
  body('voterKey').trim().isLength({ min: 1 }).withMessage('Voter key is required'),
  body('choices').isArray({ min: 1 }).withMessage('At least one choice is required'),
  body('choices.*.questionId').trim().isLength({ min: 1, max: 100 }).withMessage('Question ID is required'),
  body('choices.*.selectedOptions').optional().isArray().withMessage('Selected options must be an array'),
  body('choices.*.textAnswer').optional().trim().isLength({ max: 10000 }).withMessage('Text answer must be less than 10000 characters'),
  body('choices.*.fileUrl').optional().trim().isURL().withMessage('File URL must be a valid URL'),
  body('choices.*.rankingOrder').optional().isArray().withMessage('Ranking order must be an array'),
  body('choices.*.rankingOrder.*').isInt({ min: 1 }).withMessage('Ranking values must be positive integers'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object')
];

const validateVoteQuery = [
  query('voterKey').trim().isLength({ min: 1 }).withMessage('Voter key is required')
];

const validateElectionId = [
  param('electionId').isMongoId().withMessage('Valid election ID is required')
];

const validateVoterId = [
  param('voterId').trim().isLength({ min: 1, max: 100 }).withMessage('Valid voter ID is required')
];

const validateVoteId = [
  param('voteId').isMongoId().withMessage('Valid vote ID is required')
];

const validateBlockchainConfirmation = [
  body('blockchainTxHash').trim().isLength({ min: 64, max: 66 }).withMessage('Valid blockchain transaction hash is required'),
  body('blockchainBlockNumber').optional().isInt({ min: 0 }).withMessage('Block number must be a non-negative integer'),
  body('ipfsCid').optional().trim().isLength({ min: 1, max: 100 }).withMessage('IPFS CID must be less than 100 characters')
];

const validateVoteRejection = [
  body('reason').trim().isLength({ min: 1, max: 1000 }).withMessage('Rejection reason is required and must be less than 1000 characters')
];

// Public routes (no authentication required)

// Submit a vote
router.post('/:electionId/vote', validateElectionId, validateVoteSubmission, submitVote);

// Submit a blockchain vote
router.post('/:electionId', validateElectionId, submitBlockchainVote);

// Prepare tx data for manual wallet voting (no paymaster)
router.post('/:electionId/prepare', validateElectionId, body('voterId').isString(), body('voteHash').isString(), prepareBlockchainVote);

// Record a broadcasted tx hash from the frontend wallet
router.post('/:electionId/record', validateElectionId, body('voterId').isString(), body('txHash').isString().isLength({ min: 66, max: 66 }), recordBlockchainVote);

// Get vote by voter
router.get('/:electionId/vote/:voterId', validateElectionId, validateVoterId, validateVoteQuery, getVoteByVoter);

// Get public election results
router.get('/:electionId/results/public', validateElectionId, getPublicElectionResults);

// Protected routes (require authentication)

// Get election results (creator only)
router.get('/:electionId/results', validateElectionId, authenticateToken, getElectionResults);

// Confirm vote on blockchain
router.post('/vote/:voteId/confirm', validateVoteId, validateBlockchainConfirmation, authenticateToken, confirmVoteOnBlockchain);

// Reject vote
router.post('/vote/:voteId/reject', validateVoteId, validateVoteRejection, authenticateToken, rejectVote);

export default router;
