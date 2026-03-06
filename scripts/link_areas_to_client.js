/**
 * link_areas_to_client.js
 * One-time script: links ALL existing areas to a specific client.
 *
 * Usage: node scripts/link_areas_to_client.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const TARGET_CLIENT_EMAIL = 'delhipolice01@gmail.com';

// ── Minimal inline schemas (no circular imports) ──────────────────────────────
const clientSchema = new mongoose.Schema({ email: String, clientId: String }, { strict: false });
const areaSchema = new mongoose.Schema({ name: String, clientId: mongoose.Schema.Types.ObjectId }, { strict: false });

const Client = mongoose.model('Client', clientSchema);
const Area = mongoose.model('Area', areaSchema);

async function main() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected\n');

    // 1. Find the target client
    const client = await Client.findOne({ email: TARGET_CLIENT_EMAIL });
    if (!client) {
        console.error(`❌ Client not found: ${TARGET_CLIENT_EMAIL}`);
        process.exit(1);
    }
    console.log(`✅ Client found:`);
    console.log(`   Name     : ${client.name || client.organizationName || 'N/A'}`);
    console.log(`   Email    : ${client.email}`);
    console.log(`   _id      : ${client._id}`);
    console.log(`   clientId : ${client.clientId}\n`);

    // 2. Count areas before
    const totalAreas = await Area.countDocuments();
    const alreadyLinked = await Area.countDocuments({ clientId: client._id });
    console.log(`📊 Total areas in DB : ${totalAreas}`);
    console.log(`📊 Already linked    : ${alreadyLinked}`);
    console.log(`📊 Will update       : ${totalAreas - alreadyLinked}\n`);

    if (totalAreas === 0) {
        console.warn('⚠️  No areas found in DB. Run import_kml.js first.');
        process.exit(0);
    }

    // 3. Update ALL areas → set clientId to this client's _id
    const result = await Area.updateMany(
        {},   // all areas
        { $set: { clientId: client._id } }
    );
    console.log(`✅ Updated ${result.modifiedCount} areas → clientId = ${client._id}`);

    // 4. Verify
    const verifyCount = await Area.countDocuments({ clientId: client._id });
    console.log(`✅ Verification: ${verifyCount} areas now linked to ${TARGET_CLIENT_EMAIL}\n`);

    await mongoose.disconnect();
    console.log('🔌 Disconnected. Done!');
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
