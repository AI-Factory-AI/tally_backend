import express from 'express';
import { body, param } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import {
  createOrUpdateBallot,
  getElectionBallot,
  getPublicBallot,
  publishBallot,
  unpublishBallot,
  createNewBallotVersion,
  getBallotVersionHistory,
  getBallotVersion,
  exportBallotForDeployment
} from '../controllers/ballotController';

const router = express.Router();

// Apply authentication middleware to protected routes
router.use(authenticateToken);

// Validation middleware
const validateBallotData = [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required and must be less than 200 characters'),
  body('description').optional().trim().isLength({ max: 2000 }).withMessage('Description must be less than 2000 characters'),
  body('questions').isArray({ min: 1 }).withMessage('At least one question is required'),
  body('questions.*.questionId').trim().isLength({ min: 1, max: 100 }).withMessage('Question ID is required and must be less than 100 characters'),
  body('questions.*.question').trim().isLength({ min: 1, max: 1000 }).withMessage('Question text is required and must be less than 1000 characters'),
  body('questions.*.type').isIn(['single', 'multiple', 'ranking', 'text', 'file']).withMessage('Invalid question type'),
  body('questions.*.options').optional().isArray().withMessage('Options must be an array'),
  body('questions.*.options.*.optionId').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Option ID is required and must be less than 100 characters'),
  body('questions.*.options.*.text').optional().trim().isLength({ min: 1, max: 500 }).withMessage('Option text is required and must be less than 500 characters'),
  body('questions.*.options.*.value').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Option value is required and must be less than 200 characters'),
  body('questions.*.required').optional().isBoolean().withMessage('Required must be a boolean'),
  body('questions.*.order').isInt({ min: 1 }).withMessage('Order must be a positive integer'),
  body('questions.*.validation.minSelections').optional().isInt({ min: 0, max: 100 }).withMessage('Min selections must be between 0 and 100'),
  body('questions.*.validation.maxSelections').optional().isInt({ min: 1, max: 100 }).withMessage('Max selections must be between 1 and 100'),
  body('questions.*.validation.maxLength').optional().isInt({ min: 1, max: 10000 }).withMessage('Max length must be between 1 and 10000'),
  body('questions.*.validation.allowedFileTypes').optional().isArray().withMessage('Allowed file types must be an array'),
  body('questions.*.validation.maxFileSize').optional().isInt({ min: 1, max: 104857600 }).withMessage('Max file size must be between 1 and 100MB'),
  body('settings').optional().isObject().withMessage('Settings must be an object'),
  body('settings.allowAbstention').optional().isBoolean().withMessage('Allow abstention must be a boolean'),
  body('settings.requireAllQuestions').optional().isBoolean().withMessage('Require all questions must be a boolean'),
  body('settings.randomizeOrder').optional().isBoolean().withMessage('Randomize order must be a boolean'),
  body('settings.showProgressBar').optional().isBoolean().withMessage('Show progress bar must be a boolean'),
  body('settings.allowReview').optional().isBoolean().withMessage('Allow review must be a boolean'),
  body('settings.allowChange').optional().isBoolean().withMessage('Allow change must be a boolean'),
  body('settings.maxTimePerQuestion').optional().isInt({ min: 0, max: 3600 }).withMessage('Max time per question must be between 0 and 3600 seconds'),
  body('settings.totalTimeLimit').optional().isInt({ min: 0, max: 86400 }).withMessage('Total time limit must be between 0 and 86400 seconds')
];

const validateElectionId = [
  param('electionId').isMongoId().withMessage('Valid election ID is required')
];

const validateVersion = [
  param('version').isInt({ min: 1 }).withMessage('Version must be a positive integer')
];

// Protected routes (require authentication)

// Create or update ballot for an election
router.post('/:electionId/ballot', validateElectionId, validateBallotData, createOrUpdateBallot);

// Get ballot for an election (creator only)
router.get('/:electionId/ballot', validateElectionId, getElectionBallot);

// Publish ballot
router.post('/:electionId/ballot/publish', validateElectionId, publishBallot);

// Unpublish ballot
router.post('/:electionId/ballot/unpublish', validateElectionId, unpublishBallot);

// Create new ballot version
router.post('/:electionId/ballot/version', validateElectionId, validateBallotData, createNewBallotVersion);

// Get ballot version history
router.get('/:electionId/ballot/versions', validateElectionId, getBallotVersionHistory);

// Get specific ballot version
router.get('/:electionId/ballot/version/:version', validateElectionId, validateVersion, getBallotVersion);

// Export ballot for blockchain deployment
router.get('/:electionId/ballot/export', validateElectionId, exportBallotForDeployment);

// Public routes (no authentication required)

// Get public ballot for voting
router.get('/:electionId/ballot/public', validateElectionId, getPublicBallot);

export default router;
