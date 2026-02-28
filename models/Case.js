import mongoose from 'mongoose';

const caseSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    // Who reported the case
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Tenant: which client's zone this falls in (auto-set from area)
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        default: null,
        index: true
    },
    // Auto-assigned partner from geo-routing
    partnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Partner',
        default: null,
        index: true
    },
    // Which pincode/area polygon contains this case
    assignedAreaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Area',
        default: null
    },
    // GPS point where case was submitted [longitude, latitude]
    location: {
        type: {
            type: String,
            enum: ['Point'],
            required: true
        },
        coordinates: {
            type: [Number],
            required: true
        }
    },
    status: {
        type: String,
        enum: ['pending', 'assigned', 'in-progress', 'attended', 'resolved', 'closed'],
        default: 'pending'
    },
    // Officer/partner notes when attending
    attendedNote: {
        type: String,
        default: ''
    },
    attendedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// 2dsphere index for geo spatial queries
caseSchema.index({ location: '2dsphere' });

// Composite indexes for fast dashboard queries
caseSchema.index({ clientId: 1, createdAt: -1 });
caseSchema.index({ partnerId: 1, status: 1, createdAt: -1 });
caseSchema.index({ assignedAreaId: 1, status: 1 });

export default mongoose.model('Case', caseSchema);
