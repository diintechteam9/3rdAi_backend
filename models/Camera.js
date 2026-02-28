import mongoose from 'mongoose';

const cameraSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        index: true
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            required: true
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: true
        }
    },
    radius: {
        type: Number,
        default: 50 // Default radius in meters
    },
    description: String
}, {
    timestamps: true
});

// Create 2dsphere index for location
cameraSchema.index({ location: "2dsphere" });

export default mongoose.model('Camera', cameraSchema);
