import { Request, Response } from 'express';
import Voter from '../model/Voter';
import Election from '../model/Election';
import { AuthRequest } from '../middleware/auth';
import { validationResult } from 'express-validator';

// Add a single voter to an election
export const addVoter = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { electionId } = req.params;
    const { name, email, uniqueId, voteWeight, metadata } = req.body;

    // Check if election exists and user owns it
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    if (election.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if voter already exists
    const existingVoter = await Voter.findOne({ 
      electionId, 
      $or: [{ email }, { uniqueId }] 
    });

    if (existingVoter) {
      return res.status(400).json({ 
        message: 'Voter with this email or unique ID already exists' 
      });
    }

    // Generate secure voter key
    const voterKey = Voter.generateVoterKey();
    const verificationToken = Voter.generateVerificationToken();

    // Create voter
    const voter = new Voter({
      electionId,
      name,
      email,
      uniqueId,
      voterKey,
      voteWeight: voteWeight || 1,
      verificationToken,
      verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      metadata
    });

    await voter.save();

    // Return voter data without sensitive information
    const voterResponse = voter.toObject();
    delete voterResponse.voterKey;
    delete voterResponse.verificationToken;

    res.status(201).json({
      message: 'Voter added successfully',
      voter: voterResponse
    });

  } catch (error) {
    console.error('Add voter error:', error);
    res.status(500).json({ 
      message: 'Failed to add voter', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Bulk import voters from CSV/JSON data
export const bulkImportVoters = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId } = req.params;
    const { voters } = req.body;

    if (!Array.isArray(voters) || voters.length === 0) {
      return res.status(400).json({ message: 'Voters array is required' });
    }

    // Check if election exists and user owns it
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    if (election.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as any[]
    };

    const votersToAdd = [];

    for (let i = 0; i < voters.length; i++) {
      const voterData = voters[i];
      
      try {
        // Validate required fields
        if (!voterData.name || !voterData.email || !voterData.uniqueId) {
          results.failed++;
          results.errors.push({
            index: i,
            error: 'Missing required fields: name, email, or uniqueId'
          });
          continue;
        }

        // Check if voter already exists
        const existingVoter = await Voter.findOne({ 
          electionId, 
          $or: [{ email: voterData.email }, { uniqueId: voterData.uniqueId }] 
        });

        if (existingVoter) {
          results.failed++;
          results.errors.push({
            index: i,
            error: 'Voter already exists'
          });
          continue;
        }

        // Generate secure voter key
        const voterKey = Voter.generateVoterKey();
        const verificationToken = Voter.generateVerificationToken();

        votersToAdd.push({
          electionId,
          name: voterData.name,
          email: voterData.email,
          uniqueId: voterData.uniqueId,
          voterKey,
          voteWeight: voterData.voteWeight || 1,
          verificationToken,
          verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
          metadata: voterData.metadata || {}
        });

        results.success++;

      } catch (error) {
        results.failed++;
        results.errors.push({
          index: i,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Bulk insert voters
    if (votersToAdd.length > 0) {
      await Voter.insertMany(votersToAdd);
    }

    res.status(200).json({
      message: 'Bulk import completed',
      results
    });

  } catch (error) {
    console.error('Bulk import voters error:', error);
    res.status(500).json({ 
      message: 'Failed to import voters', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Get all voters for an election
export const getElectionVoters = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId } = req.params;
    const { status, page = 1, limit = 50, search } = req.query;

    // Check if election exists and user owns it
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    if (election.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Build filter
    const filter: any = { electionId };
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { uniqueId: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const skip = (Number(page) - 1) * Number(limit);
    
    const [voters, total] = await Promise.all([
      Voter.find(filter)
        .select('-voterKey -verificationToken')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Voter.countDocuments(filter)
    ]);

    res.status(200).json({
      voters,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });

  } catch (error) {
    console.error('Get election voters error:', error);
    res.status(500).json({ 
      message: 'Failed to get voters', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Get voter statistics for an election
export const getVoterStats = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId } = req.params;

    // Check if election exists and user owns it
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    if (election.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const stats = await Voter.aggregate([
      { $match: { electionId: election._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalVoters = await Voter.countDocuments({ electionId });
    const verifiedVoters = await Voter.countDocuments({ 
      electionId, 
      status: { $in: ['VERIFIED', 'ACTIVE'] } 
    });

    const statsMap = stats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {} as Record<string, number>);

    res.status(200).json({
      total: totalVoters,
      verified: verifiedVoters,
      byStatus: {
        PENDING: statsMap.PENDING || 0,
        VERIFIED: statsMap.VERIFIED || 0,
        ACTIVE: statsMap.ACTIVE || 0,
        SUSPENDED: statsMap.SUSPENDED || 0
      }
    });

  } catch (error) {
    console.error('Get voter stats error:', error);
    res.status(500).json({ 
      message: 'Failed to get voter statistics', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Update voter status
export const updateVoterStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId, voterId } = req.params;
    const { status } = req.body;

    if (!['PENDING', 'VERIFIED', 'ACTIVE', 'SUSPENDED'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Check if election exists and user owns it
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    if (election.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Update voter status
    const voter = await Voter.findOneAndUpdate(
      { _id: voterId, electionId },
      { 
        status,
        ...(status === 'VERIFIED' && { verifiedAt: new Date() }),
        lastActivity: new Date()
      },
      { new: true }
    ).select('-voterKey -verificationToken');

    if (!voter) {
      return res.status(404).json({ message: 'Voter not found' });
    }

    res.status(200).json({
      message: 'Voter status updated successfully',
      voter
    });

  } catch (error) {
    console.error('Update voter status error:', error);
    res.status(500).json({ 
      message: 'Failed to update voter status', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Delete a voter
export const deleteVoter = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId, voterId } = req.params;

    // Check if election exists and user owns it
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    if (election.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Delete voter
    const voter = await Voter.findOneAndDelete({ _id: voterId, electionId });
    
    if (!voter) {
      return res.status(404).json({ message: 'Voter not found' });
    }

    res.status(200).json({
      message: 'Voter deleted successfully'
    });

  } catch (error) {
    console.error('Delete voter error:', error);
    res.status(500).json({ 
      message: 'Failed to delete voter', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Verify voter with token
export const verifyVoter = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const voter = await Voter.findOne({ 
      verificationToken: token,
      verificationExpires: { $gt: new Date() }
    });

    if (!voter) {
      return res.status(400).json({ message: 'Invalid or expired verification token' });
    }

    // Update voter status
    voter.status = 'VERIFIED';
    voter.verifiedAt = new Date();
    voter.verificationToken = undefined;
    voter.verificationExpires = undefined;
    voter.lastActivity = new Date();

    await voter.save();

    res.status(200).json({
      message: 'Voter verified successfully',
      voterId: voter._id
    });

  } catch (error) {
    console.error('Verify voter error:', error);
    res.status(500).json({ 
      message: 'Failed to verify voter', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Export voters for blockchain deployment
export const exportVotersForDeployment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId } = req.params;

    // Check if election exists and user owns it
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    if (election.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get verified voters with their keys
    const voters = await Voter.find({ 
      electionId, 
      status: { $in: ['VERIFIED', 'ACTIVE'] } 
    }).select('name email uniqueId voterKeyHash voteWeight');

    if (voters.length === 0) {
      return res.status(400).json({ message: 'No verified voters found for deployment' });
    }

    // Format for blockchain deployment
    const deploymentData = voters.map(voter => ({
      voterId: voter.uniqueId,
      voterKeyHash: voter.voterKeyHash,
      voteWeight: voter.voteWeight,
      name: voter.name,
      email: voter.email
    }));

    res.status(200).json({
      message: 'Voters exported for deployment',
      count: voters.length,
      voters: deploymentData
    });

  } catch (error) {
    console.error('Export voters for deployment error:', error);
    res.status(500).json({ 
      message: 'Failed to export voters', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};
