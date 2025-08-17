import express from 'express';
import { param } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import {
  generatePreviewUrl,
  getElectionPreview,
  getElectionPreviewMobile,
  validatePreviewAccess,
  getPreviewStatistics,
  generateLiveUrl
} from '../controllers/previewController';

const router = express.Router();

// Validation middleware
const validateElectionId = [
  param('electionId').isMongoId().withMessage('Valid election ID is required')
];

const validatePreviewToken = [
  param('previewToken').trim().isLength({ min: 10 }).withMessage('Valid preview token is required')
];

// Protected routes (require authentication)

// Generate preview URL for an election
router.post('/:electionId/preview/url', validateElectionId, authenticateToken, generatePreviewUrl);

// Generate live URL for deployed election
router.post('/:electionId/live/url', validateElectionId, authenticateToken, generateLiveUrl);

// Get preview statistics
router.get('/:electionId/preview/stats', validateElectionId, authenticateToken, getPreviewStatistics);

// Public routes (no authentication required)

// Get election preview data
router.get('/:electionId/preview/:previewToken', validateElectionId, validatePreviewToken, getElectionPreview);

// Get election preview for mobile/API
router.get('/:electionId/preview/:previewToken/mobile', validateElectionId, validatePreviewToken, getElectionPreviewMobile);

// Validate preview access
router.get('/:electionId/preview/:previewToken/validate', validateElectionId, validatePreviewToken, validatePreviewAccess);

export default router;
