/**
 * Migration Script: Extract S3 Keys from URLs
 * 
 * This script:
 * 1. Finds all records with S3 URLs but no keys
 * 2. Extracts S3 keys from URLs
 * 3. Updates records with the extracted keys
 * 
 * Run with: node backend/scripts/migrate-s3-keys.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { extractS3KeyFromUrl } from '../utils/s3.js';
import Testimonial from '../models/Testimonial.js';
import FounderMessage from '../models/FounderMessage.js';
import BrandAsset from '../models/BrandAsset.js';
import Meditation from '../models/Meditation.js';
import Chanting from '../models/Chanting.js';
import Review from '../models/Review.js';
import SpiritualClip from '../models/SpiritualClip.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/brahmakosh';

const migrateModel = async (Model, modelName, urlField, keyField) => {
  console.log(`\n=== Migrating ${modelName} ===`);
  
  try {
    // Find all records with URL but no key
    const records = await Model.find({
      [urlField]: { $exists: true, $ne: null, $ne: '' },
      $or: [
        { [keyField]: { $exists: false } },
        { [keyField]: null },
        { [keyField]: '' }
      ]
    });
    
    console.log(`Found ${records.length} ${modelName} records to migrate`);
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const record of records) {
      try {
        const url = record[urlField];
        if (!url) {
          skipped++;
          continue;
        }
        
        // Extract key from URL
        const key = extractS3KeyFromUrl(url);
        
        if (!key) {
          console.warn(`  ⚠️  Could not extract key from URL: ${url} (ID: ${record._id})`);
          skipped++;
          continue;
        }
        
        // Update record
        record[keyField] = key;
        await record.save();
        
        updated++;
        if (updated % 10 === 0) {
          console.log(`  ✓ Updated ${updated}/${records.length} records...`);
        }
      } catch (error) {
        console.error(`  ❌ Error updating record ${record._id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`  ✅ ${modelName}: ${updated} updated, ${skipped} skipped, ${errors} errors`);
    return { updated, skipped, errors };
  } catch (error) {
    console.error(`  ❌ Error migrating ${modelName}:`, error);
    return { updated: 0, skipped: 0, errors: 1 };
  }
};

const runMigration = async () => {
  try {
    console.log('🚀 Starting S3 Key Migration...');
    console.log('Connecting to MongoDB...');
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to MongoDB\n');
    
    const results = {
      testimonials: { updated: 0, skipped: 0, errors: 0 },
      founderMessages: { updated: 0, skipped: 0, errors: 0 },
      brandAssets: { updated: 0, skipped: 0, errors: 0 },
      meditations: { updated: 0, skipped: 0, errors: 0 },
      chantings: { updated: 0, skipped: 0, errors: 0 },
      reviews: { updated: 0, skipped: 0, errors: 0 },
      spiritualClips: { updated: 0, skipped: 0, errors: 0 }
    };
    
    // Migrate Reviews
    results.reviews = await migrateModel(Review, 'Reviews', 'userImage', 'userImageKey');
    
    // Migrate Testimonials
    results.testimonials = await migrateModel(Testimonial, 'Testimonials', 'image', 'imageKey');
    
    // Migrate Founder Messages
    results.founderMessages = await migrateModel(FounderMessage, 'FounderMessages', 'founderImage', 'founderImageKey');
    
    // Migrate Brand Assets
    results.brandAssets = await migrateModel(BrandAsset, 'BrandAssets', 'brandLogoImage', 'brandLogoImageKey');
    
    // Migrate Meditations (has both videoUrl and imageUrl)
    console.log(`\n=== Migrating Meditations ===`);
    const meditations = await Meditation.find({
      $or: [
        { videoUrl: { $exists: true, $ne: null, $ne: '' } },
        { imageUrl: { $exists: true, $ne: null, $ne: '' } }
      ],
      $or: [
        { videoKey: { $exists: false } },
        { videoKey: null },
        { videoKey: '' },
        { imageKey: { $exists: false } },
        { imageKey: null },
        { imageKey: '' }
      ]
    });
    
    console.log(`Found ${meditations.length} Meditation records to migrate`);
    let medUpdated = 0;
    for (const meditation of meditations) {
      let needsSave = false;
      
      if (meditation.videoUrl && !meditation.videoKey) {
        const key = extractS3KeyFromUrl(meditation.videoUrl);
        if (key) {
          meditation.videoKey = key;
          needsSave = true;
        }
      }
      
      if (meditation.imageUrl && !meditation.imageKey) {
        const key = extractS3KeyFromUrl(meditation.imageUrl);
        if (key) {
          meditation.imageKey = key;
          needsSave = true;
        }
      }
      
      if (needsSave) {
        await meditation.save();
        medUpdated++;
      }
    }
    results.meditations = { updated: medUpdated, skipped: meditations.length - medUpdated, errors: 0 };
    console.log(`  ✅ Meditations: ${medUpdated} updated`);
    
    // Migrate Chantings (has both videoUrl and imageUrl)
    console.log(`\n=== Migrating Chantings ===`);
    const chantings = await Chanting.find({
      $or: [
        { videoUrl: { $exists: true, $ne: null, $ne: '' } },
        { imageUrl: { $exists: true, $ne: null, $ne: '' } }
      ],
      $or: [
        { videoKey: { $exists: false } },
        { videoKey: null },
        { videoKey: '' },
        { imageKey: { $exists: false } },
        { imageKey: null },
        { imageKey: '' }
      ]
    });
    
    console.log(`Found ${chantings.length} Chanting records to migrate`);
    let chantUpdated = 0;
    for (const chanting of chantings) {
      let needsSave = false;
      
      if (chanting.videoUrl && !chanting.videoKey) {
        const key = extractS3KeyFromUrl(chanting.videoUrl);
        if (key) {
          chanting.videoKey = key;
          needsSave = true;
        }
      }
      
      if (chanting.imageUrl && !chanting.imageKey) {
        const key = extractS3KeyFromUrl(chanting.imageUrl);
        if (key) {
          chanting.imageKey = key;
          needsSave = true;
        }
      }
      
      if (needsSave) {
        await chanting.save();
        chantUpdated++;
      }
    }
    results.chantings = { updated: chantUpdated, skipped: chantings.length - chantUpdated, errors: 0 };
    console.log(`  ✅ Chantings: ${chantUpdated} updated`);
    
    // Migrate SpiritualClips (has both videoUrl and audioUrl)
    console.log(`\n=== Migrating SpiritualClips ===`);
    const spiritualClips = await SpiritualClip.find({
      $or: [
        { videoUrl: { $exists: true, $ne: null, $ne: '' } },
        { audioUrl: { $exists: true, $ne: null, $ne: '' } }
      ],
      $or: [
        { videoKey: { $exists: false } },
        { videoKey: null },
        { videoKey: '' },
        { audioKey: { $exists: false } },
        { audioKey: null },
        { audioKey: '' }
      ]
    });
    
    console.log(`Found ${spiritualClips.length} SpiritualClip records to migrate`);
    let clipUpdated = 0;
    for (const clip of spiritualClips) {
      let needsSave = false;
      
      if (clip.videoUrl && !clip.videoKey) {
        const key = extractS3KeyFromUrl(clip.videoUrl);
        if (key) {
          clip.videoKey = key;
          needsSave = true;
        }
      }
      
      if (clip.audioUrl && !clip.audioKey) {
        const key = extractS3KeyFromUrl(clip.audioUrl);
        if (key) {
          clip.audioKey = key;
          needsSave = true;
        }
      }
      
      if (needsSave) {
        await clip.save();
        clipUpdated++;
      }
    }
    results.spiritualClips = { updated: clipUpdated, skipped: spiritualClips.length - clipUpdated, errors: 0 };
    console.log(`  ✅ SpiritualClips: ${clipUpdated} updated`);
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(50));
    const totalUpdated = Object.values(results).reduce((sum, r) => sum + r.updated, 0);
    const totalSkipped = Object.values(results).reduce((sum, r) => sum + r.skipped, 0);
    const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors, 0);
    
    console.log(`Total Updated: ${totalUpdated}`);
    console.log(`Total Skipped: ${totalSkipped}`);
    console.log(`Total Errors: ${totalErrors}`);
    console.log('='.repeat(50));
    console.log('✅ Migration completed!\n');
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run migration
runMigration();
