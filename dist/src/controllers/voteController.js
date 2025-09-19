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
exports.recordBlockchainVote = exports.prepareBlockchainVote = exports.submitBlockchainVote = exports.rejectVote = exports.confirmVoteOnBlockchain = exports.getPublicElectionResults = exports.getElectionResults = exports.getVoteByVoter = exports.submitVote = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Vote_1 = __importDefault(require("../model/Vote"));
const Voter_1 = __importDefault(require("../model/Voter"));
const Ballot_1 = __importDefault(require("../model/Ballot"));
const Election_1 = __importDefault(require("../model/Election"));
const express_validator_1 = require("express-validator");
const ethers_1 = require("ethers");
// Submit a vote
const submitVote = async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: errors.array()
            });
        }
        const { electionId } = req.params;
        const { voterId, voterKey, choices, metadata } = req.body;
        // Check if election exists and is active
        const election = await Election_1.default.findById(electionId);
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
        const voter = await Voter_1.default.findOne({
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
        const ballot = await Ballot_1.default.findOne({ electionId, isActive: true });
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
        const vote = new Vote_1.default({
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
    }
    catch (error) {
        console.error('Submit vote error:', error);
        res.status(500).json({
            message: 'Failed to submit vote',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.submitVote = submitVote;
// Get vote by voter
const getVoteByVoter = async (req, res) => {
    try {
        const { electionId, voterId } = req.params;
        const { voterKey } = req.query;
        if (!voterKey) {
            return res.status(400).json({ message: 'Voter key is required' });
        }
        // Check if election exists
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        // Verify voter
        const voter = await Voter_1.default.findOne({
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
        const vote = await Vote_1.default.findOne({ electionId, voterId: voter._id });
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
    }
    catch (error) {
        console.error('Get vote by voter error:', error);
        res.status(500).json({
            message: 'Failed to get vote',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.getVoteByVoter = getVoteByVoter;
// Get election results (for election creator)
const getElectionResults = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const { electionId } = req.params;
        // Check if election exists and user owns it
        const election = await Election_1.default.findById(electionId);
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
        const ballot = await Ballot_1.default.findOne({ electionId, isActive: true });
        if (!ballot) {
            return res.status(404).json({ message: 'No active ballot found' });
        }
        // Get all confirmed votes
        const votes = await Vote_1.default.find({
            electionId,
            status: 'CONFIRMED'
        }).populate('voterId', 'name uniqueId voteWeight');
        // Calculate results
        const results = calculateElectionResults(ballot.questions, votes);
        // Get vote statistics
        const voteStats = await Vote_1.default.aggregate([
            { $match: { electionId: new mongoose_1.default.Types.ObjectId(electionId) } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);
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
    }
    catch (error) {
        console.error('Get election results error:', error);
        res.status(500).json({
            message: 'Failed to get election results',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.getElectionResults = getElectionResults;
// Get public election results
const getPublicElectionResults = async (req, res) => {
    try {
        const { electionId } = req.params;
        // Check if election exists and is public
        const election = await Election_1.default.findById(electionId);
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
        const ballot = await Ballot_1.default.findOne({ electionId, isActive: true });
        if (!ballot) {
            return res.status(404).json({ message: 'No active ballot found' });
        }
        // Get all confirmed votes
        const votes = await Vote_1.default.find({
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
    }
    catch (error) {
        console.error('Get public election results error:', error);
        res.status(500).json({
            message: 'Failed to get election results',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.getPublicElectionResults = getPublicElectionResults;
// Confirm vote on blockchain
const confirmVoteOnBlockchain = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const { voteId } = req.params;
        const { blockchainTxHash, blockchainBlockNumber, ipfsCid } = req.body;
        // Check if vote exists
        const vote = await Vote_1.default.findById(voteId);
        if (!vote) {
            return res.status(404).json({ message: 'Vote not found' });
        }
        // Check if user owns the election
        const election = await Election_1.default.findById(vote.electionId);
        if (!election || election.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Access denied' });
        }
        // Confirm vote
        vote.status = 'CONFIRMED';
        vote.confirmedAt = new Date();
        if (blockchainTxHash)
            vote.blockchainTxHash = blockchainTxHash;
        if (blockchainBlockNumber)
            vote.blockchainBlockNumber = blockchainBlockNumber;
        if (ipfsCid)
            vote.ipfsCid = ipfsCid;
        await vote.save();
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
    }
    catch (error) {
        console.error('Confirm vote on blockchain error:', error);
        res.status(500).json({
            message: 'Failed to confirm vote',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.confirmVoteOnBlockchain = confirmVoteOnBlockchain;
// Reject vote
const rejectVote = async (req, res) => {
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
        const vote = await Vote_1.default.findById(voteId);
        if (!vote) {
            return res.status(404).json({ message: 'Vote not found' });
        }
        // Check if user owns the election
        const election = await Election_1.default.findById(vote.electionId);
        if (!election || election.creator.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Access denied' });
        }
        // Reject vote
        vote.status = 'REJECTED';
        vote.rejectedAt = new Date();
        vote.rejectionReason = reason;
        await vote.save();
        // Reset voter's hasVoted status
        const voter = await Voter_1.default.findById(vote.voterId);
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
    }
    catch (error) {
        console.error('Reject vote error:', error);
        res.status(500).json({
            message: 'Failed to reject vote',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.rejectVote = rejectVote;
// Helper function to validate vote choices
function validateVoteChoices(choices, questions) {
    const errors = [];
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
                }
                else if (question.validation.maxSelections && choice.selectedOptions.length > question.validation.maxSelections) {
                    errors.push(`Question '${question.question}' allows maximum ${question.validation.maxSelections} selections`);
                }
            }
            // Validate text questions
            if (question.type === 'text') {
                if (!choice.textAnswer && question.required) {
                    errors.push(`Question '${question.question}' requires a text answer`);
                }
                else if (choice.textAnswer && question.validation.maxLength && choice.textAnswer.length > question.validation.maxLength) {
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
function calculateElectionResults(questions, votes) {
    const results = [];
    for (const question of questions) {
        const questionVotes = votes.filter((v) => v.choices.some((c) => c.questionId === question.questionId));
        if (question.type === 'single' || question.type === 'multiple') {
            const optionCounts = {};
            const optionVoteWeights = {};
            // Initialize counts
            if (question.options) {
                for (const option of question.options) {
                    optionCounts[option.optionId] = 0;
                    optionVoteWeights[option.optionId] = 0;
                }
            }
            // Count votes
            for (const vote of questionVotes) {
                const choice = vote.choices.find((c) => c.questionId === question.questionId);
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
                options: question.options?.map((option) => ({
                    optionId: option.optionId,
                    text: option.text,
                    value: option.value,
                    count: optionCounts[option.optionId] || 0,
                    voteWeight: optionVoteWeights[option.optionId] || 0,
                    percentage: questionVotes.length > 0 ? ((optionCounts[option.optionId] || 0) / questionVotes.length) * 100 : 0
                })) || []
            });
        }
        else if (question.type === 'text') {
            const textAnswers = questionVotes
                .map((vote) => {
                const choice = vote.choices.find((c) => c.questionId === question.questionId);
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
        }
        else if (question.type === 'ranking') {
            const rankingResults = {};
            // Initialize ranking arrays
            if (question.options) {
                for (const option of question.options) {
                    rankingResults[option.optionId] = new Array(question.options.length).fill(0);
                }
            }
            // Calculate ranking scores
            for (const vote of questionVotes) {
                const choice = vote.choices.find((c) => c.questionId === question.questionId);
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
                const option = question.options?.find((o) => o.optionId === optionId);
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
// Submit a blockchain vote
const submitBlockchainVote = async (req, res) => {
    try {
        const { electionId } = req.params;
        const { voterId, ballotId, selections, voteHash } = req.body;
        // Validate required fields
        if (!voterId || !ballotId || !selections || !voteHash) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        // Get election
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        // Check if election is active
        if (election.status !== 'ACTIVE') {
            return res.status(400).json({ message: 'Election is not active' });
        }
        // Check if election is deployed
        if (!election.blockchainAddress) {
            return res.status(400).json({ message: 'Election must be deployed to vote' });
        }
        // Check if voter is registered on blockchain
        // Prefer voterId-based checks directly via contract to avoid address confusion
        const { CONTRACT_ABIS } = await Promise.resolve().then(() => __importStar(require('../config/blockchain')));
        const providerForChecks = new ethers_1.ethers.providers.JsonRpcProvider('https://rpc.sepolia-api.lisk.com');
        const electionReadonly = new ethers_1.ethers.Contract(election.blockchainAddress, CONTRACT_ABIS.ElectionCore, providerForChecks);
        const isRegisteredOnChain = await electionReadonly.isVoterIdRegistered(voterId);
        if (!isRegisteredOnChain) {
            return res.status(400).json({ message: 'Voter not registered on blockchain' });
        }
        // Check if voter has already voted on blockchain
        const hasVotedOnChain = await electionReadonly.hasVoterIdVoted(voterId);
        if (hasVotedOnChain) {
            return res.status(400).json({ message: 'Voter has already voted on blockchain' });
        }
        // For blockchain voting, we need a wallet to sign the transaction
        // In a real implementation, this would be handled by the frontend
        // For now, we'll simulate the vote being cast
        let blockchainTxHash;
        try {
            // In production, this is done by the frontend with the user's wallet
            const voterPrivateKey = process.env.VOTER_PRIVATE_KEY;
            if (!voterPrivateKey) {
                throw new Error('Missing VOTER_PRIVATE_KEY for server-side demo voting');
            }
            // Create a wallet instance
            const provider = new ethers_1.ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.sepolia-api.lisk.com');
            const wallet = new ethers_1.ethers.Wallet(voterPrivateKey, provider);
            // Create contract instance
            const { CONTRACT_ABIS } = await Promise.resolve().then(() => __importStar(require('../config/blockchain')));
            const electionContract = new ethers_1.ethers.Contract(election.blockchainAddress, CONTRACT_ABIS.ElectionCore, wallet);
            // Convert vote hash from hex string to bytes
            const voteHashBytes = ethers_1.ethers.utils.arrayify('0x' + voteHash);
            // Preflight: estimate gas and check balance/fees
            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice || ethers_1.ethers.utils.parseUnits('1', 'gwei');
            let estGas;
            try {
                estGas = await electionContract.estimateGas.castVoteById(voteHashBytes, voterId);
            }
            catch (estErr) {
                // Try to surface revert reason via callStatic
                try {
                    await electionContract.callStatic.castVoteById(voteHashBytes, voterId);
                }
                catch (simErr) {
                    const reason = (simErr?.error?.message) || (simErr?.data?.message) || simErr?.message || 'Simulation failed';
                    throw new Error(`Preflight revert: ${reason}`);
                }
                throw estErr;
            }
            const gasLimit = estGas.mul(120).div(100); // +20% buffer
            const balance = await wallet.getBalance();
            const estCost = gasLimit.mul(gasPrice);
            if (balance.lt(estCost)) {
                throw new Error(`Insufficient funds: balance ${ethers_1.ethers.utils.formatEther(balance)} < est cost ${ethers_1.ethers.utils.formatEther(estCost)}. Fund ${wallet.address}.`);
            }
            // Send transaction
            const tx = await electionContract.castVoteById(voteHashBytes, voterId, {
                gasLimit,
                gasPrice,
            });
            const receipt = await tx.wait();
            blockchainTxHash = tx.hash;
        }
        catch (blockchainError) {
            console.error('Blockchain voting error:', blockchainError);
            const msg = blockchainError?.message || 'Unknown error';
            return res.status(502).json({ message: 'Blockchain vote failed', details: msg });
        }
        // Find the voter by uniqueId to get the ObjectId
        const voter = await Voter_1.default.findOne({ uniqueId: voterId, electionId });
        if (!voter) {
            return res.status(400).json({ message: 'Voter not found' });
        }
        // Create a default ballot ID (we'll use the election ID as ballot ID for now)
        const ballotObjectId = new mongoose_1.default.Types.ObjectId();
        // Convert selections to the expected choice format
        const choices = [];
        // Add candidate votes as choices
        const candidateArray = (selections && selections.candidates) || (req.body.candidateVotes) || (req.body.candidates);
        if (candidateArray && candidateArray.length > 0) {
            candidateArray.forEach((candidate, index) => {
                choices.push({
                    questionId: `candidate_${index}`,
                    selectedOptions: [candidate.candidateId || candidate],
                    timestamp: new Date()
                });
            });
        }
        // Add ballot question selections as choices
        Object.entries(selections).forEach(([key, value]) => {
            if (key.startsWith('question_') && value) {
                const questionId = key.replace('question_', '');
                choices.push({
                    questionId,
                    selectedOptions: Array.isArray(value) ? value : [value],
                    timestamp: new Date()
                });
            }
        });
        // Ensure blockchain tx succeeded before storing
        if (!blockchainTxHash) {
            return res.status(502).json({ message: 'Blockchain transaction missing' });
        }
        // Create vote record in database
        const vote = new Vote_1.default({
            electionId: new mongoose_1.default.Types.ObjectId(electionId),
            voterId: voter._id,
            ballotId: ballotObjectId,
            choices,
            status: 'CONFIRMED',
            blockchainTxHash,
            metadata: {
                votingMethod: 'BLOCKCHAIN',
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip || req.connection.remoteAddress
            }
        });
        await vote.save();
        res.json({
            message: 'Vote submitted successfully',
            vote: {
                id: vote._id,
                voterId: vote.voterId,
                timestamp: vote.submittedAt,
                isBlockchainVote: !!blockchainTxHash,
                blockchainTxHash
            }
        });
    }
    catch (error) {
        console.error('Error submitting blockchain vote:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.submitBlockchainVote = submitBlockchainVote;
// Prepare on-chain vote transaction (frontend will send via wallet)
const prepareBlockchainVote = async (req, res) => {
    try {
        const { electionId } = req.params;
        const { voterId, voteHash, from } = req.body;
        if (!voterId || !voteHash) {
            return res.status(400).json({ message: 'voterId and voteHash are required' });
        }
        // Get election
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        if (election.status !== 'ACTIVE') {
            return res.status(400).json({ message: 'Election is not active' });
        }
        if (!election.blockchainAddress) {
            return res.status(400).json({ message: 'Election must be deployed to vote' });
        }
        // Also enforce time window like the contract's onlyDuringElection
        const now = Date.now();
        const startMs = new Date(election.startTime).getTime();
        const endMs = new Date(election.endTime).getTime();
        if (!(now >= startMs && now <= endMs)) {
            return res.status(400).json({ message: 'Election time window not active' });
        }
        // Ensure voter exists in DB
        const voter = await Voter_1.default.findOne({ uniqueId: voterId, electionId });
        if (!voter) {
            return res.status(404).json({ message: 'Voter not found' });
        }
        // Chain config (Lisk Sepolia by default)
        const rpcUrl = process.env.RPC_URL || 'https://rpc.sepolia-api.lisk.com';
        const chainId = Number(process.env.CHAIN_ID || 4202);
        const { CONTRACT_ABIS } = await Promise.resolve().then(() => __importStar(require('../config/blockchain')));
        const provider = new ethers_1.ethers.providers.JsonRpcProvider(rpcUrl);
        const readonly = new ethers_1.ethers.Contract(election.blockchainAddress, CONTRACT_ABIS.ElectionCore, provider);
        // On-chain eligibility checks (do not require on-chain active status; rely on time window above)
        const isRegisteredOnChain = await readonly.isVoterIdRegistered(voterId);
        console.log('Voter registered on-chain:', isRegisteredOnChain);
        if (!isRegisteredOnChain) {
            return res.status(400).json({ message: 'Voter not registered on blockchain' });
        }
        const hasVotedOnChain = await readonly.hasVoterIdVoted(voterId);
        console.log('Voter has voted on-chain:', hasVotedOnChain);
        if (hasVotedOnChain) {
            return res.status(400).json({ message: 'Voter has already voted on blockchain' });
        }
        // Check if election is active on-chain
        try {
            const isElectionActive = await readonly.isElectionActive();
            console.log('Election active on-chain:', isElectionActive);
            if (!isElectionActive) {
                return res.status(400).json({ message: 'Election is not active on-chain. Call startElection first.' });
            }
        }
        catch (activeErr) {
            console.error('Error checking election active status:', activeErr);
            return res.status(400).json({ message: 'Could not check election status on-chain' });
        }
        // Build calldata for castVoteById(bytes32,string)
        const voteHashBytes = ethers_1.ethers.utils.arrayify('0x' + voteHash);
        const iface = new ethers_1.ethers.utils.Interface(CONTRACT_ABIS.ElectionCore);
        const data = iface.encodeFunctionData('castVoteById', [voteHashBytes, voterId]);
        // Optional gas estimation (requires from) and preflight simulation to surface revert reasons
        let gas;
        try {
            if (from) {
                // Preflight simulation
                try {
                    console.log('Running preflight simulation...');
                    const simResult = await provider.call({ to: election.blockchainAddress, data, from });
                    console.log('Preflight simulation successful:', simResult);
                }
                catch (simErr) {
                    console.error('Preflight simulation failed:', simErr);
                    const msg = simErr?.error?.message || simErr?.data?.message || simErr?.message || 'Simulation failed';
                    return res.status(400).json({ message: `Transaction would revert: ${msg}` });
                }
                const est = await provider.estimateGas({ to: election.blockchainAddress, data, from });
                gas = est.toHexString();
            }
        }
        catch (err) {
            // best-effort; ignore estimation errors
        }
        return res.json({
            transaction: {
                to: election.blockchainAddress,
                data,
                value: '0x0',
                chainId,
                gas,
            }
        });
    }
    catch (error) {
        console.error('Prepare blockchain vote error:', error);
        return res.status(500).json({ message: 'Failed to prepare blockchain vote' });
    }
};
exports.prepareBlockchainVote = prepareBlockchainVote;
// Record an on-chain vote after the wallet broadcasts the transaction
const recordBlockchainVote = async (req, res) => {
    try {
        const { electionId } = req.params;
        const { voterId, txHash, selections, voteHash } = req.body;
        if (!voterId || !txHash) {
            return res.status(400).json({ message: 'voterId and txHash are required' });
        }
        const election = await Election_1.default.findById(electionId);
        if (!election) {
            return res.status(404).json({ message: 'Election not found' });
        }
        if (!election.blockchainAddress) {
            return res.status(400).json({ message: 'Election must be deployed' });
        }
        const rpcUrl = process.env.RPC_URL || 'https://rpc.sepolia-api.lisk.com';
        const provider = new ethers_1.ethers.providers.JsonRpcProvider(rpcUrl);
        // Verify tx on-chain
        const receipt = await provider.getTransactionReceipt(txHash);
        const statusOk = receipt && (receipt.status === 1 || receipt.status === '0x1');
        if (!statusOk) {
            return res.status(400).json({ message: 'Transaction not found or failed' });
        }
        if (receipt.to && receipt.to.toLowerCase() !== String(election.blockchainAddress).toLowerCase()) {
            return res.status(400).json({ message: 'Transaction not sent to election contract' });
        }
        // Persist vote in DB if not already
        const voter = await Voter_1.default.findOne({ uniqueId: voterId, electionId });
        if (!voter) {
            return res.status(404).json({ message: 'Voter not found' });
        }
        // Check if vote already exists
        const existingVote = await Vote_1.default.findOne({ electionId: new mongoose_1.default.Types.ObjectId(electionId), voterId: voter._id });
        if (existingVote) {
            return res.json({
                message: 'Vote already recorded',
                vote: {
                    id: existingVote._id,
                    status: existingVote.status,
                    blockchainTxHash: existingVote.blockchainTxHash,
                    confirmedAt: existingVote.confirmedAt
                }
            });
        }
        // Build basic choices from provided selections if any; otherwise store minimal record
        let choices = [];
        try {
            if (selections) {
                Object.entries(selections).forEach(([key, value]) => {
                    if (key.startsWith('question_') && value) {
                        const questionId = key.replace('question_', '');
                        choices.push({
                            questionId,
                            selectedOptions: Array.isArray(value) ? value : [value],
                            timestamp: new Date()
                        });
                    }
                });
            }
        }
        catch { }
        // Ensure we have at least one choice to satisfy validation
        if (choices.length === 0) {
            choices.push({
                questionId: 'blockchain_vote',
                selectedOptions: ['confirmed'],
                timestamp: new Date()
            });
        }
        const vote = new Vote_1.default({
            electionId: new mongoose_1.default.Types.ObjectId(electionId),
            voterId: voter._id,
            ballotId: new mongoose_1.default.Types.ObjectId(),
            choices,
            status: 'CONFIRMED',
            blockchainTxHash: txHash,
            metadata: {
                votingMethod: 'BLOCKCHAIN',
                voteHash: voteHash || undefined,
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip || req.connection?.remoteAddress
            }
        });
        await vote.save();
        voter.hasVoted = true;
        voter.lastActivity = new Date();
        await voter.save();
        return res.json({
            message: 'On-chain vote recorded',
            vote: {
                id: vote._id,
                status: vote.status,
                blockchainTxHash: vote.blockchainTxHash,
                confirmedAt: vote.confirmedAt
            }
        });
    }
    catch (error) {
        console.error('Record blockchain vote error:', error);
        console.error('Error details:', {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            electionId: req.params.electionId,
            voterId: req.body.voterId,
            txHash: req.body.txHash
        });
        return res.status(500).json({
            message: 'Failed to record blockchain vote',
            error: error instanceof Error ? error.message : String(error)
        });
    }
};
exports.recordBlockchainVote = recordBlockchainVote;
