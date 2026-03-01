import express from 'express';
import multer from 'multer';
import {
  PutObjectCommand
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import Partner from '../../models/Partner.js';
import Client from '../../models/Client.js';
import { generateToken, authenticate } from '../../middleware/auth.js';
import {
  generateOTP,
  getOTPExpiry,
  validateOTP,
  sendEmailOTP,
  sendMobileOTP,
} from '../../utils/otp.js';
import { putobject, getobject, s3Client, deleteObject } from '../../utils/s3.js';

const router = express.Router();

// Multer config for direct image uploads (memory storage, 5MB limit, images only)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

// Helper function to validate and get client
async function validateClientId(clientCode) {
  if (!clientCode) {
    throw new Error('Client ID is required');
  }

  const client = await Client.findOne({ clientId: clientCode.toUpperCase() });

  if (!client) {
    throw new Error('Invalid Client ID');
  }

  if (!client.isActive) {
    throw new Error('Client account is inactive');
  }

  return client;
}

// Registration flow is now handled in partnerRegister.js


/**
 * Upload/Update Profile Picture (For existing partners)
 * POST /api/mobile/partner/profile/picture
 * Headers: Authorization: Bearer <token>
 * Content-Type: multipart/form-data
 * Fields: image (file)
 */
router.post('/profile/picture', authenticate, upload.single('image'), async (req, res) => {
  try {
    if (req.user.role !== 'partner') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Partner access required.',
      });
    }

    const imageFile = req.file;
    if (!imageFile) {
      return res.status(400).json({
        success: false,
        message: 'Image file is required (field name: image)',
      });
    }

    const partner = await Partner.findById(req.user._id).populate('clientId', 'clientId businessName');
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found',
      });
    }

    // Delete old picture if exists and not a Google profile picture
    if (partner.profilePicture && !partner.profilePicture.startsWith('http')) {
      try {
        await deleteObject(partner.profilePicture);
      } catch (deleteErr) {
        console.error('Error deleting old profile picture:', deleteErr);
      }
    }

    // Generate unique key and upload new image to S3
    const fileExtension = imageFile.originalname.split('.').pop() || 'jpg';
    const imageKey = `images/partner/${partner._id}/profile/${uuidv4()}.${fileExtension}`;

    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: imageKey,
      Body: imageFile.buffer,
      ContentType: imageFile.mimetype,
    });

    await s3Client.send(uploadCommand);

    // Save S3 key in partner profile (key + key field for consistency with experts/crud)
    partner.profilePicture = imageKey;
    partner.profilePictureKey = imageKey;
    await partner.save();

    // Return presigned URL for immediate use
    let profilePictureUrl = null;
    try {
      profilePictureUrl = await getobject(imageKey);
    } catch (urlErr) {
      console.error('Error generating presigned URL:', urlErr);
    }

    res.json({
      success: true,
      message: 'Profile picture updated successfully',
      data: {
        partner: {
          ...partner.toObject(),
          role: 'partner',
          profilePictureUrl,
        },
      },
    });
  } catch (error) {
    console.error('Profile picture upload error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload profile picture',
    });
  }
});

/**
 * Check Email and Get Auth Token
 * POST /api/mobile/partner/check-email
 * Body: { email }
 */
router.post('/check-email', async (req, res) => {
  try {
    const { email, clientId: clientCode } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    let partner = await Partner.findOne({ clientCode: clientCode, email });
    const client = await validateClientId(clientCode);
    if (!partner) {
      // Create partner and mark email as verified
      partner = new Partner({
        email: email,
        emailVerified: true,
        password: 'temp_password_' + Date.now(),
        registrationStep: 1,
        phoneVerified: false,
        clientId: client._id,
        clientCode: client.clientId
      });
      await partner.save();

      return res.json({
        success: false,
        message: 'not registered',
        data: {
          registered: false,
          email: email,
          emailVerified: true,
          registrationStep: 1,
          clientId: client.clientId
        }
      });
    }

    if (!partner.emailVerified) {
      partner.emailVerified = true;
      partner.registrationStep = 1;
      await partner.save();
    }

    if (partner.registrationStep < 3) {
      return res.json({
        success: false,
        message: 'not registered',
        data: {
          registered: false,
          email: email,
          emailVerified: partner.emailVerified,
          registrationStep: partner.registrationStep,
          nextStep: partner.registrationStep === 1 ? 'phone_verification' : 'profile_completion',
          clientId: client.clientId
        }
      });
    }

    if (!partner.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive. Please contact administrator.'
      });
    }

    const token = generateToken(partner._id, 'partner');

    res.json({
      success: true,
      message: 'Partner found',
      data: {
        registered: true,
        partner: { ...partner.toObject(), role: 'partner' },
        token,
        emailVerified: partner.emailVerified,
        clientId: client.clientId,
        clientName: client.businessName
      }
    });
  } catch (error) {
    console.error('Check email error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check email'
    });
  }
});

// ============================================
// LOGIN
// ============================================

/**
 * Partner Login (Mobile)
 * POST /api/mobile/partner/login
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, clientId: clientCode } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Build query - if clientId provided, filter by it
    let query = { email };
    if (clientCode) {
      const client = await validateClientId(clientCode);
      query.clientId = client._id;
    }

    // Find partner by email (and optionally by clientId)
    const partner = await Partner.findOne(query).select('+password');

    if (!partner) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (partner.registrationStep < 3) {
      return res.status(400).json({
        success: false,
        message: 'Registration incomplete. Please complete all registration steps.',
        data: {
          registrationStep: partner.registrationStep,
          emailVerified: partner.emailVerified,
          phoneVerified: partner.phoneVerified
        }
      });
    }

    const isPasswordValid = await partner.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (!partner.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive. Please contact administrator.'
      });
    }

    // Generate token
    const token = generateToken(partner._id, 'partner');

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        partner: {
          ...partner.toObject(),
          role: 'partner',
          password: undefined // Remove password from response
        },
        token,
        clientId: partner.clientId?.clientId || null,
        clientName: partner.clientId?.businessName || null
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Login failed'
    });
  }
});

// ============================================
// PROFILE MANAGEMENT
// ============================================

/**
 * Get Partner Profile (Mobile)
 * GET /api/mobile/partner/profile
 * Headers: Authorization: Bearer <token>
 */
router.get('/profile', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'partner') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Partner access required.'
      });
    }

    const partner = await Partner.findById(req.user._id).select('-password');

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Generate presigned URL for profile picture if exists and is S3 key
    let profilePictureUrl = null;
    if (partner.profilePicture && !partner.profilePicture.startsWith('http')) {
      try {
        const { getobject } = await import('../../utils/s3.js');
        profilePictureUrl = await getobject(partner.profilePicture);
      } catch (error) {
        console.error('Error generating profile picture URL:', error);
      }
    } else if (partner.profilePicture) {
      profilePictureUrl = partner.profilePicture; // Google picture URL
    }

    const partnerData = partner.toObject();
    if (profilePictureUrl) {
      partnerData.profilePictureUrl = profilePictureUrl;
    }

    const token = generateToken(partner._id, 'partner');

    res.json({
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        partner: { ...partnerData, role: 'partner' },
        token
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch profile'
    });
  }
});

/**
 * Update Partner Profile (Mobile)
 * PUT /api/mobile/partner/profile
 * Headers: Authorization: Bearer <token>
 * Body: { 
 *   name, phone, email, password,
 *   experienceRange, expertiseCategory, skills, consultationModes,
 *   languages, bio, availabilityPreference, location
 * }
 */
router.put('/profile', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'partner') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Partner access required.'
      });
    }

    const partner = await Partner.findById(req.user._id);

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Update basic fields
    if (req.body.name) partner.name = req.body.name;
    if (req.body.phone) partner.phone = req.body.phone;
    if (req.body.email) partner.email = req.body.email;
    if (req.body.password) partner.password = req.body.password;

    // Update professional fields
    if (req.body.experienceRange) {
      partner.experienceRange = req.body.experienceRange;
      const expMap = { '0-2': 1, '3-5': 4, '6-10': 8, '10+': 15 };
      partner.experience = expMap[req.body.experienceRange] || 0;
    }

    if (req.body.expertiseCategory) partner.expertiseCategory = req.body.expertiseCategory;

    if (req.body.skills && Array.isArray(req.body.skills)) {
      if (req.body.skills.length > 5) {
        return res.status(400).json({
          success: false,
          message: 'Maximum 5 skills allowed'
        });
      }
      partner.skills = req.body.skills;
    }

    if (req.body.consultationModes && Array.isArray(req.body.consultationModes)) {
      partner.consultationModes = req.body.consultationModes;
    }

    if (req.body.languages && Array.isArray(req.body.languages)) {
      partner.languages = req.body.languages;
    }

    if (req.body.bio !== undefined) {
      if (req.body.bio.length > 300) {
        return res.status(400).json({
          success: false,
          message: 'Bio must be 300 characters or less'
        });
      }
      partner.bio = req.body.bio;
    }

    if (req.body.availabilityPreference && Array.isArray(req.body.availabilityPreference)) {
      partner.availabilityPreference = req.body.availabilityPreference;
    }

    // Update location
    if (req.body.location) {
      if (req.body.location.city !== undefined) partner.location.city = req.body.location.city;
      if (req.body.location.country !== undefined) partner.location.country = req.body.location.country;
      if (req.body.location.coordinates) {
        if (req.body.location.coordinates.latitude !== undefined) {
          const lat = parseFloat(req.body.location.coordinates.latitude);
          if (lat >= -90 && lat <= 90) {
            partner.location.coordinates.latitude = lat;
          }
        }
        if (req.body.location.coordinates.longitude !== undefined) {
          const lng = parseFloat(req.body.location.coordinates.longitude);
          if (lng >= -180 && lng <= 180) {
            partner.location.coordinates.longitude = lng;
          }
        }
      }
    }

    await partner.save();

    const token = generateToken(partner._id, 'partner');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        partner: { ...partner.toObject(), role: 'partner' },
        token
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update profile'
    });
  }
});

// ============================================
// RESEND OTP ENDPOINTS
// ============================================

/**
 * Resend Email OTP
 * POST /api/mobile/partner/register/resend-email-otp
 * Body: { email }
 */
router.post('/register/resend-email-otp', async (req, res) => {
  try {
    const { email, clientId: clientCode } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Validate client
    const client = await validateClientId(clientCode);

    const partner = await Partner.findOne({
      clientId: client._id,
      email
    }).select('+emailOtp +emailOtpExpiry');

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found. Please start registration again.'
      });
    }

    if (partner.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified'
      });
    }

    const otp = generateOTP();
    const otpExpiry = getOTPExpiry();

    partner.emailOtp = otp;
    partner.emailOtpExpiry = otpExpiry;
    await partner.save();

    const emailResult = await sendEmailOTP(email, otp);
    if (!emailResult.success) {
      console.warn('Email OTP sending had issues, but continuing:', emailResult.message);
    }

    res.json({
      success: true,
      message: 'OTP resent to your email'
    });
  } catch (error) {
    console.error('Resend email OTP error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to resend email OTP'
    });
  }
});

/**
 * Resend Phone OTP
 * POST /api/mobile/partner/register/resend-phone-otp
 * Body: { email, otpMethod }
 */
router.post('/register/resend-phone-otp', async (req, res) => {
  try {
    const { email, otpMethod, clientId: clientCode } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    if (!otpMethod || !['twilio', 'gupshup', 'whatsapp'].includes(otpMethod)) {
      return res.status(400).json({
        success: false,
        message: 'OTP method is required (twilio, gupshup, or whatsapp)'
      });
    }

    const partner = await Partner.findOne({ email }).select('+phoneOtp +phoneOtpExpiry');

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found. Please start registration again.'
      });
    }

    if (!partner.phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number not provided. Please complete step 2 first.'
      });
    }

    if (partner.phoneVerified) {
      return res.status(400).json({
        success: false,
        message: 'Phone already verified'
      });
    }

    const otp = generateOTP();
    const otpExpiry = getOTPExpiry();

    partner.phoneOtp = otp;
    partner.phoneOtpExpiry = otpExpiry;
    partner.phoneOtpMethod = otpMethod;
    await partner.save();

    // Send OTP based on method
    let otpResult;
    if (otpMethod === 'whatsapp') {
      otpResult = await sendMobileOTP(partner.phone, otp, 'whatsapp');
    } else if (otpMethod === 'gupshup') {
      otpResult = await sendMobileOTP(partner.phone, otp, 'gupshup');
    } else {
      otpResult = await sendMobileOTP(partner.phone, otp, 'twilio');
    }

    if (!otpResult.success) {
      console.warn(`${otpMethod.toUpperCase()} OTP sending had issues, but continuing:`, otpResult.message);
    }

    res.json({
      success: true,
      message: `OTP resent to your phone number via ${otpMethod.toUpperCase()}`
    });
  } catch (error) {
    console.error('Resend phone OTP error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to resend phone OTP'
    });
  }
});

export default router;