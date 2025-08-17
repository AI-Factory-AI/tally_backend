import { Request, Response } from 'express';
import Vote from '../model/Vote';
import Voter from '../model/Voter';
import Ballot from '../model/Ballot';
import Election from '../model/Election';
import { AuthRequest } from '../middleware/auth';
import { validationResult } from 'express-validator';

// Submit a vote
export const submitVote = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { electionId } = req.params;
    const { voterId, voterKey, choices, metadata } = req.body;

    // Check if election exists and is active
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    if (election.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Election is not active for voting' });
    }

    // Check if election has ended
    if (new Date() > election.endTime) {
      return res.status(400).json({ message: 'Election has ended' });
    }

    // Verify voter
    const voter = await Voter.findOne({ 
      electionId, 
      uniqueId: voterId,
      status: { $in: ['VERIFIED', 'ACTIVE'] }
    });

    if (!voter) {
      return res.status(404).json({ message: 'Voter not found or not verified' });
    }

    // Verify voter key
    const decryptedKey = voter.decryptVoterKey();
    if (!decryptedKey || decryptedKey !== voterKey) {
      return res.status(401).json({ message: 'Invalid voter key' });
    }

    // Check if voter has already voted
    if (voter.hasVoted) {
      return res.status(400).json({ message: 'Voter has already voted' });
    }

    // Get active ballot
    const ballot = await Ballot.findOne({ electionId, isActive: true });
    if (!ballot) {
      return res.status(404).json({ message: 'No active ballot found for this election' });
    }

    // Validate vote choices against ballot
    const validationResult = validateVoteChoices(choices, ballot.questions);
    if (!validationResult.isValid) {
      return res.status(400).json({ 
        message: 'Invalid vote choices', 
        errors: validationResult.errors 
      });
    }

    // Create vote record
    const vote = new Vote({
      electionId,
      voterId: voter._id,
      ballotId: ballot._id,
      choices,
      status: 'PENDING',
      metadata: {
        userAgent: req.headers['user-agent'] || '',
        ipAddress: req.ip || req.connection.remoteAddress || '',
        deviceInfo: req.headers['sec-ch-ua-platform'] || '',
        location: '',
        votingMethod: 'WEB',
        ...metadata
      }
    });

    await vote.save();

    // Mark voter as voted
    voter.hasVoted = true;
    voter.lastActivity = new Date();
    await voter.save();

    res.status(201).json({
      message: 'Vote submitted successfully',
      voteId: vote._id,
      status: vote.status
    });

  } catch (error) {
    console.error('Submit vote error:', error);
    res.status(500).json({ 
      message: 'Failed to submit vote', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Get vote by voter
export const getVoteByVoter = async (req: Request, res: Response) => {
  try {
    const { electionId, voterId } = req.params;
    const { voterKey } = req.query;

    if (!voterKey) {
      return res.status(400).json({ message: 'Voter key is required' });
    }

    // Check if election exists
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    // Verify voter
    const voter = await Voter.findOne({ 
      electionId, 
      uniqueId: voterId,
      status: { $in: ['VERIFIED', 'ACTIVE'] }
    });

    if (!voter) {
      return res.status(404).json({ message: 'Voter not found or not verified' });
    }

    // Verify voter key
    const decryptedKey = voter.decryptVoterKey();
    if (!decryptedKey || decryptedKey !== voterKey) {
      return res.status(401).json({ message: 'Invalid voter key' });
    }

    // Get vote
    const vote = await Vote.findOne({ electionId, voterId: voter._id });

    if (!vote) {
      return res.status(404).json({ message: 'No vote found for this voter' });
    }

    res.status(200).json({
      vote: {
        _id: vote._id,
        status: vote.status,
        submittedAt: vote.submittedAt,
        confirmedAt: vote.confirmedAt,
        blockchainTxHash: vote.blockchainTxHash
      }
    });

  } catch (error) {
    console.error('Get vote by voter error:', error);
    res.status(500).json({ 
      message: 'Failed to get vote', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Get election results (for election creator)
export const getElectionResults = async (req: AuthRequest, res: Response) => {
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

    // Check if results should be available
    if (election.status === 'ACTIVE' && !election.realTimeResults) {
      return res.status(400).json({ message: 'Real-time results are not enabled for this election' });
    }

    if (election.status === 'SCHEDULED' && election.resultsReleaseTime && new Date() < election.resultsReleaseTime) {
      return res.status(400).json({ message: 'Results are not yet available' });
    }

    // Get ballot
    const ballot = await Ballot.findOne({ electionId, isActive: true });
    if (!ballot) {
      return res.status(404).json({ message: 'No active ballot found' });
    }

    // Get all confirmed votes
    const votes = await Vote.find({ 
      electionId, 
      status: 'CONFIRMED' 
    }).populate('voterId', 'name uniqueId voteWeight');

    // Calculate results
    const results = calculateElectionResults(ballot.questions, votes);

    // Get vote statistics
    const voteStats = await Vote.getVoteStats(electionId);

    res.status(200).json({
      election: {
        title: election.title,
        status: election.status,
        totalVoters: election.maxVotersCount,
        startTime: election.startTime,
        endTime: election.endTime
      },
      ballot: {
        title: ballot.title,
        questions: ballot.questions
      },
      results,
      statistics: {
        totalVotes: votes.length,
        confirmedVotes: votes.filter(v => v.status === 'CONFIRMED').length,
        pendingVotes: votes.filter(v => v.status === 'PENDING').length,
        byStatus: voteStats
      }
    });

  } catch (error) {
    console.error('Get election results error:', error);
    res.status(500).json({ 
      message: 'Failed to get election results', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Get public election results
export const getPublicElectionResults = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;

    // Check if election exists and is public
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    if (!election.metadata?.isPublic) {
      return res.status(403).json({ message: 'Election results are not public' });
    }

    // Check if results should be available
    if (election.status === 'ACTIVE' && !election.realTimeResults) {
      return res.status(400).json({ message: 'Real-time results are not enabled for this election' });
    }

    if (election.status === 'SCHEDULED' && election.resultsReleaseTime && new Date() < election.resultsReleaseTime) {
      return res.status(400).json({ message: 'Results are not yet available' });
    }

    // Get ballot
    const ballot = await Ballot.findOne({ electionId, isActive: true });
    if (!ballot) {
      return res.status(404).json({ message: 'No active ballot found' });
    }

    // Get all confirmed votes
    const votes = await Vote.find({ 
      electionId, 
      status: 'CONFIRMED' 
    });

    // Calculate results
    const results = calculateElectionResults(ballot.questions, votes);

    // Get vote statistics
    const totalVotes = votes.length;

    res.status(200).json({
      election: {
        title: election.title,
        status: election.status,
        totalVoters: election.maxVotersCount,
        startTime: election.startTime,
        endTime: election.endTime
      },
      ballot: {
        title: ballot.title,
        questions: ballot.questions
      },
      results,
      statistics: {
        totalVotes,
        participationRate: election.maxVotersCount > 0 ? (totalVotes / election.maxVotersCount) * 100 : 0
      }
    });

  } catch (error) {
    console.error('Get public election results error:', error);
    res.status(500).json({ 
      message: 'Failed to get election results', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Confirm vote on blockchain
export const confirmVoteOnBlockchain = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { voteId } = req.params;
    const { blockchainTxHash, blockchainBlockNumber, ipfsCid } = req.body;

    // Check if vote exists
    const vote = await Vote.findById(voteId);
    if (!vote) {
      return res.status(404).json({ message: 'Vote not found' });
    }

    // Check if user owns the election
    const election = await Election.findById(vote.electionId);
    if (!election || election.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Confirm vote
    await vote.confirm(blockchainTxHash, blockchainBlockNumber);
    if (ipfsCid) {
      vote.ipfsCid = ipfsCid;
      await vote.save();
    }

    res.status(200).json({
      message: 'Vote confirmed on blockchain',
      vote: {
        _id: vote._id,
        status: vote.status,
        blockchainTxHash: vote.blockchainTxHash,
        blockchainBlockNumber: vote.blockchainBlockNumber,
        confirmedAt: vote.confirmedAt
      }
    });

  } catch (error) {
    console.error('Confirm vote on blockchain error:', error);
    res.status(500).json({ 
      message: 'Failed to confirm vote', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Reject vote
export const rejectVote = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { voteId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    // Check if vote exists
    const vote = await Vote.findById(voteId);
    if (!vote) {
      return res.status(404).json({ message: 'Vote not found' });
    }

    // Check if user owns the election
    const election = await Election.findById(vote.electionId);
    if (!election || election.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Reject vote
    await vote.reject(reason);

    // Reset voter's hasVoted status
    const voter = await Voter.findById(vote.voterId);
    if (voter) {
      voter.hasVoted = false;
      await voter.save();
    }

    res.status(200).json({
      message: 'Vote rejected successfully',
      vote: {
        _id: vote._id,
        status: vote.status,
        rejectedAt: vote.rejectedAt,
        rejectionReason: vote.rejectionReason
      }
    });

  } catch (error) {
    console.error('Reject vote error:', error);
    res.status(500).json({ 
      message: 'Failed to reject vote', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Helper function to validate vote choices
function validateVoteChoices(choices: any[], questions: any[]) {
  const errors: string[] = [];

  for (const question of questions) {
    const choice = choices.find(c => c.questionId === question.questionId);
    
    if (!choice && question.required) {
      errors.push(`Question '${question.question}' is required`);
      continue;
    }

    if (choice) {
      // Validate single choice questions
      if (question.type === 'single') {
        if (!choice.selectedOptions || choice.selectedOptions.length !== 1) {
          errors.push(`Question '${question.question}' requires exactly one selection`);
        }
      }

      // Validate multiple choice questions
      if (question.type === 'multiple') {
        if (!choice.selectedOptions || choice.selectedOptions.length === 0) {
          if (question.required) {
            errors.push(`Question '${question.question}' requires at least one selection`);
          }
        } else if (question.validation.maxSelections && choice.selectedOptions.length > question.validation.maxSelections) {
          errors.push(`Question '${question.question}' allows maximum ${question.validation.maxSelections} selections`);
        }
      }

      // Validate text questions
      if (question.type === 'text') {
        if (!choice.textAnswer && question.required) {
          errors.push(`Question '${question.question}' requires a text answer`);
        } else if (choice.textAnswer && question.validation.maxLength && choice.textAnswer.length > question.validation.maxLength) {
          errors.push(`Question '${question.question}' text answer is too long (max ${question.validation.maxLength} characters)`);
        }
      }

      // Validate ranking questions
      if (question.type === 'ranking') {
        if (!choice.rankingOrder || choice.rankingOrder.length !== question.options?.length) {
          errors.push(`Question '${question.question}' requires ranking all options`);
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Helper function to calculate election results
function calculateElectionResults(questions: any[], votes: any[]) {
  const results: any[] = [];

  for (const question of questions) {
    const questionVotes = votes.filter(v => 
      v.choices.some(c => c.questionId === question.questionId)
    );

    if (question.type === 'single' || question.type === 'multiple') {
      const optionCounts: Record<string, number> = {};
      const optionVoteWeights: Record<string, number> = {};

      // Initialize counts
      if (question.options) {
        for (const option of question.options) {
          optionCounts[option.optionId] = 0;
          optionVoteWeights[option.optionId] = 0;
        }
      }

      // Count votes
      for (const vote of questionVotes) {
        const choice = vote.choices.find(c => c.questionId === question.questionId);
        if (choice && choice.selectedOptions) {
          for (const optionId of choice.selectedOptions) {
            optionCounts[optionId] = (optionCounts[optionId] || 0) + 1;
            optionVoteWeights[optionId] = (optionVoteWeights[optionId] || 0) + (vote.voterId?.voteWeight || 1);
          }
        }
      }

      results.push({
        questionId: question.questionId,
        question: question.question,
        type: question.type,
        totalVotes: questionVotes.length,
        options: question.options?.map(option => ({
          optionId: option.optionId,
          text: option.text,
          value: option.value,
          count: optionCounts[option.optionId] || 0,
          voteWeight: optionVoteWeights[option.optionId] || 0,
          percentage: questionVotes.length > 0 ? ((optionCounts[option.optionId] || 0) / questionVotes.length) * 100 : 0
        })) || []
      });
    } else if (question.type === 'text') {
      const textAnswers = questionVotes
        .map(vote => {
          const choice = vote.choices.find(c => c.questionId === question.questionId);
          return choice?.textAnswer;
        })
        .filter(Boolean);

      results.push({
        questionId: question.questionId,
        question: question.question,
        type: question.type,
        totalVotes: questionVotes.length,
        textAnswers: textAnswers.length,
        sampleAnswers: textAnswers.slice(0, 5) // Show first 5 answers as sample
      });
    } else if (question.type === 'ranking') {
      const rankingResults: Record<string, number[]> = {};

      // Initialize ranking arrays
      if (question.options) {
        for (const option of question.options) {
          rankingResults[option.optionId] = new Array(question.options.length).fill(0);
        }
      }

      // Calculate ranking scores
      for (const vote of questionVotes) {
        const choice = vote.choices.find(c => c.questionId === question.questionId);
        if (choice && choice.rankingOrder) {
          for (let i = 0; i < choice.rankingOrder.length; i++) {
            const optionId = choice.rankingOrder[i];
            if (rankingResults[optionId]) {
              rankingResults[optionId][i] += 1;
            }
          }
        }
      }

      // Calculate average rankings
      const averageRankings = Object.entries(rankingResults).map(([optionId, rankings]) => {
        const option = question.options?.find(o => o.optionId === optionId);
        let totalScore = 0;
        let totalVotes = 0;

        for (let i = 0; i < rankings.length; i++) {
          totalScore += rankings[i] * (i + 1);
          totalVotes += rankings[i];
        }

        return {
          optionId,
          text: option?.text || '',
          value: option?.value || '',
          averageRank: totalVotes > 0 ? totalScore / totalVotes : 0,
          totalVotes
        };
      }).sort((a, b) => a.averageRank - b.averageRank);

      results.push({
        questionId: question.questionId,
        question: question.question,
        type: question.type,
        totalVotes: questionVotes.length,
        rankings: averageRankings
      });
    }
  }

  return results;
}
