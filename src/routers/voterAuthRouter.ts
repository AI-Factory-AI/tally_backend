import express from 'express';
import jwt from 'jsonwebtoken';
import Voter from '../model/Voter';
import Election from '../model/Election';
import CandidateBallot from '../model/CandidateBallot';

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { voterId, accessKey } = req.body as { voterId?: string; accessKey?: string };
    if (!voterId || !accessKey) {
      return res.status(400).json({ message: 'voterId and accessKey are required' });
    }

    // Normalize inputs
    const normalizedKey = accessKey.replace(/\s+/g, '').toUpperCase();
    const normalizedVoterId = String(voterId).trim();

    // Case-insensitive voterId lookup
    const voter = await Voter.findOne({ uniqueId: { $regex: new RegExp(`^${normalizedVoterId}$`, 'i') } }).select('+voterKey');
    if (!voter) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const crypto = await import('crypto');
    const accessKeyHash = crypto.createHash('sha256').update(normalizedKey).digest('hex');

    let valid = voter.voterKeyHash === accessKeyHash;

    // Fallback: if no hash stored (legacy), try decrypt and compare, then persist hash
    if (!valid && (!voter.voterKeyHash || voter.voterKeyHash.length === 0) && (voter as any).decryptVoterKey) {
      try {
        const raw = (voter as any).decryptVoterKey();
        if (raw) {
          const legacyHash = crypto.createHash('sha256').update(String(raw).replace(/\s+/g, '').toUpperCase()).digest('hex');
          if (legacyHash === accessKeyHash) {
            voter.voterKeyHash = legacyHash;
            await voter.save();
            valid = true;
          }
        }
      } catch {
        // ignore
      }
    }

    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const secret = process.env.VOTER_JWT_SECRET || process.env.JWT_SECRET || 'change-me';
    const token = jwt.sign(
      { sub: voter._id.toString(), voterId: voter.uniqueId, electionId: voter.electionId.toString(), scope: 'voter' },
      secret,
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      voter: {
        id: voter._id,
        voterId: voter.uniqueId,
        name: voter.name,
        email: voter.email,
        electionId: voter.electionId,
        status: voter.status,
      },
    });
  } catch (err) {
    console.error('Voter login error:', err);
    return res.status(500).json({ message: 'Failed to login' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
    const token = auth.slice(7);
    const secret = process.env.VOTER_JWT_SECRET || process.env.JWT_SECRET || 'change-me';
    const payload = jwt.verify(token, secret) as any;
    if (!payload?.sub || payload.scope !== 'voter') return res.status(401).json({ message: 'Unauthorized' });
    const voter = await Voter.findById(payload.sub).select('-voterKey -verificationToken');
    if (!voter) return res.status(404).json({ message: 'Voter not found' });
    return res.json({ voter });
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
});

// Get elections for a voter
router.get('/elections', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
    const token = auth.slice(7);
    const secret = process.env.VOTER_JWT_SECRET || process.env.JWT_SECRET || 'change-me';
    const payload = jwt.verify(token, secret) as any;
    if (!payload?.sub || payload.scope !== 'voter') return res.status(401).json({ message: 'Unauthorized' });
    
    const voter = await Voter.findById(payload.sub);
    if (!voter) return res.status(404).json({ message: 'Voter not found' });
    
    // Get the election for this voter
    const election = await Election.findById(voter.electionId)
      .select('title description startTime endTime status blockchainAddress totalVotes totalVoters ballotConfig');
    
    if (!election) return res.status(404).json({ message: 'Election not found' });
    
    // Get the candidate ballot for this election
    const candidateBallot = await CandidateBallot.findOne({ 
      electionId: voter.electionId, 
      isActive: true 
    });
    
    // Add candidate ballot to election data and map date fields
    const electionWithBallot = {
      ...election.toObject(),
      candidateBallot: candidateBallot,
      // Map backend field names to frontend expected names
      startDate: election.startTime,
      endDate: election.endTime
    };
    
    return res.json({ 
      elections: [electionWithBallot],
      voter: {
        id: voter._id,
        voterId: voter.uniqueId,
        name: voter.name,
        email: voter.email,
        electionId: voter.electionId,
        status: voter.status,
      }
    });
  } catch (err) {
    console.error('Get voter elections error:', err);
    return res.status(500).json({ message: 'Failed to load elections' });
  }
});

// Public election details
router.get('/public/elections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const election = await Election.findById(id).select('title description startDate endDate status blockchainAddress ballotConfig');
    if (!election) return res.status(404).json({ message: 'Election not found' });
    return res.json({ election });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load election' });
  }
});

export default router;


