import { s3Client } from './utils/s3.js';
console.log('s3Client properties:', Object.keys(s3Client));
if (s3Client.config) {
    s3Client.config.credentials().then(creds => console.log('creds:', creds)).catch(e => console.error(e));
} else {
    console.log('R2 is probably disabled (mock client)');
}
