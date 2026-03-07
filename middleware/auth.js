// src/middleware/auth.js - UNIFIED VERSION WITH ENHANCED FILTERING
// Provides robust authentication and data isolation for multi-tenant architecture.

import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import Client from '../models/Client.js';
import User from '../models/User.js';
import Partner from '../models/Partner.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production-to-a-strong-random-string';

/**
 * Enhanced Authentication Middleware
 * Works with all user types: super_admin, admin, client, user, and partner.
 * Sets req.tenantFilter for data isolation.
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization') || req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'No authorization header provided. Authentication required.'
      });
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '')
      : authHeader;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Authentication required.'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (verifyError) {
      if (verifyError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired. Please login again.'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Authorization denied.'
      });
    }

    const userId = decoded.userId || decoded.id;
    const userRole = decoded.role;

    if (!userId || !userRole) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload. Authorization denied.'
      });
    }

    let user = null;
    let userDoc = null;

    if (userRole === 'super_admin' || userRole === 'admin') {
      userDoc = await Admin.findById(userId).select('-password');
      if (userDoc) {
        user = userDoc.toObject();
        user.role = userRole;
      }
    } else if (userRole === 'client') {
      userDoc = await Client.findById(userId).select('-password');
      if (userDoc) {
        user = userDoc.toObject();
        user.role = 'client';
      }
    } else if (userRole === 'user') {
      userDoc = await User.findById(userId)
        .select('-password -emailOtp -emailOtpExpiry -mobileOtp -mobileOtpExpiry')
        .populate('clientId', 'clientId organizationName businessName fullName');
      if (userDoc) {
        user = userDoc.toObject();
        user.role = 'user';
        if (decoded.clientId) user.tokenClientId = decoded.clientId;
      }
    } else if (userRole === 'partner') {
      userDoc = await Partner.findById(userId).select('-password');
      if (userDoc) {
        user = userDoc.toObject();
        user.role = 'partner';
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Authorization denied.'
      });
    }

    // Active check (Partners exempted during registration)
    if (user.isActive === false && userRole !== 'partner') {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Logic for user approval
    if (userRole === 'user' && user.loginApproved === false) {
      return res.status(401).json({
        success: false,
        message: 'Your account is pending approval.'
      });
    }

    // CRITICAL: Force role to be string
    user.role = String(userRole);

    // Data Isolation Logic (req.tenantFilter)
    req.isSuperAdmin = userRole === 'super_admin';
    if (userRole === 'super_admin') {
      req.clientId = null;
      req.tenantFilter = {};
    } else if (userRole === 'admin') {
      req.clientId = null;
      const clients = await Client.find({ adminId: userId }).select('_id');
      const clientIds = clients.map(c => c._id);
      req.tenantFilter = { clientId: { $in: clientIds } };
    } else if (userRole === 'client') {
      req.clientId = user._id;
      req.tenantFilter = { clientId: user._id };
    } else if (userRole === 'user' || userRole === 'partner') {
      req.clientId = user.clientId?._id || user.clientId || decoded.clientId;
      req.tenantFilter = { clientId: req.clientId };
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth Middleware] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication server error.'
    });
  }
};

/**
 * Role-based Authorization Middleware
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const allowedRoles = Array.isArray(roles[0]) ? roles[0] : roles;
    const userRole = String(req.user.role);

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Role ${userRole} is not authorized.`
      });
    }
    next();
  };
};

/**
 * Generate JWT token
 */
export const generateToken = (userId, role, clientId = null, email = null) => {
  const payload = {
    userId,
    id: userId,
    role: String(role),
    email: email || undefined
  };
  if ((role === 'user' || role === 'partner') && clientId) {
    payload.clientId = clientId;
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

export const authenticateToken = authenticate;
export const authMiddleware = authenticate;

export default {
  authenticate,
  authorize,
  generateToken,
  authenticateToken,
  authMiddleware,
  JWT_SECRET
};