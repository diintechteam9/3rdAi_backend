import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { OAuth2Client } from 'google-auth-library';
import Partner from '../models/Partner.js';
import { generateToken, authenticate } from '../middleware/authMiddleware.js';
import Client from '../models/Client.js';
import { uploadToS3, getobject } from '../utils/s3.js';

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Multer — memory storage for optional profile picture uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  }
});

// @route   POST /api/partners/register
// @desc    Register new partner (requires admin/client approval before login)
// @access  Public
router.post('/register', upload.single('profileImage'), async (req, res) => {
  try {
    const { name, email, password, designation, area, state, clientId, phone, policeId, experience } = req.body;

    // Validate required fields
    if (!name || !email || !password || !designation || !area || !state || !clientId || !phone || !policeId || !experience) {
      return res.status(400).json({
        success: false,
        message: 'Name, Email, Password, Phone, Police ID, Experience, Designation, Area, State, and Client ID are required'
      });
    }

    const clientDoc = await Client.findOne({ clientId: clientId.toString().toUpperCase() });
    if (!clientDoc) {
      return res.status(404).json({ success: false, message: 'Invalid Client ID' });
    }

    // Check if partner already exists
    const existingPartner = await Partner.findOne({ email: email.toLowerCase() });
    if (existingPartner) {
      return res.status(400).json({
        success: false,
        message: 'Partner already exists with this email'
      });
    }

    // Upload profile picture to R2 if provided (optional)
    let profilePictureUrl = null;
    let profilePictureKey = null;
    if (req.file) {
      try {
        const uploadResult = await uploadToS3(req.file, 'partner-profiles');
        profilePictureUrl = uploadResult.url;
        profilePictureKey = uploadResult.key;
      } catch (uploadError) {
        console.error('Profile image upload failed (continuing registration):', uploadError.message);
        // Non-fatal — skip profile picture, still register
      }
    }

    // Create new partner — verificationStatus defaults to 'pending', isVerified: false
    const partner = new Partner({
      name,
      email,
      password,
      designation,
      phone,
      policeId,
      experience: Number(experience) || 0,
      location: { area, state },
      clientId: clientDoc._id,
      verificationStatus: 'pending',
      isVerified: false,
      ...(profilePictureUrl && { profilePicture: profilePictureUrl, profilePictureKey })
    });

    await partner.save();

    // ❌ NO TOKEN ISSUED — partner must wait for admin/client approval
    res.status(201).json({
      success: true,
      message: 'Registration successful! Please wait for admin/client approval before logging in.',
      data: {
        partner: {
          id: partner._id,
          name: partner.name,
          email: partner.email,
          designation: partner.designation,
          area: partner.location?.area,
          state: partner.location?.state,
          profilePicture: partner.profilePicture || null,
          verificationStatus: partner.verificationStatus,
          isVerified: partner.isVerified
        },
        requiresApproval: true
      }
    });
  } catch (error) {
    console.error('Partner registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// @route   POST /api/partners/login
// @desc    Login partner
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find partner
    const partner = await Partner.findOne({ email });
    if (!partner) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isMatch = await partner.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // ✅ CHECK: Approval status — block login if not approved
    if (partner.verificationStatus === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending approval. Please wait for admin/client to approve you.',
        data: {
          verificationStatus: 'pending',
          requiresApproval: true,
          partner: {
            id: partner._id,
            name: partner.name,
            email: partner.email,
            verificationStatus: partner.verificationStatus
          }
        }
      });
    }

    if (partner.verificationStatus === 'rejected') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been rejected. Please contact admin/client for more information.',
        data: {
          verificationStatus: 'rejected',
          requiresApproval: false,
          blockedReason: partner.blockedReason || null
        }
      });
    }

    // Check if partner is active
    if (!partner.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // ✅ Approved partner — generate token
    const token = generateToken(partner._id, 'partner', partner.clientId);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        partner: {
          id: partner._id,
          name: partner.name,
          email: partner.email,
          phone: partner.phone,
          specialization: partner.specialization,
          profilePicture: partner.profilePicture,
          rating: partner.rating,
          totalSessions: partner.totalSessions,
          isVerified: partner.isVerified,
          verificationStatus: partner.verificationStatus
        },
        token
      }
    });
  } catch (error) {
    console.error('Partner login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   GET /api/partners/approval-status
// @desc    Check partner's approval status (for waiting screen polling)
// @access  Public (by email)
router.get('/approval-status', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const partner = await Partner.findOne({ email: email.toLowerCase() })
      .select('name email verificationStatus isVerified blockedReason');

    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found' });
    }

    res.json({
      success: true,
      data: {
        verificationStatus: partner.verificationStatus,
        isVerified: partner.isVerified,
        blockedReason: partner.blockedReason || null,
        name: partner.name
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/partners/pending
// @desc    Get all pending partners for admin/client
// @access  Private (admin, super_admin, client)
router.get('/pending', authenticate, async (req, res) => {
  try {
    const allowedRoles = ['admin', 'super_admin', 'client'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Client can only see partners under their clientId
    const filter = { verificationStatus: 'pending', isDeleted: false };
    if (req.user.role === 'client') {
      filter.clientId = req.user._id;
    } else if (req.clientId) {
      filter.clientId = req.clientId;
    }

    const partners = await Partner.find(filter)
      .select('name email designation location profilePicture profilePictureKey verificationStatus isVerified createdAt clientId')
      .populate('clientId', 'clientId businessName email')
      .sort({ createdAt: -1 })
      .lean();

    for (const p of partners) {
      if (p.profilePictureKey) {
        try { p.profilePicture = await getobject(p.profilePictureKey); } catch (e) { }
      } else if (p.profilePicture && !p.profilePicture.includes('googleusercontent') && p.profilePicture.includes('cloudflarestorage')) {
        const key = p.profilePicture.split(`${process.env.R2_BUCKET}/`)[1];
        if (key) { try { p.profilePicture = await getobject(key); } catch (e) { } }
      }
    }

    res.json({
      success: true,
      data: { partners, total: partners.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/partners/all
// @desc    Get all partners (all statuses) for admin/client
// @access  Private (admin, super_admin, client)
router.get('/all', authenticate, async (req, res) => {
  try {
    const allowedRoles = ['admin', 'super_admin', 'client'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const filter = { isDeleted: false };
    if (req.user.role === 'client') {
      filter.clientId = req.user._id;
    }

    const partners = await Partner.find(filter)
      .select('name email designation location profilePicture profilePictureKey verificationStatus isVerified isActive onlineStatus createdAt clientId')
      .populate('clientId', 'clientId businessName')
      .sort({ createdAt: -1 })
      .lean();

    for (const p of partners) {
      if (p.profilePictureKey) {
        try { p.profilePicture = await getobject(p.profilePictureKey); } catch (e) { }
      } else if (p.profilePicture && !p.profilePicture.includes('googleusercontent') && p.profilePicture.includes('cloudflarestorage')) {
        const key = p.profilePicture.split(`${process.env.R2_BUCKET}/`)[1];
        if (key) { try { p.profilePicture = await getobject(key); } catch (e) { } }
      }
    }

    res.json({
      success: true,
      data: { partners, total: partners.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PATCH /api/partners/:partnerId/approve
// @desc    Approve a partner (admin/client)
// @access  Private (admin, super_admin, client)
router.patch('/:partnerId/approve', authenticate, async (req, res) => {
  try {
    const allowedRoles = ['admin', 'super_admin', 'client'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const partner = await Partner.findById(req.params.partnerId);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found' });
    }

    // Client can only approve their own partners
    if (req.user.role === 'client' && partner.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only approve partners under your account' });
    }

    partner.verificationStatus = 'approved';
    partner.isVerified = true;
    partner.verifiedAt = new Date();
    partner.verifiedBy = req.user._id;
    await partner.save();

    res.json({
      success: true,
      message: `Partner ${partner.name} approved successfully`,
      data: { partnerId: partner._id, verificationStatus: 'approved' }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PATCH /api/partners/:partnerId/reject
// @desc    Reject a partner (admin/client)
// @access  Private (admin, super_admin, client)
router.patch('/:partnerId/reject', authenticate, async (req, res) => {
  try {
    const allowedRoles = ['admin', 'super_admin', 'client'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const partner = await Partner.findById(req.params.partnerId);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found' });
    }

    if (req.user.role === 'client' && partner.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only reject partners under your account' });
    }

    const { reason } = req.body;
    partner.verificationStatus = 'rejected';
    partner.isVerified = false;
    partner.blockedReason = reason || 'Rejected by admin';
    await partner.save();

    res.json({
      success: true,
      message: `Partner ${partner.name} rejected`,
      data: { partnerId: partner._id, verificationStatus: 'rejected' }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/partners/google-login
// @desc    Google OAuth login for partners
// @access  Public
router.post('/google-login', async (req, res) => {
  try {
    const { credential } = req.body;

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Check if partner exists
    let partner = await Partner.findOne({
      $or: [{ email }, { googleId }]
    });

    if (partner) {
      // Update Google ID if not set
      if (!partner.googleId) {
        partner.googleId = googleId;
        await partner.save();
      }
    } else {
      // Create new partner
      partner = new Partner({
        name,
        email,
        googleId,
        profilePicture: picture,
        isVerified: true // Google accounts are pre-verified
      });
      await partner.save();
    }

    // Check if partner is active
    if (!partner.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // Generate token
    const token = generateToken(partner._id, 'partner', partner.clientId);

    res.json({
      success: true,
      message: 'Google login successful',
      data: {
        partner: {
          id: partner._id,
          name: partner.name,
          email: partner.email,
          phone: partner.phone,
          specialization: partner.specialization,
          profilePicture: partner.profilePicture,
          rating: partner.rating,
          totalSessions: partner.totalSessions,
          isVerified: partner.isVerified
        },
        token
      }
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({
      success: false,
      message: 'Google authentication failed'
    });
  }
});

// @route   GET /api/partners/profile
// @desc    Get partner profile
// @access  Private
router.get('/profile', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const partnerId = decoded.userId || decoded.id || decoded.partnerId;
    const partner = await Partner.findById(partnerId).select('-password');

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    const partnerData = partner.toObject();

    // Generate presigned URL for profile picture
    if (partnerData.profilePictureKey) {
      try {
        partnerData.profilePicture = await getobject(partnerData.profilePictureKey);
      } catch (err) {
        console.error('Failed to generate presigned URL for profile:', err.message);
      }
    } else if (partnerData.profilePicture && !partnerData.profilePicture.includes('googleusercontent.com') && partnerData.profilePicture.includes('cloudflarestorage.com')) {
      // Legacy fallback
      const key = partnerData.profilePicture.split(`${process.env.R2_BUCKET}/`)[1];
      if (key) {
        try { partnerData.profilePicture = await getobject(key); } catch (err) { }
      }
    }

    res.json({
      success: true,
      data: partnerData
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/partners/profile
// @desc    Update partner profile
// @access  Private
router.put('/profile', upload.single('profileImage'), async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const partnerId = decoded.userId || decoded.id || decoded.partnerId;

    let partner = await Partner.findById(partnerId);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found' });
    }

    // Handle image upload if a new file is provided
    if (req.file) {
      try {
        const uploadResult = await uploadToS3(req.file, 'partner-profiles');
        partner.profilePicture = uploadResult.url;
        partner.profilePictureKey = uploadResult.key;
      } catch (uploadError) {
        console.error('Profile image update failed:', uploadError.message);
        return res.status(500).json({ success: false, message: 'Failed to upload profile image' });
      }
    }

    // Prepare location updates
    const updatedLocation = { ...partner.location?.toObject() };
    if (req.body.area) updatedLocation.area = req.body.area;
    if (req.body.state) updatedLocation.state = req.body.state;
    if (req.body['location.city']) updatedLocation.city = req.body['location.city'];
    if (req.body['location.country']) updatedLocation.country = req.body['location.country'];

    // List of allowed fields to update
    const allowedUpdates = [
      'name', 'phone', 'bio', 'designation', 'policeId', 'policeStation',
      'experience', 'skills', 'languages', 'socialMedia'
    ];

    allowedUpdates.forEach(field => {
      // For objects like socialMedia, we might need to parse if it comes as JSON string from FormData
      if (req.body[field] !== undefined) {
        try {
          // Attempt to parse JSON strings back to objects/arrays (useful for skills, languages, socialMedia from FormData)
          const parsed = JSON.parse(req.body[field]);
          partner[field] = parsed;
        } catch (e) {
          // If not JSON, just assign the value directly
          partner[field] = req.body[field];
        }
      }
    });

    partner.location = updatedLocation;

    await partner.save();

    const partnerData = partner.toObject();

    // Generate presigned URL for the updated picture
    if (partnerData.profilePictureKey) {
      try {
        partnerData.profilePicture = await getobject(partnerData.profilePictureKey);
      } catch (err) {
        console.error('Failed to generate presigned URL for profile:', err.message);
      }
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: partnerData
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during profile update'
    });
  }
});

export default router;