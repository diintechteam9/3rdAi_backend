import fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import togeojson from 'togeojson';

const kmlStr = fs.readFileSync('../../benglore_pincode.kml', 'utf8');
const kml = new DOMParser().parseFromString(kmlStr, 'text/xml');
const geojson = togeojson.kml(kml);

function stripAltitude(coordinates) {
    if (!coordinates || !coordinates.length) return coordinates;
    if (typeof coordinates[0] === 'number') {
        return [coordinates[0], coordinates[1]]; // Keep only lon, lat
    }
    return coordinates.map(stripAltitude);
}

const p = geojson.features.filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))[0];
if (p) {
    console.log("Original:", JSON.stringify(p.geometry.coordinates).substring(0, 100));
    console.log("Stripped:", JSON.stringify(stripAltitude(p.geometry.coordinates)).substring(0, 100));
} else {
    console.log("No polygons found");
}
