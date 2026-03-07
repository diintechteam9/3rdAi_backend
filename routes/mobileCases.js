import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import Alert from '../models/Alert.js';
import Area from '../models/Area.js';
import Notification from '../models/Notification.js';
import { authenticate } from '../middleware/auth.js';
import { putobject } from '../utils/s3.js'; // Fix import path

const router = express.Router();

// Memory storage for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit per file
});

// ─────────────────────────────────────────────────────────────────────────────
// STATIC DATA FOR MOBILE APP 
// ─────────────────────────────────────────────────────────────────────────────

// List of all case types to draw the cards in Mobile App
const CASE_TYPES = [
    { id: 'robbery', name: 'Robbery', description: 'Report an armed robbery or holdup' },
    { id: 'unidentified_emergency', name: 'Emergency / Unknown Incident', description: 'Report dead bodies, suspicious objects, etc.' },
    { id: 'snatching', name: 'Snatching', description: 'Report a chain, bag, or mobile snatching incident' },
    { id: 'theft', name: 'Theft', description: 'Report a home, shop, or vehicle theft' },
    { id: 'harassment', name: 'Harassment / Suspicious Activity', description: 'Report stalking or suspicious persons' },
    { id: 'accident', name: 'Accident', description: 'Report a road accident or hit & run' },
    { id: 'camera_issue', name: 'Camera / Safety Issue', description: 'Report blind spots or non-working cameras' }
];

// Dynamic Form definitions for each category
const CASE_FORMS = {
    'robbery': [
        { name: 'incidentTitle', label: 'Incident Title', type: 'text', required: true, placeholder: 'e.g. Armed robbery at store' },
        { name: 'robberyWeaponUsed', label: 'Weapon Used?', type: 'select', options: ['No', 'Yes'], required: true },
        { name: 'robberyInjury', label: 'Injury Happened?', type: 'select', options: ['No', 'Yes'], required: true },
        { name: 'robberySuspectCount', label: 'Suspect Count', type: 'number', required: false }
    ],
    'unidentified_emergency': [
        { name: 'emergencyType', label: 'Emergency Type', type: 'select', options: ['Dead Body', 'Unconscious Person', 'Suspicious Object', 'Unknown Person', 'Other'], required: true }
    ],
    'snatching': [
        { name: 'snatchingType', label: 'Snatching Type', type: 'select', options: ['Mobile', 'Chain', 'Bag', 'Other'], required: true },
        { name: 'itemStolen', label: 'Item Stolen', type: 'text', required: true },
        { name: 'estimatedValue', label: 'Estimated Value (₹)', type: 'number', required: false },
        { name: 'numberOfAttackers', label: 'Number of Attackers', type: 'number', required: false },
        { name: 'weaponUsed', label: 'Weapon Used?', type: 'select', options: ['No', 'Yes'], required: false },
        { name: 'vehicleUsed', label: 'Vehicle Used by Attacker', type: 'select', options: ['Bike', 'Car', 'On foot'], required: false },
        { name: 'injuryHappened', label: 'Injury Happened?', type: 'select', options: ['No', 'Yes'], required: false }
    ],
    'theft': [
        { name: 'theftType', label: 'Theft Type', type: 'select', options: ['Vehicle', 'House', 'Shop', 'Pickpocket'], required: true },
        { name: 'itemStolen', label: 'Item Stolen', type: 'text', required: true },
        { name: 'estimatedValue', label: 'Estimated Value (₹)', type: 'number', required: false },
        { name: 'cctvNearby', label: 'CCTV Nearby?', type: 'select', options: ['No', 'Yes'], required: false },
        { name: 'suspectSeen', label: 'Suspect Seen?', type: 'select', options: ['No', 'Yes'], required: false },
        { name: 'vehicleType', label: 'Vehicle Type (If vehicle theft)', type: 'text', required: false, condition: { field: 'theftType', value: 'Vehicle' } },
        { name: 'numberPlate', label: 'Number Plate', type: 'text', required: false, condition: { field: 'theftType', value: 'Vehicle' } },
        { name: 'vehicleColor', label: 'Color', type: 'text', required: false, condition: { field: 'theftType', value: 'Vehicle' } }
    ],
    'harassment': [
        { name: 'incidentType', label: 'Incident Type', type: 'select', options: ['Harassment', 'Stalking', 'Suspicious person', 'Suspicious vehicle'], required: true },
        { name: 'personDescription', label: 'Person Description', type: 'textarea', required: false, placeholder: 'Height, clothes, visible marks...' },
        { name: 'vehicleDescription', label: 'Vehicle Description (If any)', type: 'textarea', required: false, placeholder: 'Type, color, number plate...' },
        { name: 'repeatedIncident', label: 'Repeated Incident?', type: 'select', options: ['No', 'Yes'], required: false }
    ],
    'accident': [
        { name: 'accidentType', label: 'Accident Type', type: 'select', options: ['Bike', 'Car', 'Hit & run'], required: true },
        { name: 'injuries', label: 'Injuries?', type: 'select', options: ['No', 'Yes'], required: true },
        { name: 'ambulanceRequired', label: 'Ambulance Required?', type: 'select', options: ['No', 'Yes'], required: false },
        { name: 'vehiclesInvolved', label: 'Vehicles Involved', type: 'text', required: false, placeholder: 'e.g. 1 Car, 1 Bike' },
        { name: 'roadBlocked', label: 'Road Blocked?', type: 'select', options: ['No', 'Yes'], required: false }
    ],
    'camera_issue': [
        { name: 'issueType', label: 'Issue Type', type: 'select', options: ['Camera not working', 'No camera', 'Blind spot', 'Street light not working'], required: true },
        { name: 'sinceWhen', label: 'Since When', type: 'text', required: false, placeholder: 'e.g. 2 days, Since yesterday' }
    ]
};

// ─────────────────────────────────────────────────────────────────────────────
//  MOBILE APP SPECIFIC ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1️⃣ Get Case Types
 * GET /api/mobile/cases/types
 */
router.get('/types', (req, res) => {
    res.json({
        success: true,
        data: CASE_TYPES
    });
});

/**
 * 2️⃣ Get Case Form Fields
 * GET /api/mobile/cases/form/:caseType
 */
router.get('/form/:caseType', (req, res) => {
    const { caseType } = req.params;
    const formFields = CASE_FORMS[caseType];

    if (!formFields) {
        return res.status(404).json({ success: false, message: 'Invalid case type' });
    }

    res.json({
        success: true,
        data: {
            caseType,
            title: CASE_TYPES.find(c => c.id === caseType)?.name || caseType,
            commonFields: [
                { name: 'location', label: 'Address / Landmark', type: 'text', required: true },
                { name: 'latitude', label: 'Latitude', type: 'number', required: false }, // Typically auto fetched by GPS
                { name: 'longitude', label: 'Longitude', type: 'number', required: false }, // Typically auto fetched by GPS
                { name: 'dateTime', label: 'Date & Time', type: 'datetime-local', required: true },
                { name: 'description', label: 'Description', type: 'textarea', required: true }
            ],
            specificFields: formFields
        }
    });
});

/**
 * 3️⃣ Create Case via Mobile App (Using Existing Web Geo-Routing Logic)
 * POST /api/mobile/cases/create
 */
router.post('/create', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'user') {
            return res.status(403).json({ success: false, message: 'Only users can report cases via mobile' });
        }

        // body includes common form fields + specific form data
        const { caseType, location, description, latitude, longitude, dateTime, ...specificFormData } = req.body;

        if (!caseType || !description) {
            return res.status(400).json({ success: false, message: 'caseType and description are required' });
        }

        // ── GEO ROUTING (Copied perfectly from web logic in alerts.js) ───────────
        let locationPoint = undefined;
        let matchedArea = null;
        let assignedPartnerId = null;
        let resolvedClientId = req.user.clientId;
        let routedAreaId = null;

        const lng = parseFloat(longitude);
        const lat = parseFloat(latitude);
        const userClientId = req.user.clientId?._id || req.user.clientId;

        if (!isNaN(lng) && !isNaN(lat)) {
            locationPoint = { type: 'Point', coordinates: [lng, lat] };
            const clientFilter = userClientId ? { clientId: userClientId } : {};

            matchedArea = await Area.findOne({
                ...clientFilter,
                boundary: { $geoIntersects: { $geometry: locationPoint } }
            }).lean();

            if (matchedArea) {
                resolvedClientId = matchedArea.clientId || resolvedClientId;
                assignedPartnerId = matchedArea.partnerId || null;
                routedAreaId = matchedArea._id;
            } else {
                const nearestArea = await Area.findOne({
                    ...clientFilter,
                    boundary: { $near: { $geometry: locationPoint, $maxDistance: 50000 } }
                }).lean();

                if (nearestArea) {
                    resolvedClientId = nearestArea.clientId || resolvedClientId;
                    assignedPartnerId = nearestArea.partnerId || null;
                    routedAreaId = nearestArea._id;
                }
            }
        }

        // ── CREATE ALERT ──────────────────────────────────────────────────
        const typeName = CASE_TYPES.find(c => c.id === caseType)?.name || caseType;
        const alertTitle = specificFormData.incidentTitle || `New ${typeName} Case`;

        const alert = await Alert.create({
            title: alertTitle,
            message: description,
            priority: 'high',
            type: 'USER', // Ensure this is a citizen case
            clientId: resolvedClientId,
            userId: req.user._id,
            createdBy: req.user._id,
            metadata: {
                type: caseType,
                locationString: location,
                dateTime,
                ...specificFormData,
                media: [] // To be populated later by upload API
            },
            ...(locationPoint && { location: locationPoint }),
            ...(routedAreaId && { areaId: routedAreaId }),
            ...(assignedPartnerId && { assignedPartnerId, routedPartnerId: assignedPartnerId })
        });

        res.status(201).json({
            success: true,
            message: 'Case reported successfully',
            data: {
                caseId: alert._id,
                routing: {
                    areaMatched: matchedArea?.name || null,
                    partnerAssigned: !!assignedPartnerId
                }
            }
        });

    } catch (error) {
        console.error('[MobileCases] POST /create error:', error);
        res.status(500).json({ success: false, message: 'Failed to create case', error: error.message });
    }
});

/**
 * 4️⃣ Upload Media for a specific Case
 * POST /api/mobile/cases/upload-media
 * FormData: caseId, media (files)
 */
router.post('/upload-media', authenticate, upload.array('media', 5), async (req, res) => {
    try {
        const { caseId } = req.body;

        if (!caseId) {
            return res.status(400).json({ success: false, message: 'caseId is required' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No media files provided' });
        }

        const alert = await Alert.findOne({ _id: caseId, userId: req.user._id });

        if (!alert) {
            return res.status(404).json({ success: false, message: 'Case not found or unauthorized' });
        }

        const uploadedUrls = [];

        // Upload to S3/R2 iteratively
        for (const file of req.files) {
            try {
                // Determine file extension
                const ext = file.originalname.split('.').pop();
                const fileName = `cases/${alert._id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
                const fileUrl = await putobject(fileName, file.buffer, file.mimetype);
                uploadedUrls.push(fileUrl);
            } catch (uploadError) {
                console.error(`[Upload] Failed for file ${file.originalname}:`, uploadError);
            }
        }

        // Save newly uploaded URLs to the alert metadata
        const existingMedia = alert.metadata.media || [];
        alert.metadata.media = [...existingMedia, ...uploadedUrls];
        alert.markModified('metadata'); // Tell Mongoose Mixed type was updated

        await alert.save();

        res.json({
            success: true,
            message: `${uploadedUrls.length} file(s) uploaded successfully`,
            data: { mediaUrls: uploadedUrls }
        });

    } catch (error) {
        console.error('[MobileCases] POST /upload-media error:', error);
        res.status(500).json({ success: false, message: 'Failed to upload media', error: error.message });
    }
});

/**
 * 5️⃣ Get My Cases
 * GET /api/mobile/cases/my
 */
router.get('/my', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'user') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const alerts = await Alert.find({ userId: req.user._id, type: 'USER' })
            .sort({ createdAt: -1 })
            .select('title metadata.type status createdAt updatedAt priority') // Return lean preview content
            .lean();

        res.json({ success: true, data: { cases: alerts, total: alerts.length } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch user cases', error: error.message });
    }
});

/**
 * 6️⃣ Get Case Details
 * GET /api/mobile/cases/:caseId
 */
router.get('/:caseId', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'user') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Return the full alert, excluding the huge timeline array to save mobile bandwidth
        const alert = await Alert.findOne({ _id: req.params.caseId, userId: req.user._id, type: 'USER' })
            .select('-timeline')
            .lean();

        if (!alert) {
            return res.status(404).json({ success: false, message: 'Case not found' });
        }

        res.json({ success: true, data: { caseDetail: alert } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch case details', error: error.message });
    }
});

/**
 * 7️⃣ Get Case Timeline
 * GET /api/mobile/cases/:caseId/timeline
 */
router.get('/:caseId/timeline', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'user') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Only pluck the timeline array and the overall status
        const alert = await Alert.findOne({ _id: req.params.caseId, userId: req.user._id, type: 'USER' })
            .select('status timeline')
            .lean();

        if (!alert) {
            return res.status(404).json({ success: false, message: 'Case not found' });
        }

        res.json({
            success: true,
            data: {
                currentStatus: alert.status,
                timeline: alert.timeline || []
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch case timeline', error: error.message });
    }
});

export default router;
