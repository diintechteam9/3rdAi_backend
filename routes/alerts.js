/**
 * Alert Management Routes
 * 
 * Client: Full CRUD for their own alerts
 * Partner: Read-only (their clientId's alerts)
 */

import express from 'express';
import Alert from '../models/Alert.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
//  CLIENT ROUTES — Full CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/alerts
 * List all alerts for the logged-in client's tenant
 * Access: client
 */
router.get('/', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'client') {
            return res.status(403).json({ success: false, message: 'Only clients can manage alerts' });
        }

        const { page = 1, limit = 20, priority, isActive, type } = req.query;
        const pageNum = Math.max(parseInt(page) || 1, 1);
        const pageSize = Math.min(parseInt(limit) || 20, 100);
        const skip = (pageNum - 1) * pageSize;

        const filter = { clientId: req.user._id };
        if (priority) filter.priority = priority;
        if (isActive !== undefined) filter.isActive = isActive === 'true';
        if (type) filter.type = type;

        const [alerts, total] = await Promise.all([
            Alert.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageSize)
                .lean(),
            Alert.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: {
                alerts,
                total,
                page: pageNum,
                limit: pageSize,
                hasMore: total > skip + alerts.length
            }
        });
    } catch (error) {
        console.error('[Alerts] GET /alerts error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch alerts', error: error.message });
    }
});

/**
 * POST /api/alerts
 * Create a new alert
 * Access: client
 */
router.post('/', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'client') {
            return res.status(403).json({ success: false, message: 'Only clients can create alerts' });
        }

        const { title, message, priority, type } = req.body;

        if (!title || !message) {
            return res.status(400).json({ success: false, message: 'Title and message are required' });
        }

        const alert = await Alert.create({
            title: title.trim(),
            message: message.trim(),
            priority: priority || 'medium',
            type: type || 'CLIENT',
            clientId: req.user._id,
            createdBy: req.user._id
        });

        res.status(201).json({
            success: true,
            message: 'Alert created successfully',
            data: { alert }
        });
    } catch (error) {
        console.error('[Alerts] POST /alerts error:', error);
        res.status(500).json({ success: false, message: 'Failed to create alert', error: error.message });
    }
});

/**
 * PATCH /api/alerts/:alertId
 * Update an alert (title, message, priority, isActive)
 * Access: client (own alerts only)
 */
router.patch('/:alertId', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'client') {
            return res.status(403).json({ success: false, message: 'Only clients can update alerts' });
        }

        const { title, message, priority, isActive, type } = req.body;

        const alert = await Alert.findOne({ _id: req.params.alertId, clientId: req.user._id });
        if (!alert) {
            return res.status(404).json({ success: false, message: 'Alert not found or unauthorized' });
        }

        if (title !== undefined) alert.title = title.trim();
        if (message !== undefined) alert.message = message.trim();
        if (priority !== undefined) alert.priority = priority;
        if (isActive !== undefined) alert.isActive = Boolean(isActive);
        if (type !== undefined) alert.type = type;

        await alert.save();

        res.json({ success: true, message: 'Alert updated', data: { alert } });
    } catch (error) {
        console.error('[Alerts] PATCH /alerts/:id error:', error);
        res.status(500).json({ success: false, message: 'Failed to update alert', error: error.message });
    }
});

/**
 * DELETE /api/alerts/:alertId
 * Delete an alert
 * Access: client (own alerts only)
 */
router.delete('/:alertId', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'client') {
            return res.status(403).json({ success: false, message: 'Only clients can delete alerts' });
        }

        const deleted = await Alert.findOneAndDelete({ _id: req.params.alertId, clientId: req.user._id });
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Alert not found or unauthorized' });
        }

        res.json({ success: true, message: 'Alert deleted successfully' });
    } catch (error) {
        console.error('[Alerts] DELETE /alerts/:id error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete alert', error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PARTNER ROUTES — Read-only (their client's active alerts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/alerts/partner
 * Get active alerts for partner's client (latest 5 by default, or paginated)
 * Access: partner
 */
router.get('/partner', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'partner') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const { limit = 5, type } = req.query;
        const pageSize = Math.min(parseInt(limit) || 5, 50);

        const filter = { clientId: req.user.clientId, isActive: true };
        if (type) filter.type = type;

        const [alerts, total, newCount] = await Promise.all([
            Alert.find(filter)
                .sort({ createdAt: -1 })
                .limit(pageSize)
                .lean(),
            Alert.countDocuments(filter),
            // "New" = created in last 24 hours
            Alert.countDocuments({
                ...filter,
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            })
        ]);

        res.json({
            success: true,
            data: {
                alerts,
                total,
                newCount
            }
        });
    } catch (error) {
        console.error('[Alerts] GET /alerts/partner error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch alerts', error: error.message });
    }
});

export default router;
