import mongoose from 'mongoose';
import dotenv from 'dotenv';

console.log("Starting seed script...");

dotenv.config();
console.log("Loaded env.");

const run = async () => {
    try {
        const User = (await import('./models/User.js')).default;
        console.log("Imported User model.");

        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/brahmakosh';
        console.log("Connecting to:", MONGODB_URI);

        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB.");

        const email = 'admin@gmail.com';
        const password = 'password';

        let user = await User.findOne({ email });

        if (user) {
            console.log('User exists. Updating password...');
            user.password = password;
            user.loginApproved = true;
            user.isActive = true;
            user.emailVerified = true;
            user.registrationStep = 3;
            // Force password hashing if needed, but saving document usually triggers pre value
            // However, simply setting property might not mark it modified if it's the same? 
            // But we want to reset it to 'password'
            user.markModified('password');
        } else {
            console.log('Creating user...');
            user = new User({
                email,
                password,
                profile: { name: 'Admin User' },
                loginApproved: true,
                isActive: true,
                emailVerified: true,
                registrationStep: 3,
                role: 'user' // Although schema doesn't have role explicitly? Wait, userSchema doesn't have role!
                // It has clientId.
            });
        }

        // Remove role if schema doesn't have it
        // userSchema in User.js lines 1-196 does NOT have 'role'.
        // It has clientId.
        if (user.role) delete user.role;

        await user.save();
        console.log('User saved successfully.');
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);

        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
};

run();
