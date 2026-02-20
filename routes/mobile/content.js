import express from 'express';
import Testimonial from '../../models/Testimonial.js';
import FounderMessage from '../../models/FounderMessage.js';
import BrandAsset from '../../models/BrandAsset.js';

import { authenticateToken } from '../../middleware/auth.js';
import mongoose from 'mongoose';
import { getobject, extractS3KeyFromUrl } from '../../utils/s3.js';

const router = express.Router();

/**
 * MOBILE ENDPOINTS FOR APP DEVELOPERS
 * These endpoints allow app developers to access content by clientId
 * No authentication required - clientId is passed as query parameter
 */



// ============================================
// TESTIMONIALS - Mobile Endpoints
// ============================================

/**
 * GET /api/mobile/testimonials?clientId=<clientId>
 * Get all testimonials for a specific client (for mobile app)
 */
router.get('/testimonials', async (req, res) => {
  try {
    const { clientId } = req.query;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: 'clientId query parameter is required'
      });
    }

    // Validate clientId format
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid clientId format'
      });
    }

    const testimonials = await Testimonial.find({
      clientId: clientId,
      isActive: true
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: testimonials,
      count: testimonials.length,
      clientId: clientId
    });
  } catch (error) {
    console.error('Error fetching testimonials:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch testimonials',
      error: error.message
    });
  }
});

/**
 * GET /api/mobile/testimonials/:id?clientId=<clientId>
 * Get single testimonial by ID for a specific client
 */
router.get('/testimonials/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { clientId } = req.query;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: 'clientId query parameter is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid clientId format'
      });
    }

    const testimonial = await Testimonial.findOne({
      _id: id,
      clientId: clientId,
      isActive: true
    });

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        message: 'Testimonial not found'
      });
    }

    res.json({
      success: true,
      data: testimonial
    });
  } catch (error) {
    console.error('Error fetching testimonial:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch testimonial',
      error: error.message
    });
  }
});

// ============================================
// FOUNDER MESSAGES - Mobile Endpoints
// ============================================

/**
 * GET /api/mobile/founder-messages?clientId=<clientId>
 * Get all founder messages for a specific client (for mobile app)
 */
router.get('/founder-messages', async (req, res) => {
  try {
    const { clientId } = req.query;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: 'clientId query parameter is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid clientId format'
      });
    }

    const messages = await FounderMessage.find({
      clientId: clientId,
      status: 'published' // Only return published messages
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: messages,
      count: messages.length,
      clientId: clientId
    });
  } catch (error) {
    console.error('Error fetching founder messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch founder messages',
      error: error.message
    });
  }
});

/**
 * GET /api/mobile/founder-messages/:id?clientId=<clientId>
 * Get single founder message by ID for a specific client
 */
router.get('/founder-messages/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { clientId } = req.query;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: 'clientId query parameter is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid clientId format'
      });
    }

    const message = await FounderMessage.findOne({
      _id: id,
      clientId: clientId,
      status: 'published'
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Founder message not found'
      });
    }

    res.json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Error fetching founder message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch founder message',
      error: error.message
    });
  }
});

// ============================================
// BRAND ASSETS - Mobile Endpoints
// ============================================

/**
 * GET /api/mobile/brand-assets?clientId=<clientId>
 * Get all brand assets for a specific client (for mobile app)
 */
router.get('/brand-assets', async (req, res) => {
  try {
    const { clientId } = req.query;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: 'clientId query parameter is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid clientId format'
      });
    }

    const brandAssets = await BrandAsset.find({
      clientId: clientId,
      isActive: true
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: brandAssets,
      count: brandAssets.length,
      clientId: clientId
    });
  } catch (error) {
    console.error('Error fetching brand assets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brand assets',
      error: error.message
    });
  }
});

/**
 * GET /api/mobile/brand-assets/:id?clientId=<clientId>
 * Get single brand asset by ID for a specific client
 */
router.get('/brand-assets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { clientId } = req.query;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: 'clientId query parameter is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid clientId format'
      });
    }

    const brandAsset = await BrandAsset.findOne({
      _id: id,
      clientId: clientId,
      isActive: true
    });

    if (!brandAsset) {
      return res.status(404).json({
        success: false,
        message: 'Brand asset not found'
      });
    }

    res.json({
      success: true,
      data: brandAsset
    });
  } catch (error) {
    console.error('Error fetching brand asset:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brand asset',
      error: error.message
    });
  }
});



export default router;
