"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const mongoose_1 = __importDefault(require("mongoose"));
const db_1 = require("./src/config/db");
const authRouter_1 = __importDefault(require("./src/routers/authRouter"));
const userRouter_1 = __importDefault(require("./src/routers/userRouter"));
const electionRouter_1 = __importDefault(require("./src/routers/electionRouter"));
const voterRouter_1 = __importDefault(require("./src/routers/voterRouter"));
const ballotRouter_1 = __importDefault(require("./src/routers/ballotRouter"));
const candidateBallotRouter_1 = __importDefault(require("./src/routers/candidateBallotRouter"));
const voteRouter_1 = __importDefault(require("./src/routers/voteRouter"));
const previewRouter_1 = __importDefault(require("./src/routers/previewRouter"));
const notificationRouter_1 = __importDefault(require("./src/routers/notificationRouter"));
const voterAuthRouter_1 = __importDefault(require("./src/routers/voterAuthRouter"));
dotenv_1.default.config();
const app = (0, express_1.default)();
// Security middleware
app.use((0, helmet_1.default)());
// CORS configuration
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));
// Logging middleware
app.use((0, morgan_1.default)('combined'));
// Body parsing middleware
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        database: mongoose_1.default.connection.readyState === 1 ? 'connected' : 'disconnected',
        uptime: process.uptime()
    });
});
// Detailed health check for debugging
app.get('/health/detailed', async (req, res) => {
    try {
        const dbStatus = mongoose_1.default.connection.readyState === 1 ? 'connected' : 'disconnected';
        const envVars = {
            NODE_ENV: process.env.NODE_ENV || 'not set',
            PORT: process.env.PORT || 'not set',
            MONGO_URI: process.env.MONGO_URI ? 'set' : 'not set',
            JWT_SECRET: process.env.JWT_SECRET ? 'set' : 'not set',
            VOTER_KEY_ENCRYPTION_KEY: process.env.VOTER_KEY_ENCRYPTION_KEY ? 'set' : 'not set'
        };
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            database: dbStatus,
            environment: envVars,
            uptime: process.uptime(),
            memory: process.memoryUsage()
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'ERROR',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Connect to database
(0, db_1.connectDB)();
// API routes
app.use('/api/auth', authRouter_1.default);
app.use('/api/voter', voterAuthRouter_1.default);
app.use('/api/user', userRouter_1.default);
app.use('/api/elections', electionRouter_1.default);
// New feature routes
app.use('/api/elections', voterRouter_1.default); // Voter management
app.use('/api/elections', ballotRouter_1.default); // Ballot management
app.use('/api/elections', candidateBallotRouter_1.default); // Candidate ballot management
app.use('/api/votes', voteRouter_1.default); // Voting and results
app.use('/api/elections', previewRouter_1.default); // Preview functionality
// Notification system routes
app.use('/api/notifications', notificationRouter_1.default);
// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        message: 'Route not found',
        path: req.originalUrl
    });
});
// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});
exports.default = app;
