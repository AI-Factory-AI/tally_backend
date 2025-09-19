"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const electionController_1 = require("../controllers/electionController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Test endpoint to verify route is working
router.get('/test', (req, res) => {
    res.json({ message: 'Election router is working', timestamp: new Date().toISOString() });
});
// Protected routes (require authentication)
router.use('/user', auth_1.authenticateToken);
// User election management
router.post('/user', electionController_1.createElection);
router.get('/user', electionController_1.getUserElections);
router.get('/user/stats', electionController_1.getElectionStats);
router.get('/user/factory-info', electionController_1.getFactoryInfo);
// Individual election operations (require ownership)
router.get('/user/:electionId', auth_1.validateElectionOwnership, electionController_1.getElection);
router.put('/user/:electionId', auth_1.validateElectionOwnership, electionController_1.updateElection);
router.delete('/user/:electionId', auth_1.validateElectionOwnership, electionController_1.deleteElection);
router.get('/user/:electionId/preflight', auth_1.validateElectionOwnership, electionController_1.preflightDeploy);
router.post('/user/:electionId/deploy', auth_1.validateElectionOwnership, electionController_1.deployElection);
router.post('/user/:electionId/activate', auth_1.validateElectionOwnership, electionController_1.activateElection);
router.post('/user/:electionId/register-voters', auth_1.validateElectionOwnership, electionController_1.registerVoters);
// Public routes (optional authentication)
router.get('/public', auth_1.optionalAuth, electionController_1.getPublicElections);
router.get('/:electionId', auth_1.optionalAuth, electionController_1.getElection);
exports.default = router;
