import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import Client from '../models/Client.js';
import Area from '../models/Area.js';

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const clients = await Client.find({}).select('clientId businessName email cityBoundary').lean();
    const areas = await Area.find({}).select('name city clientId partnerId').lean();
    const byCity = {};
    areas.forEach(a => {
        byCity[a.city] = (byCity[a.city] || 0) + 1;
    });
    const bangaloreAreas = areas.filter(a => a.city === 'Bangalore');

    const output = {
        clients,
        areaStats: byCity,
        sampleBangaloreAreas: bangaloreAreas.slice(0, 5)
    };

    fs.writeFileSync('db_check.json', JSON.stringify(output, null, 2));
    process.exit(0);
}
run().catch(console.error);
