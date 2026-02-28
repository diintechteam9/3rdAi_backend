/**
 * Alert / Citizen Case Management Routes
 *
 * Client  : Full CRUD for their own alerts
 * User    : Report cases + view own cases
 * Partner : View all client cases + structured status update workflow
 *
 * STATUS FLOW (enforced, no skipping):
 *   Reported → Under Review → Verified → Action Taken → Resolved
 *                                     ↘ Rejected (from Under Review or Verified only)
 */

import express from 'express';
import mongoose from 'mongoose';
import Alert from '../models/Alert.js';
import Area from '../models/Area.js';
import Notification from '../models/Notification.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
//  STATUS FLOW CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_FLOW = {
    'Reported': ['Under Review'],
    'Under Review': ['Verified', 'Rejected'],
    'Verified': ['Action Taken', 'Rejected'],
    'Action Taken': ['Resolved'],
    'Resolved': [],    // terminal
    'Rejected': []     // terminal
};

const VALID_STATUSES = Object.keys(STATUS_FLOW);

/**
 * Category-based basis types for partner status updates.
 * Basis types are case-category specific to ensure operational clarity.
 */
const CATEGORY_BASIS_TYPES = {
    robbery: [
        'Eyewitness Account Recorded',
        'CCTV Footage Reviewed',
        'FIR Lodged',
        'Suspect Identified',
        'Suspect Apprehended',
        'Vehicle Traced',
        'Forensic Evidence Collected',
        'Victim Statement Recorded',
        'Case Under Investigation'
    ],
    unidentified_emergency: [
        'Scene Assessed by Officers',
        'Medical Assessment Completed',
        'Ambulance Dispatched',
        'Forensic Team Dispatched',
        'Identity of Person Confirmed',
        'Object Identified as Safe',
        'Object Identified as Threat',
        'Area Cordoned Off',
        'Case Referred to Specialists'
    ],
    snatching: [
        'Eyewitness Account Recorded',
        'CCTV Footage Reviewed',
        'Victim Statement Recorded',
        'FIR Lodged',
        'Suspect Traced via CCTV',
        'Suspect Apprehended',
        'Stolen Item Recovered',
        'Vehicle Number Traced',
        'Case Under Investigation'
    ],
    theft: [
        'Scene Inspected by Officers',
        'CCTV Evidence Collected',
        'Victim Statement Recorded',
        'Forensic Evidence Collected',
        'FIR Lodged',
        'Suspect Identified',
        'Suspect Apprehended',
        'Item Partially Recovered',
        'Item Fully Recovered',
        'Insurance Notified'
    ],
    harassment: [
        'Individual Apprehended',
        'Scene Monitored by Officers',
        'Victim Statement Recorded',
        'CCTV Evidence Collected',
        'Suspect Under Surveillance',
        'FIR Lodged',
        'Restraining Notice Issued',
        'Case Transferred to Cyber Cell',
        'Case Under Investigation'
    ],
    accident: [
        'Accident Scene Secured',
        'Medical Assistance Provided',
        'Ambulance Dispatched',
        'FIR Registered',
        'Vehicles Involved Inspected',
        'Traffic Restored',
        'Hit & Run Investigation Started',
        'Insurance Notified',
        'Victim Hospitalized',
        'Scene Cleared'
    ],
    camera_issue: [
        'Technical Team Dispatched',
        'Camera Restored and Functional',
        'New Camera Installation Initiated',
        'Street Light Repaired',
        'Maintenance Request Filed',
        'Blind Spot Logged for Review',
        'Temporary Patrol Assigned',
        'Issue Under Continuous Observation'
    ]
};

// Default basis types for unknown categories
const DEFAULT_BASIS_TYPES = [
    'Site Inspection Completed',
    'Evidence Collected',
    'Witness Statement Recorded',
    'FIR Lodged',
    'Case Under Investigation',
    'Action Initiated',
    'Case Resolved'
];

// ─────────────────────────────────────────────────────────────────────────────
//  CLIENT ROUTES — Full CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/alerts
 * List all alerts for the logged-in client's tenant
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
                .populate('assignedPartnerId', 'name email designation phone')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageSize)
                .lean(),
            Alert.countDocuments(filter)
        ]);


        res.json({
            success: true,
            data: { alerts, total, page: pageNum, limit: pageSize, hasMore: total > skip + alerts.length }
        });
    } catch (error) {
        console.error('[Alerts] GET /alerts error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch alerts', error: error.message });
    }
});

/**
 * POST /api/alerts
 * Create a new alert (client-side)
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

        res.status(201).json({ success: true, message: 'Alert created successfully', data: { alert } });
    } catch (error) {
        console.error('[Alerts] POST /alerts error:', error);
        res.status(500).json({ success: false, message: 'Failed to create alert', error: error.message });
    }
});

/**
 * PATCH /api/alerts/:alertId
 * Update an alert
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
//  USER ROUTES — Citizen Case Reporting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/alerts/user
 * Citizen submits a case with GPS coordinates.
 *
 * Body:
 *   title, message, priority, formData   (same as before)
 *   latitude, longitude                  (NEW — GPS from mobile)
 *
 * Geo-routing logic:
 *   If lat/lng provided → find matching Area polygon via $geoIntersects
 *   → inherit clientId + assignedPartnerId + areaId from that Area
 *   → fall back to req.user.clientId if no area matched
 */
router.post('/user', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'user') {
            return res.status(403).json({ success: false, message: 'Only users can report cases' });
        }

        const { title, message, priority, formData, latitude, longitude } = req.body;

        // ── GEO ROUTING ──────────────────────────────────────────────────
        let locationPoint = undefined;
        let matchedArea = null;
        let assignedPartnerId = null;
        let resolvedClientId = req.user.clientId; // default: use citizen's own client
        let routedAreaId = null;

        const lng = parseFloat(longitude);
        const lat = parseFloat(latitude);

        if (!isNaN(lng) && !isNaN(lat)) {
            // Build GeoJSON Point — always [longitude, latitude] per GeoJSON spec
            locationPoint = { type: 'Point', coordinates: [lng, lat] };

            // Find the pincode/area polygon that contains this GPS point
            matchedArea = await Area.findOne({
                boundary: {
                    $geoIntersects: {
                        $geometry: locationPoint
                    }
                }
            }).lean();

            if (matchedArea) {
                // Inherit routing from area
                resolvedClientId = matchedArea.clientId || resolvedClientId;
                assignedPartnerId = matchedArea.partnerId || null;
                routedAreaId = matchedArea._id;
                console.log(`[GeoRouting] Case → Area: "${matchedArea.name}" | Partner: ${assignedPartnerId || 'unassigned'}`);
            } else {
                console.warn('[GeoRouting] No area matched GPS point, falling back to user clientId');
            }
        }

        // ── CREATE ALERT ──────────────────────────────────────────────────
        const alert = await Alert.create({
            title: title || 'New Citizen Case',
            message: message || formData?.description || 'Case reported by user',
            priority: priority || 'high',
            type: 'USER',
            clientId: resolvedClientId,
            userId: req.user._id,
            createdBy: req.user._id,
            metadata: formData || {},
            // Geo-routing fields (populated only when GPS provided)
            ...(locationPoint && { location: locationPoint }),
            ...(routedAreaId && { areaId: routedAreaId }),
            ...(assignedPartnerId && { assignedPartnerId, routedPartnerId: assignedPartnerId })
        });

        res.status(201).json({
            success: true,
            message: 'Case reported successfully',
            data: {
                alert,
                routing: {
                    areaMatched: matchedArea?.name || null,
                    partnerAssigned: !!assignedPartnerId,
                    coordinates: locationPoint?.coordinates || null
                }
            }
        });
    } catch (error) {
        console.error('[Alerts] POST /alerts/user error:', error);
        res.status(500).json({ success: false, message: 'Failed to report case', error: error.message });
    }
});

/**
 * GET /api/alerts/user
 * Get citizen cases reported by the logged-in user
 */
router.get('/user', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'user') {
            return res.status(403).json({ success: false, message: 'Only users can view their reported cases' });
        }

        const alerts = await Alert.find({ userId: req.user._id, type: 'USER' })
            .sort({ createdAt: -1 })
            .lean();

        res.json({ success: true, data: { alerts, total: alerts.length } });
    } catch (error) {
        console.error('[Alerts] GET /alerts/user error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch user cases', error: error.message });
    }
});

/**
 * GET /api/alerts/user/:alertId
 */
router.get('/user/:alertId', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'user') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const alert = await Alert.findOne({ _id: req.params.alertId, userId: req.user._id, type: 'USER' }).lean();
        if (!alert) {
            return res.status(404).json({ success: false, message: 'Case not found' });
        }

        res.json({ success: true, data: { alert } });
    } catch (error) {
        console.error('[Alerts] GET /alerts/user/:alertId error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch case', error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PARTNER ROUTES — Structured Incident Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/alerts/partner/basis-types
 * Get category-specific basis types for the update form
 * Access: partner
 */
router.get('/partner/basis-types', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'partner') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const { category } = req.query;
        const basisTypes = category
            ? (CATEGORY_BASIS_TYPES[category] || DEFAULT_BASIS_TYPES)
            : CATEGORY_BASIS_TYPES;

        res.json({ success: true, data: { basisTypes } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/alerts/partner
 * Get cases assigned to THIS partner (not all client cases).
 *
 * Filter priority:
 *   1. assignedPartnerId = req.user._id  (geo-routed cases assigned to this partner)
 *   2. Optionally also show unassigned cases from same client (if ?unassigned=true)
 *
 * Access: partner
 */
router.get('/partner', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'partner') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const { limit = 100, page = 1, status, type, priority, includeUnassigned } = req.query;
        const pageNum = Math.max(parseInt(page) || 1, 1);
        const pageSize = Math.min(parseInt(limit) || 100, 200);
        const skip = (pageNum - 1) * pageSize;

        const partnerObjId = new mongoose.Types.ObjectId(req.user._id.toString());

        // Safely extract clientId (needed for statusCounts aggregate)
        const clientId = req.user.clientId?._id || req.user.clientId;
        const clientObjId = clientId ? new mongoose.Types.ObjectId(clientId.toString()) : null;

        // PRIMARY FILTER: cases where this partner is the assigned responder
        // This is the geo-routing result — only see YOUR cases, not all client cases
        const base = { assignedPartnerId: partnerObjId };

        // Optional: also include unassigned cases from same client (control-room mode)
        // Activated by ?includeUnassigned=true
        const matchExpr = (includeUnassigned === 'true' && clientObjId)
            ? { $or: [{ assignedPartnerId: partnerObjId }, { clientId: clientObjId, assignedPartnerId: null }] }
            : base;

        const filter = { ...matchExpr, type: 'USER' };
        if (status) filter.status = status;
        if (priority) filter.priority = priority;

        const [alerts, total, newCount, statusCounts] = await Promise.all([
            Alert.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageSize)
                .lean(),
            Alert.countDocuments(filter),
            Alert.countDocuments({
                ...matchExpr,
                type: 'USER',
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }),
            // Status counts for THIS partner's cases only
            Alert.aggregate([
                { $match: { assignedPartnerId: partnerObjId, type: 'USER' } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ])
        ]);

        const counts = {};
        statusCounts.forEach(s => { counts[s._id] = s.count; });

        res.json({
            success: true,
            data: {
                alerts,
                total,
                newCount,
                page: pageNum,
                limit: pageSize,
                hasMore: total > skip + alerts.length,
                statusCounts: counts
            }
        });
    } catch (error) {
        console.error('[Alerts] GET /alerts/partner error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch alerts', error: error.message });
    }
});


/**
 * GET /api/alerts/partner/:alertId
 * Get a single case detail
 * Access: partner
 */
router.get('/partner/:alertId', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'partner' && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const clientId = req.user.clientId?._id || req.user.clientId;
        const clientObjId = clientId ? new mongoose.Types.ObjectId(clientId.toString()) : null;

        const alert = await Alert.findOne({ _id: req.params.alertId, clientId: clientObjId }).lean();
        if (!alert) {
            return res.status(404).json({ success: false, message: 'Case not found' });
        }

        // Attach allowed next statuses
        const allowedNext = STATUS_FLOW[alert.status] || [];
        const caseCategory = alert.metadata?.type || null;
        const availableBasisTypes = caseCategory
            ? (CATEGORY_BASIS_TYPES[caseCategory] || DEFAULT_BASIS_TYPES)
            : DEFAULT_BASIS_TYPES;

        res.json({
            success: true,
            data: {
                alert,
                allowedNextStatuses: allowedNext,
                availableBasisTypes
            }
        });
    } catch (error) {
        console.error('[Alerts] GET /alerts/partner/:alertId error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch case', error: error.message });
    }
});

/**
 * PATCH /api/alerts/partner/:alertId/status
 * Update case status — STRICT FLOW ENFORCED
 *
 * Body: { status, basisType, description }
 * - status      : required, must be a valid next step in the flow
 * - basisType   : required, must be from category-specific list
 * - description : required, minimum 20 characters
 *
 * Access: partner (same clientId)
 */
router.patch('/partner/:alertId/status', authenticate, async (req, res) => {
    try {
        console.log(`[Alerts] PATCH status update start: ${req.params.alertId}`);
        if (req.user.role !== 'partner' && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Only authorized personnel can update case status'
            });
        }

        const { status, basisType, description } = req.body;

        // ── Validation ────────────────────────────────────────────────────────

        if (!status) {
            return res.status(400).json({ success: false, message: 'Status is required' });
        }

        if (!VALID_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Valid statuses are: ${VALID_STATUSES.join(', ')}`
            });
        }

        if (!basisType || basisType.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Basis type is required for every status update' });
        }

        if (!description || description.trim().length < 20) {
            return res.status(400).json({
                success: false,
                message: 'A detailed description is required (minimum 20 characters)'
            });
        }

        // ── Fetch case ────────────────────────────────────────────────────────

        const clientId = req.user.clientId?._id || req.user.clientId;
        const clientObjId = clientId ? new mongoose.Types.ObjectId(clientId.toString()) : null;
        const alert = await Alert.findOne({ _id: req.params.alertId, clientId: clientObjId });

        if (!alert) {
            console.log(`[Alerts] Case not found: ${req.params.alertId} for client: ${clientObjId}`);
            return res.status(404).json({ success: false, message: 'Case not found' });
        }
        console.log(`[Alerts] Found case: ${alert._id}, current status: ${alert.status}`);

        // ── Strict status flow check ──────────────────────────────────────────

        const allowedNextStatuses = STATUS_FLOW[alert.status] || [];

        if (!allowedNextStatuses.includes(status)) {
            return res.status(422).json({
                success: false,
                message: `Cannot transition from "${alert.status}" to "${status}". Allowed next statuses: ${allowedNextStatuses.length ? allowedNextStatuses.join(', ') : 'None (terminal status)'}`,
                currentStatus: alert.status,
                allowedNext: allowedNextStatuses
            });
        }

        // ── Validate basisType against category (Case-Insensitive) ────────────
        const caseCategory = (alert.metadata?.type || '').toLowerCase().trim();
        const validBasisTypes = caseCategory
            ? (CATEGORY_BASIS_TYPES[caseCategory] || DEFAULT_BASIS_TYPES)
            : DEFAULT_BASIS_TYPES;

        // Try exact match first, then case-insensitive match
        const isBasisValid = validBasisTypes.some(bt =>
            bt.trim().toLowerCase() === basisType.trim().toLowerCase()
        );

        if (!isBasisValid) {
            console.log(`[Alerts] Invalid basis type: "${basisType}" for category: "${caseCategory}"`);
            return res.status(400).json({
                success: false,
                message: `Invalid basis type for case category "${caseCategory}". Please select a valid basis type or contact support.`,
                validBasisTypes
            });
        }

        // ── Apply update ──────────────────────────────────────────────────────

        const previousStatus = alert.status;
        alert.status = status;

        // If partner takes the case (first update), assign them
        if (!alert.assignedPartnerId) {
            alert.assignedPartnerId = req.user._id;
        }

        // Add timeline entry
        alert.timeline.push({
            status,
            basisType: basisType.trim(),
            note: description.trim(),
            timestamp: new Date(),
            updatedBy: req.user._id,
            updatedByName: req.user.name || req.user.email || 'Officer'
        });

        // If terminal status, mark inactive
        if (status === 'Resolved' || status === 'Rejected') {
            alert.isActive = false;
        }

        console.log('[Alerts] Saving alert update...');
        await alert.save();
        console.log('[Alerts] Alert saved successfully');

        // ── User notification ─────────────────────────────────────────────────

        if (alert.userId) {
            try {
                await Notification.create({
                    userId: alert.userId,
                    type: 'case_update',
                    title: `Case Status: ${status}`,
                    message: `Your case #${alert._id.toString().slice(-6).toUpperCase()} has been updated to "${status}". Officer Note: ${description.trim().substring(0, 100)}`,
                    data: {
                        alertId: alert._id,
                        status,
                        basisType: basisType.trim(),
                        previousStatus
                    }
                });
            } catch (notifErr) {
                console.warn('[Alerts] Notification creation failed (non-critical):', notifErr.message);
            }
        }

        // Return updated alert with allowed next statuses
        const updatedAlert = await Alert.findById(alert._id).lean();
        const newAllowedNext = STATUS_FLOW[updatedAlert.status] || [];

        res.json({
            success: true,
            message: `Case status updated to "${status}" successfully`,
            data: {
                alert: updatedAlert,
                allowedNextStatuses: newAllowedNext,
                previousStatus
            }
        });
    } catch (error) {
        console.error('[Alerts] PATCH /alerts/partner/:alertId/status error:', error);
        res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
    }
});

export default router;
