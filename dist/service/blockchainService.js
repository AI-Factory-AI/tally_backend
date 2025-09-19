"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockchainService = void 0;
const ethers_1 = require("ethers");
const blockchain_1 = require("../config/blockchain");
class BlockchainService {
    constructor() {
        this.provider = new ethers_1.ethers.providers.JsonRpcProvider(blockchain_1.RPC_URL);
        this.factoryContract = new ethers_1.ethers.Contract(blockchain_1.CONTRACT_ADDRESSES.electionFactory, blockchain_1.CONTRACT_ABIS.ElectionFactory, this.provider);
        this.paymasterContract = new ethers_1.ethers.Contract(blockchain_1.CONTRACT_ADDRESSES.electionPaymaster, blockchain_1.CONTRACT_ABIS.ElectionPaymaster, this.provider);
    }
    /**
     * Create a new election on the blockchain
     */
    async createElection(electionData, creatorPrivateKey) {
        try {
            console.log('Creating election on blockchain...');
            console.log('Election data:', electionData);
            console.log('Factory address:', this.factoryContract.address);
            console.log('Provider URL:', this.provider.connection.url);
            // Ensure the factory address actually has contract code (common after anvil restart)
            const factoryCode = await this.provider.getCode(this.factoryContract.address);
            if (!factoryCode || factoryCode === '0x') {
                throw new Error(`No contract code at ElectionFactory address ${this.factoryContract.address}. ` +
                    'Re-deploy contracts to Anvil and update tally-blockchain/deployments.local.json.');
            }
            const wallet = new ethers_1.ethers.Wallet(creatorPrivateKey, this.provider);
            console.log('Wallet address:', wallet.address);
            // Fetch suggested fee data and apply optional caps from env
            const feeData = await this.provider.getFeeData();
            const maxPriorityFromEnv = process.env.MAX_PRIORITY_FEE_GWEI
                ? ethers_1.ethers.utils.parseUnits(process.env.MAX_PRIORITY_FEE_GWEI, 'gwei')
                : undefined;
            const maxFeeFromEnv = process.env.MAX_FEE_GWEI
                ? ethers_1.ethers.utils.parseUnits(process.env.MAX_FEE_GWEI, 'gwei')
                : undefined;
            const maxPriorityFeePerGas = maxPriorityFromEnv || feeData.maxPriorityFeePerGas || ethers_1.ethers.utils.parseUnits('1', 'gwei');
            const maxFeePerGas = maxFeeFromEnv || feeData.maxFeePerGas || ethers_1.ethers.utils.parseUnits('3', 'gwei');
            // Preflight balance check
            // Ensure a safe minimum gas limit (clamp to at least 3,000,000)
            const configuredGas = process.env.CREATE_ELECTION_GAS_LIMIT || '3000000';
            const gasLimitOverride = ethers_1.ethers.BigNumber.from(configuredGas);
            const minGas = ethers_1.ethers.BigNumber.from('3000000');
            const finalGasLimit = gasLimitOverride.gte(minGas) ? gasLimitOverride : minGas;
            const balance = await wallet.getBalance();
            const estCost = maxFeePerGas.mul(gasLimitOverride);
            console.log('Balance:', balance.toString(), 'Estimated max cost:', estCost.toString());
            if (balance.lt(estCost)) {
                throw new Error(`Insufficient funds: balance ${ethers_1.ethers.utils.formatEther(balance)} < est max cost ${ethers_1.ethers.utils.formatEther(estCost)}. Fund ${wallet.address} on Lisk Sepolia or lower gas caps.`);
            }
            const factoryWithSigner = this.factoryContract.connect(wallet);
            // Optional creation fee
            let valueOverride = undefined;
            try {
                const fee = await factoryWithSigner.creationFee?.();
                if (fee && fee.gt(0)) {
                    valueOverride = { value: fee };
                    console.log('Including creation fee:', fee.toString());
                }
            }
            catch {
                // ignore if method not present
            }
            // Build args once to reuse in callStatic and send
            const args = [
                electionData.title,
                electionData.description,
                electionData.startTime,
                electionData.endTime,
                electionData.timezone,
                electionData.ballotReceipt,
                electionData.submitConfirmation,
                electionData.maxVoters,
                electionData.allowVoterRegistration,
                electionData.loginInstructions,
                electionData.voteConfirmation,
                electionData.afterElectionMessage,
                electionData.publicResults,
                electionData.realTimeResults,
                electionData.resultsReleaseTime,
                electionData.allowResultsDownload
            ];
            // Preflight simulate the call to catch revert reasons (e.g., not authorized)
            try {
                await factoryWithSigner.callStatic.createElection(...args, {
                    from: wallet.address,
                    ...(valueOverride || {})
                });
                console.log('callStatic.createElection succeeded (preflight)');
            }
            catch (simErr) {
                const reason = simErr?.error?.message || simErr?.reason || simErr?.message || '';
                console.warn('Preflight createElection revert reason:', reason);
                const looksUnauthorized = /unauthor|not authorized|forbidden|creator/i.test(reason || '');
                // If owner, attempt to self-authorize and retry preflight
                try {
                    const owner = await factoryWithSigner.owner?.();
                    if (owner && owner.toLowerCase() === wallet.address.toLowerCase() && looksUnauthorized) {
                        console.log('Signer is owner; attempting to authorize creator on factory...');
                        const authTx = await factoryWithSigner.authorizeCreator(wallet.address);
                        console.log('authorizeCreator tx sent:', authTx.hash);
                        await authTx.wait();
                        console.log('authorizeCreator confirmed. Re-running preflight...');
                        await factoryWithSigner.callStatic.createElection(...args, { from: wallet.address, ...(valueOverride || {}) });
                        console.log('Preflight after authorization succeeded.');
                    }
                    else {
                        if (looksUnauthorized) {
                            throw new Error(`Not authorized to create elections with ${wallet.address}. Ask factory owner to authorize this address.`);
                        }
                        console.warn('Not owner or different revert. Proceeding to send with current permissions.');
                    }
                }
                catch (authErr) {
                    // If we threw a clear unauthorized error above, rethrow; else log and rethrow original
                    if (authErr?.message?.includes('Not authorized to create elections')) {
                        throw authErr;
                    }
                    console.warn('Authorization attempt failed or not supported on factory:', authErr?.message || authErr);
                    throw new Error(reason || 'createElection preflight failed');
                }
            }
            // First, get the election address using callStatic (this simulates the call without sending a transaction)
            const electionAddress = await factoryWithSigner.callStatic.createElection(...args, { from: wallet.address, ...(valueOverride || {}) });
            console.log('Election address from callStatic:', electionAddress);
            // Now send the actual transaction
            const tx = await factoryWithSigner.createElection(...args, { gasLimit: finalGasLimit, maxPriorityFeePerGas, maxFeePerGas, ...(valueOverride || {}) });
            console.log('Transaction sent:', tx.hash);
            console.log('Waiting for transaction confirmation...');
            const receipt = await tx.wait();
            // Check if transaction was successful
            if (receipt.status !== 1) {
                throw new Error(`Transaction failed with status: ${receipt.status}`);
            }
            console.log('Transaction successful!');
            console.log('Gas used:', receipt.gasUsed.toString());
            console.log('Block number:', receipt.blockNumber);
            return {
                electionAddress,
                txHash: tx.hash
            };
        }
        catch (error) {
            console.error('Error creating election on blockchain:', error);
            throw new Error(`Failed to create election: ${error.message}`);
        }
    }
    async simulateCreateElection(electionData, fromAddress) {
        try {
            const args = [
                electionData.title,
                electionData.description,
                electionData.startTime,
                electionData.endTime,
                electionData.timezone,
                electionData.ballotReceipt,
                electionData.submitConfirmation,
                electionData.maxVoters,
                electionData.allowVoterRegistration,
                electionData.loginInstructions,
                electionData.voteConfirmation,
                electionData.afterElectionMessage,
                electionData.publicResults,
                electionData.realTimeResults,
                electionData.resultsReleaseTime,
                electionData.allowResultsDownload
            ];
            // Attempt to include creationFee if present
            let valueOverride = {};
            try {
                const fee = await this.factoryContract.creationFee?.();
                if (fee && fee.gt && fee.gt(0)) {
                    valueOverride.value = fee;
                }
            }
            catch { }
            await this.factoryContract.callStatic.createElection(...args, { from: fromAddress, ...valueOverride });
            return { ok: true };
        }
        catch (simErr) {
            const reason = simErr?.error?.message || simErr?.reason || simErr?.message || 'simulation failed';
            return { ok: false, reason };
        }
    }
    async getFactoryInfo() {
        const info = { factoryAddress: this.factoryContract.address };
        try {
            const owner = await this.factoryContract.owner?.();
            if (owner)
                info.owner = owner;
        }
        catch { }
        try {
            const pk = process.env.CREATOR_PRIVATE_KEY;
            if (pk) {
                const signer = new ethers_1.ethers.Wallet(pk);
                info.serverSigner = signer.address;
                try {
                    const isAuth = await this.factoryContract.authorizedCreators?.(signer.address);
                    if (typeof isAuth === 'boolean')
                        info.serverAuthorized = isAuth;
                }
                catch { }
            }
        }
        catch { }
        try {
            const fee = await this.factoryContract.creationFee?.();
            if (fee)
                info.creationFee = ethers_1.ethers.utils.formatEther(fee);
        }
        catch { }
        return info;
    }
    /**
     * Register voters for an election
     */
    async registerVoters(electionAddress, voters, creatorPrivateKey) {
        try {
            const wallet = new ethers_1.ethers.Wallet(creatorPrivateKey, this.provider);
            const electionContract = new ethers_1.ethers.Contract(electionAddress, blockchain_1.CONTRACT_ABIS.ElectionCore, wallet);
            // Extract voter IDs and emails
            const voterIds = voters.map(v => v.voterId);
            const emails = voters.map(v => v.email);
            const tx = await electionContract.batchRegisterVoterIds(voterIds, emails);
            await tx.wait();
            return { txHash: tx.hash };
        }
        catch (error) {
            console.error('Error registering voters on blockchain:', error);
            throw new Error(`Failed to register voters: ${error.message}`);
        }
    }
    /**
     * Get election details from blockchain
     */
    async getElectionDetails(electionAddress) {
        try {
            const electionContract = new ethers_1.ethers.Contract(electionAddress, blockchain_1.CONTRACT_ABIS.ElectionCore, this.provider);
            const details = await electionContract.getElectionSummary();
            return {
                title: details.title,
                description: details.description,
                startTime: details.startTime.toNumber(),
                endTime: details.endTime.toNumber(),
                status: details.status,
                voterCount: details.voterCount.toNumber(),
                maxVoters: details.maxVoters.toNumber(),
                creator: details.creator
            };
        }
        catch (error) {
            console.error('Error getting election details from blockchain:', error);
            throw new Error(`Failed to get election details: ${error.message}`);
        }
    }
    /**
     * Check if a voter is registered for an election
     */
    async isVoterRegistered(electionAddress, voterId) {
        try {
            const electionContract = new ethers_1.ethers.Contract(electionAddress, blockchain_1.CONTRACT_ABIS.ElectionCore, this.provider);
            return await electionContract.isVoterIdRegistered(voterId);
        }
        catch (error) {
            console.error('Error checking voter registration:', error);
            return false;
        }
    }
    /**
     * Check if a voter has voted
     */
    async hasVoterVoted(electionAddress, voterId) {
        try {
            const electionContract = new ethers_1.ethers.Contract(electionAddress, blockchain_1.CONTRACT_ABIS.ElectionCore, this.provider);
            return await electionContract.hasVoterIdVoted(voterId);
        }
        catch (error) {
            console.error('Error checking if voter has voted:', error);
            return false;
        }
    }
    /**
     * Get all elections created by a specific creator
     */
    async getCreatorElections(creatorAddress) {
        try {
            const elections = await this.factoryContract.getCreatorElections(creatorAddress);
            return elections;
        }
        catch (error) {
            console.error('Error getting creator elections:', error);
            throw new Error(`Failed to get creator elections: ${error.message}`);
        }
    }
    /**
     * Get election count
     */
    async getElectionCount() {
        try {
            const count = await this.factoryContract.getElectionCount();
            return count.toNumber();
        }
        catch (error) {
            console.error('Error getting election count:', error);
            return 0;
        }
    }
    /**
     * Fund the paymaster for gasless transactions
     */
    async fundPaymaster(amount, funderPrivateKey) {
        try {
            const wallet = new ethers_1.ethers.Wallet(funderPrivateKey, this.provider);
            const paymasterWithSigner = this.paymasterContract.connect(wallet);
            const tx = await paymasterWithSigner.deposit({
                value: ethers_1.ethers.utils.parseEther(amount)
            });
            await tx.wait();
            return { txHash: tx.hash };
        }
        catch (error) {
            console.error('Error funding paymaster:', error);
            throw new Error(`Failed to fund paymaster: ${error.message}`);
        }
    }
    /**
     * Whitelist voters for gasless transactions
     */
    async whitelistVoters(voters, electionAddress, adminPrivateKey) {
        try {
            const wallet = new ethers_1.ethers.Wallet(adminPrivateKey, this.provider);
            const paymasterWithSigner = this.paymasterContract.connect(wallet);
            const tx = await paymasterWithSigner.batchWhitelistVoters(voters, electionAddress);
            await tx.wait();
            return { txHash: tx.hash };
        }
        catch (error) {
            console.error('Error whitelisting voters:', error);
            throw new Error(`Failed to whitelist voters: ${error.message}`);
        }
    }
}
exports.BlockchainService = BlockchainService;
exports.default = new BlockchainService();
