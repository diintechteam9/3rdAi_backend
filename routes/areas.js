/**
 * Area Routes
 *
 * GET  /api/areas              — GeoJSON FeatureCollection (map consumption)
 * GET  /api/areas/list         — JSON array of area docs (for UI dropdowns/tables)
 * GET  /api/areas/my-areas     — Auth-aware: returns areas for logged-in role
 * PATCH /api/areas/:id/assign-partner  — Client assigns partner to area
 * PATCH /api/areas/:id/unassign-partner — Remove partner from area
 * PATCH /api/areas/:id/assign-client   — Admin assigns client to area
 */

import express from 'express';
import mongoose from 'mongoose';
import Area from '../models/Area.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/areas — GeoJSON FeatureCollection for Leaflet map consumption
//  Query: ?city=  ?clientId=  ?partnerId=
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const { city, clientId, partnerId } = req.query;

        const filter = {};
        if (city) filter.city = city;
        if (clientId) filter.clientId = clientId;
        if (partnerId) filter.partnerId = partnerId;

        const areas = await Area.find(filter)
            .populate('partnerId', 'name email designation')
            .lean();

        const features = areas.map(area => ({
            type: 'Feature',
            properties: {
                id: area._id,
                name: area.name,
                city: area.city,
                clientId: area.clientId,
                partnerId: area.partnerId?._id || null,
                partnerName: area.partnerId?.name || 'Unassigned',
                partnerEmail: area.partnerId?.email || null,
                description: area.description || ''
            },
            geometry: area.boundary
        }));

        res.json({ type: 'FeatureCollection', features });
    } catch (err) {
        console.error('[Areas] GET / error:', err);
        res.status(500).json({ error: 'Server error fetching areas' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/areas/list — Plain JSON array (for client-side tables & dropdowns)
//  Query: ?city=  ?clientId=  ?partnerId=
//  Response: { success, areas: [...], total }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/list', async (req, res) => {
    try {
        const { city, clientId, partnerId } = req.query;

        const filter = {};
        if (city) filter.city = city;
        if (clientId) filter.clientId = clientId;
        if (partnerId) filter.partnerId = partnerId;

        const areas = await Area.find(filter)
            .populate('partnerId', 'name email designation')
            .select('-boundary')   // exclude heavy polygon coords from list view
            .sort({ name: 1 })
            .lean();

        res.json({
            success: true,
            total: areas.length,
            areas: areas.map(a => ({
                _id: a._id,
                name: a.name,
                city: a.city,
                clientId: a.clientId,
                description: a.description || '',
                partner: a.partnerId
                    ? { _id: a.partnerId._id, name: a.partnerId.name, email: a.partnerId.email, designation: a.partnerId.designation }
                    : null
            }))
        });
    } catch (err) {
        console.error('[Areas] GET /list error:', err);
        res.status(500).json({ error: 'Server error fetching area list' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/areas/my-areas — Auth-aware area fetching
//  - Client:  returns all areas where clientId  = token.id
//  - Partner: returns the area where partnerId  = token.id (their assigned zone)
//  - Admin:   returns all areas
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my-areas', authenticate, async (req, res) => {
    try {
        const { role, _id } = req.user;
        let filter = {};

        if (role === 'client') {
            filter.clientId = _id;
        } else if (role === 'partner') {
            filter.partnerId = _id;
        }
        // admin/super_admin → no filter → all areas

        const areas = await Area.find(filter)
            .populate('partnerId', 'name email designation')
            .select('-boundary')    // leave out boundary coords for list use
            .sort({ name: 1 })
            .lean();

        res.json({
            success: true,
            role,
            total: areas.length,
            areas: areas.map(a => ({
                _id: a._id,
                name: a.name,
                city: a.city,
                clientId: a.clientId,
                description: a.description || '',
                partner: a.partnerId
                    ? { _id: a.partnerId._id, name: a.partnerId.name, email: a.partnerId.email, designation: a.partnerId.designation }
                    : null
            }))
        });
    } catch (err) {
        console.error('[Areas] GET /my-areas error:', err);
        res.status(500).json({ error: 'Server error fetching my areas' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/areas/:id/assign-partner
//  Client assigns one of their approved partners to an area.
//  Body: { partnerId }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/assign-partner', authenticate, async (req, res) => {
    try {
        const { partnerId } = req.body;
        if (!partnerId) {
            return res.status(400).json({ success: false, error: 'partnerId is required' });
        }

        // Only clients and admins can assign partners
        if (!['client', 'admin', 'super_admin'].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Only clients can assign partners to areas' });
        }

        const area = await Area.findByIdAndUpdate(
            req.params.id,
            { partnerId },
            { new: true }
        ).populate('partnerId', 'name email designation');

        if (!area) return res.status(404).json({ success: false, error: 'Area not found' });

        console.log(`[Areas] Partner ${partnerId} assigned to area "${area.name}" by ${req.user.role} ${req.user._id}`);
        res.json({ success: true, area });
    } catch (err) {
        console.error('[Areas] PATCH assign-partner error:', err);
        res.status(500).json({ success: false, error: 'Server error assigning partner' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/areas/:id/unassign-partner
//  Remove partner from an area (set partnerId = null)
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/unassign-partner', authenticate, async (req, res) => {
    try {
        if (!['client', 'admin', 'super_admin'].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Only clients can unassign partners' });
        }

        const area = await Area.findByIdAndUpdate(
            req.params.id,
            { $unset: { partnerId: '' } },
            { new: true }
        );

        if (!area) return res.status(404).json({ success: false, error: 'Area not found' });

        res.json({ success: true, message: 'Partner unassigned', area });
    } catch (err) {
        console.error('[Areas] PATCH unassign-partner error:', err);
        res.status(500).json({ success: false, error: 'Server error unassigning partner' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/areas/:id/assign-client
//  Admin links an area to a client (run once during setup)
//  Body: { clientId }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/assign-client', async (req, res) => {
    try {
        const { clientId } = req.body;
        if (!clientId) {
            return res.status(400).json({ success: false, error: 'clientId is required' });
        }

        const area = await Area.findByIdAndUpdate(
            req.params.id,
            { clientId },
            { new: true }
        );

        if (!area) return res.status(404).json({ success: false, error: 'Area not found' });

        res.json({ success: true, area });
    } catch (err) {
        console.error('[Areas] PATCH assign-client error:', err);
        res.status(500).json({ success: false, error: 'Server error assigning client' });
    }
});

export default router;

