import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import Client from '../models/Client.js';
import Area from '../models/Area.js';

await mongoose.connect(process.env.MONGODB_URI);
console.log('✅ Connected\n');

const clients = await Client.find({}).select('clientId businessName email cityBoundary').lean();
console.log('=== ALL CLIENTS ===');
clients.forEach(c => {
    console.log(`  [${c.clientId}] ${c.businessName} | email: ${c.email} | cityBoundary: "${c.cityBoundary}"`);
});

const areas = await Area.find({}).select('name city clientId partnerId').lean();
console.log(`\n=== AREAS IN DB: ${areas.length} total ===`);
const byCity = {};
areas.forEach(a => {
    byCity[a.city] = (byCity[a.city] || 0) + 1;
});
console.log('  By city:', JSON.stringify(byCity));
const bangaloreAreas = areas.filter(a => a.city === 'Bangalore');
console.log(`  Bangalore areas: ${bangaloreAreas.length}`);
if (bangaloreAreas.length > 0) {
    bangaloreAreas.slice(0, 5).forEach(a => console.log(`    - ${a.name} | clientId: ${a.clientId} | partnerId: ${a.partnerId}`));
}

process.exit(0);
