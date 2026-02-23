import express from 'express';
import mongoose from 'mongoose';
import Partner from '../../models/Partner.js';
import Client from '../../models/Client.js';
import multer from 'multer';
import { uploadToS3, deleteFromS3, getobject, extractS3KeyFromUrl } from '../../utils/s3.js';
import { authenticate } from '../../middleware/auth.js';

const router = express.Router();

// Helper function to extract clientId from request (supports both client and user tokens)
const getClientId = (req) => {
  return req.clientId;
};

const withClientIdString = (doc) => {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject() : doc;
  if (obj.clientId && typeof obj.clientId === 'object') {
    if (obj.clientId.clientId) {
      return { ...obj, clientId: obj.clientId.clientId };
    }
  }
  return obj;
};

// Backward-compatible shape for existing "experts" frontend.
const toExpertShape = (doc) => {
  const obj = withClientIdString(doc);
  const expertiseStr = Array.isArray(obj.expertise) ? obj.expertise.join(', ') : (obj.expertise || '');
  const experienceStr = typeof obj.experience === 'number' ? `${obj.experience} years` : (obj.experience || '');
  const statusStr = obj.onlineStatus || obj.status || 'offline';
  return {
    ...obj,
    profileSummary: obj.profileSummary ?? obj.bio ?? '',
    profilePhoto: obj.profilePhoto ?? obj.profilePicture ?? null,
    profilePhotoKey: obj.profilePhotoKey ?? obj.profilePictureKey ?? null,
    status: statusStr,
    expertise: expertiseStr,
    experience: experienceStr,
    reviews: obj.reviews ?? obj.totalRatings ?? 0
  };
};

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// GET all experts
router.get('/', authenticate, async (req, res) => {
  try {
    const query = { ...req.tenantFilter, isDeleted: false };
    if (req.query.includeInactive !== 'true') {
      query.isActive = true;
    }

    // Add category filter if provided (support both 'category' and 'categoryId' parameters)
    const categoryParam = req.query.categoryId || req.query.category;
    if (categoryParam) {
      // Handle special cases
      if (categoryParam === 'null' || categoryParam === 'undefined') {
        query.categoryId = null;
      } else if (mongoose.Types.ObjectId.isValid(categoryParam)) {
        query.categoryId = categoryParam;
      } else {
        console.warn('Invalid category parameter format:', categoryParam);
        return res.status(400).json({
          success: false,
          message: 'Invalid category parameter format. Must be a valid ObjectId.'
        });
      }
    }

    // Debug logging
    console.log('Query parameters:', req.query);
    console.log('Category parameter used:', categoryParam);
    console.log('Final MongoDB query:', query);

    const experts = await Partner.find(query)
      .populate('clientId', 'clientId')
      .sort({ createdAt: -1 });

    console.log(`Found ${experts.length} experts matching query`);

    const expertsWithUrls = await Promise.all(
      experts.map(async (expert) => {
        const expertObj = withClientIdString(expert);
        // partner profile picture
        if (expertObj.profilePictureKey || expertObj.profilePicture) {
          try {
            const imageKey = expertObj.profilePictureKey || extractS3KeyFromUrl(expertObj.profilePicture);
            if (imageKey) {
              expertObj.profilePicture = await getobject(imageKey, 604800);
            }
          } catch (error) {
            console.error('Error generating profile photo presigned URL:', error);
          }
        }
        if (expertObj.backgroundBannerKey || expertObj.backgroundBanner) {
          try {
            const imageKey = expertObj.backgroundBannerKey || extractS3KeyFromUrl(expertObj.backgroundBanner);
            if (imageKey) {
              expertObj.backgroundBanner = await getobject(imageKey, 604800);
            }
          } catch (error) {
            console.error('Error generating banner presigned URL:', error);
          }
        }
        return toExpertShape(expertObj);
      })
    );

    res.json({ success: true, data: expertsWithUrls, count: expertsWithUrls.length });
  } catch (error) {
    console.error('Get experts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET single expert
router.get('/:id', authenticate, async (req, res) => {
  try {
    const query = { _id: req.params.id, ...req.tenantFilter, isDeleted: false };
    if (req.query.includeInactive !== 'true' && req.user.role !== 'super_admin') {
      query.isActive = true;
    }
    const expert = await Partner.findOne(query).populate('clientId', 'clientId');

    if (!expert) {
      return res.status(404).json({ success: false, message: 'Expert not found' });
    }

    const expertObj = expert.toObject();
    if (expertObj.profilePictureKey || expertObj.profilePicture) {
      try {
        const imageKey = expertObj.profilePictureKey || extractS3KeyFromUrl(expertObj.profilePicture);
        if (imageKey) {
          expertObj.profilePicture = await getobject(imageKey, 604800);
        }
      } catch (error) {
        console.error('Error generating profile photo presigned URL:', error);
      }
    }
    if (expertObj.backgroundBannerKey || expertObj.backgroundBanner) {
      try {
        const imageKey = expertObj.backgroundBannerKey || extractS3KeyFromUrl(expertObj.backgroundBanner);
        if (imageKey) {
          expertObj.backgroundBanner = await getobject(imageKey, 604800);
        }
      } catch (error) {
        console.error('Error generating banner presigned URL:', error);
      }
    }

    res.json({ success: true, data: toExpertShape(expertObj) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// CREATE new expert
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, email, password, phone, experience, expertise, profileSummary, languages, customLanguage, chatCharge, voiceCharge, videoCharge, status, categoryId } = req.body;
    const clientId = req.clientId;

    if (req.user.role !== 'client' && req.user.role !== 'super_admin' && !clientId) {
      return res.status(403).json({ success: false, message: 'Client context required.' });
    }

    if (!['client', 'user'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Client or user role required.'
      });
    }

    if (!name || !email || !password || !experience || !expertise || !profileSummary) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, email, password, experience, expertise, profileSummary are required'
      });
    }

    const expNum = Number(String(experience).match(/\d+/)?.[0] || 0);
    const expertiseArr = String(expertise)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const langs = Array.isArray(languages) ? languages.slice() : (languages ? [languages] : ['Hindi']);
    if (customLanguage && String(customLanguage).trim()) langs.push(String(customLanguage).trim());

    const onlineStatus =
      status === 'online' ? 'online' :
        status === 'busy' || status === 'queue' ? 'busy' :
          'offline';

    const newPartner = new Partner({
      name,
      email,
      password,
      phone: phone || null,
      clientId: clientId,
      categoryId: categoryId || null,
      bio: profileSummary,
      experience: Number.isFinite(expNum) ? expNum : 0,
      expertise: expertiseArr,
      specialization: expertiseArr,
      languages: langs,
      chatCharge: Number(chatCharge) || 0,
      voiceCharge: Number(voiceCharge) || 0,
      videoCharge: Number(videoCharge) || 0,
      onlineStatus,
      isActive: true,
      // Client-created experts are treated as verified partners
      isVerified: true,
      verificationStatus: 'approved',
      verifiedAt: new Date()
    });

    const saved = await newPartner.save();
    await saved.populate('clientId', 'clientId');
    res.status(201).json({ success: true, data: toExpertShape(saved) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Upload profile photo
router.post('/:id/upload-profile-photo', authenticate, upload.single('profilePhoto'), async (req, res) => {
  try {
    const clientId = req.clientId;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const expert = await Partner.findOne({
      _id: req.params.id,
      ...req.tenantFilter,
      isDeleted: false
    }).populate('clientId', 'clientId');

    if (!expert) {
      return res.status(404).json({
        success: false,
        message: 'Expert not found'
      });
    }

    const uploadResult = await uploadToS3(req.file, 'experts/profile-photos');
    const imageUrl = uploadResult.url;
    const imageKey = uploadResult.key;

    expert.profilePicture = imageUrl;
    expert.profilePictureKey = imageKey;
    await expert.save();

    res.json({
      success: true,
      message: 'Profile photo uploaded successfully',
      data: {
        imageUrl: imageUrl,
        clientId: expert.clientId?.clientId || expert.clientId
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to upload profile photo',
      error: error.message
    });
  }
});

// Upload background banner
router.post('/:id/upload-banner', authenticate, upload.single('backgroundBanner'), async (req, res) => {
  try {
    const clientId = req.clientId;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const expert = await Partner.findOne({
      _id: req.params.id,
      ...req.tenantFilter,
      isDeleted: false
    }).populate('clientId', 'clientId');

    if (!expert) {
      return res.status(404).json({
        success: false,
        message: 'Expert not found'
      });
    }

    const uploadResult = await uploadToS3(req.file, 'experts/banners');
    const imageUrl = uploadResult.url;
    const imageKey = uploadResult.key;

    expert.backgroundBanner = imageUrl;
    expert.backgroundBannerKey = imageKey;
    await expert.save();

    res.json({
      success: true,
      message: 'Background banner uploaded successfully',
      data: {
        imageUrl: imageUrl,
        clientId: expert.clientId?.clientId || expert.clientId
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to upload background banner',
      error: error.message
    });
  }
});

// UPDATE expert
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, email, password, phone, experience, expertise, profileSummary, languages, customLanguage, chatCharge, voiceCharge, videoCharge, status, isActive, categoryId } = req.body;
    const clientId = req.clientId;

    if (!['client', 'user'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Client or user role required.'
      });
    }

    const expert = await Partner.findOne({
      _id: req.params.id,
      ...req.tenantFilter,
      isDeleted: false
    });

    if (!expert) {
      return res.status(404).json({ success: false, message: 'Expert not found' });
    }

    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (password !== undefined && password) updateData.password = password;
    if (phone !== undefined) updateData.phone = phone;
    if (experience !== undefined) {
      const expNum = Number(String(experience).match(/\d+/)?.[0] || 0);
      updateData.experience = Number.isFinite(expNum) ? expNum : 0;
    }
    if (expertise !== undefined) {
      const expertiseArr = String(expertise)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      updateData.expertise = expertiseArr;
      updateData.specialization = expertiseArr;
    }
    if (profileSummary !== undefined) updateData.bio = profileSummary;
    if (languages !== undefined) updateData.languages = Array.isArray(languages) ? languages : [languages].filter(Boolean);
    if (customLanguage !== undefined) {
      const cl = String(customLanguage || '').trim();
      if (cl) {
        const cur = Array.isArray(updateData.languages) ? updateData.languages : (expert.languages || []);
        if (!cur.includes(cl)) updateData.languages = [...cur, cl];
      }
    }
    if (chatCharge !== undefined) updateData.chatCharge = Number(chatCharge);
    if (voiceCharge !== undefined) updateData.voiceCharge = Number(voiceCharge);
    if (videoCharge !== undefined) updateData.videoCharge = Number(videoCharge);
    if (status !== undefined && status !== null && status !== '') {
      updateData.onlineStatus =
        status === 'online' ? 'online' :
          status === 'busy' || status === 'queue' ? 'busy' :
            'offline';
    }
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    if (categoryId !== undefined) updateData.categoryId = categoryId || null;

    const updatedExpert = await Partner.findOneAndUpdate(
      {
        _id: req.params.id,
        ...req.tenantFilter,
        isDeleted: false
      },
      updateData,
      { new: true, runValidators: false }
    ).populate('clientId', 'clientId');

    if (!updatedExpert) {
      return res.status(404).json({ success: false, message: 'Expert not found' });
    }

    res.json({ success: true, data: toExpertShape(updatedExpert) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE expert (soft delete)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const clientId = req.clientId;

    if (!['client', 'user'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Client or user role required.'
      });
    }

    const expert = await Partner.findOne({
      _id: req.params.id,
      ...req.tenantFilter,
      isDeleted: false
    });

    if (!expert) {
      return res.status(404).json({ success: false, message: 'Expert not found' });
    }

    expert.isDeleted = true;
    await expert.save();

    res.json({ success: true, message: 'Expert deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// TOGGLE enable/disable (isActive)
router.patch('/:id/toggle', authenticate, async (req, res) => {
  try {
    const clientId = req.clientId;

    if (!['client', 'user'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Client or user role required.'
      });
    }

    const expert = await Partner.findOne({
      _id: req.params.id,
      ...req.tenantFilter,
      isDeleted: false
    }).populate('clientId', 'clientId');

    if (!expert) {
      return res.status(404).json({ success: false, message: 'Expert not found' });
    }

    expert.isActive = !expert.isActive;
    const updatedExpert = await expert.save();

    res.json({
      success: true,
      data: toExpertShape(updatedExpert),
      message: `Expert ${updatedExpert.isActive ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;