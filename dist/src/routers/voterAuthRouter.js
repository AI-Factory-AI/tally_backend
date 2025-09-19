"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const Voter_1 = __importDefault(require("../model/Voter"));
const Election_1 = __importDefault(require("../model/Election"));
const CandidateBallot_1 = __importDefault(require("../model/CandidateBallot"));
const router = express_1.default.Router();
router.post('/login', async (req, res) => {
    try {
        const { voterId, accessKey } = req.body;
        if (!voterId || !accessKey) {
            return res.status(400).json({ message: 'voterId and accessKey are required' });
        }
        // Normalize inputs
        const normalizedKey = accessKey.replace(/\s+/g, '').toUpperCase();
        const normalizedVoterId = String(voterId).trim();
        // Case-insensitive voterId lookup
        const voter = await Voter_1.default.findOne({ uniqueId: { $regex: new RegExp(`^${normalizedVoterId}$`, 'i') } }).select('+voterKey');
        if (!voter) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const crypto = await Promise.resolve().then(() => __importStar(require('crypto')));
        const accessKeyHash = crypto.createHash('sha256').update(normalizedKey).digest('hex');
        let valid = voter.voterKeyHash === accessKeyHash;
        // Fallback: if no hash stored (legacy), try decrypt and compare, then persist hash
        if (!valid && (!voter.voterKeyHash || voter.voterKeyHash.length === 0) && voter.decryptVoterKey) {
            try {
                const raw = voter.decryptVoterKey();
                if (raw) {
                    const legacyHash = crypto.createHash('sha256').update(String(raw).replace(/\s+/g, '').toUpperCase()).digest('hex');
                    if (legacyHash === accessKeyHash) {
                        voter.voterKeyHash = legacyHash;
                        await voter.save();
                        valid = true;
                    }
                }
            }
            catch {
                // ignore
            }
        }
        if (!valid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const secret = process.env.VOTER_JWT_SECRET || process.env.JWT_SECRET || 'change-me';
        const token = jsonwebtoken_1.default.sign({ sub: voter._id.toString(), voterId: voter.uniqueId, electionId: voter.electionId.toString(), scope: 'voter' }, secret, { expiresIn: '7d' });
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
    }
    catch (err) {
        console.error('Voter login error:', err);
        return res.status(500).json({ message: 'Failed to login' });
    }
});
router.get('/me', async (req, res) => {
    try {
        const auth = req.headers.authorization;
        if (!auth?.startsWith('Bearer '))
            return res.status(401).json({ message: 'Unauthorized' });
        const token = auth.slice(7);
        const secret = process.env.VOTER_JWT_SECRET || process.env.JWT_SECRET || 'change-me';
        const payload = jsonwebtoken_1.default.verify(token, secret);
        if (!payload?.sub || payload.scope !== 'voter')
            return res.status(401).json({ message: 'Unauthorized' });
        const voter = await Voter_1.default.findById(payload.sub).select('-voterKey -verificationToken');
        if (!voter)
            return res.status(404).json({ message: 'Voter not found' });
        return res.json({ voter });
    }
    catch (err) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
});
// Get elections for a voter
router.get('/elections', async (req, res) => {
    try {
        const auth = req.headers.authorization;
        if (!auth?.startsWith('Bearer '))
            return res.status(401).json({ message: 'Unauthorized' });
        const token = auth.slice(7);
        const secret = process.env.VOTER_JWT_SECRET || process.env.JWT_SECRET || 'change-me';
        const payload = jsonwebtoken_1.default.verify(token, secret);
        if (!payload?.sub || payload.scope !== 'voter')
            return res.status(401).json({ message: 'Unauthorized' });
        const voter = await Voter_1.default.findById(payload.sub);
        if (!voter)
            return res.status(404).json({ message: 'Voter not found' });
        // Get the election for this voter
        const election = await Election_1.default.findById(voter.electionId)
            .select('title description startTime endTime status blockchainAddress totalVotes totalVoters ballotConfig');
        if (!election)
            return res.status(404).json({ message: 'Election not found' });
        // Get the candidate ballot for this election
        const candidateBallot = await CandidateBallot_1.default.findOne({
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
    }
    catch (err) {
        console.error('Get voter elections error:', err);
        return res.status(500).json({ message: 'Failed to load elections' });
    }
});
// Public election details
router.get('/public/elections/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const election = await Election_1.default.findById(id).select('title description startDate endDate status blockchainAddress ballotConfig');
        if (!election)
            return res.status(404).json({ message: 'Election not found' });
        return res.json({ election });
    }
    catch (err) {
        return res.status(500).json({ message: 'Failed to load election' });
    }
});
exports.default = router;
