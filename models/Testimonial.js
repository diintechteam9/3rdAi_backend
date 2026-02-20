import mongoose from 'mongoose';

const testimonialSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  image: {
    type: String,
    default: null
  },
  imageKey: {
    type: String,
    default: null
    // S3 object key for generating presigned URLs
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

// Index for better query performance
testimonialSchema.index({ clientId: 1, createdAt: -1 });
testimonialSchema.index({ rating: 1 });

const Testimonial = mongoose.model('Testimonial', testimonialSchema);

export default Testimonial;