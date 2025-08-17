import express from 'express';
import { body, param } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import {
  createOrUpdateCandidateBallot,
  getElectionCandidateBallot,
  getPublicCandidateBallot,
  publishCandidateBallot,
  unpublishCandidateBallot,
  deleteCandidateBallot
} from '../controllers/candidateBallotController';

const router = express.Router();

// Apply authentication middleware to protected routes
router.use(authenticateToken);

// Validation middleware
const validateCandidateBallotData = [
  body('candidates').isArray({ min: 2 }).withMessage('At least 2 candidates are required'),
  body('candidates.*.id').trim().isLength({ min: 1, max: 100 }).withMessage('Candidate ID is required and must be less than 100 characters'),
  body('candidates.*.name').trim().isLength({ min: 1, max: 200 }).withMessage('Candidate name is required and must be less than 200 characters'),
  body('candidates.*.portfolio').trim().isLength({ min: 1, max: 200 }).withMessage('Portfolio is required and must be less than 200 characters'),
  body('candidates.*.description').trim().isLength({ min: 1, max: 2000 }).withMessage('Description is required and must be less than 2000 characters'),
  body('candidates.*.order').isInt({ min: 1 }).withMessage('Order must be a positive integer'),
  body('candidates.*.imageUrl').optional().trim().isLength({ max: 500 }).withMessage('Image URL must be less than 500 characters'),
  body('type').optional().isIn(['single-choice', 'multiple-choice']).withMessage('Type must be either single-choice or multiple-choice')
];

const validateElectionId = [
  param('electionId').isMongoId().withMessage('Valid election ID is required')
];

// Protected routes (require authentication)

// Create or update candidate ballot for an election
router.post('/:electionId/candidate-ballot', validateElectionId, validateCandidateBallotData, createOrUpdateCandidateBallot);

// Get candidate ballot for an election (creator only)
router.get('/:electionId/candidate-ballot', validateElectionId, getElectionCandidateBallot);

// Publish candidate ballot
router.post('/:electionId/candidate-ballot/publish', validateElectionId, publishCandidateBallot);

// Unpublish candidate ballot
router.post('/:electionId/candidate-ballot/unpublish', validateElectionId, unpublishCandidateBallot);

// Delete candidate ballot
router.delete('/:electionId/candidate-ballot', validateElectionId, deleteCandidateBallot);

// Public routes (no authentication required)

// Get public candidate ballot for voting
router.get('/:electionId/candidate-ballot/public', validateElectionId, getPublicCandidateBallot);

export default router;
