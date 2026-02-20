import jwt from 'jsonwebtoken';
import Client from '../models/Client.js';
import { JWT_SECRET } from './auth.js';

/**
 * Middleware to authenticate client tokens only
 * Used for testimonials, founder messages, brand assets (client-only features)
 * @alias authenticateTestimonial (for backward compatibility)
 */
export const authenticateClient = async (req, res, next) => {
  try {
    // Use req.get() which is case-insensitive, or check both Authorization and authorization
    const authHeader = req.get('Authorization') || req.get('authorization') || req.header('Authorization');
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : null;
    
    console.log('[Client Auth] Request received:', {
      path: req.path,
      method: req.method,
      hasAuthHeader: !!authHeader,
      hasToken: !!token,
      tokenLength: token ? token.length : 0,
      tokenPreview: token ? token.substring(0, 50) + '...' : null
    });
    
    if (!token) {
      console.warn('[Client Auth] No token provided');
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // First, decode without verification to inspect token contents
    const decodedUnverified = jwt.decode(token);
    console.log('[Client Auth] Token decoded (unverified):', {
      userId: decodedUnverified?.userId,
      role: decodedUnverified?.role,
      exp: decodedUnverified?.exp,
      iat: decodedUnverified?.iat
    });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log('[Client Auth] Token verified successfully:', {
        userId: decoded.userId,
        role: decoded.role
      });
    } catch (verifyError) {
      console.error('[Client Auth] Token verification failed:', {
        error: verifyError.message,
        errorName: verifyError.name
      });
      throw verifyError;
    }
    
    // Check if it's a client token
    if (decoded.role !== 'client') {
      console.warn('[Client Auth] Non-client role attempted:', decoded.role);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Client role required.'
      });
    }

    // Token has userId field (from generateToken function in auth.js)
    const clientId = decoded.userId || decoded.id;
    if (!clientId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Client ID not found in token.'
      });
    }

    const client = await Client.findById(clientId);
    if (!client) {
      console.log('[Client Auth] Client not found for ID:', clientId);
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Client not found.'
      });
    }

    if (!client.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive. Please contact administrator.'
      });
    }

    // Ensure _id is available
    if (!client._id && clientId) {
      client._id = clientId;
    }
    
    console.log('[Client Auth] Authentication successful:', {
      clientId: client._id?.toString(),
      clientIdAlt: client.id,
      email: client.email,
      role: client.role,
      path: req.path,
      clientType: client.constructor?.name,
      clientKeys: Object.keys(client).slice(0, 10)
    });

    req.user = client;
    // Ensure req.user has _id
    if (!req.user._id && clientId) {
      req.user._id = clientId;
    }
    
    console.log('[Client Auth] req.user set:', {
      hasUser: !!req.user,
      userId: req.user?._id?.toString(),
      userRole: req.user?.role
    });
    
    next();
  } catch (error) {
    console.error('[Client Auth] Final error catch:', {
      error: error.message,
      errorName: error.name
    });
    
    // Return helpful error message
    const isSignatureError = error.message.includes('invalid signature') || error.message.includes('Invalid token signature');
    const isExpiredError = error.name === 'TokenExpiredError';
    
    let errorMessage = 'Invalid token.';
    if (isSignatureError) {
      errorMessage = 'Invalid token signature. Please log out and log back in to get a fresh token.';
    } else if (isExpiredError) {
      errorMessage = 'Token has expired. Please log out and log back in.';
    }
    
    return res.status(401).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Export with old name for backward compatibility (testimonials routes still use this name)
export const authenticateTestimonial = authenticateClient;
