/**
 * scripts/fix_city_client_isolation.js
 *
 * One-time migration:
 *   - Delhi areas   → linked to the Delhi client (delhipolice01@gmail.com)
 *   - Bangalore areas → linked to the Bangalore client (if exists, else unlinked)
 *
 * Run: node scripts/fix_city_client_isolation.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

// Inline schemas
const clientSchema = new mongoose.Schema({ email: String, city: String, cityBoundary: String, organizationName: String, clientId: String }, { strict: false });
const areaSchema = new mongoose.Schema({ name: String, city: String, clientId: mongoose.Schema.Types.ObjectId, partnerId: mongoose.Schema.Types.ObjectId }, { strict: false });

const Client = mongoose.model('Client', clientSchema);
const Area = mongoose.model('Area', areaSchema);

async function main() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected\n');

    // ── 1. List all Clients ───────────────────────────────────────────────────
    const clients = await Client.find({}).lean();
    console.log(`📋 Found ${clients.length} clients in DB:\n`);
    clients.forEach((c, i) => {
        console.log(`  [${i + 1}] ${c.email}`);
        console.log(`       organizationName : ${c.organizationName || 'N/A'}`);
        console.log(`       cityBoundary     : ${c.cityBoundary || 'N/A'}`);
        console.log(`       city             : ${c.city || 'N/A'}`);
        console.log(`       _id              : ${c._id}\n`);
    });

    // ── 2. Find Delhi client ──────────────────────────────────────────────────
    // Match by cityBoundary='Delhi' OR city contains 'Delhi' OR email contains 'delhi'
    const delhiClient = clients.find(c =>
        c.cityBoundary === 'Delhi' ||
        c.city?.toLowerCase().includes('delhi') ||
        c.email?.toLowerCase().includes('delhi')
    );

    // ── 3. Find Bangalore client ──────────────────────────────────────────────
    const bangaloreClient = clients.find(c =>
        c.cityBoundary === 'Bangalore' ||
        c.city?.toLowerCase().includes('bangalore') ||
        c.city?.toLowerCase().includes('bengaluru') ||
        c.email?.toLowerCase().includes('bangalore') ||
        c.email?.toLowerCase().includes('bengaluru')
    );

    console.log('='.repeat(60));
    if (delhiClient) {
        console.log(`✅ Delhi client   : ${delhiClient.email} (${delhiClient._id})`);
    } else {
        console.warn('⚠️  No Delhi client found — Delhi areas will be unlinked (clientId=null)');
    }
    if (bangaloreClient) {
        console.log(`✅ Bangalore client: ${bangaloreClient.email} (${bangaloreClient._id})`);
    } else {
        console.warn('⚠️  No Bangalore client found — Bangalore areas will be unlinked (clientId=null)');
    }
    console.log('='.repeat(60) + '\n');

    // ── 4. Count areas by city ────────────────────────────────────────────────
    const delhiCount = await Area.countDocuments({ city: 'Delhi' });
    const bangaloreCount = await Area.countDocuments({ city: 'Bangalore' });
    const otherCount = await Area.countDocuments({ city: { $nin: ['Delhi', 'Bangalore'] } });
    console.log(`📊 Areas by city:`);
    console.log(`   Delhi     : ${delhiCount}`);
    console.log(`   Bangalore : ${bangaloreCount}`);
    console.log(`   Other     : ${otherCount}\n`);

    // ── 5. Update Delhi areas ─────────────────────────────────────────────────
    if (delhiClient && delhiCount > 0) {
        const dRes = await Area.updateMany(
            { city: 'Delhi' },
            { $set: { clientId: delhiClient._id } }
        );
        console.log(`✅ Delhi areas updated   : ${dRes.modifiedCount} areas → clientId = ${delhiClient._id}`);
    } else if (!delhiClient && delhiCount > 0) {
        // Unlink Delhi areas (remove wrong clientId)
        const dRes = await Area.updateMany(
            { city: 'Delhi' },
            { $unset: { clientId: '' } }
        );
        console.log(`🔓 Delhi areas unlinked  : ${dRes.modifiedCount} areas (no Delhi client found)`);
    }

    // ── 6. Update Bangalore areas ─────────────────────────────────────────────
    if (bangaloreClient && bangaloreCount > 0) {
        const bRes = await Area.updateMany(
            { city: 'Bangalore' },
            { $set: { clientId: bangaloreClient._id } }
        );
        console.log(`✅ Bangalore areas updated: ${bRes.modifiedCount} areas → clientId = ${bangaloreClient._id}`);
    } else if (!bangaloreClient && bangaloreCount > 0) {
        // Unlink Bangalore areas (so they stop polluting Delhi client)
        const bRes = await Area.updateMany(
            { city: 'Bangalore' },
            { $unset: { clientId: '' } }
        );
        console.log(`🔓 Bangalore areas unlinked: ${bRes.modifiedCount} areas (no Bangalore client found)`);
    }

    // ── 7. Verify ─────────────────────────────────────────────────────────────
    console.log('\n📊 Verification after migration:');
    if (delhiClient) {
        const v1 = await Area.countDocuments({ city: 'Delhi', clientId: delhiClient._id });
        console.log(`   Delhi areas linked to ${delhiClient.email}: ${v1}`);
    }
    if (bangaloreClient) {
        const v2 = await Area.countDocuments({ city: 'Bangalore', clientId: bangaloreClient._id });
        console.log(`   Bangalore areas linked to ${bangaloreClient.email}: ${v2}`);
    }
    const orphan = await Area.countDocuments({ clientId: null });
    const noClientId = await Area.countDocuments({ clientId: { $exists: false } });
    console.log(`   Areas with no clientId: ${orphan + noClientId}`);

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected. Migration complete!\n');
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
