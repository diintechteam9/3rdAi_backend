import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

async function testUpload() {
    try {
        console.log('Testing R2 Upload...');
        console.log('Bucket:', process.env.R2_BUCKET);
        console.log('Endpoint:', process.env.R2_ENDPOINT);

        const command = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: 'test/image_upload_test.txt',
            Body: 'Hello world',
            ContentType: 'text/plain',
        });

        const response = await s3Client.send(command);
        console.log('Upload successful! Response:', response);
    } catch (error) {
        console.error('Upload failed!');
        console.error(error);
    }
}

testUpload();
