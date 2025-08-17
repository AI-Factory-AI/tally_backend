import { Request, Response } from 'express';
import Ballot from '../model/Ballot';
import Election from '../model/Election';
import { AuthRequest } from '../middleware/auth';
import { validationResult } from 'express-validator';

// Create or update ballot for an election
export const createOrUpdateBallot = async (req: AuthRequest, res: Response) => {
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
    const { title, description, questions, settings } = req.body;

    // Check if election exists and user owns it
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    if (election.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if election is in draft status
    if (election.status !== 'DRAFT') {
      return res.status(400).json({ 
        message: 'Can only modify ballot for elections in DRAFT status' 
      });
    }

    // Check if active ballot exists
    let ballot = await Ballot.findOne({ electionId, isActive: true });

    if (ballot) {
      // Update existing ballot
      ballot.title = title;
      ballot.description = description;
      ballot.questions = questions;
      ballot.settings = { ...ballot.settings, ...settings };
      ballot.updatedAt = new Date();
    } else {
      // Create new ballot
      ballot = new Ballot({
        electionId,
        title,
        description,
        questions,
        settings: {
          allowAbstention: false,
          requireAllQuestions: true,
          randomizeOrder: false,
          showProgressBar: true,
          allowReview: true,
          allowChange: false,
          ...settings
        },
        version: 1,
        isActive: true
      });
    }

    await ballot.save();

    res.status(200).json({
      message: ballot.isNew ? 'Ballot created successfully' : 'Ballot updated successfully',
      ballot: {
        _id: ballot._id,
        title: ballot.title,
        description: ballot.description,
        questions: ballot.questions,
        settings: ballot.settings,
        version: ballot.version,
        isActive: ballot.isActive,
        createdAt: ballot.createdAt,
        updatedAt: ballot.updatedAt
      }
    });

  } catch (error) {
    console.error('Create/Update ballot error:', error);
    res.status(500).json({ 
      message: 'Failed to create/update ballot', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Get ballot for an election
export const getElectionBallot = async (req: AuthRequest, res: Response) => {
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

    // Get active ballot
    const ballot = await Ballot.findOne({ electionId, isActive: true });

    if (!ballot) {
      return res.status(404).json({ message: 'No active ballot found for this election' });
    }

    res.status(200).json({
      ballot: {
        _id: ballot._id,
        title: ballot.title,
        description: ballot.description,
        questions: ballot.questions,
        settings: ballot.settings,
        version: ballot.version,
        isActive: ballot.isActive,
        createdAt: ballot.createdAt,
        updatedAt: ballot.updatedAt
      }
    });

  } catch (error) {
    console.error('Get election ballot error:', error);
    res.status(500).json({ 
      message: 'Failed to get ballot', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Get public ballot for voting (no authentication required)
export const getPublicBallot = async (req: Request, res: Response) => {
  try {
    const { electionId } = req.params;

    // Check if election exists and is active
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    if (election.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Election is not active for voting' });
    }

    // Get active ballot
    const ballot = await Ballot.findOne({ electionId, isActive: true });

    if (!ballot) {
      return res.status(404).json({ message: 'No active ballot found for this election' });
    }

    // Return ballot without sensitive information
    res.status(200).json({
      ballot: {
        _id: ballot._id,
        title: ballot.title,
        description: ballot.description,
        questions: ballot.questions,
        settings: ballot.settings,
        version: ballot.version
      }
    });

  } catch (error) {
    console.error('Get public ballot error:', error);
    res.status(500).json({ 
      message: 'Failed to get ballot', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Publish ballot
export const publishBallot = async (req: AuthRequest, res: Response) => {
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

    // Check if election is in draft status
    if (election.status !== 'DRAFT') {
      return res.status(400).json({ 
        message: 'Can only publish ballot for elections in DRAFT status' 
      });
    }

    // Get active ballot
    const ballot = await Ballot.findOne({ electionId, isActive: true });

    if (!ballot) {
      return res.status(404).json({ message: 'No active ballot found for this election' });
    }

    // Validate ballot has questions
    if (!ballot.questions || ballot.questions.length === 0) {
      return res.status(400).json({ message: 'Ballot must have at least one question' });
    }

    // Publish ballot
    await ballot.publish();

    res.status(200).json({
      message: 'Ballot published successfully',
      ballot: {
        _id: ballot._id,
        title: ballot.title,
        version: ballot.version,
        isActive: ballot.isActive,
        publishedAt: ballot.publishedAt
      }
    });

  } catch (error) {
    console.error('Publish ballot error:', error);
    res.status(500).json({ 
      message: 'Failed to publish ballot', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Unpublish ballot
export const unpublishBallot = async (req: AuthRequest, res: Response) => {
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

    // Get active ballot
    const ballot = await Ballot.findOne({ electionId, isActive: true });

    if (!ballot) {
      return res.status(404).json({ message: 'No active ballot found for this election' });
    }

    // Unpublish ballot
    await ballot.unpublish();

    res.status(200).json({
      message: 'Ballot unpublished successfully',
      ballot: {
        _id: ballot._id,
        title: ballot.title,
        version: ballot.version,
        isActive: ballot.isActive
      }
    });

  } catch (error) {
    console.error('Unpublish ballot error:', error);
    res.status(500).json({ 
      message: 'Failed to unpublish ballot', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Create new ballot version
export const createNewBallotVersion = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId } = req.params;
    const { title, description, questions, settings } = req.body;

    // Check if election exists and user owns it
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    if (election.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if election is in draft status
    if (election.status !== 'DRAFT') {
      return res.status(400).json({ 
        message: 'Can only create new ballot version for elections in DRAFT status' 
      });
    }

    // Get current active ballot
    const currentBallot = await Ballot.findOne({ electionId, isActive: true });

    if (currentBallot) {
      // Unpublish current ballot
      await currentBallot.unpublish();
    }

    // Create new ballot version
    const newBallot = new Ballot({
      electionId,
      title,
      description,
      questions,
      settings: {
        allowAbstention: false,
        requireAllQuestions: true,
        randomizeOrder: false,
        showProgressBar: true,
        allowReview: true,
        allowChange: false,
        ...settings
      },
      version: currentBallot ? currentBallot.version + 1 : 1,
      isActive: true
    });

    await newBallot.save();

    res.status(201).json({
      message: 'New ballot version created successfully',
      ballot: {
        _id: newBallot._id,
        title: newBallot.title,
        description: newBallot.description,
        questions: newBallot.questions,
        settings: newBallot.settings,
        version: newBallot.version,
        isActive: newBallot.isActive,
        createdAt: newBallot.createdAt,
        updatedAt: newBallot.updatedAt
      }
    });

  } catch (error) {
    console.error('Create new ballot version error:', error);
    res.status(500).json({ 
      message: 'Failed to create new ballot version', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Get ballot version history
export const getBallotVersionHistory = async (req: AuthRequest, res: Response) => {
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

    // Get all ballot versions
    const ballots = await Ballot.find({ electionId })
      .select('title version isActive createdAt updatedAt publishedAt')
      .sort({ version: -1 });

    res.status(200).json({
      ballots,
      totalVersions: ballots.length
    });

  } catch (error) {
    console.error('Get ballot version history error:', error);
    res.status(500).json({ 
      message: 'Failed to get ballot version history', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Get specific ballot version
export const getBallotVersion = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { electionId, version } = req.params;

    // Check if election exists and user owns it
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ message: 'Election not found' });
    }

    if (election.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get specific ballot version
    const ballot = await Ballot.findOne({ electionId, version: Number(version) });

    if (!ballot) {
      return res.status(404).json({ message: 'Ballot version not found' });
    }

    res.status(200).json({
      ballot: {
        _id: ballot._id,
        title: ballot.title,
        description: ballot.description,
        questions: ballot.questions,
        settings: ballot.settings,
        version: ballot.version,
        isActive: ballot.isActive,
        createdAt: ballot.createdAt,
        updatedAt: ballot.updatedAt,
        publishedAt: ballot.publishedAt
      }
    });

  } catch (error) {
    console.error('Get ballot version error:', error);
    res.status(500).json({ 
      message: 'Failed to get ballot version', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Export ballot for blockchain deployment
export const exportBallotForDeployment = async (req: AuthRequest, res: Response) => {
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

    // Get active ballot
    const ballot = await Ballot.findOne({ electionId, isActive: true });

    if (!ballot) {
      return res.status(404).json({ message: 'No active ballot found for this election' });
    }

    // Format for blockchain deployment
    const deploymentData = {
      title: ballot.title,
      description: ballot.description,
      questions: ballot.questions.map(q => ({
        questionId: q.questionId,
        question: q.question,
        type: q.type,
        options: q.options?.map(o => ({
          optionId: o.optionId,
          text: o.text,
          value: o.value
        })) || [],
        required: q.required,
        order: q.order
      })),
      settings: {
        allowAbstention: ballot.settings.allowAbstention,
        requireAllQuestions: ballot.settings.requireAllQuestions,
        randomizeOrder: ballot.settings.randomizeOrder
      }
    };

    res.status(200).json({
      message: 'Ballot exported for deployment',
      ballot: deploymentData
    });

  } catch (error) {
    console.error('Export ballot for deployment error:', error);
    res.status(500).json({ 
      message: 'Failed to export ballot', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};
