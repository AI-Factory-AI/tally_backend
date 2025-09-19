import path from 'path';
import fs from 'fs';

// Load deployment addresses (Lisk Sepolia)
const deploymentsPath = path.join(__dirname, '..', '..', '..', 'tally-blockchain', 'deployments.lisk-sepolia.json');
const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));

// Load ABIs
const abisPath = path.join(__dirname, '..', '..', '..', 'tally-blockchain', 'out');

export const CONTRACT_ADDRESSES = {
  entryPoint: deployments.entryPoint as string,
  electionFactory: deployments.electionFactory as string,
  electionPaymaster: deployments.electionPaymaster as string,
} as const;

export const CONTRACT_ABIS = {
  ElectionFactory: require('../contracts/abis/ElectionFactory.ts').ABI_ElectionFactory,
  ElectionCore: require('../contracts/abis/ElectionCore.ts').ABI_ElectionCore,
  ElectionPaymaster: require('../contracts/abis/ElectionPaymaster.ts').ABI_ElectionPaymaster,
} as const;

// Lisk Sepolia RPC URL (official public endpoint)
export const RPC_URL = process.env.RPC_URL || 'https://rpc.sepolia-api.lisk.com';

// Chain ID for Lisk Sepolia
export const CHAIN_ID = Number(process.env.CHAIN_ID || 4202);
