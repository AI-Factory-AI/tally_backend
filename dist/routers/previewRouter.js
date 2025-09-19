"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const previewController_1 = require("../controllers/previewController");
const router = express_1.default.Router();
// Validation middleware
const validateElectionId = [
    (0, express_validator_1.param)('electionId').isMongoId().withMessage('Valid election ID is required')
];
const validatePreviewToken = [
    (0, express_validator_1.param)('previewToken').trim().isLength({ min: 10 }).withMessage('Valid preview token is required')
];
// Protected routes (require authentication)
// Generate preview URL for an election
router.post('/:electionId/preview/url', validateElectionId, auth_1.authenticateToken, previewController_1.generatePreviewUrl);
// Generate live URL for deployed election
router.post('/:electionId/live/url', validateElectionId, auth_1.authenticateToken, previewController_1.generateLiveUrl);
// Get preview statistics
router.get('/:electionId/preview/stats', validateElectionId, auth_1.authenticateToken, previewController_1.getPreviewStatistics);
// Public routes (no authentication required)
// Get election preview data
router.get('/:electionId/preview/:previewToken', validateElectionId, validatePreviewToken, previewController_1.getElectionPreview);
// Get election preview for mobile/API
router.get('/:electionId/preview/:previewToken/mobile', validateElectionId, validatePreviewToken, previewController_1.getElectionPreviewMobile);
// Validate preview access
router.get('/:electionId/preview/:previewToken/validate', validateElectionId, validatePreviewToken, previewController_1.validatePreviewAccess);
exports.default = router;
