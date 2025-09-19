"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const backgroundJobService_1 = __importDefault(require("./src/service/backgroundJobService"));
const PORT = process.env.PORT || 5000;
const server = app_1.default.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Start background jobs for notifications
    try {
        backgroundJobService_1.default.start();
        console.log('Background notification jobs started successfully');
    }
    catch (error) {
        console.error('Failed to start background notification jobs:', error);
    }
});
// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    // Stop background jobs
    backgroundJobService_1.default.stop();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    // Stop background jobs
    backgroundJobService_1.default.stop();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
