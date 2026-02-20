import mongoose from 'mongoose';

const sponsorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  website: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Website must be a valid URL'
    }
  },
  logo: {
    type: String,
    default: null
  },
  logoKey: {
    type: String,
    default: null
    // S3 object key for generating presigned URLs
  },
  sponsorshipType: {
    type: String,
    required: true,
    enum: ['Platinum', 'Gold', 'Silver', 'Bronze'],
    default: 'Gold'
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
sponsorSchema.index({ clientId: 1, createdAt: -1 });
sponsorSchema.index({ sponsorshipType: 1 });
sponsorSchema.index({ isActive: 1 });

const Sponsor = mongoose.model('Sponsor', sponsorSchema);

export default Sponsor;