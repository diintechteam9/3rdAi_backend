import mongoose from 'mongoose';

console.log('FounderMessage model loaded');

const founderMessageSchema = new mongoose.Schema({
  founderName: {
    type: String,
    required: true,
    trim: true
  },
  position: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  founderImage: {
    type: String,
    default: null
  },
  founderImageKey: {
    type: String,
    default: null
    // S3 object key for generating presigned URLs
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft'
  },
  views: {
    type: Number,
    default: 0
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

export default mongoose.model('FounderMessage', founderMessageSchema);