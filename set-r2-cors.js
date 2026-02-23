import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const s3Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY,
        secretAccessKey: process.env.R2_SECRET_KEY,
    },
});

const configureCors = async () => {
    try {
        const command = new PutBucketCorsCommand({
            Bucket: process.env.R2_BUCKET,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedHeaders: ['*'],
                        AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
                        AllowedOrigins: ['*'], // Allow any origin, or change to ['http://localhost:5173']
                        ExposeHeaders: ['ETag'],
                        MaxAgeSeconds: 3000
                    }
                ]
            }
        });

        const response = await s3Client.send(command);
        console.log('✅ CORS policy successfully applied to R2 bucket:', process.env.R2_BUCKET);
    } catch (error) {
        console.error('❌ Error setting CORS policy:', error);
    }
};

configureCors();
