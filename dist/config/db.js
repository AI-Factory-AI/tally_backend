"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tally';
console.log('MONGO_URI:', MONGO_URI); // Debug log
const connectDB = async () => {
    try {
        console.log('Attempting to connect to MongoDB...');
        console.log('MONGO_URI:', MONGO_URI);
        await mongoose_1.default.connect(MONGO_URI);
        console.log('✅ MongoDB connected successfully');
        // Test the connection
        const db = mongoose_1.default.connection;
        db.on('error', (err) => {
            console.error('MongoDB connection error after initial connection:', err);
        });
        db.on('disconnected', () => {
            console.warn('MongoDB disconnected');
        });
        db.on('reconnected', () => {
            console.log('MongoDB reconnected');
        });
    }
    catch (err) {
        console.error('❌ MongoDB connection error:', err);
        console.error('Please check:');
        console.error('1. MongoDB is running');
        console.error('2. MONGO_URI is correct');
        console.error('3. Network connectivity');
        process.exit(1);
    }
};
exports.connectDB = connectDB;
