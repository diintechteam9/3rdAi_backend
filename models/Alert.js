import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        },
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000
        },
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium'
        },
        type: {
            type: String,
            enum: ['CLIENT', 'USER'],
            default: 'CLIENT'
        },
        // Tenant isolation — which client's partners see this
        clientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Client',
            required: true,
            index: true
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            // Could be Client or User, dropping strict ref for flexibility
            required: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        metadata: {
            type: Object,
            default: {}
        },
        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

// Index for fast partner-side queries
alertSchema.index({ clientId: 1, isActive: 1, createdAt: -1 });

const Alert = mongoose.model('Alert', alertSchema);
export default Alert;
