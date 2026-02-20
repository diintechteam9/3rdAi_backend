import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

console.log('Testing MongoDB Connection...');
console.log('URI:', process.env.MONGODB_URI);

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB Connected Successfully!');
        console.log('Database Name:', mongoose.connection.name);
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Connection Failed:', err);
        process.exit(1);
    });
