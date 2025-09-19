"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfile = exports.getProfile = void 0;
const User_1 = __importDefault(require("../model/User"));
const getProfile = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const user = await User_1.default.findById(userId).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            institution: user.institution || '',
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        });
    }
    catch (err) {
        console.error('Get profile error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.getProfile = getProfile;
const updateProfile = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const { name, email, firstName, lastName, institution } = req.body;
        const user = await User_1.default.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Only update fields that are provided
        if (name !== undefined)
            user.name = name;
        if (email !== undefined)
            user.email = email;
        if (firstName !== undefined)
            user.firstName = firstName;
        if (lastName !== undefined)
            user.lastName = lastName;
        if (institution !== undefined)
            user.institution = institution;
        await user.save();
        res.json({
            message: 'Profile updated successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                institution: user.institution || '',
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            }
        });
    }
    catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.updateProfile = updateProfile;
