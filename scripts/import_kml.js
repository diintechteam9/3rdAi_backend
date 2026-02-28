/**
 * scripts/import_kml.js
 *
 * Imports Delhi_Pincode.kml, benglore_pincode.kml, and CAMERA LAYER.kml
 * into MongoDB as separate Area/Camera documents.
 *
 * USAGE:
 *   node scripts/import_kml.js
 *
 * Optional env vars to auto-assign IDs:
 *   DELHI_CLIENT_ID=<ObjectId>
 *   BANGALORE_CLIENT_ID=<ObjectId>
 *
 * After import, use PATCH /api/areas/:id/assign-partner
 * or PATCH /api/areas/:id/assign-client to assign partners.
 */

import fs from 'fs';
import path from 'path';
import { DOMParser } from '@xmldom/xmldom';
import togeojson from 'togeojson';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

import Area from '../models/Area.js';
import Camera from '../models/Camera.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/brahmakosh';

// Optional: pass client IDs from environment to auto-assign at import time
const DELHI_CLIENT_ID = process.env.DELHI_CLIENT_ID || null;
const BANGALORE_CLIENT_ID = process.env.BANGALORE_CLIENT_ID || null;

// ─── KML coordinate helpers ───────────────────────────────────────────────────

/** Strip altitude (z) from any coordinate array, keep only [lng, lat] */
function cleanCoords(coords, geomType) {
    if (!coords || !coords.length) return coords;

    if (geomType === 'Point' && typeof coords[0] === 'number') {
        return [coords[0], coords[1]]; // [lng, lat]
    }

    return coords.map(c => {
        if (c && typeof c[0] === 'number') {
            return [c[0], c[1]];
        } else if (Array.isArray(c)) {
            return cleanCoords(c, geomType);
        }
        return c;
    });
}

/** Ensure first === last coordinate (GeoJSON ring must be closed) */
function closeRing(ring) {
    if (!ring || ring.length < 3) return ring;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([...first]);
    }
    return ring;
}

function closeGeom(coords, geomType) {
    if (geomType === 'Polygon') {
        return coords.map(closeRing);
    } else if (geomType === 'MultiPolygon') {
        return coords.map(poly => poly.map(closeRing));
    }
    return coords;
}

// ─── Main import function ─────────────────────────────────────────────────────

async function importKML() {
    try {
        console.log('\n' + '='.repeat(60));
        console.log('🗺️  KML → MongoDB Geo Import');
        console.log('='.repeat(60));

        console.log('\n🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ MongoDB connected');

        // Clear existing collections to avoid duplicates on re-import
        console.log('\n🗑️  Clearing Area and Camera collections...');
        const delAreas = await Area.deleteMany({});
        const delCameras = await Camera.deleteMany({});
        console.log(`   Deleted ${delAreas.deletedCount} areas, ${delCameras.deletedCount} cameras`);

        // File definitions — order matters; process areas before cameras
        const files = [
            {
                path: path.join(backendRoot, '..', '..', 'Delhi_Pincode.kml'),
                city: 'Delhi',
                type: 'area',
                clientId: DELHI_CLIENT_ID
            },
            {
                path: path.join(backendRoot, '..', '..', 'benglore_pincode.kml'),
                city: 'Bangalore',
                type: 'area',
                clientId: BANGALORE_CLIENT_ID
            },
            {
                path: path.join(backendRoot, '..', '..', 'CAMERA LAYER.kml'),
                city: 'Bangalore',
                type: 'camera'
            }
        ];

        let totalAreas = 0;
        let totalCameras = 0;

        for (const fileDef of files) {
            if (!fs.existsSync(fileDef.path)) {
                console.warn(`\n⚠️  File not found, skipping: ${fileDef.path}`);
                continue;
            }

            console.log(`\n📂 Processing: ${path.basename(fileDef.path)}`);
            console.log(`   City: ${fileDef.city || 'N/A'} | Type: ${fileDef.type}`);

            const kmlStr = fs.readFileSync(fileDef.path, 'utf8');
            const kmlDom = new DOMParser().parseFromString(kmlStr, 'text/xml');
            const geojson = togeojson.kml(kmlDom);

            console.log(`   Features found: ${geojson.features?.length || 0}`);

            let success = 0;
            let skipped = 0;
            let failed = 0;

            for (const feature of (geojson.features || [])) {
                if (!feature.geometry) { skipped++; continue; }

                const geomType = feature.geometry.type;
                const properties = feature.properties || {};
                const name = properties.name || 'Unnamed';

                try {
                    let cleaned = cleanCoords(feature.geometry.coordinates, geomType);

                    // ── Area (Polygon / MultiPolygon) ────────────────────────
                    if (fileDef.type === 'area' &&
                        (geomType === 'Polygon' || geomType === 'MultiPolygon')) {

                        cleaned = closeGeom(cleaned, geomType);

                        const doc = {
                            name,
                            city: fileDef.city,
                            boundary: { type: geomType, coordinates: cleaned },
                            description: properties.description || ''
                        };

                        // Auto-assign clientId if provided
                        if (fileDef.clientId) {
                            doc.clientId = fileDef.clientId;
                        }

                        await Area.create(doc);
                        success++;

                        // ── Camera (Point) ───────────────────────────────────────
                    } else if (fileDef.type === 'camera' && geomType === 'Point') {
                        await Camera.create({
                            name,
                            city: fileDef.city,
                            location: { type: 'Point', coordinates: cleaned },
                            radius: 300, // 300m surveillance radius
                            description: properties.description || ''
                        });
                        success++;

                    } else {
                        skipped++; // geometry type mismatch
                    }

                } catch (createErr) {
                    failed++;
                    // Only log first 3 failures to avoid flooding the terminal
                    if (failed <= 3) {
                        console.error(`   ❌ Failed "${name}": ${createErr.message.substring(0, 120)}`);
                    }
                }
            }

            console.log(`   ✅ Imported: ${success} | ⏭️  Skipped: ${skipped} | ❌ Failed: ${failed}`);

            if (fileDef.type === 'area') totalAreas += success;
            if (fileDef.type === 'camera') totalCameras += success;
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ Import Complete');
        console.log(`   Total Areas   imported: ${totalAreas}`);
        console.log(`   Total Cameras imported: ${totalCameras}`);
        console.log('\n📌 Next Steps:');
        console.log('   1. Use PATCH /api/areas/:id/assign-client to link areas to clients');
        console.log('   2. Use PATCH /api/areas/:id/assign-partner to assign partners to areas');
        console.log('   3. Or set DELHI_CLIENT_ID / BANGALORE_CLIENT_ID env vars and re-run');
        console.log('='.repeat(60) + '\n');

        process.exit(0);
    } catch (err) {
        console.error('\n❌ Import error:', err);
        process.exit(1);
    }
}

importKML();
