/**
 * Announcement Routes
 *
 * Client: Full CRUD for their own announcements
 * Partner: Read-only (their clientId's announcements)
 */

import express from 'express';
import Announcement from '../models/Announcement.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
//  CLIENT ROUTES — Full CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/announcements
 * List all announcements for the logged-in client
 * Access: client
 */
router.get('/', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'client') {
            return res.status(403).json({ success: false, message: 'Only clients can manage announcements' });
        }

        const { page = 1, limit = 20, isActive } = req.query;
        const pageNum = Math.max(parseInt(page) || 1, 1);
        const pageSize = Math.min(parseInt(limit) || 20, 100);
        const skip = (pageNum - 1) * pageSize;

        const filter = { clientId: req.user._id };
        if (isActive !== undefined) filter.isActive = isActive === 'true';

        const [announcements, total] = await Promise.all([
            Announcement.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageSize)
                .lean(),
            Announcement.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: {
                announcements,
                total,
                page: pageNum,
                limit: pageSize,
                hasMore: total > skip + announcements.length
            }
        });
    } catch (error) {
        console.error('[Announcements] GET / error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch announcements', error: error.message });
    }
});

/**
 * POST /api/announcements
 * Create a new announcement
 * Access: client
 */
router.post('/', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'client') {
            return res.status(403).json({ success: false, message: 'Only clients can create announcements' });
        }

        const { title, content } = req.body;
        if (!title || !content) {
            return res.status(400).json({ success: false, message: 'Title and content are required' });
        }

        const announcement = await Announcement.create({
            title: title.trim(),
            content: content.trim(),
            clientId: req.user._id,
            createdBy: req.user._id
        });

        res.status(201).json({
            success: true,
            message: 'Announcement created successfully',
            data: { announcement }
        });
    } catch (error) {
        console.error('[Announcements] POST / error:', error);
        res.status(500).json({ success: false, message: 'Failed to create announcement', error: error.message });
    }
});

/**
 * PATCH /api/announcements/:announcementId
 * Update an announcement
 * Access: client (own only)
 */
router.patch('/:announcementId', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'client') {
            return res.status(403).json({ success: false, message: 'Only clients can update announcements' });
        }

        const { title, content, isActive } = req.body;

        const announcement = await Announcement.findOne({
            _id: req.params.announcementId,
            clientId: req.user._id
        });

        if (!announcement) {
            return res.status(404).json({ success: false, message: 'Announcement not found or unauthorized' });
        }

        if (title !== undefined) announcement.title = title.trim();
        if (content !== undefined) announcement.content = content.trim();
        if (isActive !== undefined) announcement.isActive = Boolean(isActive);

        await announcement.save();

        res.json({ success: true, message: 'Announcement updated', data: { announcement } });
    } catch (error) {
        console.error('[Announcements] PATCH / error:', error);
        res.status(500).json({ success: false, message: 'Failed to update announcement', error: error.message });
    }
});

/**
 * DELETE /api/announcements/:announcementId
 * Delete an announcement
 * Access: client (own only)
 */
router.delete('/:announcementId', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'client') {
            return res.status(403).json({ success: false, message: 'Only clients can delete announcements' });
        }

        const deleted = await Announcement.findOneAndDelete({
            _id: req.params.announcementId,
            clientId: req.user._id
        });

        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Announcement not found or unauthorized' });
        }

        res.json({ success: true, message: 'Announcement deleted successfully' });
    } catch (error) {
        console.error('[Announcements] DELETE / error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete announcement', error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PARTNER ROUTES — Read-only
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/announcements/partner
 * Get active announcements for partner's client (latest 5 default)
 * Access: partner
 */
router.get('/partner', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'partner') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const { limit = 5 } = req.query;
        const pageSize = Math.min(parseInt(limit) || 5, 50);

        const [announcements, total, newCount] = await Promise.all([
            Announcement.find({ clientId: req.user.clientId, isActive: true })
                .sort({ createdAt: -1 })
                .limit(pageSize)
                .lean(),
            Announcement.countDocuments({ clientId: req.user.clientId, isActive: true }),
            // "New" = created in last 48 hours
            Announcement.countDocuments({
                clientId: req.user.clientId,
                isActive: true,
                createdAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) }
            })
        ]);

        res.json({
            success: true,
            data: {
                announcements,
                total,
                newCount
            }
        });
    } catch (error) {
        console.error('[Announcements] GET /partner error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch announcements', error: error.message });
    }
});

export default router;
