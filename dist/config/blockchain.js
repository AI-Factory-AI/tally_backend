"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAIN_ID = exports.RPC_URL = exports.CONTRACT_ABIS = exports.CONTRACT_ADDRESSES = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Load deployment addresses (Lisk Sepolia)
const deploymentsPath = path_1.default.join(__dirname, '..', '..', '..', 'tally-blockchain', 'deployments.lisk-sepolia.json');
const deployments = JSON.parse(fs_1.default.readFileSync(deploymentsPath, 'utf8'));
// Load ABIs
const abisPath = path_1.default.join(__dirname, '..', '..', '..', 'tally-blockchain', 'out');
exports.CONTRACT_ADDRESSES = {
    entryPoint: deployments.entryPoint,
    electionFactory: deployments.electionFactory,
    electionPaymaster: deployments.electionPaymaster,
};
exports.CONTRACT_ABIS = {
    ElectionFactory: require('../contracts/abis/ElectionFactory.ts').ABI_ElectionFactory,
    ElectionCore: require('../contracts/abis/ElectionCore.ts').ABI_ElectionCore,
    ElectionPaymaster: require('../contracts/abis/ElectionPaymaster.ts').ABI_ElectionPaymaster,
};
// Lisk Sepolia RPC URL (official public endpoint)
exports.RPC_URL = 'https://rpc.sepolia-api.lisk.com';
// Chain ID for Lisk Sepolia
exports.CHAIN_ID = 4202;
