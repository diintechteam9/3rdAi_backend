import mongoose from 'mongoose';

const areaSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        index: true
    },
    city: {
        type: String,
        required: true,
        index: true
    },
    // Which client (city owner) this area belongs to
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        default: null,
        index: true
    },
    // Which partner is responsible for this area
    partnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Partner',
        default: null,
        index: true
    },
    boundary: {
        type: {
            type: String,
            enum: ['Polygon', 'MultiPolygon'],
            required: true
        },
        coordinates: {
            // Supports both Polygon and MultiPolygon coordinate arrays
            type: mongoose.Schema.Types.Mixed,
            required: true
        }
    },
    description: String
}, {
    timestamps: true
});

// 2dsphere index — REQUIRED for $geoIntersects queries
areaSchema.index({ boundary: '2dsphere' });

// Composite indexes for fast partner/client lookups
areaSchema.index({ clientId: 1, city: 1 });
areaSchema.index({ partnerId: 1 });

export default mongoose.model('Area', areaSchema);
