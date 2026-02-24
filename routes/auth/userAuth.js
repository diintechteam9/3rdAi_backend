import express from 'express';
import User from '../../models/User.js';
import { generateToken, authenticate } from '../../middleware/auth.js';
import { OAuth2Client } from 'google-auth-library';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const router = express.Router();

router.post('/google', async (req, res) => {
  try {
    const { idToken, clientId: clientCode } = req.body;

    if (!clientCode) {
      return res.status(400).json({ success: false, message: 'Client ID is required' });
    }

    const Client = (await import('../../models/Client.js')).default;
    const clientDoc = await Client.findOne({ clientId: clientCode.toUpperCase() });

    if (!clientDoc) {
      return res.status(404).json({ success: false, message: 'Invalid Client ID' });
    }

    // Log for debugging
    console.log('Google auth request - has idToken:', !!idToken);

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'Google ID token is required'
      });
    }

    // Verify the Google ID token
    let verifiedEmail = null;
    let verifiedName = null;
    let isEmailVerified = false;

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();

      verifiedEmail = payload.email;
      verifiedName = payload.name;
      isEmailVerified = payload.email_verified;

      console.log('Token verified successfully:', {
        email: verifiedEmail,
        name: verifiedName,
        emailVerified: isEmailVerified
      });
    } catch (verifyError) {
      console.error('Token verification failed:', verifyError.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid Google token: ' + verifyError.message
      });
    }

    if (!verifiedEmail) {
      return res.status(400).json({
        success: false,
        message: 'No email found in Google account'
      });
    }

    // Find or create user for this specific client
    let user = await User.findOne({ email: verifiedEmail, clientId: clientDoc._id });

    if (!user) {
      // Create new user for Google sign-up
      user = new User({
        email: verifiedEmail,
        authMethod: 'google',
        profile: { name: verifiedName || 'Google User' },
        emailVerified: isEmailVerified !== false,
        password: 'google_auth_' + Date.now(), // Temp password for Google users
        loginApproved: true,
        isActive: true,
        registrationStep: 1, // Email verified, but need mobile and profile
        mobileVerified: false,
        clientId: clientDoc._id
      });
      await user.save();
      console.log('New Google user created:', verifiedEmail);
    } else {
      // Existing user
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is inactive.'
        });
      }

      // Update auth method if needed
      if (user.authMethod !== 'google') {
        user.authMethod = 'google';
        await user.save();
      }
    }

    // Populate clientId if exists
    if (user.clientId) {
      await user.populate('clientId', 'clientId businessName email');
    }

    // Generate token with clientId if available
    const token = generateToken(user._id, 'user', user.clientId?._id || user.clientId);

    res.json({
      success: true,
      message: 'Google authentication successful',
      data: {
        user: {
          ...user.toObject(),
          role: 'user'
        },
        token,
        clientId: user.clientId?.clientId || null,
        clientName: user.clientId?.businessName || null
      },
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed: ' + error.message
    });
  }
});

// User Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive. Please contact administrator.'
      });
    }

    if (user.approvalStatus === 'rejected') {
      return res.status(403).json({
        success: false,
        message: 'Your registration has been rejected. Please sign up again.'
      });
    }

    // Populate clientId if exists
    if (user.clientId) {
      await user.populate('clientId', 'clientId businessName email');
    }

    // Generate token with clientId if available
    const token = generateToken(user._id, 'user', user.clientId?._id || user.clientId);

    let profileImageUrl = null;
    if (user.profileImage && !user.profileImage.startsWith('http')) {
      try {
        const { getobject } = await import('../../utils/s3.js');
        profileImageUrl = await getobject(user.profileImage);
      } catch (error) {
        console.error('Error generating profile image URL during login:', error);
      }
    } else if (user.profileImage && user.profileImage.startsWith('http')) {
      profileImageUrl = user.profileImage;
    }

    const userData = user.toObject();
    if (profileImageUrl) {
      userData.profileImageUrl = profileImageUrl;
    }

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: { ...userData, role: 'user' },
        token,
        clientId: user.clientId?.clientId || null,
        clientName: user.clientId?.businessName || null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// User Registration
router.post('/register', async (req, res) => {
  try {
    const { email, password, profile, clientId: clientCode } = req.body;

    if (!email || !password || !clientCode) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and Client ID are required'
      });
    }

    const Client = (await import('../../models/Client.js')).default;
    const clientDoc = await Client.findOne({ clientId: clientCode.toUpperCase() });

    if (!clientDoc) {
      return res.status(404).json({ success: false, message: 'Invalid Client ID' });
    }

    const existingUser = await User.findOne({ email, clientId: clientDoc._id });
    if (existingUser) {
      if (existingUser.approvalStatus === 'rejected') {
        await User.deleteOne({ _id: existingUser._id });
      } else {
        return res.status(400).json({
          success: false,
          message: 'User already exists with this email'
        });
      }
    }

    const user = new User({
      email,
      password,
      profile: profile || {},
      clientId: clientDoc._id,
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please wait for super admin approval to login.',
      data: {
        user: user.toObject()
      }
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
    let profileImageUrl = null;
    const user = req.user;
    if (user.profileImage && !user.profileImage.startsWith('http')) {
      try {
        const { getobject } = await import('../../utils/s3.js');
        profileImageUrl = await getobject(user.profileImage);
      } catch (error) {
        console.error('Error generating profile image URL:', error);
      }
    } else if (user.profileImage && user.profileImage.startsWith('http')) {
      profileImageUrl = user.profileImage;
    }

    const userData = user.toObject ? user.toObject() : { ...user._doc, ...user };
    if (profileImageUrl) {
      userData.profileImageUrl = profileImageUrl;
    }

    res.json({
      success: true,
      data: {
        user: userData
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;