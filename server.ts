import app from './app';
import backgroundJobService from './src/service/backgroundJobService';

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Start background jobs for notifications
  try {
    backgroundJobService.start();
    console.log('Background notification jobs started successfully');
  } catch (error) {
    console.error('Failed to start background notification jobs:', error);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // Stop background jobs
  backgroundJobService.stop();
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  
  // Stop background jobs
  backgroundJobService.stop();
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
