"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.preflightDeploy = exports.getFactoryInfo = exports.registerVoters = exports.getElectionStats = exports.getPublicElections = exports.activateElection = exports.deployElection = exports.deleteElection = exports.updateElection = exports.getElection = exports.getUserElections = exports.createElection = void 0;
const Election_1 = __importDefault(require("../model/Election"));
const blockchainService_1 = __importDefault(require("../service/blockchainService"));
// Create a new election draft
const createElection = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        console.log('Creating election with data:', req.body);
        console.log('User:', req.user);
        const { title, description, startTime, endTime, timezone, maxVotersCount, loginInstructions, voteConfirmation, afterElectionMessage, realTimeResults, resultsReleaseTime, ballotConfig, voterSettings, metadata } = req.body;
        // Validate required fields
        if (!title || !description || !startTime || !endTime || !maxVotersCount) {
            console.log('Missing required fields:', { title, description, startTime, endTime, maxVotersCount });
            return res.status(400).json({
                message: 'Missing required fields',
                required: ['title', 'description', 'startTime', 'endTime', 'maxVotersCount'],
                received: { title, description, startTime, endTime, maxVotersCount }
            });
        }
        // Validate dates
        const start = new Date(startTime);
        const end = new Date(endTime);
        const now = new Date();
        console.log('Date validation:', { start, end, now, startISO: start.toISOString(), endISO: end.toISOString() });
        // For demo purposes, allow elections to start today (same day)
        // Only require that start time is not in the past (allowing same day)
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of today
        const startDate = new Date(start);
        startDate.setHours(0, 0, 0, 0); // Start of start date
        if (startDate < today) {
            return res.status(400).json({
                message: 'Start time cannot be in the past (same day is allowed for demo)',
                startTime: start.toISOString(),
                currentTime: now.toISOString()
            });
        }
        if (end <= start) {
            return res.status(400).json({
                message: 'End time must be after start time',
                startTime: start.toISOString(),
                endTime: end.toISOString()
            });
        }
        // Create election
        const election = new Election_1.default({
            creator: req.user.id,
            title,
            description,
            startTime: start,
            endTime: end,
            timezone: timezone || 'UTC',
            maxVotersCount,
            loginInstructions: loginInstructions || '',
            voteConfirmation: voteConfirmation || '',
            afterElectionMessage: afterElectionMessage || '',
            realTimeResults: realTimeResults || false,
            resultsReleaseTime: resultsReleaseTime ? new Date(resultsReleaseTime) : undefined,
            ballotConfig: ballotConfig || {
                questions: []
            },
            voterSettings: voterSettings || {
                allowAnonymous: false,
                requireVerification: true,
                maxVotesPerVoter: 1
            },
            metadata: {
                tags: metadata?.tags || [],
                category: metadata?.category || 'General',
                institution: metadata?.institution || '',
                isPublic: metadata?.isPublic || false,
                ...metadata
            }
        });
        await election.save();
        // Set the preview URL after saving (when we have the _id)
        election.previewUrl = `/election/preview/${election._id}`;
        await election.save();
        res.status(201).json({
            message: 'Election draft created successfully',
            election: {
                id: election._id,
                title: election.title,
                status: election.status,
                previewUrl: election.previewUrl,
                createdAt: election.createdAt
            }
        });
    }
    catch (error) {
        console.error('Create election error:', error);
        res.status(500).json({
            message: 'Failed to create election',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.createElection = createElection;
// Get all elections for a user
const getUserElections = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const { status, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const query = { creator: req.user.id };
        if (status && status !== 'all') {
            query.status = status;
        }
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
        const elections = await Election_1.default.find(query)
            .sort(sort)
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit))
            .select('-ballotConfig -voterSettings -metadata')
            .lean();
        const total = await Election_1.default.countDocuments(query);
        res.json({
            elections,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit))
            }
        });
    }
    catch (error) {
        console.error('Get user elections error:', error);
        res.status(500).json({
            message: 'Failed to fetch elections',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.getUserElections = getUserElections;
// Get a specific election
const getElection = async (req, res) => {
    try {
        const { electionId } = req.params;
        const election = await Election_1.default.findById(electionId)
            .populate('creator', 'name email')
            .lean();
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        // Check if user can access this election
        if (req.user && election.creator.toString() !== req.user.id) {
            if (!election.metadata?.isPublic && election.status === 'DRAFT') {
                return res.status(403).json({ message: 'Access denied' });
            }
        }
        res.json({ election });
    }
    catch (error) {
        console.error('Get election error:', error);
        res.status(500).json({
            message: 'Failed to fetch election',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.getElection = getElection;
// Update an election draft
const updateElection = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const { electionId } = req.params;
        const updateData = req.body;
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        // Check ownership
        if (election.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Access denied' });
        }
        // Only allow updates for draft elections
        if (election.status !== 'DRAFT') {
            return res.status(400).json({
                message: 'Only draft elections can be updated'
            });
        }
        // Validate dates if they're being updated
        if (updateData.startTime || updateData.endTime) {
            const start = updateData.startTime ? new Date(updateData.startTime) : election.startTime;
            const end = updateData.endTime ? new Date(updateData.endTime) : election.endTime;
            const now = new Date();
            if (start <= now) {
                return res.status(400).json({
                    message: 'Start time must be in the future'
                });
            }
            if (end <= start) {
                return res.status(400).json({
                    message: 'End time must be after start time'
                });
            }
        }
        // Update election
        Object.assign(election, updateData);
        election.updatedAt = new Date();
        await election.save();
        res.json({
            message: 'Election updated successfully',
            election: {
                id: election._id,
                title: election.title,
                status: election.status,
                updatedAt: election.updatedAt
            }
        });
    }
    catch (error) {
        console.error('Update election error:', error);
        res.status(500).json({
            message: 'Failed to update election',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.updateElection = updateElection;
// Delete an election
const deleteElection = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const { electionId } = req.params;
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        // Check ownership
        if (election.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Access denied' });
        }
        // Only allow deletion of draft elections
        if (election.status !== 'DRAFT') {
            return res.status(400).json({
                message: 'Only draft elections can be deleted'
            });
        }
        await Election_1.default.findByIdAndDelete(electionId);
        res.json({ message: 'Election deleted successfully' });
    }
    catch (error) {
        console.error('Delete election error:', error);
        res.status(500).json({
            message: 'Failed to delete election',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.deleteElection = deleteElection;
// Deploy election to blockchain
const deployElection = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const { electionId } = req.params;
        // Get election from database
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        // Check if user is the creator
        if (election.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to deploy this election' });
        }
        // Check if already deployed
        console.log('Election status:', election.status);
        console.log('Election blockchain address:', election.blockchainAddress);
        console.log('Election blockchain tx hash:', election.blockchainTxHash);
        // Allow deployment for DRAFT and SCHEDULED elections
        if (election.status !== 'DRAFT' && election.status !== 'SCHEDULED') {
            return res.status(400).json({ message: 'Election is already deployed or in progress' });
        }
        // If already deployed to blockchain, don't deploy again
        if (election.blockchainAddress) {
            return res.status(400).json({ message: 'Election is already deployed to blockchain' });
        }
        // For demo purposes, we'll use a hardcoded private key
        // In production, this should be stored securely or derived from user's seed phrase
        const creatorPrivateKey = process.env.CREATOR_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
        // Prepare election data for blockchain
        const startTs = Math.floor(election.startTime.getTime() / 1000);
        const endTs = Math.floor(election.endTime.getTime() / 1000);
        // Enforce factory minimums to avoid on-chain revert
        const MIN_DURATION = 3600; // 1 hour
        if (endTs - startTs < MIN_DURATION) {
            return res.status(400).json({ message: 'Election duration too short. Must be at least 1 hour.' });
        }
        const electionData = {
            title: election.title,
            description: election.description,
            startTime: startTs,
            endTime: endTs,
            timezone: election.timezone,
            ballotReceipt: false,
            submitConfirmation: true,
            maxVoters: Math.max(1, election.maxVotersCount || 0),
            allowVoterRegistration: election.voterSettings?.allowAnonymous || false,
            loginInstructions: election.loginInstructions || '',
            voteConfirmation: election.voteConfirmation || '',
            afterElectionMessage: election.afterElectionMessage || '',
            publicResults: election.metadata?.isPublic || false,
            realTimeResults: election.realTimeResults || false,
            resultsReleaseTime: election.resultsReleaseTime ? Math.floor(election.resultsReleaseTime.getTime() / 1000) : 0,
            allowResultsDownload: false
        };
        // Preflight simulate to avoid sending failing transactions (unless forced)
        const force = String(req.query?.force || '').toLowerCase() === 'true';
        if (!force) {
            try {
                const fromAddr = new (require('ethers').Wallet)(creatorPrivateKey).address;
                const sim = await blockchainService_1.default.simulateCreateElection(electionData, fromAddr);
                if (!sim.ok) {
                    return res.status(400).json({ message: 'Preflight failed', reason: sim.reason, from: fromAddr });
                }
            }
            catch (pfErr) {
                console.warn('Preflight error (non-fatal):', pfErr);
            }
        }
        // Deploy to blockchain
        console.log('Deploying election to blockchain...');
        console.log('Election data prepared:', electionData);
        console.log('Using private key:', creatorPrivateKey.substring(0, 10) + '...');
        const { electionAddress, txHash } = await blockchainService_1.default.createElection(electionData, creatorPrivateKey);
        console.log('Election deployed successfully!');
        console.log('Election address:', electionAddress);
        console.log('Transaction hash:', txHash);
        // Update election in database
        election.blockchainAddress = electionAddress;
        election.blockchainTxHash = txHash;
        election.deployedAt = new Date();
        election.status = 'SCHEDULED'; // Change to SCHEDULED after deployment
        election.liveUrl = `/election/${election._id}`;
        await election.save();
        res.json({
            message: 'Election deployed successfully',
            election: {
                id: election._id,
                blockchainAddress: electionAddress,
                txHash: txHash,
                status: election.status,
                liveUrl: election.liveUrl,
                deployedAt: election.deployedAt
            }
        });
    }
    catch (error) {
        console.error('Error deploying election:', error);
        res.status(500).json({ message: 'Failed to deploy election to blockchain' });
    }
};
exports.deployElection = deployElection;
// Manually activate an election (for testing purposes)
const activateElection = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const { electionId } = req.params;
        // Get election from database
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        // Check if user is the creator
        if (election.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to activate this election' });
        }
        // Check if election can be activated
        if (election.status !== 'SCHEDULED') {
            return res.status(400).json({
                message: 'Only scheduled elections can be activated',
                currentStatus: election.status
            });
        }
        // Check if start time has passed
        const now = new Date();
        if (election.startTime > now) {
            return res.status(400).json({
                message: 'Election start time has not been reached yet',
                startTime: election.startTime,
                currentTime: now
            });
        }
        // Activate the election
        election.status = 'ACTIVE';
        election.startedAt = new Date();
        await election.save();
        console.log(`Election "${election.title}" (${election._id}) manually activated at ${election.startedAt}`);
        res.json({
            message: 'Election activated successfully',
            election: {
                id: election._id,
                title: election.title,
                status: election.status,
                startedAt: election.startedAt
            }
        });
    }
    catch (error) {
        console.error('Error activating election:', error);
        res.status(500).json({ message: 'Failed to activate election' });
    }
};
exports.activateElection = activateElection;
// Get public elections
const getPublicElections = async (req, res) => {
    try {
        const { page = 1, limit = 10, category, search } = req.query;
        const query = {
            'metadata.isPublic': true,
            status: { $in: ['SCHEDULED', 'ACTIVE'] }
        };
        if (category) {
            query['metadata.category'] = category;
        }
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }
        const elections = await Election_1.default.find(query)
            .populate('creator', 'name institution')
            .sort({ startTime: 1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit))
            .select('-ballotConfig -voterSettings -loginInstructions -voteConfirmation -afterElectionMessage')
            .lean();
        const total = await Election_1.default.countDocuments(query);
        res.json({
            elections,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit))
            }
        });
    }
    catch (error) {
        console.error('Get public elections error:', error);
        res.status(500).json({
            message: 'Failed to fetch public elections',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.getPublicElections = getPublicElections;
// Get election statistics
const getElectionStats = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const stats = await Election_1.default.aggregate([
            { $match: { creator: req.user.id } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);
        const totalElections = await Election_1.default.countDocuments({ creator: req.user.id });
        const recentElections = await Election_1.default.find({ creator: req.user.id })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('title status createdAt')
            .lean();
        res.json({
            stats: stats.reduce((acc, stat) => {
                acc[stat._id] = stat.count;
                return acc;
            }, {}),
            totalElections,
            recentElections
        });
    }
    catch (error) {
        console.error('Get election stats error:', error);
        res.status(500).json({
            message: 'Failed to fetch election statistics',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.getElectionStats = getElectionStats;
// Register voters for deployed election
const registerVoters = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const { electionId } = req.params;
        const { voters } = req.body;
        // Get election from database
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        // Check if user is the creator
        if (election.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to register voters for this election' });
        }
        // Check if election is deployed
        if (!election.blockchainAddress) {
            return res.status(400).json({ message: 'Election must be deployed before registering voters' });
        }
        // Validate voters data
        if (!Array.isArray(voters) || voters.length === 0) {
            return res.status(400).json({ message: 'Voters array is required' });
        }
        // Prepare voter data for blockchain
        const voterData = voters.map((voter) => ({
            voterId: voter.voterId || voter.id,
            email: voter.email
        }));
        // Get creator's private key
        const creatorPrivateKey = process.env.CREATOR_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
        // Register voters on blockchain
        const { txHash } = await blockchainService_1.default.registerVoters(election.blockchainAddress, voterData, creatorPrivateKey);
        res.json({
            message: 'Voters registered successfully',
            txHash: txHash,
            registeredCount: voters.length
        });
    }
    catch (error) {
        console.error('Error registering voters:', error);
        res.status(500).json({ message: 'Failed to register voters' });
    }
};
exports.registerVoters = registerVoters;
const getFactoryInfo = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const info = await blockchainService_1.default.getFactoryInfo();
        res.json(info);
    }
    catch (error) {
        console.error('Get factory info error:', error);
        res.status(500).json({ message: 'Failed to fetch factory info' });
    }
};
exports.getFactoryInfo = getFactoryInfo;
const preflightDeploy = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const { electionId } = req.params;
        const { from } = req.query;
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        if (election.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to deploy this election' });
        }
        const electionData = {
            title: election.title,
            description: election.description,
            startTime: Math.floor(election.startTime.getTime() / 1000),
            endTime: Math.floor(election.endTime.getTime() / 1000),
            timezone: election.timezone,
            ballotReceipt: false,
            submitConfirmation: true,
            maxVoters: election.maxVotersCount,
            allowVoterRegistration: election.voterSettings?.allowAnonymous || false,
            loginInstructions: election.loginInstructions || '',
            voteConfirmation: election.voteConfirmation || '',
            afterElectionMessage: election.afterElectionMessage || '',
            publicResults: election.metadata?.isPublic || false,
            realTimeResults: election.realTimeResults || false,
            resultsReleaseTime: election.resultsReleaseTime ? Math.floor(election.resultsReleaseTime.getTime() / 1000) : 0,
            allowResultsDownload: false
        };
        // pick from address: client-provided or backend signer
        let fromAddress;
        if (from) {
            fromAddress = from;
        }
        else {
            const pk = process.env.CREATOR_PRIVATE_KEY;
            if (!pk)
                return res.status(400).json({ message: 'Missing from address. Provide ?from=0x... or set CREATOR_PRIVATE_KEY.' });
            fromAddress = new (require('ethers').Wallet)(pk).address;
        }
        const result = await blockchainService_1.default.simulateCreateElection(electionData, fromAddress);
        res.json({ ok: result.ok, reason: result.reason, from: fromAddress, data: electionData });
    }
    catch (error) {
        console.error('Preflight deploy error:', error);
        res.status(500).json({ message: 'Preflight failed' });
    }
};
exports.preflightDeploy = preflightDeploy;
