import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { readdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from parent directory of scripts
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('MONGODB_URI not found in .env');
    process.exit(1);
}

async function initDb() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected successfully to:', mongoose.connection.name);

        const modelsDir = path.join(__dirname, '../models');
        const files = readdirSync(modelsDir).filter(file => file.endsWith('.js'));

        console.log(`Found ${files.length} models. Creating collections...`);

        for (const file of files) {
            const modelPath = `../models/${file}`;
            // Import the model
            const modelModule = await import(modelPath);
            const Model = modelModule.default || modelModule[Object.keys(modelModule)[0]];

            if (Model && Model.prototype instanceof mongoose.Model) {
                const collectionName = Model.collection.name;
                console.log(`- Creating collection for model: ${Model.modelName} (Collection: ${collectionName})`);

                // Mongoose 6+ createCollection
                try {
                    await Model.createCollection();
                    console.log(`  Success: Collection '${collectionName}' created/ready.`);
                } catch (err) {
                    if (err.codeName === 'NamespaceExists') {
                        console.log(`  Info: Collection '${collectionName}' already exists.`);
                    } else {
                        console.error(`  Error creating collection '${collectionName}':`, err.message);
                    }
                }
            } else {
                console.warn(`- Skipping ${file}: Not a valid Mongoose model.`);
            }
        }

        console.log('\nDatabase initialization complete!');
    } catch (error) {
        console.error('Error during database initialization:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

initDb();
