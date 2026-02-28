import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';

// Generate unique client ID (e.g., CLI-ABC123)
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

const clientSchema = new mongoose.Schema({
  // Unique Client ID for user registration
  clientId: {
    type: String,
    unique: true,
    uppercase: true,
    trim: true
    // NOT required - will be auto-generated
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  // Police Geo-Routing System Info
  organizationName: {
    type: String,
    required: true,
    trim: true
  },
  state: {
    type: String,
    required: true,
    trim: true
  },
  city: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  contactNumber: {
    type: String,
    required: true,
    trim: true
  },
  alternateContact: {
    type: String,
    trim: true
  },
  cityBoundary: {
    type: String,
    required: true,
    enum: ['Delhi', 'Bangalore']
  },
  // Relationships
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  loginApproved: {
    type: Boolean,
    default: false
  },
  // Per-client settings (e.g. AI API keys for conversation summary)
  settings: {
    geminiApiKey: { type: String, default: null, trim: true },
    openaiApiKey: { type: String, default: null, trim: true }
  }
}, {
  timestamps: true
});

// Generate unique client ID BEFORE validation
clientSchema.pre('validate', async function (next) {
  // Only generate clientId if it doesn't exist
  if (!this.clientId) {
    let unique = false;
    let generatedId;

    // Keep trying until we get a unique ID
    while (!unique) {
      generatedId = `CLI-${nanoid()}`;
      const existing = await mongoose.model('Client').findOne({ clientId: generatedId });
      if (!existing) {
        unique = true;
      }
    }

    this.clientId = generatedId;
    console.log('Auto-generated clientId:', generatedId);
  }

  next();
});

// Hash password before saving
clientSchema.pre('save', async function (next) {
  // Hash password only if it's modified
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  next();
});

// Compare password method
clientSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
clientSchema.methods.toJSON = function () {
  const clientObject = this.toObject();
  delete clientObject.password;
  return clientObject;
};

const Client = mongoose.model('Client', clientSchema);

export default Client;