import express from 'express';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { getobject, extractS3KeyFromUrl } from '../utils/s3.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Helper to process user object and add presigned URLs
const processUserWithUrls = async (userDoc) => {
  const user = userDoc.toObject ? userDoc.toObject() : userDoc;

  if (user.profileImage) {
    try {
      // Check if it's an S3 key or URL
      const key = extractS3KeyFromUrl(user.profileImage) || user.profileImage;
      // If it looks like a key (no http/https) or we extracted a key
      if (key && !key.startsWith('http')) {
        user.profileImage = await getobject(key);
      }
    } catch (error) {
      console.error('Error generating presigned URL for profile image:', error);
      // Keep original value on error
    }
  }
  return user;
};

// Get user profile
router.get('/profile', async (req, res) => {
  try {
    const userDoc = await User.findById(req.user._id).select('-password');
    const user = await processUserWithUrls(userDoc);

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await processUserWithUrls(req.user);
    res.json({
      success: true,
      data: {
        user
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update user profile
router.put('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (req.body.password) {
      user.password = req.body.password;
    }

    if (req.body.profile) {
      user.profile = { ...user.profile, ...req.body.profile };
    }

    if (req.body.clientInfo) {
      user.clientInfo = { ...user.clientInfo, ...req.body.clientInfo };
    }

    Object.keys(req.body).forEach(key => {
      if (key !== 'password' && key !== 'profile' && key !== 'clientInfo') {
        user[key] = req.body[key];
      }
    });

    await user.save();

    // Process response with presigned URLs
    const processedUser = await processUserWithUrls(user);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: processedUser }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;


