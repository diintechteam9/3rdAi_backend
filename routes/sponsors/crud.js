import express from 'express';
import mongoose from 'mongoose';
import Sponsor from '../../models/Sponsor.js';
import Client from '../../models/Client.js';
import { authenticate } from '../../middleware/auth.js';
import { getobject, extractS3KeyFromUrl } from '../../utils/s3.js';

const router = express.Router();

// Helper function to extract clientId from request (supports both client and user tokens)
const getClientId = (req) => {
  return req.clientId;
};

// GET /api/sponsors - Get all sponsors for authenticated client
router.get('/', authenticate, async (req, res) => {
  try {
    // Build query - exclude deleted items, optionally include inactive items
    const query = { ...req.tenantFilter, isDeleted: false };
    if (req.query.includeInactive !== 'true') {
      query.isActive = true;
    }

    const sponsors = await Sponsor.find(query)
      .populate('clientId', 'clientId')
      .sort({ createdAt: -1 });

    // Generate presigned URLs for logos
    const sponsorsWithUrls = await Promise.all(
      sponsors.map(async (sponsor) => {
        const sponsorObj = withClientIdString(sponsor);

        // Generate presigned URL for logo if exists
        if (sponsorObj.logoKey || sponsorObj.logo) {
          try {
            // Use stored key if available, otherwise extract from URL
            const logoKey = sponsorObj.logoKey || extractS3KeyFromUrl(sponsorObj.logo);
            if (logoKey) {
              sponsorObj.logo = await getobject(logoKey);
            }
          } catch (error) {
            console.error('Error generating logo presigned URL:', error);
          }
        }

        return sponsorObj;
      })
    );

    res.json({
      success: true,
      data: {
        data: sponsorsWithUrls,
        count: sponsorsWithUrls.length
      }
    });
  } catch (error) {
    console.error('Error fetching sponsors:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sponsors',
      error: error.message
    });
  }
});

// GET /api/sponsors/:id - Get single sponsor
router.get('/:id', authenticate, async (req, res) => {
  try {
    const query = { _id: req.params.id, ...req.tenantFilter, isDeleted: false };
    if (req.query.includeInactive !== 'true' && req.user.role !== 'super_admin') {
      query.isActive = true;
    }
    const sponsor = await Sponsor.findOne(query).populate('clientId', 'clientId');

    if (!sponsor) {
      return res.status(404).json({
        success: false,
        message: 'Sponsor not found'
      });
    }

    const obj = sponsor.toObject();
    if (obj.clientId && typeof obj.clientId === 'object') {
      obj.clientId = obj.clientId.clientId; // Extract CLI-ABC123
    }

    // Generate presigned URL for logo if exists
    if (obj.logoKey || obj.logo) {
      try {
        // Use stored key if available, otherwise extract from URL
        const logoKey = obj.logoKey || extractS3KeyFromUrl(obj.logo);
        if (logoKey) {
          obj.logo = await getobject(logoKey);
        }
      } catch (error) {
        console.error('Error generating logo presigned URL:', error);
      }
    }

    res.json({
      success: true,
      data: obj
    });
  } catch (error) {
    console.error('Error fetching sponsor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sponsor',
      error: error.message
    });
  }
});

// POST /api/sponsors - Create new sponsor
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description, website, sponsorshipType } = req.body;
    const clientId = req.clientId;

    if (req.user.role !== 'client' && req.user.role !== 'super_admin' && !clientId) {
      return res.status(403).json({ success: false, message: 'Client context required.' });
    }

    // Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Sponsor name is required'
      });
    }

    if (sponsorshipType && !['Platinum', 'Gold', 'Silver', 'Bronze'].includes(sponsorshipType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sponsorship type'
      });
    }

    const sponsor = new Sponsor({
      name: name.trim(),
      description: description ? description.trim() : '',
      website: website ? website.trim() : '',
      sponsorshipType: sponsorshipType || 'Gold',
      clientId: clientId
    });

    await sponsor.save();

    const populated = await sponsor.populate('clientId', 'clientId');
    const obj = populated.toObject();
    if (obj.clientId && typeof obj.clientId === 'object') {
      obj.clientId = obj.clientId.clientId; // Extract CLI-ABC123
    }

    res.status(201).json({
      success: true,
      message: 'Sponsor created successfully',
      data: obj
    });
  } catch (error) {
    console.error('Error creating sponsor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sponsor',
      error: error.message
    });
  }
});

// PUT /api/sponsors/:id - Update sponsor
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, description, website, sponsorshipType } = req.body;
    const { id } = req.params;

    // Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Sponsor name is required'
      });
    }

    if (sponsorshipType && !['Platinum', 'Gold', 'Silver', 'Bronze'].includes(sponsorshipType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sponsorship type'
      });
    }

    const sponsor = await Sponsor.findOneAndUpdate(
      {
        _id: id,
        ...req.tenantFilter,
        isDeleted: false
      },
      {
        name: name.trim(),
        description: description ? description.trim() : '',
        website: website ? website.trim() : '',
        sponsorshipType: sponsorshipType || 'Gold'
      },
      { new: true, runValidators: true }
    ).populate('clientId', 'clientId');

    if (!sponsor) {
      return res.status(404).json({
        success: false,
        message: 'Sponsor not found'
      });
    }

    const obj = sponsor.toObject();
    if (obj.clientId && typeof obj.clientId === 'object') {
      obj.clientId = obj.clientId.clientId; // Extract CLI-ABC123
    }

    res.json({
      success: true,
      message: 'Sponsor updated successfully',
      data: obj
    });
  } catch (error) {
    console.error('Error updating sponsor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update sponsor',
      error: error.message
    });
  }
});

// DELETE /api/sponsors/:id - Delete sponsor (soft delete)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const sponsor = await Sponsor.findOneAndUpdate(
      {
        _id: req.params.id,
        ...req.tenantFilter,
        isDeleted: false
      },
      { isDeleted: true },
      { new: true }
    );

    if (!sponsor) {
      return res.status(404).json({
        success: false,
        message: 'Sponsor not found'
      });
    }

    res.json({
      success: true,
      message: 'Sponsor deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting sponsor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete sponsor',
      error: error.message
    });
  }
});

// PATCH /api/sponsors/:id/toggle - Toggle sponsor status
router.patch('/:id/toggle', authenticate, async (req, res) => {
  try {
    const sponsor = await Sponsor.findOne({
      _id: req.params.id,
      ...req.tenantFilter,
      isDeleted: false
    });

    if (!sponsor) {
      return res.status(404).json({
        success: false,
        message: 'Sponsor not found'
      });
    }

    sponsor.isActive = !sponsor.isActive;
    await sponsor.save();

    const obj = sponsor.toObject();
    if (obj.clientId && typeof obj.clientId === 'object') {
      obj.clientId = obj.clientId.clientId; // Extract CLI-ABC123
    }

    res.json({
      success: true,
      data: obj,
      message: `Sponsor ${sponsor.isActive ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    console.error('Toggle sponsor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle sponsor status',
      error: error.message
    });
  }
});

export default router;