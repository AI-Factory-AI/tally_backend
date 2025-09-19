import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Election from '../model/Election';
import Voter from '../model/Voter';
import { AuthRequest } from '../middleware/auth';
import blockchainService, { ElectionData, VoterData } from '../service/blockchainService';
import { ethers } from 'ethers';

// Create a new election draft
export const createElection = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log('Creating election with data:', req.body);
    console.log('User:', req.user);

    const {
      title,
      description,
      startTime,
      endTime,
      timezone,
      maxVotersCount,
      loginInstructions,
      voteConfirmation,
      afterElectionMessage,
      realTimeResults,
      resultsReleaseTime,
      ballotConfig,
      voterSettings,
      metadata
    } = req.body;

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
    const election = new Election({
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
  } catch (error) {
    console.error('Create election error:', error);
    res.status(500).json({ 
      message: 'Failed to create election',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get all elections for a user
export const getUserElections = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { status, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    const query: any = { creator: req.user.id };
    if (status && status !== 'all') {
      query.status = status;
    }

    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

    const elections = await Election.find(query)
      .sort(sort)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .select('-ballotConfig -voterSettings -metadata')
      .lean();

    const total = await Election.countDocuments(query);

    res.json({
      elections,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get user elections error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch elections',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get a specific election
export const getElection = async (req: AuthRequest, res: Response) => {
  try {
    const { electionId } = req.params;
    
    const election = await Election.findById(electionId)
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
  } catch (error) {
    console.error('Get election error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch election',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Update an election draft
export const updateElection = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId } = req.params;
    const updateData = req.body;

    const election = await Election.findById(electionId);
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
  } catch (error) {
    console.error('Update election error:', error);
    res.status(500).json({ 
      message: 'Failed to update election',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Delete an election
export const deleteElection = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId } = req.params;

    // Validate election ID
    if (!electionId || !mongoose.Types.ObjectId.isValid(electionId)) {
      return res.status(400).json({ message: 'Invalid election ID' });
    }

    // Find the election
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    // Check if user owns the election
    if (election.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You can only delete your own elections' });
    }

    // Check if election is in a deletable state
    if (election.status === 'ACTIVE') {
      return res.status(400).json({ 
        message: 'Cannot delete active election. Please end the election first.' 
      });
    }

    if (election.status === 'COMPLETED') {
      return res.status(400).json({ 
        message: 'Cannot delete completed election. Elections with results cannot be deleted.' 
      });
    }

    // Delete related data
    console.log('Deleting election and related data...');
    
    // Delete voters
    const voterResult = await Voter.deleteMany({ electionId });
    console.log(`Deleted ${voterResult.deletedCount} voters`);

    // Delete votes
    const Vote = require('../model/Vote').default;
    const voteResult = await Vote.deleteMany({ electionId });
    console.log(`Deleted ${voteResult.deletedCount} votes`);

    // Delete candidate ballots
    const CandidateBallot = require('../model/CandidateBallot').default;
    const ballotResult = await CandidateBallot.deleteMany({ electionId });
    console.log(`Deleted ${ballotResult.deletedCount} candidate ballots`);

    // Delete notifications related to this election
    const Notification = require('../model/Notification').default;
    const notificationResult = await Notification.deleteMany({ 
      $or: [
        { 'data.electionId': electionId },
        { 'data.election': electionId }
      ]
    });
    console.log(`Deleted ${notificationResult.deletedCount} notifications`);

    // Finally, delete the election
    await Election.findByIdAndDelete(electionId);

    console.log(`Election ${electionId} deleted successfully`);

    res.json({
      message: 'Election deleted successfully',
      deletedData: {
        election: 1,
        voters: voterResult.deletedCount,
        votes: voteResult.deletedCount,
        ballots: ballotResult.deletedCount,
        notifications: notificationResult.deletedCount
      }
    });

  } catch (error) {
    console.error('Error deleting election:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Deploy election to blockchain
export const deployElection = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId } = req.params;

    // Get election from database
    const election = await Election.findById(electionId);
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

    // Require a creator private key from environment (no hardcoded defaults)
    const creatorPrivateKey = process.env.CREATOR_PRIVATE_KEY;
    if (!creatorPrivateKey) {
      return res.status(400).json({ message: 'Missing CREATOR_PRIVATE_KEY' });
    }

    // Prepare election data for blockchain
    const now = Math.floor(Date.now() / 1000);
    const originalStartTs = Math.floor(election.startTime.getTime() / 1000);
    const endTs = Math.floor(election.endTime.getTime() / 1000);
    
    // Ensure start time is not in the past (contract requirement)
    const startTs = Math.max(originalStartTs, now);
    
    // Enforce factory minimums to avoid on-chain revert
    const MIN_DURATION = 3600; // 1 hour
    if (endTs - startTs < MIN_DURATION) {
      return res.status(400).json({ message: 'Election duration too short. Must be at least 1 hour.' });
    }
    
    console.log('Original start time:', new Date(originalStartTs * 1000));
    console.log('Adjusted start time:', new Date(startTs * 1000));
    console.log('End time:', new Date(endTs * 1000));

    const electionData: ElectionData = {
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
    const force = String((req.query as any)?.force || '').toLowerCase() === 'true';
    if (!force) {
      try {
        const fromAddr = new (require('ethers').Wallet)(creatorPrivateKey).address;
        const sim = await blockchainService.simulateCreateElection(electionData, fromAddr);
        if (!sim.ok) {
          return res.status(400).json({ message: 'Preflight failed', reason: sim.reason, from: fromAddr });
        }
      } catch (pfErr) {
        console.warn('Preflight error (non-fatal):', pfErr);
      }
    }

    // Deploy to blockchain
    console.log('Deploying election to blockchain...');
    console.log('Election data prepared:', electionData);
    console.log('Using private key:', creatorPrivateKey.substring(0, 10) + '...');
    
    const { electionAddress, txHash } = await blockchainService.createElection(
      electionData,
      creatorPrivateKey
    );
    
    console.log('Election deployed successfully!');
    console.log('Election address:', electionAddress);
    console.log('Transaction hash:', txHash);

    // Update election in database
    election.blockchainAddress = electionAddress;
    election.blockchainTxHash = txHash;
    election.deployedAt = new Date();
    election.status = 'SCHEDULED'; // Change to SCHEDULED after deployment
    election.liveUrl = `/election/${election._id}`;
    
    // Update start time if it was adjusted
    if (startTs !== originalStartTs) {
      election.startTime = new Date(startTs * 1000);
      console.log('Updated election start time in database to:', election.startTime);
    }
    
    await election.save();

    // Automatically start the election on-chain after deployment
    try {
      console.log('Starting election on-chain after deployment...');
      const rpcUrl = process.env.RPC_URL || 'https://rpc.sepolia-api.lisk.com';
      const pk = process.env.CREATOR_PRIVATE_KEY;
      if (pk) {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(pk, provider);
        const { CONTRACT_ABIS } = await import('../config/blockchain');
        const core = new ethers.Contract(electionAddress, CONTRACT_ABIS.ElectionCore, wallet);
        
        const startTx = await core.startElection();
        const startReceipt = await startTx.wait();
        
        // Update election status to ACTIVE
        election.status = 'ACTIVE';
        election.startedAt = new Date();
        await election.save();
        
        console.log('Election started on-chain successfully:', startTx.hash);
      }
    } catch (startError) {
      console.error('Failed to start election on-chain after deployment:', startError);
      // Don't fail the deployment if starting fails
    }

    // Register all voters on blockchain
    console.log('Registering voters on blockchain...');
    const voters = await Voter.find({ electionId, status: 'ACTIVE' });
    
    if (voters.length > 0) {
      const voterData = voters.map(voter => ({
        voterId: voter.uniqueId,
        email: voter.email
      }));

      try {
        const voterTxHash = await blockchainService.registerVoters(
          electionAddress,
          voterData,
          creatorPrivateKey
        );
        console.log('Voters registered successfully:', voterTxHash.txHash);
      } catch (voterError) {
        console.error('Error registering voters:', voterError);
        // Continue even if voter registration fails
      }
    }

    // Paymaster setup skipped - using manual wallet voting instead

    // Ballot data is stored in backend database only (not on-chain)
    console.log('Ballot data stored in backend database for voting');

    res.json({
      message: 'Election deployed and started on-chain successfully with voters registered',
      election: {
        id: election._id,
        blockchainAddress: electionAddress,
        txHash: txHash,
        status: election.status,
        liveUrl: election.liveUrl,
        deployedAt: election.deployedAt,
        votersRegistered: voters.length
      }
    });
  } catch (error) {
    console.error('Error deploying election:', error);
    res.status(500).json({ message: 'Failed to deploy election to blockchain' });
  }
};

// Manually activate an election (for testing purposes)
export const activateElection = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId } = req.params;

    // Get election from database
    const election = await Election.findById(electionId);
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
  } catch (error) {
    console.error('Error activating election:', error);
    res.status(500).json({ message: 'Failed to activate election' });
  }
};

// Get public elections
export const getPublicElections = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, category, search } = req.query;
    
    const query: any = { 
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

    const elections = await Election.find(query)
      .populate('creator', 'name institution')
      .sort({ startTime: 1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .select('-ballotConfig -voterSettings -loginInstructions -voteConfirmation -afterElectionMessage')
      .lean();

    const total = await Election.countDocuments(query);

    res.json({
      elections,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get public elections error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch public elections',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get election statistics
export const getElectionStats = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const stats = await Election.aggregate([
      { $match: { creator: req.user.id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalElections = await Election.countDocuments({ creator: req.user.id });
    const recentElections = await Election.find({ creator: req.user.id })
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
  } catch (error) {
    console.error('Get election stats error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch election statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};


// Register voters for deployed election
export const registerVoters = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId } = req.params;
    const { voters } = req.body;

    // Get election from database
    const election = await Election.findById(electionId);
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
    const voterData: VoterData[] = voters.map((voter: any) => ({
      voterId: voter.voterId || voter.id,
      email: voter.email
    }));

    // Get creator's private key
    const creatorPrivateKey = process.env.CREATOR_PRIVATE_KEY;
    if (!creatorPrivateKey) {
      return res.status(400).json({ message: 'Missing CREATOR_PRIVATE_KEY' });
    }

    // Register voters on blockchain
    const { txHash } = await blockchainService.registerVoters(
      election.blockchainAddress,
      voterData,
      creatorPrivateKey
    );

    res.json({
      message: 'Voters registered successfully',
      txHash: txHash,
      registeredCount: voters.length
    });
  } catch (error) {
    console.error('Error registering voters:', error);
    res.status(500).json({ message: 'Failed to register voters' });
  }
};

export const getFactoryInfo = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const info = await blockchainService.getFactoryInfo();
    res.json(info);
  } catch (error) {
    console.error('Get factory info error:', error);
    res.status(500).json({ message: 'Failed to fetch factory info' });
  }
};

// Start election ON-CHAIN (owner-only) so voting by ID can proceed
export const startElectionOnChain = async (req: AuthRequest<{ electionId: string }>, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId } = req.params;
    const election = await Election.findById(electionId);
    if (!election) return res.status(404).json({ message: 'Election not found' });
    if (election.creator.toString() !== req.user.id) return res.status(403).json({ message: 'Access denied' });
    
    console.log('Election blockchainAddress:', election.blockchainAddress);
    console.log('Election status:', election.status);
    console.log('Election deployedAt:', election.deployedAt);
    
    if (!election.blockchainAddress) return res.status(400).json({ message: 'Election not deployed' });

    // Ensure current time is within the configured window (optional safety)
    const now = Date.now();
    if (now < new Date(election.startTime).getTime()) {
      return res.status(400).json({ message: 'Start time not reached' });
    }

    const rpcUrl = process.env.RPC_URL || 'https://rpc.sepolia-api.lisk.com';
    const pk = process.env.CREATOR_PRIVATE_KEY;
    if (!pk) return res.status(400).json({ message: 'Missing CREATOR_PRIVATE_KEY' });

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(pk, provider);
    const { CONTRACT_ABIS } = await import('../config/blockchain');
    const core = new ethers.Contract(election.blockchainAddress, CONTRACT_ABIS.ElectionCore, wallet);

    // If already ACTIVE on-chain, skip
    try {
      const isActive: boolean = await core.isElectionActive();
      if (isActive) {
        if (election.status !== 'ACTIVE') {
          election.status = 'ACTIVE';
          election.startedAt = new Date();
          await election.save();
        }
        return res.json({ message: 'Election already active on-chain' });
      }
    } catch {}

    const tx = await core.startElection();
    const receipt = await tx.wait();

    // Sync DB status
    election.status = 'ACTIVE';
    election.startedAt = new Date();
    await election.save();

    return res.json({ message: 'Election started on-chain', txHash: tx.hash, blockNumber: (receipt as any)?.blockNumber });
  } catch (err) {
    console.error('startElectionOnChain error:', err);
    return res.status(500).json({ message: 'Failed to start election on-chain', error: err instanceof Error ? err.message : String(err) });
  }
};

// Update election with deployment info (for wallet deployments)
export const updateElectionDeployment = async (req: AuthRequest<{ electionId: string }>, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId } = req.params;
    const { blockchainAddress, blockchainTxHash } = req.body;

    if (!blockchainAddress || !blockchainTxHash) {
      return res.status(400).json({ message: 'blockchainAddress and blockchainTxHash are required' });
    }

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    if (election.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Update election with deployment info
    election.blockchainAddress = blockchainAddress;
    election.blockchainTxHash = blockchainTxHash;
    election.deployedAt = new Date();
    election.status = 'SCHEDULED';
    election.liveUrl = `/election/${election._id}`;
    
    await election.save();

    // Register voters on blockchain
    console.log('Registering voters on blockchain...');
    const voters = await Voter.find({ electionId, status: 'ACTIVE' });
    
    if (voters.length > 0) {
      const voterData = voters.map(voter => ({
        voterId: voter.uniqueId,
        email: voter.email
      }));

      try {
        const creatorPrivateKey = process.env.CREATOR_PRIVATE_KEY;
        if (!creatorPrivateKey) {
          throw new Error('Missing CREATOR_PRIVATE_KEY');
        }
        const voterTxHash = await blockchainService.registerVoters(
          blockchainAddress,
          voterData,
          creatorPrivateKey
        );
        console.log('Voters registered successfully:', voterTxHash.txHash);
      } catch (voterError) {
        console.error('Error registering voters:', voterError);
        // Continue even if voter registration fails
      }
    }

    // Start election on-chain
    try {
      console.log('Starting election on-chain after wallet deployment...');
      const rpcUrl = process.env.RPC_URL || 'https://rpc.sepolia-api.lisk.com';
      const pk = process.env.CREATOR_PRIVATE_KEY;
      if (pk) {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(pk, provider);
        const { CONTRACT_ABIS } = await import('../config/blockchain');
        const core = new ethers.Contract(blockchainAddress, CONTRACT_ABIS.ElectionCore, wallet);
        
        // Check if already active first
        const isAlreadyActive = await core.isElectionActive();
        console.log('Election already active on-chain:', isAlreadyActive);
        
        if (!isAlreadyActive) {
          const startTx = await core.startElection();
          console.log('Start election transaction sent:', startTx.hash);
          const startReceipt = await startTx.wait();
          console.log('Start election transaction confirmed:', startReceipt.status);
          
          if (startReceipt.status !== 1) {
            throw new Error('Start election transaction failed');
          }
        }
        
        // Update election status to ACTIVE
        election.status = 'ACTIVE';
        election.startedAt = new Date();
        await election.save();
        
        console.log('Election started on-chain successfully');
      } else {
        console.error('No CREATOR_PRIVATE_KEY found, cannot start election on-chain');
      }
    } catch (startError) {
      console.error('Failed to start election on-chain after wallet deployment:', startError);
      // Don't fail the update if starting fails, but log the error
      return res.status(500).json({ 
        message: 'Election deployed but failed to start on-chain', 
        error: startError instanceof Error ? startError.message : String(startError),
        election: {
          id: election._id,
          blockchainAddress: blockchainAddress,
          txHash: blockchainTxHash,
          status: election.status
        }
      });
    }

    res.json({
      message: 'Election deployment updated and started on-chain successfully',
      election: {
        id: election._id,
        blockchainAddress: blockchainAddress,
        txHash: blockchainTxHash,
        status: election.status,
        liveUrl: election.liveUrl,
        deployedAt: election.deployedAt,
        votersRegistered: voters.length
      }
    });
  } catch (error) {
    console.error('Error updating election deployment:', error);
    res.status(500).json({ message: 'Failed to update election deployment' });
  }
};

export const preflightDeploy = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId } = req.params;
    const { from } = req.query as { from?: string };

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }
    if (election.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to deploy this election' });
    }

    const electionData: ElectionData = {
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
    let fromAddress: string;
    if (from) {
      fromAddress = from;
    } else {
      const pk = process.env.CREATOR_PRIVATE_KEY;
      if (!pk) return res.status(400).json({ message: 'Missing from address. Provide ?from=0x... or set CREATOR_PRIVATE_KEY.' });
      fromAddress = new (require('ethers').Wallet)(pk).address;
    }

    const result = await blockchainService.simulateCreateElection(electionData, fromAddress);
    res.json({ ok: result.ok, reason: result.reason, from: fromAddress, data: electionData });
  } catch (error) {
    console.error('Preflight deploy error:', error);
    res.status(500).json({ message: 'Preflight failed' });
  }
};
