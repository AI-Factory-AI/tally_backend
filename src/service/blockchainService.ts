import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES, CONTRACT_ABIS, RPC_URL } from '../config/blockchain';

export interface ElectionData {
  title: string;
  description: string;
  startTime: number;
  endTime: number;
  timezone: string;
  ballotReceipt: boolean;
  submitConfirmation: boolean;
  maxVoters: number;
  allowVoterRegistration: boolean;
  loginInstructions: string;
  voteConfirmation: string;
  afterElectionMessage: string;
  publicResults: boolean;
  realTimeResults: boolean;
  resultsReleaseTime: number;
  allowResultsDownload: boolean;
}

export interface VoterData {
  voterId: string;
  email: string;
}

export class BlockchainService {
  private provider: ethers.providers.JsonRpcProvider;
  private factoryContract: ethers.Contract;
  private paymasterContract: ethers.Contract;

  constructor() {
    this.provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    this.factoryContract = new ethers.Contract(
      CONTRACT_ADDRESSES.electionFactory,
      CONTRACT_ABIS.ElectionFactory,
      this.provider
    );
    this.paymasterContract = new ethers.Contract(
      CONTRACT_ADDRESSES.electionPaymaster,
      CONTRACT_ABIS.ElectionPaymaster,
      this.provider
    );
  }

  /**
   * Create a new election on the blockchain
   */
  async createElection(
    electionData: ElectionData,
    creatorPrivateKey: string
  ): Promise<{ electionAddress: string; txHash: string }> {
    try {
      console.log('Creating election on blockchain...');
      console.log('Election data:', electionData);
      console.log('Factory address:', this.factoryContract.address);
      console.log('Provider URL:', this.provider.connection.url);

      // Ensure the factory address actually has contract code (common after anvil restart)
      const factoryCode = await this.provider.getCode(this.factoryContract.address);
      if (!factoryCode || factoryCode === '0x') {
        throw new Error(
          `No contract code at ElectionFactory address ${this.factoryContract.address}. ` +
          'Re-deploy contracts to Anvil and update tally-blockchain/deployments.local.json.'
        );
      }

      const wallet = new ethers.Wallet(creatorPrivateKey, this.provider);
      console.log('Wallet address:', wallet.address);

      // Fetch suggested fee data and apply optional caps from env
      const feeData = await this.provider.getFeeData();
      const maxPriorityFromEnv = process.env.MAX_PRIORITY_FEE_GWEI
        ? ethers.utils.parseUnits(process.env.MAX_PRIORITY_FEE_GWEI, 'gwei')
        : undefined;
      const maxFeeFromEnv = process.env.MAX_FEE_GWEI
        ? ethers.utils.parseUnits(process.env.MAX_FEE_GWEI, 'gwei')
        : undefined;
      const maxPriorityFeePerGas = maxPriorityFromEnv || feeData.maxPriorityFeePerGas || ethers.utils.parseUnits('1', 'gwei');
      const maxFeePerGas = maxFeeFromEnv || feeData.maxFeePerGas || ethers.utils.parseUnits('3', 'gwei');

      // Preflight balance check
      // Ensure a safe minimum gas limit (clamp to at least 3,000,000)
      const configuredGas = process.env.CREATE_ELECTION_GAS_LIMIT || '3000000';
      const gasLimitOverride = ethers.BigNumber.from(configuredGas);
      const minGas = ethers.BigNumber.from('3000000');
      const finalGasLimit = gasLimitOverride.gte(minGas) ? gasLimitOverride : minGas;
      const balance = await wallet.getBalance();
      const estCost = maxFeePerGas.mul(gasLimitOverride);
      console.log('Balance:', balance.toString(), 'Estimated max cost:', estCost.toString());
      if (balance.lt(estCost)) {
        throw new Error(`Insufficient funds: balance ${ethers.utils.formatEther(balance)} < est max cost ${ethers.utils.formatEther(estCost)}. Fund ${wallet.address} on Lisk Sepolia or lower gas caps.`);
      }

      const factoryWithSigner = this.factoryContract.connect(wallet);

      // Optional creation fee
      let valueOverride = undefined as undefined | { value: ethers.BigNumber };
      try {
        const fee: ethers.BigNumber = await (factoryWithSigner as any).creationFee?.();
        if (fee && fee.gt(0)) {
          valueOverride = { value: fee };
          console.log('Including creation fee:', fee.toString());
        }
      } catch {
        // ignore if method not present
      }

      // Build args once to reuse in callStatic and send
      const args: any[] = [
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
      } catch (simErr: any) {
        const reason = simErr?.error?.message || simErr?.reason || simErr?.message || '';
        console.warn('Preflight createElection revert reason:', reason);
        const looksUnauthorized = /unauthor|not authorized|forbidden|creator/i.test(reason || '');

        // If owner, attempt to self-authorize and retry preflight
        try {
          const owner = await (factoryWithSigner as any).owner?.();
          if (owner && owner.toLowerCase() === wallet.address.toLowerCase() && looksUnauthorized) {
            console.log('Signer is owner; attempting to authorize creator on factory...');
            const authTx = await (factoryWithSigner as any).authorizeCreator(wallet.address);
            console.log('authorizeCreator tx sent:', authTx.hash);
            await authTx.wait();
            console.log('authorizeCreator confirmed. Re-running preflight...');
            await factoryWithSigner.callStatic.createElection(...args, { from: wallet.address, ...(valueOverride || {}) });
            console.log('Preflight after authorization succeeded.');
          } else {
            if (looksUnauthorized) {
              throw new Error(`Not authorized to create elections with ${wallet.address}. Ask factory owner to authorize this address.`);
            }
            console.warn('Not owner or different revert. Proceeding to send with current permissions.');
          }
        } catch (authErr: any) {
          // If we threw a clear unauthorized error above, rethrow; else log and rethrow original
          if (authErr?.message?.includes('Not authorized to create elections')) {
            throw authErr;
          }
          console.warn('Authorization attempt failed or not supported on factory:', authErr?.message || authErr);
          throw new Error(reason || 'createElection preflight failed');
        }
      }

      // First, get the election address using callStatic (this simulates the call without sending a transaction)
      const electionAddress = await factoryWithSigner.callStatic.createElection(
        ...args,
        { from: wallet.address, ...(valueOverride || {}) }
      );
      
      console.log('Election address from callStatic:', electionAddress);

      // Now send the actual transaction
      const tx = await factoryWithSigner.createElection(
        ...args,
        { gasLimit: finalGasLimit, maxPriorityFeePerGas, maxFeePerGas, ...(valueOverride || {}) }
      );

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
    } catch (error: any) {
      console.error('Error creating election on blockchain:', error);
      throw new Error(`Failed to create election: ${error.message}`);
    }
  }

  async simulateCreateElection(
    electionData: ElectionData,
    fromAddress: string
  ): Promise<{ ok: boolean; reason?: string }> {
    try {
      const args: any[] = [
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
      let valueOverride = {} as any;
      try {
        const fee: any = await (this.factoryContract as any).creationFee?.();
        if (fee && fee.gt && fee.gt(0)) {
          valueOverride.value = fee;
        }
      } catch {}

      await this.factoryContract.callStatic.createElection(...args, { from: fromAddress, ...valueOverride });
      return { ok: true };
    } catch (simErr: any) {
      const reason = simErr?.error?.message || simErr?.reason || simErr?.message || 'simulation failed';
      return { ok: false, reason };
    }
  }

  async getFactoryInfo(): Promise<{
    factoryAddress: string;
    owner?: string;
    serverSigner?: string;
    serverAuthorized?: boolean;
    creationFee?: string;
  }> {
    const info: {
      factoryAddress: string;
      owner?: string;
      serverSigner?: string;
      serverAuthorized?: boolean;
      creationFee?: string;
    } = { factoryAddress: this.factoryContract.address };

    try {
      const owner = await (this.factoryContract as any).owner?.();
      if (owner) info.owner = owner;
    } catch {}

    try {
      const pk = process.env.CREATOR_PRIVATE_KEY;
      if (pk) {
        const signer = new ethers.Wallet(pk);
        info.serverSigner = signer.address;
        try {
          const isAuth = await (this.factoryContract as any).authorizedCreators?.(signer.address);
          if (typeof isAuth === 'boolean') info.serverAuthorized = isAuth;
        } catch {}
      }
    } catch {}

    try {
      const fee = await (this.factoryContract as any).creationFee?.();
      if (fee) info.creationFee = ethers.utils.formatEther(fee);
    } catch {}

    return info;
  }

  /**
   * Register voters for an election
   */
  async registerVoters(
    electionAddress: string,
    voters: VoterData[],
    creatorPrivateKey: string
  ): Promise<{ txHash: string }> {
    try {
      const wallet = new ethers.Wallet(creatorPrivateKey, this.provider);
      const electionContract = new ethers.Contract(
        electionAddress,
        CONTRACT_ABIS.ElectionCore,
        wallet
      );

      // Extract voter IDs and emails
      const voterIds = voters.map(v => v.voterId);
      const emails = voters.map(v => v.email);

      const tx = await electionContract.batchRegisterVoterIds(voterIds, emails);
      await tx.wait();

      return { txHash: tx.hash };
    } catch (error: any) {
      console.error('Error registering voters on blockchain:', error);
      throw new Error(`Failed to register voters: ${error.message}`);
    }
  }

  /**
   * Get election details from blockchain
   */
  async getElectionDetails(electionAddress: string) {
    try {
      const electionContract = new ethers.Contract(
        electionAddress,
        CONTRACT_ABIS.ElectionCore,
        this.provider
      );

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
    } catch (error: any) {
      console.error('Error getting election details from blockchain:', error);
      throw new Error(`Failed to get election details: ${error.message}`);
    }
  }

  /**
   * Check if a voter is registered for an election
   */
  async isVoterRegistered(electionAddress: string, voterId: string): Promise<boolean> {
    try {
      const electionContract = new ethers.Contract(
        electionAddress,
        CONTRACT_ABIS.ElectionCore,
        this.provider
      );

      return await electionContract.isVoterIdRegistered(voterId);
    } catch (error: any) {
      console.error('Error checking voter registration:', error);
      return false;
    }
  }

  /**
   * Check if a voter has voted
   */
  async hasVoterVoted(electionAddress: string, voterId: string): Promise<boolean> {
    try {
      const electionContract = new ethers.Contract(
        electionAddress,
        CONTRACT_ABIS.ElectionCore,
        this.provider
      );

      return await electionContract.hasVoterIdVoted(voterId);
    } catch (error: any) {
      console.error('Error checking if voter has voted:', error);
      return false;
    }
  }

  /**
   * Get all elections created by a specific creator
   */
  async getCreatorElections(creatorAddress: string) {
    try {
      const elections = await this.factoryContract.getCreatorElections(creatorAddress);
      return elections;
    } catch (error: any) {
      console.error('Error getting creator elections:', error);
      throw new Error(`Failed to get creator elections: ${error.message}`);
    }
  }

  /**
   * Get election count
   */
  async getElectionCount(): Promise<number> {
    try {
      const count = await this.factoryContract.getElectionCount();
      return count.toNumber();
    } catch (error: any) {
      console.error('Error getting election count:', error);
      return 0;
    }
  }

  /**
   * Fund the paymaster for gasless transactions
   */
  async fundPaymaster(amount: string, funderPrivateKey: string): Promise<{ txHash: string }> {
    try {
      const wallet = new ethers.Wallet(funderPrivateKey, this.provider);
      const paymasterWithSigner = this.paymasterContract.connect(wallet);

      const tx = await paymasterWithSigner.deposit({
        value: ethers.utils.parseEther(amount)
      });

      await tx.wait();
      return { txHash: tx.hash };
    } catch (error: any) {
      console.error('Error funding paymaster:', error);
      throw new Error(`Failed to fund paymaster: ${error.message}`);
    }
  }

  /**
   * Whitelist voters for gasless transactions
   */
  async whitelistVoters(
    voters: string[],
    electionAddress: string,
    adminPrivateKey: string
  ): Promise<{ txHash: string }> {
    try {
      const wallet = new ethers.Wallet(adminPrivateKey, this.provider);
      const paymasterWithSigner = this.paymasterContract.connect(wallet);

      const tx = await paymasterWithSigner.batchWhitelistVoters(voters, electionAddress);
      await tx.wait();

      return { txHash: tx.hash };
    } catch (error: any) {
      console.error('Error whitelisting voters:', error);
      throw new Error(`Failed to whitelist voters: ${error.message}`);
    }
  }
}

export default new BlockchainService();
