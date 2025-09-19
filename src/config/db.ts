import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI as string;
if (!MONGO_URI) {
  throw new Error('Missing MONGO_URI environment variable');
}

console.log('MONGO_URI configured');

export const connectDB = async () => {
  try {
    console.log('Attempting to connect to MongoDB...');
    console.log('MONGO_URI:', MONGO_URI);
    
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected successfully');
    
    // Test the connection
    const db = mongoose.connection;
    db.on('error', (err) => {
      console.error('MongoDB connection error after initial connection:', err);
    });
    
    db.on('disconnected', () => {
      console.warn('MongoDB disconnected');
    });
    
    db.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });
    
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    console.error('Please check:');
    console.error('1. MongoDB is running');
    console.error('2. MONGO_URI is correct');
    console.error('3. Network connectivity');
    process.exit(1);
  }
};
