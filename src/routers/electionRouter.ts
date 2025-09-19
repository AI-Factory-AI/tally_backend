import express from 'express';
import {
  createElection,
  getUserElections,
  getElection,
  updateElection,
  deleteElection,
  deployElection,
  activateElection,
  registerVoters,
  getPublicElections,
  getElectionStats,
  getFactoryInfo,
  preflightDeploy,
  startElectionOnChain,
  updateElectionDeployment
} from '../controllers/electionController';
import { 
  authenticateToken, 
  optionalAuth, 
  validateElectionOwnership 
} from '../middleware/auth';

const router = express.Router();

// Test endpoint to verify route is working
router.get('/test', (req, res) => {
  res.json({ message: 'Election router is working', timestamp: new Date().toISOString() });
});

// Protected routes (require authentication)
router.use('/user', authenticateToken);

// User election management
router.post('/user', createElection);
router.get('/user', getUserElections);
router.get('/user/stats', getElectionStats);
router.get('/user/factory-info', getFactoryInfo);

// Individual election operations (require ownership)
router.get('/user/:electionId', validateElectionOwnership, getElection);
router.put('/user/:electionId', validateElectionOwnership, updateElection);
router.delete('/user/:electionId', validateElectionOwnership, deleteElection);
router.get('/user/:electionId/preflight', validateElectionOwnership, preflightDeploy);
router.post('/user/:electionId/deploy', validateElectionOwnership, deployElection);
router.post('/user/:electionId/update-deployment', validateElectionOwnership, updateElectionDeployment);
router.post('/user/:electionId/activate', validateElectionOwnership, activateElection);
router.post('/user/:electionId/start-onchain', validateElectionOwnership, startElectionOnChain);
router.post('/user/:electionId/register-voters', validateElectionOwnership, registerVoters);

// Public routes (optional authentication)
router.get('/public', optionalAuth, getPublicElections);
router.get('/:electionId', optionalAuth, getElection);

export default router;
