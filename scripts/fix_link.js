import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import Area from '../models/Area.js';
import Partner from '../models/Partner.js';

async function fix() {
    await mongoose.connect(process.env.MONGODB_URI);

    const partner = await Partner.findOne({ email: 'nandu797090@gmail.com' });
    if (!partner) return console.log('Partner not found');

    const areaLookup = partner.location.area || 'Electronic City';
    console.log(`Partner: ${partner.name} | Trying to link to area: ${areaLookup}`);

    const area = await Area.findOne({ name: { $regex: new RegExp(areaLookup, 'i') } });

    if (area) {
        console.log(`Found matching area: ${area.name}`);
        area.partnerId = partner._id;
        await area.save();
        console.log('✅ Successfully linked partner to area!');
    } else {
        // try finding by matching word
        const allAreas = await Area.find({ city: 'Bangalore' }).select('name').lean();
        console.log(`❌ Area not found directly. Here are 10 Bangalore area names to compare:`);
        allAreas.slice(0, 10).forEach(a => console.log('  - ' + a.name));
    }
    process.exit(0);
}

fix().catch(console.error);
