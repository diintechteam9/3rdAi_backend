import express from 'express';
import Testimonial from '../../models/Testimonial.js';
import { authenticate } from '../../middleware/auth.js';

const router = express.Router();

// Helper function to extract clientId from request (supports both client and user tokens)
const getClientId = (req) => {
  // If user role, get clientId from decoded token first (most reliable), then populated user object
  if (req.user.role === 'user') {
    // Priority: decodedClientId (from token) > populated clientId._id > clientId ObjectId
    const clientId = req.decodedClientId || req.user.clientId?._id || req.user.clientId || req.user.tokenClientId;
    if (!clientId) {
      throw new Error('Client ID not found for user token. Please ensure your token includes clientId.');
    }
    return clientId;
  }
  // For client role, use user._id (which is the client's MongoDB _id)
  return req.user._id || req.user.id;
};

// GET /api/testimonials/stats/summary - Get testimonials statistics
router.get('/summary', authenticate, async (req, res) => {
  try {
    let clientId;
    try {
      clientId = getClientId(req);
    } catch (clientIdError) {
      return res.status(401).json({
        success: false,
        message: clientIdError.message || 'Unable to determine client ID. Please ensure your token is valid.'
      });
    }
    const stats = await Testimonial.aggregate([
      {
        $match: {
          clientId: clientId,
          isActive: true
        }
      },
      {
        $group: {
          _id: null,
          totalTestimonials: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          ratingDistribution: {
            $push: '$rating'
          }
        }
      }
    ]);

    const ratingCounts = {};
    for (let i = 1; i <= 5; i++) {
      ratingCounts[i] = 0;
    }

    if (stats.length > 0) {
      stats[0].ratingDistribution.forEach(rating => {
        ratingCounts[rating]++;
      });
    }

    res.json({
      success: true,
      data: {
        totalTestimonials: stats.length > 0 ? stats[0].totalTestimonials : 0,
        averageRating: stats.length > 0 ? Math.round(stats[0].averageRating * 10) / 10 : 0,
        ratingDistribution: ratingCounts
      }
    });
  } catch (error) {
    console.error('Error fetching testimonial stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch testimonial statistics',
      error: error.message
    });
  }
});

export default router;