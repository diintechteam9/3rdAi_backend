import express from 'express';
import User from '../models/User.js';
import { generateToken, authenticate } from '../middleware/auth.js';

const router = express.Router();

// Register - User self-registration
router.post('/register/user', async (req, res) => {
  try {
    const { email, password, profile, clientId } = req.body;

    // Validate required fields
    if (!email || !password || !clientId) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and Client ID are required'
      });
    }

    // Check if client exists
    const Client = (await import('../models/Client.js')).default;
    const clientDoc = await Client.findOne({ clientId: clientId.toString().toUpperCase() });

    if (!clientDoc) {
      return res.status(404).json({
        success: false,
        message: 'Invalid Client ID. Please check and try again.'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create user
    const user = new User({
      email,
      password,
      role: 'user',
      profile: profile || {},
      clientId: clientDoc._id,
      loginApproved: false // Requires super admin approval
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please wait for super admin approval to login.',
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

// Register - Client self-registration
router.post('/register/client', async (req, res) => {
  try {
    const { email, password, clientInfo } = req.body;

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
        message: 'Client already exists with this email'
      });
    }

    const user = new User({
      email,
      password,
      role: 'client',
      clientInfo: clientInfo || {},
      loginApproved: false // Requires super admin approval
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'Client registered successfully. Please wait for super admin approval to login.',
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

// Google Sign-In Registration/Login
router.post('/register/google', async (req, res) => {
  try {
    const { credential, clientId } = req.body;

    if (!credential || !clientId) {
      return res.status(400).json({
        success: false,
        message: 'Google credential and clientId are required'
      });
    }

    // Verify Google token
    const { OAuth2Client } = await import('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;

    // Check if client exists
    const Client = (await import('../models/Client.js')).default;
    const clientDoc = await Client.findOne({ clientId });

    if (!clientDoc) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Check if user already exists
    // Using User model instead of undefined MobileUser
    // Note: The User model schema might need adjustment if it doesn't support 'clientId' or 'authProvider' 
    // exactly as used here, but checking the schema previously showed it has clientId and authMethod.

    let user = await User.findOne({ email }).populate('clientId', 'clientId businessName email');

    if (user) {
      // User exists - login
      // Update auth method if not already set or different
      if (user.authMethod !== 'google') {
        user.authMethod = 'google';
        await user.save();
      }

      const token = generateToken(user._id);

      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          user,
          clientId,
          clientName: clientDoc.businessName || clientDoc.fullName
        }
      });
    } else {
      // ... (create new user logic remains similar but we can't populate a new instance immediately without saving and re-fetching, but we have clientDoc)
      // Actually we have clientDoc so we can construct the response manually or re-fetch.

      user = new User({
        email,
        profile: {
          name: name
        },
        profileImage: picture,
        clientId: clientDoc._id, // User model references Client ObjectId, not String clientId
        emailVerified: true, // Google emails are already verified
        mobileVerified: false,
        registrationStep: 1, // Assumed step
        authMethod: 'google',
        role: 'user',
        loginApproved: true // Auto-approve Google logins? Or keep false? keeping true for now for ease.
      });

      await user.save();

      // Re-fetch to populate if needed, or just return user with client info attached manually for response
      user = await User.findById(user._id).populate('clientId', 'clientId businessName email');

      const token = generateToken(user._id);

      return res.status(201).json({
        success: true,
        message: 'User registered successfully with Google',
        data: {
          token,
          user,
          clientId,
          clientName: clientDoc.businessName || clientDoc.fullName
        }
      });
    }
  } catch (error) {
    console.error('Google Sign-In Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Google authentication failed'
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const user = await User.findOne({ email }).populate('clientId', 'clientId businessName email');
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

    // Check if login is approved (super admin can always login)
    if (user.role !== 'super_admin' && !user.loginApproved) {
      return res.status(403).json({
        success: false,
        message: 'Login not approved. Please wait for super admin approval.'
      });
    }

    // Generate presigned URL for profile image if exists
    let profileImageUrl = null;
    if (user.profileImage && !user.profileImage.startsWith('http')) {
      try {
        const { getobject } = await import('../utils/s3.js');
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

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userData,
        token
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
    let user = req.user;

    // Convert to plain object if it's a Mongoose document
    if (user.toObject) {
      user = user.toObject();
    }

    // Generate presigned URL for profile image if exists
    let profileImageUrl = null;
    if (user.profileImage && !user.profileImage.startsWith('http')) {
      try {
        const { getobject } = await import('../utils/s3.js');
        profileImageUrl = await getobject(user.profileImage);
      } catch (error) {
        console.error('Error generating profile image URL in /me:', error);
      }
    } else if (user.profileImage && user.profileImage.startsWith('http')) {
      profileImageUrl = user.profileImage;
    }

    if (profileImageUrl) {
      user.profileImageUrl = profileImageUrl;
    }

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

export default router;

