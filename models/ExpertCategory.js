import mongoose from 'mongoose';

const expertCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    image: {
        type: String,
        default: null
    },
    imageKey: {
        type: String,
        default: null
    },
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true,
        index: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isDeleted: {
        type: Boolean,
        default: false,
        index: true
    }
}, {
    timestamps: true
});

// Index for name within client scope
expertCategorySchema.index({ name: 1, clientId: 1 }, { unique: true });

export default mongoose.model('ExpertCategory', expertCategorySchema);
