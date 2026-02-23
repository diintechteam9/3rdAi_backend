import express from 'express';
import mongoose from 'mongoose';
import BrandAsset from '../../models/BrandAsset.js';
import Client from '../../models/Client.js';
import multer from 'multer';
import { uploadToS3, deleteFromS3, getobject, extractS3KeyFromUrl } from '../../utils/s3.js';
import { authenticate } from '../../middleware/auth.js';

const router = express.Router();

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

// Helper function to extract clientId from request (supports both client and user tokens)
const getClientId = (req) => {
  return req.clientId;
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

router.get('/', authenticate, async (req, res) => {
  try {
    // Build query - exclude deleted items, optionally include inactive items
    const query = { ...req.tenantFilter, isDeleted: false };
    if (req.query.includeInactive !== 'true') {
      query.isActive = true;
    }

    const brandAssets = await BrandAsset.find(query)
      .populate('clientId', 'clientId')
      .sort({ createdAt: -1 });

    // Generate presigned URLs for images
    const assetsWithUrls = await Promise.all(
      brandAssets.map(async (asset) => {
        const assetObj = withClientIdString(asset);
        if (assetObj.brandLogoImageKey || assetObj.brandLogoImage) {
          try {
            const imageKey = assetObj.brandLogoImageKey || extractS3KeyFromUrl(assetObj.brandLogoImage);
            if (imageKey) {
              assetObj.brandLogoImage = await getobject(imageKey, 604800);
            }
          } catch (error) {
            console.error('Error generating image presigned URL:', error);
          }
        }
        if (assetObj.backgroundLogoImageKey || assetObj.backgroundLogoImage) {
          try {
            const imageKey = assetObj.backgroundLogoImageKey || extractS3KeyFromUrl(assetObj.backgroundLogoImage);
            if (imageKey) {
              assetObj.backgroundLogoImage = await getobject(imageKey, 604800);
            }
          } catch (error) {
            console.error('Error generating background image presigned URL:', error);
          }
        }
        return assetObj;
      })
    );

    res.json({
      success: true,
      data: assetsWithUrls,
      count: assetsWithUrls.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brand assets',
      error: error.message
    });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { headingText, brandLogoName, webLinkUrl, socialLink } = req.body;
    const clientId = req.clientId;

    // Ensure permission
    if (!['client', 'user', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (!clientId && req.user.role !== 'super_admin') {
      return res.status(400).json({ success: false, message: 'Client context required.' });
    }

    if (!headingText || !brandLogoName || !webLinkUrl || !socialLink) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    const newBrandAsset = new BrandAsset({
      headingText: headingText.trim(),
      brandLogoName: brandLogoName.trim(),
      webLinkUrl: webLinkUrl.trim(),
      socialLink: socialLink.trim(),
      clientId
    });

    const savedBrandAsset = await newBrandAsset.save();
    await savedBrandAsset.populate('clientId', 'clientId');

    res.status(201).json({
      success: true,
      message: 'Brand asset created successfully',
      data: withClientIdString(savedBrandAsset)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to create brand asset',
      error: error.message
    });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { headingText, brandLogoName, webLinkUrl, socialLink } = req.body;
    const query = { _id: req.params.id, ...req.tenantFilter, isDeleted: false };
    if (req.query.includeInactive !== 'true' && req.user.role !== 'super_admin') {
      query.isActive = true;
    }

    const brandAsset = await BrandAsset.findOneAndUpdate(
      query,
      { headingText, brandLogoName, webLinkUrl, socialLink },
      { new: true, runValidators: true }
    ).populate('clientId', 'clientId');

    if (!brandAsset) {
      return res.status(404).json({
        success: false,
        message: 'Brand asset not found'
      });
    }

    res.json({
      success: true,
      message: 'Brand asset updated successfully',
      data: withClientIdString(brandAsset)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to update brand asset',
      error: error.message
    });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const query = { _id: req.params.id, ...req.tenantFilter, isDeleted: false };
    const brandAsset = await BrandAsset.findOne(query).populate('clientId', 'clientId');

    if (!brandAsset) {
      return res.status(404).json({
        success: false,
        message: 'Brand asset not found'
      });
    }

    brandAsset.isDeleted = true;
    await brandAsset.save();

    res.json({
      success: true,
      message: 'Brand asset deleted successfully',
      data: withClientIdString(brandAsset)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete brand asset',
      error: error.message
    });
  }
});

// PATCH /api/brand-assets/:id/toggle - Toggle brand asset status (enable/disable)
router.patch('/:id/toggle', authenticate, async (req, res) => {
  try {
    const brandAsset = await BrandAsset.findOne({
      _id: req.params.id,
      ...req.tenantFilter,
      isDeleted: false
    }).populate('clientId', 'clientId');

    if (!brandAsset) {
      return res.status(404).json({
        success: false,
        message: 'Brand asset not found'
      });
    }

    brandAsset.isActive = !brandAsset.isActive;
    await brandAsset.save();

    res.json({
      success: true,
      data: withClientIdString(brandAsset),
      message: `Brand asset ${brandAsset.isActive ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    console.error('Toggle brand asset error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle brand asset status',
      error: error.message
    });
  }
});

// Upload image for brand asset
router.post('/:id/upload-image', authenticate, upload.single('brandLogoImage'), async (req, res) => {
  try {
    const brandAsset = await BrandAsset.findOne({
      _id: req.params.id,
      ...req.tenantFilter,
      isDeleted: false
    }).populate('clientId', 'clientId');

    if (!brandAsset) {
      return res.status(404).json({
        success: false,
        message: 'Brand asset not found'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // Delete old image if exists (prefer key over URL)
    if (brandAsset.brandLogoImageKey || brandAsset.brandLogoImage) {
      try {
        await deleteFromS3(brandAsset.brandLogoImageKey || brandAsset.brandLogoImage);
      } catch (error) {
        console.warn('Failed to delete old image:', error.message);
      }
    }

    // Upload new image to S3
    const uploadResult = await uploadToS3(req.file, 'brand-assets');
    const imageUrl = uploadResult.url;
    const imageKey = uploadResult.key;

    // Update brand asset with new image URL and key
    brandAsset.brandLogoImage = imageUrl;
    brandAsset.brandLogoImageKey = imageKey;
    const updatedBrandAsset = await brandAsset.save();

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        brandAsset: withClientIdString(updatedBrandAsset),
        imageUrl: imageUrl,
        clientId: brandAsset.clientId?.clientId || brandAsset.clientId
      }
    });
  } catch (error) {
    console.error('Error uploading brand asset image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
});

// Upload background image for brand asset
router.post('/:id/upload-background-image', authenticate, upload.single('backgroundLogoImage'), async (req, res) => {
  try {
    const brandAsset = await BrandAsset.findOne({
      _id: req.params.id,
      ...req.tenantFilter,
      isDeleted: false
    }).populate('clientId', 'clientId');

    if (!brandAsset) {
      return res.status(404).json({
        success: false,
        message: 'Brand asset not found'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // Delete old background image if exists
    if (brandAsset.backgroundLogoImageKey || brandAsset.backgroundLogoImage) {
      try {
        await deleteFromS3(brandAsset.backgroundLogoImageKey || brandAsset.backgroundLogoImage);
      } catch (error) {
        console.warn('Failed to delete old background image:', error.message);
      }
    }

    // Upload new background image to S3
    const uploadResult = await uploadToS3(req.file, 'brand-assets');
    const imageUrl = uploadResult.url;
    const imageKey = uploadResult.key;

    // Update brand asset with new background image URL and key
    brandAsset.backgroundLogoImage = imageUrl;
    brandAsset.backgroundLogoImageKey = imageKey;
    const updatedBrandAsset = await brandAsset.save();

    res.json({
      success: true,
      message: 'Background image uploaded successfully',
      data: {
        brandAsset: withClientIdString(updatedBrandAsset),
        imageUrl: imageUrl,
        clientId: brandAsset.clientId?.clientId || brandAsset.clientId
      }
    });
  } catch (error) {
    console.error('Error uploading background image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload background image',
      error: error.message
    });
  }
});

export default router;