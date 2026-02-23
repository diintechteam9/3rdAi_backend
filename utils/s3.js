import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['R2_ACCESS_KEY', 'R2_SECRET_KEY', 'R2_BUCKET', 'R2_ENDPOINT'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

let s3Client;

if (missingEnvVars.length > 0) {
  console.warn('⚠️  Missing R2 environment variables:', missingEnvVars);
  console.warn('Cloudflare R2 functionality will be disabled until these are configured.');
  s3Client = {
    send: async () => { throw new Error('R2 not configured'); }
  };
} else {
  s3Client = new S3Client({
    region: 'auto', // R2 requires 'auto'
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY,
      secretAccessKey: process.env.R2_SECRET_KEY,
    },
  });
}

// Generate presigned URL for uploading
export const putobject = async (key, contentType) => {
  try {
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
    return signedUrl;
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    throw error;
  }
};

// Generate presigned URL for direct browser upload
export const generateUploadUrl = async (fileName, contentType, folder) => {
  try {
    // Generate unique key with timestamp and random ID
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const fileExtension = fileName.split('.').pop();
    const uniqueFileName = `${timestamp}_${randomId}.${fileExtension}`;
    const key = folder ? `${folder}/${uniqueFileName}` : uniqueFileName;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
      CacheControl: 'max-age=31536000',
      Metadata: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, HEAD',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    // For R2, the public URL is either a custom domain or we use the presigned GET URL strategy.
    // If R2_PUBLIC_URL is provided, we use it, otherwise fallback to endpoint/bucket style.
    const baseUrl = process.env.R2_PUBLIC_URL || `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET}`;
    const fileUrl = `${baseUrl}/${key}`;

    return { uploadUrl, fileUrl, key };
  } catch (error) {
    console.error('Error generating upload URL:', error);
    throw error;
  }
};

// Generate presigned URL for getting/reading an object
export const getobject = async (key, expiresIn = 604800) => {
  try {
    // If key is a URL, extract the key first
    const actualKey = key.startsWith('http') ? extractS3KeyFromUrl(key) : key;

    if (!actualKey) {
      throw new Error('Invalid R2 key provided');
    }

    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: actualKey,
      ResponseContentDisposition: 'inline',
      ResponseContentType: actualKey.match(/\.(mp4|webm|ogg)$/i) ? 'video/mp4' :
        actualKey.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image/jpeg' : undefined,
      ResponseCacheControl: 'max-age=31536000, public',
      ResponseExpires: new Date(Date.now() + expiresIn * 1000).toISOString()
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    console.error('Error generating get presigned URL:', error);
    throw error;
  }
};

// Generate presigned URL for a specific bucket and key
export const getobjectFor = async (bucket, key) => {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: 'inline',
      ResponseContentType: key.endsWith('.txt') ? 'text/plain; charset=utf-8' : undefined,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 604800 });
    return signedUrl;
  } catch (error) {
    console.error('Error generating get presigned URL for bucket:', error);
    throw error;
  }
};

// Generate presigned URL for a specific bucket and region
export const getobjectForWithRegion = async (bucket, key, region) => {
  try {
    const regionalClient = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY,
        secretAccessKey: process.env.R2_SECRET_KEY,
      },
    });
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: 'inline',
      ResponseContentType: key.endsWith('.txt') ? 'text/plain; charset=utf-8' : undefined,
    });
    const signedUrl = await getSignedUrl(regionalClient, command, { expiresIn: 604800 });
    return signedUrl;
  } catch (error) {
    console.error('Error generating regional presigned URL:', error);
    throw error;
  }
};

export const deleteObject = async (key) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
    });

    await s3Client.send(command);
  } catch (error) {
    console.error('Error deleting object:', error);
    throw error;
  }
};

/**
 * Extract S3 key from S3 URL
 * Supports multiple S3 URL formats:
 * - https://bucket.s3.region.amazonaws.com/key
 * - https://bucket.s3.amazonaws.com/key
 * - s3://bucket/key
 */
export const extractS3KeyFromUrl = (url) => {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Handle s3:// protocol
  if (url.startsWith('s3://')) {
    const parts = url.replace('s3://', '').split('/');
    if (parts.length > 1) {
      return parts.slice(1).join('/');
    }
    return null;
  }

  // Handle HTTP/HTTPS URLs
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const urlObj = new URL(url);
      // Remove leading slash from pathname
      const key = urlObj.pathname.substring(1);
      return key || null;
    } catch (error) {
      console.error('Error parsing storage URL:', error);
      // Fallback: try to extract key manually
      // This will match an R2 endpoint or S3 endpoint
      const match = url.match(/(?:s3[.-][^.]+\.amazonaws\.com|r2\.cloudflarestorage\.com)\/(.+)$/);
      if (match && match[1]) {
        // Handle bucket name in path for R2 (e.g., /bucket-name/key)
        const pathParts = match[1].split('/');
        if (pathParts.length > 1 && pathParts[0] === process.env.R2_BUCKET) {
          return decodeURIComponent(pathParts.slice(1).join('/'));
        }
        return decodeURIComponent(match[1]);
      }
      return null;
    }
  }

  // If it's already a key (no http:// or s3://), return as-is
  return url;
};

// Upload file directly to S3
export const uploadToS3 = async (file, folder = '') => {
  console.log('=== R2 UPLOAD START ===');
  console.log('File details:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    hasBuffer: !!file.buffer,
    bufferLength: file.buffer?.length
  });
  console.log('R2 Config:', {
    region: 'auto',
    bucket: process.env.R2_BUCKET,
    hasAccessKey: !!process.env.R2_ACCESS_KEY,
    hasSecretKey: !!process.env.R2_SECRET_KEY
  });

  try {
    // Validate required fields
    if (!file || !file.buffer) {
      throw new Error('Invalid file: missing file buffer');
    }

    if (!process.env.R2_BUCKET) {
      throw new Error('R2_BUCKET not configured');
    }

    if (!process.env.R2_ACCESS_KEY || !process.env.R2_SECRET_KEY) {
      throw new Error('R2 credentials not configured');
    }

    // Clean filename - remove spaces and special characters
    const cleanFileName = file.originalname
      .replace(/\s+/g, '_')  // Replace spaces with underscores
      .replace(/[^a-zA-Z0-9._-]/g, '')  // Remove special characters
      .toLowerCase();

    const key = folder ? `${folder}/${Date.now()}-${cleanFileName}` : `${Date.now()}-${cleanFileName}`;
    console.log('Generated R2 key:', key);

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      CacheControl: 'max-age=31536000',
      // Add metadata for better handling
      Metadata: {
        'uploaded-by': 'brahmkosh-app',
        'upload-timestamp': Date.now().toString()
      }
    });
    console.log('R2 command created, sending...');

    const result = await s3Client.send(command);
    console.log('R2 upload result:', result);

    // Return both key and URL for storage
    const baseUrl = process.env.R2_PUBLIC_URL || `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET}`;
    const fileUrl = `${baseUrl}/${key}`;
    console.log('Generated file URL:', fileUrl);

    return {
      key: key,
      Location: fileUrl,  // Add Location for backward compatibility
      url: fileUrl
    };
  } catch (error) {
    console.error('=== R2 UPLOAD ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);
    throw error;
  }
};

// Delete file from S3 using URL or key
export const deleteFromS3 = async (keyOrUrl) => {
  try {
    let key;

    // Check if it's a URL or just a key
    if (keyOrUrl.startsWith('http')) {
      // Extract key from S3 URL
      const url = new URL(keyOrUrl);
      key = url.pathname.substring(1); // Remove leading slash
    } else {
      // It's already a key
      key = keyOrUrl;
    }

    const command = new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
    });

    await s3Client.send(command);
  } catch (error) {
    console.error('Error deleting from R2:', error);
    throw error;
  }
};

export { s3Client };
