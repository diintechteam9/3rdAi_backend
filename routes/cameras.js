/**
 * GET /api/cameras
 * Returns cameras as GeoJSON FeatureCollection.
 * Query params: ?city=Bangalore
 */
import express from 'express';
import Camera from '../models/Camera.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { city } = req.query;
        const filter = {};
        if (city) filter.city = city;

        const cameras = await Camera.find(filter).lean();

        const features = cameras.map(cam => ({
            type: 'Feature',
            properties: {
                id: cam._id,
                name: cam.name,
                city: cam.city || 'Bangalore',
                radius: cam.radius || 300,
                description: cam.description || ''
            },
            geometry: cam.location
        }));

        res.json({ type: 'FeatureCollection', features });
    } catch (err) {
        console.error('[Cameras] GET error:', err);
        res.status(500).json({ error: 'Server error fetching cameras' });
    }
});

export default router;
