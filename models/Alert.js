import mongoose from 'mongoose';

const VALID_STATUSES = ['Reported', 'Under Review', 'Verified', 'Action Taken', 'Resolved', 'Rejected'];

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
            required: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        // Partner currently handling this case
        assignedPartnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Partner',
            default: null
        },
        metadata: {
            type: Object,
            default: {}
        },
        status: {
            type: String,
            enum: VALID_STATUSES,
            default: 'Reported'
        },
        timeline: [
            {
                status: {
                    type: String,
                    enum: VALID_STATUSES
                },
                // Category-specific operational basis for the status update
                basisType: {
                    type: String,
                    default: null
                },
                timestamp: {
                    type: Date,
                    default: Date.now
                },
                note: {
                    type: String,
                    default: ''
                },
                updatedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    default: null
                },
                updatedByName: {
                    type: String,
                    default: null
                }
            }
        ],
        isActive: {
            type: Boolean,
            default: true
        },
        // ── GEO ROUTING FIELDS ────────────────────────────────────────────────
        // GPS coordinates where citizen submitted the case
        location: {
            type: {
                type: String,
                enum: ['Point']
            },
            coordinates: {
                type: [Number] // [longitude, latitude]
            }
        },
        // Area polygon that matched the GPS point
        areaId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Area',
            default: null
        },
        // Auto-assigned partner based on area (redundant with assignedPartnerId but explicit)
        routedPartnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Partner',
            default: null
        }
    },
    {
        timestamps: true
    }
);

// Pre-save middleware to add initial timeline entry if new
alertSchema.pre('save', function (next) {
    if (this.isNew && this.timeline.length === 0) {
        this.timeline.push({
            status: 'Reported',
            timestamp: new Date(),
            note: 'Case reported by citizen',
            updatedBy: this.createdBy,
            basisType: null,
            updatedByName: 'Citizen'
        });
    }
    next();
});

// Indexes for fast queries
alertSchema.index({ clientId: 1, isActive: 1, createdAt: -1 });
alertSchema.index({ clientId: 1, status: 1, createdAt: -1 });
alertSchema.index({ assignedPartnerId: 1, status: 1, createdAt: -1 });
// 2dsphere — required for $geoIntersects lookups when citizen submits with GPS
alertSchema.index({ location: '2dsphere' });
// Compound index for area-based partner dashboard queries
alertSchema.index({ areaId: 1, status: 1, createdAt: -1 });

const Alert = mongoose.model('Alert', alertSchema);
export default Alert;
