import { Request, Response } from 'express';
import Voter from '../model/Voter';
import Election from '../model/Election';
import { AuthRequest } from '../middleware/auth';
import { validationResult } from 'express-validator';
import { sendNotification } from '../middleware/notificationMiddleware';
import emailService from '../service/emailService';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

// Add a single voter to an election
export const addVoter = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ 
        message: 'Invalid voter data', 
        errors: errors.array(),
        details: 'Please check the required fields and their format'
      });
    }

    const { electionId } = req.params;
    const { name, email, uniqueId, voteWeight, metadata } = req.body;

    console.log('Adding voter:', { electionId, name, email, uniqueId, voteWeight, metadata });

    // Check if election exists and user owns it
    const election = await Election.findById(electionId);
    if (!election) {
      console.log('Election not found:', electionId);
      return res.status(404).json({ message: 'Election not found' });
    }

    if (election.creator.toString() !== req.user.id) {
      console.log('Access denied for user:', req.user.id, 'to election:', electionId);
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if voter already exists
    const existingVoter = await Voter.findOne({ 
      electionId, 
      $or: [{ email }, { uniqueId }] 
    });

    if (existingVoter) {
      console.log('Voter already exists:', { email, uniqueId });
      return res.status(400).json({ 
        message: 'Voter with this email or unique ID already exists' 
      });
    }

    // Generate secure voter key
    let generatedVoterKey: string;
    let generatedVerificationToken: string;
    
    try {
      generatedVoterKey = Voter.generateVoterKey();
      generatedVerificationToken = Voter.generateVerificationToken();
      console.log('Generated voter key and verification token successfully');
    } catch (keyError) {
      console.error('Error generating voter key or verification token:', keyError);
      return res.status(500).json({ 
        message: 'Failed to generate voter credentials', 
        error: 'Key generation failed' 
      });
    }

    // Generate voterKeyHash directly
    const voterKeyHash = crypto.createHash('sha256').update(generatedVoterKey).digest('hex');

    // Create voter
    const voter = new Voter({
      electionId,
      name: name || '', // Handle optional name
      email,
      uniqueId,
      voterKey: generatedVoterKey, // Set voterKey during creation
      voterKeyHash: voterKeyHash, // Set voterKeyHash directly
      voteWeight: voteWeight || 1,
      verificationToken: generatedVerificationToken,
      verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      metadata
    });

    console.log('Voter object created, attempting to save...');
    console.log('Voter key before save:', voter.voterKey);
    console.log('Voter key hash before save:', voter.voterKeyHash);

    // Immediately activate voter and mark email sent
    voter.status = 'ACTIVE';
    voter.verifiedAt = new Date();
    voter.emailDeliveryStatus = 'SENT';
    voter.emailSentAt = new Date();
    voter.inviteCount = (voter.inviteCount || 0) + 1;
    voter.lastInviteAt = new Date();
    await voter.save();
    console.log('Voter saved successfully:', voter._id);
    console.log('Voter key hash after save:', voter.voterKeyHash);

    // Send credentials email to voter (ID + Key + voting link)
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const rawVoterKey = generatedVoterKey; // raw key before encryption
      const directVotePath = `/vote-page/${electionId}?voterId=${encodeURIComponent(voter.uniqueId)}`;
      const voteUrl = `${frontendUrl}/voter-login?next=${encodeURIComponent(directVotePath)}`;
      const electionUrl = `${frontendUrl}/voter/dashboard`;
      const mailInfo = await emailService.sendVoterCredentialsEmail({
        to: voter.email,
        voterName: voter.name,
        electionTitle: election.title,
        voterId: voter.uniqueId,
        voterKey: rawVoterKey,
        voteUrl,
        electionUrl
      });
      // already set ACTIVE above; just persist
      await voter.save();
      console.log('Voter credentials email sent successfully to:', voter.email);
      // attach ethereal preview url to response if available
      (req as any)._emailPreviewUrl = nodemailer.getTestMessageUrl(mailInfo as any) || undefined;
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      voter.emailDeliveryStatus = 'FAILED';
      voter.lastEmailError = emailError instanceof Error ? emailError.message : String(emailError);
      voter.inviteCount = (voter.inviteCount || 0) + 1;
      voter.lastInviteAt = new Date();
      await voter.save();
    }

    // Send notification for voter registration
    try {
      await sendNotification({
        type: 'VOTER_REGISTERED',
        voterId: voter._id.toString(),
        electionId: electionId,
        message: `New voter ${voter.name} has been registered for election: ${election.title}`,
        recipients: [req.user.id],
        category: 'SUCCESS',
        priority: 'MEDIUM'
      });
    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError);
      // Don't fail the main operation if notification fails
    }

    // Return voter data without sensitive information
    const { voterKey: _, verificationToken: __, ...voterResponse } = voter.toObject();

    res.status(201).json({
      success: true,
      message: 'Voter added successfully',
      voter: voterResponse,
      emailPreviewUrl: (req as any)._emailPreviewUrl
    });

  } catch (error) {
    console.error('Add voter error:', error);
    
    // Check for specific MongoDB errors
    if (error instanceof Error) {
      if (error.message.includes('E11000')) {
        return res.status(400).json({ 
          message: 'Voter with this email or unique ID already exists',
          error: 'Duplicate key error'
        });
      }
      
      if (error.message.includes('validation failed')) {
        return res.status(400).json({ 
          message: 'Invalid voter data',
          error: error.message
        });
      }
    }
    
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
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

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
        const generatedVoterKey = Voter.generateVoterKey();
        const generatedVerificationToken = Voter.generateVerificationToken();

        const normalizedKey = Voter.generateVoterKey();
        const cryptoHash = require('crypto').createHash('sha256').update(normalizedKey).digest('hex');

        votersToAdd.push({
          electionId,
          name: voterData.name,
          email: voterData.email,
          uniqueId: voterData.uniqueId,
          voterKey: normalizedKey,
          voterKeyHash: cryptoHash,
          voteWeight: voterData.voteWeight || 1,
          verificationToken: generatedVerificationToken,
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
      const insertedVoters = await Voter.insertMany(votersToAdd);
      
      // Send credentials emails to all newly added voters and activate them
      for (const voter of insertedVoters) {
        try {
          const directVotePath = `/vote-page/${electionId}?voterId=${encodeURIComponent(voter.uniqueId)}`;
          const voteUrl = `${frontendUrl}/voter-login?next=${encodeURIComponent(directVotePath)}`;
          const electionUrl = `${frontendUrl}/voter/dashboard`;
          // decrypt or use plaintext (legacy) to send credentials
          const rawVoterKey = (voter as any).decryptVoterKey ? (voter as any).decryptVoterKey() : voter.voterKey;
          await emailService.sendVoterCredentialsEmail({
            to: voter.email,
            voterName: voter.name,
            electionTitle: election.title,
            voterId: voter.uniqueId,
            voterKey: rawVoterKey,
            voteUrl,
            electionUrl
          });
          voter.status = 'ACTIVE';
          voter.verifiedAt = new Date();
          voter.emailDeliveryStatus = 'SENT';
          voter.emailSentAt = new Date();
          voter.inviteCount = (voter.inviteCount || 0) + 1;
          voter.lastInviteAt = new Date();
          await voter.save();
          console.log('Voter credentials email sent successfully to:', voter.email);
        } catch (emailError) {
          console.error('Failed to send verification email to:', voter.email, emailError);
          voter.emailDeliveryStatus = 'FAILED';
          voter.lastEmailError = emailError instanceof Error ? emailError.message : String(emailError);
          voter.inviteCount = (voter.inviteCount || 0) + 1;
          voter.lastInviteAt = new Date();
          await voter.save();
        }
      }
      
      // Send notification for bulk import
      try {
        await sendNotification({
          type: 'VOTER_REGISTERED',
          electionId: electionId,
          message: `Bulk import completed: ${results.success} voters added successfully to election: ${election.title}`,
          recipients: [req.user.id],
          category: 'SUCCESS',
          priority: 'MEDIUM'
        });
      } catch (notificationError) {
        console.error('Failed to send notification:', notificationError);
      }
    }

    res.status(200).json({
      success: true,
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
      success: true,
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
      success: true,
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

    // Send email notification to voter about status change
    try {
      await emailService.sendVoterStatusUpdateEmail(
        voter.email,
        voter.name,
        election.title,
        status
      );
      console.log('Status update email sent successfully to:', voter.email);
    } catch (emailError) {
      console.error('Failed to send status update email:', emailError);
      // Don't fail the main operation if email fails
    }

    // Send notification for status change
    try {
      let notificationType: string;
      let notificationMessage: string;
      
      switch (status) {
        case 'VERIFIED':
          notificationType = 'VOTER_VERIFIED';
          notificationMessage = `Voter ${voter.name} has been verified for election: ${election.title}`;
          break;
        case 'ACTIVE':
          notificationType = 'VOTER_ACTIVATED';
          notificationMessage = `Voter ${voter.name} has been activated and can now vote in election: ${election.title}`;
          break;
        case 'SUSPENDED':
          notificationType = 'VOTER_SUSPENDED';
          notificationMessage = `Voter ${voter.name} has been suspended from election: ${election.title}`;
          break;
        default:
          notificationType = 'VOTER_UPDATED';
          notificationMessage = `Voter ${voter.name} status updated to ${status} in election: ${election.title}`;
      }

      await sendNotification({
        type: notificationType as any,
        voterId: voter._id.toString(),
        electionId: electionId,
        message: notificationMessage,
        recipients: [req.user.id],
        category: status === 'SUSPENDED' ? 'WARNING' : 'SUCCESS',
        priority: 'MEDIUM'
      });
    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError);
    }

    res.status(200).json({
      success: true,
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

    // Get voter info before deletion for notification
    const voterToDelete = await Voter.findOne({ _id: voterId, electionId })
      .select('name email uniqueId');

    if (!voterToDelete) {
      return res.status(404).json({ message: 'Voter not found' });
    }

    // Delete voter
    await Voter.findOneAndDelete({ _id: voterId, electionId });

    // Send notification for voter deletion
    try {
      await sendNotification({
        type: 'VOTER_DELETED',
        electionId: electionId,
        message: `Voter ${voterToDelete.name} (${voterToDelete.email}) has been removed from election: ${election.title}`,
        recipients: [req.user.id],
        category: 'WARNING',
        priority: 'MEDIUM'
      });
    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError);
    }

    res.status(200).json({
      success: true,
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

    // Get election info for notification
    const election = await Election.findById(voter.electionId);
    const electionTitle = election ? election.title : 'Unknown Election';

    // Update voter status
    voter.status = 'VERIFIED';
    voter.verifiedAt = new Date();
    voter.verificationToken = undefined;
    voter.verificationExpires = undefined;
    voter.lastActivity = new Date();

    await voter.save();

    // Send notification for voter verification
    try {
      await sendNotification({
        type: 'VOTER_VERIFIED',
        voterId: voter._id.toString(),
        electionId: voter.electionId.toString(),
        message: `Voter ${voter.name} has successfully verified their account for election: ${electionTitle}`,
        recipients: [voter.electionId.toString()], // Send to election creator
        category: 'SUCCESS',
        priority: 'MEDIUM'
      });
    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError);
    }

    res.status(200).json({
      success: true,
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

    // Send notification for export
    try {
      await sendNotification({
        type: 'VOTER_EXPORTED',
        electionId: electionId,
        message: `Voters exported for blockchain deployment: ${voters.length} voters ready for election: ${election.title}`,
        recipients: [req.user.id],
        category: 'INFO',
        priority: 'MEDIUM'
      });
    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError);
    }

    res.status(200).json({
      success: true,
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

// Send emails to all pending voters and activate them
export const sendEmailsToPendingVoters = async (req: AuthRequest, res: Response) => {
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

    // Get all pending voters (include encrypted voterKey for decryption)
    const pendingVoters = await Voter.find({ 
      electionId, 
      status: 'PENDING' 
    }).select('+voterKey');

    if (pendingVoters.length === 0) {
      return res.status(400).json({ message: 'No pending voters found' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const results = {
      success: 0,
      failed: 0,
      errors: [] as any[]
    };

    // Send emails to all pending voters and activate them
    for (const voter of pendingVoters) {
      try {
        // Decrypt voter key for email
        const rawVoterKey = voter.decryptVoterKey() || '';
        const voteUrl = `${frontendUrl}/vote-page/${electionId}?voterId=${encodeURIComponent(voter.uniqueId)}`;
        
        // Send credentials email
        await emailService.sendVoterCredentialsEmail({
          to: voter.email,
          voterName: voter.name,
          electionTitle: election.title,
          voterId: voter.uniqueId,
          voterKey: rawVoterKey,
          voteUrl
        });

        // Update voter status to VERIFIED and mark email as sent
        voter.status = 'VERIFIED';
        voter.verifiedAt = new Date();
        voter.emailDeliveryStatus = 'SENT';
        voter.emailSentAt = new Date();
        voter.inviteCount = (voter.inviteCount || 0) + 1;
        voter.lastInviteAt = new Date();
        voter.lastActivity = new Date();
        
        await voter.save();
        results.success++;
        
        console.log('Email sent and voter activated:', voter.email);
      } catch (error) {
        console.error('Failed to send email to voter:', voter.email, error);
        
        // Mark email as failed but don't change status
        voter.emailDeliveryStatus = 'FAILED';
        voter.lastEmailError = error instanceof Error ? error.message : String(error);
        voter.inviteCount = (voter.inviteCount || 0) + 1;
        voter.lastInviteAt = new Date();
        await voter.save();
        
        results.failed++;
        results.errors.push({
          voterId: voter._id,
          email: voter.email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Send notification for bulk email sending
    try {
      await sendNotification({
        type: 'VOTER_REGISTERED',
        electionId: electionId,
        message: `Bulk email sending completed: ${results.success} emails sent successfully, ${results.failed} failed for election: ${election.title}`,
        recipients: [req.user.id],
        category: results.failed > 0 ? 'WARNING' : 'SUCCESS',
        priority: 'MEDIUM'
      });
    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError);
    }

    res.status(200).json({
      success: true,
      message: `Email sending completed: ${results.success} successful, ${results.failed} failed`,
      results
    });

  } catch (error) {
    console.error('Send emails to pending voters error:', error);
    res.status(500).json({ 
      message: 'Failed to send emails to pending voters', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};
