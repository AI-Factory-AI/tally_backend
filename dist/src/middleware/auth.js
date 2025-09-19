"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateElectionOwnership = exports.optionalAuth = exports.requireRole = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../model/User"));
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('Missing JWT_SECRET environment variable');
}
const authenticateToken = async (req, res, next) => {
    try {
        console.log('Auth middleware called for:', req.originalUrl);
        console.log('Headers:', req.headers);
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
        if (!token) {
            console.log('No token provided');
            return res.status(401).json({
                message: 'Access token required',
                code: 'TOKEN_MISSING'
            });
        }
        console.log('Token received, length:', token.length);
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        console.log('Token decoded:', { id: decoded.id, email: decoded.email });
        // Verify user still exists in database
        const user = await User_1.default.findById(decoded.id).select('-password');
        if (!user) {
            console.log('User not found in database:', decoded.id);
            return res.status(401).json({
                message: 'User no longer exists',
                code: 'USER_NOT_FOUND'
            });
        }
        console.log('User found:', { id: user._id, email: user.email, name: user.name });
        req.user = {
            id: user._id.toString(),
            email: user.email,
            name: user.name
        };
        next();
    }
    catch (error) {
        console.error('Auth middleware error:', error);
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({
                message: 'Invalid token',
                code: 'TOKEN_INVALID'
            });
        }
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return res.status(401).json({
                message: 'Token expired',
                code: 'TOKEN_EXPIRED'
            });
        }
        return res.status(500).json({
            message: 'Authentication error',
            code: 'AUTH_ERROR'
        });
    }
};
exports.authenticateToken = authenticateToken;
const requireRole = (roles) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    message: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
            }
            // For now, all authenticated users have access
            // You can extend this later with role-based access control
            next();
        }
        catch (error) {
            console.error('Role middleware error:', error);
            return res.status(500).json({
                message: 'Authorization error',
                code: 'AUTHZ_ERROR'
            });
        }
    };
};
exports.requireRole = requireRole;
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (token) {
            try {
                const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
                const user = await User_1.default.findById(decoded.id).select('-password');
                if (user) {
                    req.user = {
                        id: user._id.toString(),
                        email: user.email,
                        name: user.name
                    };
                }
            }
            catch (error) {
                // Token is invalid, but we continue without user context
                console.log('Optional auth failed:', error);
            }
        }
        next();
    }
    catch (error) {
        console.error('Optional auth middleware error:', error);
        next(); // Continue without user context
    }
};
exports.optionalAuth = optionalAuth;
const validateElectionOwnership = async (req, res, next) => {
    try {
        const { electionId } = req.params;
        if (!req.user) {
            return res.status(401).json({
                message: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        // This will be implemented when we add the election controller
        // For now, just pass through
        next();
    }
    catch (error) {
        console.error('Election ownership validation error:', error);
        return res.status(500).json({
            message: 'Authorization error',
            code: 'AUTHZ_ERROR'
        });
    }
};
exports.validateElectionOwnership = validateElectionOwnership;
