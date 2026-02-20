import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import ConversationSession from '../models/ConversationSession.js';
import { generateConversationSummary } from '../services/geminiService.js';
import { getobject } from '../utils/s3.js';
import Partner from '../models/Partner.js';
import User from '../models/User.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production-to-a-strong-random-string';

// Middleware to authenticate
const authenticate = async (req, res, next) => {
  try {
    console.log('🔐 Authentication middleware started');
    console.log('📋 Headers:', req.headers);

    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    console.log('🔑 Token received:', token.substring(0, 20) + '...');

    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('✅ Token decoded:', decoded);

    let user;
    if (decoded.role === 'partner') {
      const partnerIdFromToken = decoded.userId || decoded.partnerId; // Support both
      user = await Partner.findById(partnerIdFromToken);
      req.userId = partnerIdFromToken;
      req.userType = 'partner';
    } else if (decoded.role === 'user') {
      console.log('👤 User type: USER');
      user = await User.findById(decoded.userId);
      req.userId = decoded.userId;
      req.userType = 'user';
    }

    if (!user) {
      console.log('❌ User not found in database');
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ User authenticated:', { id: req.userId, type: req.userType });
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Authentication error:', error.message);
    console.error('Stack:', error.stack);
    res.status(401).json({
      success: false,
      message: 'Invalid token',
      error: error.message
    });
  }
};

// ==================== PARTNER STATUS MANAGEMENT ====================

// @route   PATCH /api/chat/partner/status
// @desc    Update partner's online status (online/offline/busy)
// @access  Private (Partner only)
router.patch('/partner/status', authenticate, async (req, res) => {
  try {
    if (req.userType !== 'partner') {
      return res.status(403).json({
        success: false,
        message: 'Only partners can update status'
      });
    }

    const { status } = req.body;

    if (!['online', 'offline', 'busy'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be: online, offline, or busy'
      });
    }

    const partner = await Partner.findByIdAndUpdate(
      req.userId,
      {
        onlineStatus: status,
        lastActiveAt: new Date()
      },
      { new: true }
    ).select('name email onlineStatus lastActiveAt activeConversationsCount');

    res.json({
      success: true,
      message: 'Status updated successfully',
      data: partner
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: error.message
    });
  }
});

// @route   GET /api/chat/partner/status
// @desc    Get partner's current status
// @access  Private (Partner only)
router.get('/partner/status', authenticate, async (req, res) => {
  try {
    if (req.userType !== 'partner') {
      return res.status(403).json({
        success: false,
        message: 'Only partners can view their status'
      });
    }

    const partner = await Partner.findById(req.userId)
      .select('name email onlineStatus lastActiveAt activeConversationsCount maxConversations');

    res.json({
      success: true,
      data: {
        ...partner.toObject(),
        canAcceptMore: partner.activeConversationsCount < partner.maxConversations
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch status',
      error: error.message
    });
  }
});

// ==================== GET AVAILABLE PARTNERS ====================

// @route   GET /api/chat/partners
// @desc    Get all available partners for users
// @access  Private
router.get('/partners', authenticate, async (req, res) => {
  try {
    const totalPartners = await Partner.countDocuments();
    const activePartners = await Partner.countDocuments({ isActive: true });
    const verifiedPartners = await Partner.countDocuments({ isVerified: true });

    const partners = await Partner.find({ isActive: true, isVerified: true })
      .select('name email phone profilePicture bio specialization rating totalSessions experience experienceRange expertise expertiseCategory skills languages qualifications consultationModes location totalRatings completedSessions pricePerSession currency onlineStatus activeConversationsCount maxConversations lastActiveAt availabilityPreference')
      .sort({ rating: -1, totalSessions: -1 })
      .lean();

    // Process partners with safe defaults for missing fields
    const partnersData = partners.map(partner => {
      const onlineStatus = partner.onlineStatus || 'offline';
      const activeConversationsCount = partner.activeConversationsCount ?? 0;
      const maxConversations = partner.maxConversations || 5;

      return {
        ...partner,
        name: partner.name || partner.email.split('@')[0],
        onlineStatus,
        activeConversationsCount,
        maxConversations,
        rating: partner.rating || 0,
        totalSessions: partner.totalSessions || 0,
        experience: partner.experience || 0,
        status: onlineStatus,
        isBusy: activeConversationsCount >= maxConversations,
        canAcceptConversation: activeConversationsCount < maxConversations,
        availableSlots: maxConversations - activeConversationsCount
      };
    });

    res.json({
      success: true,
      data: partnersData,
      meta: {
        total: partnersData.length,
        totalInDb: totalPartners,
        active: activePartners,
        verified: verifiedPartners,
        query: { isActive: true, isVerified: true }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch partners',
      error: error.message
    });
  }
});

// @route   GET /api/chat/partners/:partnerId
// @desc    Get full partner details (for display in chat sidebar)
// @access  Private
router.get('/partners/:partnerId', authenticate, async (req, res) => {
  try {
    const { partnerId } = req.params;
    const partner = await Partner.findById(partnerId)
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .lean();
    if (!partner || !partner.isActive) {
      return res.status(404).json({ success: false, message: 'Partner not found' });
    }
    const onlineStatus = partner.onlineStatus || 'offline';
    const activeConversationsCount = partner.activeConversationsCount ?? 0;
    const maxConversations = partner.maxConversations || 5;
    res.json({
      success: true,
      data: {
        ...partner,
        status: onlineStatus,
        isBusy: activeConversationsCount >= maxConversations,
        canAcceptConversation: activeConversationsCount < maxConversations
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch partner',
      error: error.message
    });
  }
});

// ==================== CONVERSATION REQUESTS ====================

// @route   POST /api/chat/conversations
// @desc    Create conversation request
// @access  Private
router.post('/conversations', authenticate, async (req, res) => {
  try {
    const { partnerId, userId } = req.body;

    // Validate request based on user type
    if (req.userType === 'user' && !partnerId) {
      return res.status(400).json({
        success: false,
        message: 'Partner ID is required'
      });
    }

    if (req.userType === 'partner' && !userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const finalPartnerId = req.userType === 'partner' ? req.userId : partnerId;
    const finalUserId = req.userType === 'user' ? req.userId : userId;

    // Check if partner exists (optional availability check could go here)
    const partner = await Partner.findById(finalPartnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Base ID for lookup
    const baseId = [finalPartnerId, finalUserId].sort().join('_');

    // Check if active/pending conversation already exists
    let conversation = await Conversation.findOne({
      partnerId: finalPartnerId,
      userId: finalUserId,
      status: { $in: ['pending', 'accepted', 'active'] }
    });

    if (conversation) {
      await conversation.populate('partnerId', 'name email profilePicture specialization rating onlineStatus bio experience expertise languages qualifications location totalSessions completedSessions pricePerSession');
      await conversation.populate('userId', 'email profile profileImage');
      return res.json({
        success: true,
        message: 'Conversation already exists',
        data: conversation
      });
    }

    // New conversation
    const conversationId = `${baseId}_${Date.now()}`;

    conversation = await Conversation.create({
      conversationId,
      partnerId: finalPartnerId,
      userId: finalUserId,
      status: 'pending',
      isAcceptedByPartner: false
    });

    await conversation.populate('partnerId', 'name email profilePicture specialization rating onlineStatus bio experience expertise languages qualifications location totalSessions completedSessions pricePerSession');
    await conversation.populate('userId', 'email profile profileImage');

    res.json({
      success: true,
      message: 'Conversation request created. Waiting for partner acceptance.',
      data: conversation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create conversation',
      error: error.message
    });
  }
});

// @route   GET /api/chat/partner/requests
// @desc    Get all pending conversation requests for partner
// @access  Private (Partner only)
router.get('/partner/requests', authenticate, async (req, res) => {
  try {
    if (req.userType !== 'partner') {
      return res.status(403).json({
        success: false,
        message: 'Only partners can view conversation requests'
      });
    }

    const partnerObjectId = mongoose.Types.ObjectId.isValid(req.userId) ? new mongoose.Types.ObjectId(req.userId) : req.userId;
    const requests = await Conversation.find({
      partnerId: partnerObjectId,
      status: 'pending',
      isAcceptedByPartner: false
    })
      .sort({ createdAt: -1 })
      .populate('userId', 'email profile profileImage')
      .lean();

    res.json({
      success: true,
      data: {
        requests,
        totalRequests: requests.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation requests',
      error: error.message
    });
  }
});

// @route   POST /api/chat/partner/requests/:conversationId/accept
// @desc    Accept a conversation request
// @access  Private (Partner only)
router.post('/partner/requests/:conversationId/accept', authenticate, async (req, res) => {
  try {
    if (req.userType !== 'partner') {
      return res.status(403).json({
        success: false,
        message: 'Only partners can accept conversation requests'
      });
    }

    const { conversationId } = req.params;
    const conversation = await Conversation.findOne({ conversationId });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    if (conversation.partnerId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (conversation.isAcceptedByPartner) {
      return res.status(400).json({
        success: false,
        message: 'Conversation already accepted'
      });
    }

    const partner = await Partner.findById(req.userId);
    if (partner.activeConversationsCount >= partner.maxConversations) {
      return res.status(400).json({
        success: false,
        message: 'Maximum concurrent conversations reached. Please end some conversations first.'
      });
    }

    const acceptedAt = new Date();
    conversation.status = 'accepted';
    conversation.isAcceptedByPartner = true;
    conversation.acceptedAt = acceptedAt;
    conversation.startedAt = acceptedAt;
    conversation.sessionDetails = {
      ...(conversation.sessionDetails || {}),
      startTime: acceptedAt,
      duration: 0,
      messagesCount: 0
    };
    await conversation.save();

    partner.activeConversationsCount += 1;
    await partner.updateBusyStatus();

    await conversation.populate('partnerId', 'name email profilePicture specialization rating onlineStatus');
    await conversation.populate('userId', 'email profile profileImage');

    res.json({
      success: true,
      message: 'Conversation accepted successfully',
      data: conversation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to accept conversation',
      error: error.message
    });
  }
});

// @route   POST /api/chat/partner/requests/:conversationId/reject
// @desc    Reject a conversation request
// @access  Private (Partner only)
router.post('/partner/requests/:conversationId/reject', authenticate, async (req, res) => {
  try {
    if (req.userType !== 'partner') {
      return res.status(403).json({
        success: false,
        message: 'Only partners can reject conversation requests'
      });
    }

    const { conversationId } = req.params;
    const conversation = await Conversation.findOne({ conversationId });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    if (conversation.partnerId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    conversation.status = 'rejected';
    conversation.rejectedAt = new Date();
    await conversation.save();

    res.json({
      success: true,
      message: 'Conversation rejected',
      data: conversation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to reject conversation',
      error: error.message
    });
  }
});

// ==================== CONVERSATIONS LIST ====================
// @route   GET /api/chat/conversations
// @desc    Get all conversations (accepted/active) for logged-in user/partner
// @access  Private
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const isPartner = req.userType === 'partner';
    const query = isPartner
      ? { partnerId: req.userId, status: { $in: ['accepted', 'active', 'ended'] } }
      : { userId: req.userId, status: { $in: ['accepted', 'active', 'pending', 'ended'] } };

    const conversations = await Conversation.find(query)
      .sort({ lastMessageAt: -1 })
      .populate('partnerId', 'name email profilePicture specialization rating onlineStatus bio experience expertise languages qualifications location totalSessions completedSessions pricePerSession')
      .populate('userId', 'email profile profileImage')
      .lean();

    const conversationsData = conversations.map(conv => ({
      ...conv,
      otherUser: isPartner ? conv.userId : conv.partnerId,
      unreadCount: isPartner ? conv.unreadCount.partner : conv.unreadCount.user
    }));

    // Replace S3 keys with presigned URLs for otherUser profile images (bucket is private)
    const conversationsWithPresignedUrls = await Promise.all(
      conversationsData.map(async (conv) => {
        const other = conv.otherUser;
        if (!other) return conv;
        const updated = { ...conv, otherUser: other ? { ...other } : other };
        const otherUser = updated.otherUser;
        if (!otherUser) return updated;

        if (otherUser.profilePicture && !otherUser.profilePicture.startsWith('http')) {
          try {
            const url = await getobject(otherUser.profilePicture);
            otherUser.profilePictureUrl = url;
            otherUser.profilePicture = url;
          } catch (err) {
            console.error('Error presigned URL for partner profilePicture:', err);
          }
        }

        if (otherUser.profileImage && !otherUser.profileImage.startsWith('http')) {
          try {
            const url = await getobject(otherUser.profileImage);
            otherUser.profileImageUrl = url;
            otherUser.profileImage = url;
          } catch (err) {
            console.error('Error presigned URL for user profileImage:', err);
          }
        }
        return updated;
      })
    );

    const slimData = conversationsWithPresignedUrls.map((conv) => ({
      _id: conv._id,
      conversationId: conv.conversationId,
      status: conv.status,
      isAcceptedByPartner: conv.isAcceptedByPartner,
      acceptedAt: conv.acceptedAt,
      lastMessage: conv.lastMessage,
      lastMessageAt: conv.lastMessageAt,
      unreadCount: conv.unreadCount,
      otherUser: conv.otherUser,
      startedAt: conv.startedAt,
      endedAt: conv.endedAt,
      createdAt: conv.createdAt
    }));

    res.json({
      success: true,
      data: slimData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversations',
      error: error.message
    });
  }
});

// ==================== MESSAGES ====================

// @route   GET /api/chat/conversations/:conversationId/messages
// @desc    Get messages for a specific conversation
// @access  Private
router.get('/conversations/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const conversation = await Conversation.findOne({ conversationId });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    const isPartner = req.userType === 'partner';
    const hasAccess = isPartner
      ? conversation.partnerId.toString() === req.userId
      : conversation.userId.toString() === req.userId;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (conversation.status === 'pending' && !conversation.isAcceptedByPartner) {
      return res.status(403).json({
        success: false,
        message: 'Conversation is pending partner acceptance'
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await Message.find({ conversationId, isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('senderId', 'name email profilePicture profile')
      .lean();

    res.json({
      success: true,
      data: messages.reverse(),
      meta: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
});

export default router;