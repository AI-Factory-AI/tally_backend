import express from 'express';
import {
  createElection,
  getUserElections,
  getElection,
  updateElection,
  deleteElection,
  deployElection,
  getPublicElections,
  getElectionStats
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

// Individual election operations (require ownership)
router.get('/user/:electionId', validateElectionOwnership, getElection);
router.put('/user/:electionId', validateElectionOwnership, updateElection);
router.delete('/user/:electionId', validateElectionOwnership, deleteElection);
router.post('/user/:electionId/deploy', validateElectionOwnership, deployElection);

// Public routes (optional authentication)
router.get('/public', optionalAuth, getPublicElections);
router.get('/:electionId', optionalAuth, getElection);

export default router;
