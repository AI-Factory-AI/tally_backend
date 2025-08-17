import { Request, Response } from 'express';
import Election from '../model/Election';
import { AuthRequest } from '../middleware/auth';

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

    if (start <= now) {
      return res.status(400).json({ 
        message: 'Start time must be in the future',
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

    const election = await Election.findById(electionId);
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

    await Election.findByIdAndDelete(electionId);

    res.json({ message: 'Election deleted successfully' });
  } catch (error) {
    console.error('Delete election error:', error);
    res.status(500).json({ 
      message: 'Failed to delete election',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Deploy an election to blockchain
export const deployElection = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId } = req.params;
    const { blockchainAddress, blockchainTxHash } = req.body;

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    // Check ownership
    if (election.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Only allow deployment of draft elections
    if (election.status !== 'DRAFT') {
      return res.status(400).json({ 
        message: 'Only draft elections can be deployed' 
      });
    }

    // Update election status and blockchain info
    election.status = 'SCHEDULED';
    election.blockchainAddress = blockchainAddress;
    election.blockchainTxHash = blockchainTxHash;
    election.deployedAt = new Date();
    election.liveUrl = `/election/${election._id}`;
    
    await election.save();

    res.json({
      message: 'Election deployed successfully',
      election: {
        id: election._id,
        title: election.title,
        status: election.status,
        blockchainAddress: election.blockchainAddress,
        liveUrl: election.liveUrl,
        deployedAt: election.deployedAt
      }
    });
  } catch (error) {
    console.error('Deploy election error:', error);
    res.status(500).json({ 
      message: 'Failed to deploy election',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
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
