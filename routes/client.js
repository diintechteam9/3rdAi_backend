// src/routes/client.js - UPDATED VERSION
// Now supports user token authentication for all endpoints

import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import User from '../models/User.js';
import Client from '../models/Client.js';

const router = express.Router();

/**
 * Helper function to get client ID based on user role
 */
const getClientIdForQuery = (user) => {
  if (user.role === 'client') {
    return user._id;
  }
  if (user.role === 'user') {
    // For users, get clientId from populated field or token
    return user.clientId?._id || user.clientId || user.tokenClientId;
  }
  // Admin and super_admin don't filter by clientId
  return null;
};

/**
 * Helper function to check if user has access to a specific user record
 */
const checkUserAccess = (requestingUser, targetUser) => {
  // Super admin and admin have access to all users
  if (requestingUser.role === 'super_admin' || requestingUser.role === 'admin') {
    return true;
  }

  // Client can only access their own users
  if (requestingUser.role === 'client') {
    const targetClientId = targetUser.clientId?._id?.toString() || targetUser.clientId?.toString();
    return targetClientId === requestingUser._id.toString();
  }

  // User can only access their own record
  if (requestingUser.role === 'user') {
    return targetUser._id.toString() === requestingUser._id.toString();
  }

  return false;
};

/**
 * Get client's own users
 * GET /api/client/users
 * Query params: ?page=1&limit=25&search=query
 * Access: client, admin, super_admin, user (user can only see themselves)
 */
router.get('/users', authenticate, authorize('client', 'admin', 'super_admin', 'user'), async (req, res) => {
  try {
    const { search, page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 25, 1), 100);
    const skip = (pageNum - 1) * pageSize;

    let query = {};

    if (req.user.role === 'client') {
      query.clientId = req.user._id;
    } else if (req.user.role === 'user') {
      query._id = req.user._id;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { email: regex },
        { 'profile.name': regex }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -emailOtp -emailOtpExpiry -mobileOtp -mobileOtpExpiry')
        .populate('clientId', 'clientId businessName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      User.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        users,
        total,
        page: pageNum,
        limit: pageSize,
        hasMore: total > skip + users.length
      }
    });
  } catch (error) {
    console.error('[Client API] Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Create a new user under this client
 * POST /api/client/users
 * Access: client, admin, super_admin (users cannot create other users)
 */
router.post('/users', authenticate, authorize('client', 'admin', 'super_admin'), async (req, res) => {
  try {
    const { email, password, profile } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    console.log('[Client API] Creating user for client:', req.user._id.toString());

    const user = new User({
      email,
      password,
      profile: profile || {},
      clientId: req.user.role === 'client' ? req.user._id : req.body.clientId,
      emailVerified: true,
      loginApproved: true,
      registrationStep: 3
    });

    await user.save();
    console.log('[Client API] User created:', user._id.toString());

    const userResponse = await User.findById(user._id)
      .select('-password -emailOtp -emailOtpExpiry -mobileOtp -mobileOtpExpiry')
      .populate('clientId', 'clientId businessName email')
      .lean();

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        user: userResponse
      }
    });
  } catch (error) {
    console.error('[Client API] Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Update a user
 * PUT /api/client/users/:userId
 * Access: client (own users), admin, super_admin, user (own profile only)
 */
router.put('/users/:userId', authenticate, authorize('client', 'admin', 'super_admin', 'user'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { profile, isActive } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check access permissions
    if (!checkUserAccess(req.user, user)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this user'
      });
    }

    // Users can only update their own profile, not isActive status
    if (req.user.role === 'user') {
      if (isActive !== undefined) {
        return res.status(403).json({
          success: false,
          message: 'You cannot change your active status'
        });
      }
    }

    if (profile) {
      user.profile = { ...user.profile, ...profile };
    }
    if (typeof isActive === 'boolean' && req.user.role !== 'user') {
      user.isActive = isActive;
    }

    await user.save();

    const updatedUser = await User.findById(userId)
      .select('-password -emailOtp -emailOtpExpiry -mobileOtp -mobileOtpExpiry')
      .populate('clientId', 'clientId businessName email')
      .lean();

    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        user: updatedUser
      }
    });
  } catch (error) {
    console.error('[Client API] Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Update user's live location
 * PUT /api/client/users/:userId/live-location
 * Body: { latitude: 19.076, longitude: 72.8777, formattedAddress: "...", city: "...", state: "...", country: "..." }
 * Access: client (own users), admin, super_admin, user (own location only)
 */
router.put('/users/:userId/live-location', authenticate, authorize('client', 'admin', 'super_admin', 'user'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { latitude, longitude, formattedAddress, city, state, country } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check access permissions
    if (!checkUserAccess(req.user, user)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update location for this user'
      });
    }

    // Validate coordinates
    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Both latitude and longitude are required'
      });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (lat < -90 || lat > 90) {
      return res.status(400).json({
        success: false,
        message: 'Latitude must be between -90 and 90'
      });
    }

    if (lon < -180 || lon > 180) {
      return res.status(400).json({
        success: false,
        message: 'Longitude must be between -180 and 180'
      });
    }

    // Update live location
    user.liveLocation = {
      latitude: lat,
      longitude: lon,
      formattedAddress: formattedAddress || user.liveLocation?.formattedAddress,
      city: city || user.liveLocation?.city,
      state: state || user.liveLocation?.state,
      country: country || user.liveLocation?.country,
      lastUpdated: new Date()
    };

    await user.save();

    const updatedUser = await User.findById(userId)
      .select('-password -emailOtp -emailOtpExpiry -mobileOtp -mobileOtpExpiry')
      .populate('clientId', 'clientId businessName email')
      .lean();

    res.json({
      success: true,
      message: 'Live location updated successfully',
      data: {
        user: updatedUser
      }
    });
  } catch (error) {
    console.error('[Client API] Update live location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update live location',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Delete a user
 * DELETE /api/client/users/:userId
 * Access: client (own users), admin, super_admin (users cannot delete themselves)
 */
router.delete('/users/:userId', authenticate, authorize('client', 'admin', 'super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (req.user.role === 'client') {
      if (!user.clientId || user.clientId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You can only delete your own users'
        });
      }
    }

    await User.findByIdAndDelete(userId);
    console.log('[Client API] User deleted:', userId);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('[Client API] Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


/**
 * Get client dashboard overview
 * GET /api/client/dashboard/overview
 * Access: client
 */
router.get('/dashboard/overview', authenticate, authorize('client'), async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ clientId: req.user._id });

    res.json({
      success: true,
      data: {
        totalUsers
      }
    });
  } catch (error) {
    console.error('[Client API] Dashboard overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;