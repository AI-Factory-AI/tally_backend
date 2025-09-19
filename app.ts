import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { connectDB } from './src/config/db';
import authRouter from './src/routers/authRouter';
import userRouter from './src/routers/userRouter';
import electionRouter from './src/routers/electionRouter';
import voterRouter from './src/routers/voterRouter';
import ballotRouter from './src/routers/ballotRouter';
import candidateBallotRouter from './src/routers/candidateBallotRouter';
import voteRouter from './src/routers/voteRouter';
import previewRouter from './src/routers/previewRouter';
import notificationRouter from './src/routers/notificationRouter';
import voterAuthRouter from './src/routers/voterAuthRouter';

dotenv.config();

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({ 
  origin: process.env.FRONTEND_URL || 'http://localhost:5173', 
  credentials: true 
}));

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

// Detailed health check for debugging
app.get('/health/detailed', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
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
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Connect to database
connectDB();

// API routes
app.use('/api/auth', authRouter);
app.use('/api/voter', voterAuthRouter);
app.use('/api/user', userRouter);
app.use('/api/elections', electionRouter);

// New feature routes
app.use('/api/elections', voterRouter);      // Voter management
app.use('/api/elections', ballotRouter);     // Ballot management
app.use('/api/elections', candidateBallotRouter); // Candidate ballot management
app.use('/api/votes', voteRouter);           // Voting and results
app.use('/api/elections', previewRouter);    // Preview functionality

// Notification system routes
app.use('/api/notifications', notificationRouter);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error:', err);
  
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

export default app;
