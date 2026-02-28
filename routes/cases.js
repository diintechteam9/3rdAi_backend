/**
 * Geo-Based Case Management Routes
 *
 * POST /api/cases             — User submits GPS case → auto-routed to area+partner
 * GET  /api/cases             — All cases as GeoJSON (for client/admin map)
 * GET  /api/cases/client/:clientId  — Client dashboard: all cases in their city
 * GET  /api/cases/partner/:partnerId — Partner dashboard: only their cases
 * PATCH /api/cases/:id/status — Update case status (partner attends)
 */

import express from 'express';
import mongoose from 'mongoose';
import Case from '../models/Case.js';
import Area from '../models/Area.js';
import { io } from '../services/chatWebSocket.js';

const router = express.Router();

// ─── Helper: case document → GeoJSON Feature ──────────────────────────────────
function caseToFeature(c) {
    return {
        type: 'Feature',
        properties: {
            id: c._id,
            title: c.title,
            description: c.description || '',
            status: c.status,
            assignedAreaId: c.assignedAreaId,
            clientId: c.clientId,
            partnerId: c.partnerId?._id || c.partnerId || null,
            partnerName: c.partnerId?.name || null,
            partnerEmail: c.partnerId?.email || null,
            attendedNote: c.attendedNote || '',
            attendedAt: c.attendedAt || null,
            createdAt: c.createdAt
        },
        geometry: c.location
    };
}

// ─── GET /api/cases ───────────────────────────────────────────────────────────
// All cases as GeoJSON FeatureCollection.
// Optional query: ?clientId=, ?partnerId=, ?status=, ?city=
router.get('/', async (req, res) => {
    try {
        const { clientId, partnerId, status, city } = req.query;

        const filter = {};
        if (clientId) filter.clientId = clientId;
        if (partnerId) filter.partnerId = partnerId;
        if (status) filter.status = status;

        // If filtering by city, find all areas in that city then filter cases
        if (city) {
            const areaIds = await Area.find({ city }).distinct('_id');
            filter.assignedAreaId = { $in: areaIds };
        }

        const cases = await Case
            .find(filter)
            .populate('partnerId', 'name email')
            .lean();

        const features = cases.map(caseToFeature);

        res.json({ type: 'FeatureCollection', features });
    } catch (err) {
        console.error('[Cases] GET / error:', err);
        res.status(500).json({ error: 'Server error fetching cases' });
    }
});

// ─── GET /api/cases/client/:clientId ─────────────────────────────────────────
// CLIENT DASHBOARD: all cases in this client's zone, with partner info populated
router.get('/client/:clientId', async (req, res) => {
    try {
        const { status } = req.query;
        const filter = { clientId: req.params.clientId };
        if (status) filter.status = status;

        const cases = await Case
            .find(filter)
            .populate('partnerId', 'name email')
            .populate('assignedAreaId', 'name city')
            .sort({ createdAt: -1 })
            .lean();

        const features = cases.map(c => ({
            ...caseToFeature(c),
            properties: {
                ...caseToFeature(c).properties,
                areaName: c.assignedAreaId?.name || 'Unknown Area',
                areaCity: c.assignedAreaId?.city || ''
            }
        }));

        res.json({
            type: 'FeatureCollection',
            features,
            total: features.length,
            statusCounts: summarizeStatuses(cases)
        });
    } catch (err) {
        console.error('[Cases] GET /client error:', err);
        res.status(500).json({ error: 'Server error fetching client cases' });
    }
});

// ─── GET /api/cases/partner/:partnerId ───────────────────────────────────────
// PARTNER DASHBOARD: only cases assigned to this partner
router.get('/partner/:partnerId', async (req, res) => {
    try {
        const { status } = req.query;
        const filter = { partnerId: req.params.partnerId };
        if (status) filter.status = status;

        const cases = await Case
            .find(filter)
            .populate('assignedAreaId', 'name city boundary')
            .sort({ createdAt: -1 })
            .lean();

        const features = cases.map(c => ({
            ...caseToFeature(c),
            properties: {
                ...caseToFeature(c).properties,
                areaName: c.assignedAreaId?.name || 'Unknown Area',
                areaCity: c.assignedAreaId?.city || ''
            }
        }));

        res.json({
            type: 'FeatureCollection',
            features,
            total: features.length,
            statusCounts: summarizeStatuses(cases)
        });
    } catch (err) {
        console.error('[Cases] GET /partner error:', err);
        res.status(500).json({ error: 'Server error fetching partner cases' });
    }
});

// ─── POST /api/cases ──────────────────────────────────────────────────────────
// User submits a case with GPS coordinates.
// Auto-routing: finds area by $geoIntersects, inherits clientId + partnerId.
router.post('/', async (req, res) => {
    try {
        const { title, description, longitude, latitude, userId } = req.body;

        if (!title || longitude === undefined || latitude === undefined) {
            return res.status(400).json({ error: 'title, longitude and latitude are required' });
        }

        const lng = parseFloat(longitude);
        const lat = parseFloat(latitude);

        if (isNaN(lng) || isNaN(lat)) {
            return res.status(400).json({ error: 'longitude and latitude must be valid numbers' });
        }

        // GeoJSON Point — always [longitude, latitude]
        const locationPoint = {
            type: 'Point',
            coordinates: [lng, lat]
        };

        // ── GEO ROUTING ──────────────────────────────────────────────────────
        // Find the area polygon that contains this GPS coordinate.
        // $geoIntersects works with 2dsphere index on boundary field.
        const matchedArea = await Area.findOne({
            boundary: {
                $geoIntersects: {
                    $geometry: locationPoint
                }
            }
        }).lean();

        // ── CREATE CASE ──────────────────────────────────────────────────────
        const newCase = await Case.create({
            title,
            description,
            userId,
            location: locationPoint,
            assignedAreaId: matchedArea?._id || null,
            clientId: matchedArea?.clientId || null,
            partnerId: matchedArea?.partnerId || null,
            status: matchedArea?.partnerId ? 'assigned' : 'pending'
        });

        // ── EMIT REAL-TIME UPDATE ────────────────────────────────────────────
        if (io) {
            io.emit('new_case', caseToFeature({
                ...newCase.toObject(),
                partnerId: null  // not populated yet, avoids ObjectId error
            }));
        }

        res.status(201).json({
            success: true,
            message: 'Case created successfully',
            case: newCase,
            routing: {
                matchedArea: matchedArea?.name || null,
                matchedCity: matchedArea?.city || null,
                assignedPartner: matchedArea?.partnerId || null,
                status: newCase.status
            }
        });
    } catch (err) {
        console.error('[Cases] POST error:', err);
        res.status(500).json({ error: 'Server error creating case' });
    }
});

// ─── PATCH /api/cases/:id/status ─────────────────────────────────────────────
// Partner marks a case as attended (or any status transition)
// Body: { status, attendedNote? }
router.patch('/:id/status', async (req, res) => {
    try {
        const { status, attendedNote } = req.body;

        const VALID = ['pending', 'assigned', 'in-progress', 'attended', 'resolved', 'closed'];
        if (!status || !VALID.includes(status)) {
            return res.status(400).json({
                error: `Invalid status. Must be one of: ${VALID.join(', ')}`
            });
        }

        const update = { status };
        if (status === 'attended' || status === 'resolved') {
            update.attendedAt = new Date();
            update.attendedNote = attendedNote || '';
        }

        const updated = await Case.findByIdAndUpdate(
            req.params.id,
            update,
            { new: true }
        ).populate('partnerId', 'name email').lean();

        if (!updated) {
            return res.status(404).json({ error: 'Case not found' });
        }

        // Emit real-time status update to all dashboard watchers
        if (io) {
            io.emit('case_status_updated', caseToFeature(updated));
        }

        res.json({
            success: true,
            message: `Case status updated to "${status}"`,
            case: updated
        });
    } catch (err) {
        console.error('[Cases] PATCH status error:', err);
        res.status(500).json({ error: 'Server error updating case status' });
    }
});

// ─── Helper ───────────────────────────────────────────────────────────────────
function summarizeStatuses(cases) {
    return cases.reduce((acc, c) => {
        acc[c.status] = (acc[c.status] || 0) + 1;
        return acc;
    }, {});
}

export default router;
