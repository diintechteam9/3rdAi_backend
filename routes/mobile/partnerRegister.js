/**
 * Partner Multi-Step Registration Routes
 * POST /api/mobile/partner/register/step1          — Email + Password → Send Email OTP
 * POST /api/mobile/partner/register/step1/verify   — Verify Email OTP
 * POST /api/mobile/partner/register/step1/google   — Google Sign-In (skips email OTP)
 * POST /api/mobile/partner/register/step2          — Phone → Send Phone OTP
 * POST /api/mobile/partner/register/step2/verify   — Verify Phone OTP
 * POST /api/mobile/partner/register/step2/resend   — Resend Phone OTP
 * POST /api/mobile/partner/register/step3          — Profile Details
 * POST /api/mobile/partner/register/step4          — Profile Image Upload (multipart)
 * POST /api/mobile/partner/register/resend-email-otp — Resend Email OTP
 */

import express from 'express';
import multer from 'multer';
import { OAuth2Client } from 'google-auth-library';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

import Partner from '../../models/Partner.js';
import Client from '../../models/Client.js';
import { generateToken, authenticate } from '../../middleware/auth.js';
import {
    generateOTP,
    getOTPExpiry,
    validateOTP,
    sendEmailOTP,
    sendMobileOTP,
} from '../../utils/otp.js';
import { s3Client, getobject } from '../../utils/s3.js';

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Multer: memory storage, 5 MB limit, images only
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'), false);
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function resolveClient(clientCode) {
    if (!clientCode) throw new Error('Client ID is required');
    const doc = await Client.findOne({ clientId: clientCode.toString().toUpperCase() });
    if (!doc) throw new Error('Invalid Client ID');
    if (!doc.isActive) throw new Error('Client account is inactive');
    return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Send Email OTP
// Body: { email, password, clientId }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/step1', async (req, res) => {
    try {
        const { email, password, clientId: clientCode } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const clientDoc = await resolveClient(clientCode);

        // Check if already fully registered
        let partner = await Partner.findOne({ email: email.toLowerCase(), clientId: clientDoc._id });
        if (partner && partner.registrationStep === 3) {
            return res.status(400).json({ success: false, message: 'Partner already registered with this email' });
        }

        const otp = generateOTP();
        const otpExpiry = getOTPExpiry();

        if (partner) {
            partner.emailOtp = otp;
            partner.emailOtpExpiry = otpExpiry;
            if (password) partner.password = password;
            partner.emailVerified = false;
        } else {
            partner = new Partner({
                email: email.toLowerCase(),
                password,
                emailOtp: otp,
                emailOtpExpiry: otpExpiry,
                registrationStep: 0,
                emailVerified: false,
                verificationStatus: 'pending',
                isVerified: false,
                isActive: false,
                clientId: clientDoc._id,
            });
        }

        await partner.save();

        const emailResult = await sendEmailOTP(email, otp);
        if (!emailResult.success) {
            console.warn('[PartnerReg] Email OTP issue (non-fatal):', emailResult.message);
        }

        res.json({
            success: true,
            message: 'OTP sent to your email. Please verify to continue.',
            data: { email: partner.email, clientId: clientDoc.clientId, clientName: clientDoc.businessName },
        });
    } catch (err) {
        console.error('[PartnerReg] step1 error:', err);
        res.status(500).json({ success: false, message: err.message || 'Step 1 failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 VERIFY — Verify Email OTP
// Body: { email, otp, clientId }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/step1/verify', async (req, res) => {
    try {
        const { email, otp, clientId: clientCode } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ success: false, message: 'Email and OTP are required' });
        }

        const clientDoc = await resolveClient(clientCode);
        const partner = await Partner.findOne({ email: email.toLowerCase(), clientId: clientDoc._id });

        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found. Start registration again.' });
        }

        const validation = validateOTP(partner.emailOtp, otp, partner.emailOtpExpiry);
        if (!validation.valid) {
            return res.status(400).json({ success: false, message: validation.message });
        }

        partner.emailVerified = true;
        partner.emailOtp = null;
        partner.emailOtpExpiry = null;
        partner.registrationStep = Math.max(partner.registrationStep || 0, 1);
        await partner.save();

        res.json({
            success: true,
            message: 'Email verified successfully! Now verify your phone number.',
            data: { email: partner.email, emailVerified: true, clientId: clientDoc.clientId },
        });
    } catch (err) {
        console.error('[PartnerReg] step1/verify error:', err);
        res.status(500).json({ success: false, message: err.message || 'Verification failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Resend Email OTP
// Body: { email, clientId }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/resend-email-otp', async (req, res) => {
    try {
        const { email, clientId: clientCode } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

        const clientDoc = await resolveClient(clientCode);
        const partner = await Partner.findOne({ email: email.toLowerCase(), clientId: clientDoc._id });
        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found' });
        }

        const otp = generateOTP();
        partner.emailOtp = otp;
        partner.emailOtpExpiry = getOTPExpiry();
        await partner.save();

        await sendEmailOTP(email, otp);

        res.json({ success: true, message: 'OTP resent to your email' });
    } catch (err) {
        console.error('[PartnerReg] resend-email-otp error:', err);
        res.status(500).json({ success: false, message: err.message || 'Failed to resend OTP' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 GOOGLE — Google Sign-In (replace email OTP with Google)
// Body: { credential, clientId }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/step1/google', async (req, res) => {
    try {
        const { credential, clientId: clientCode } = req.body;
        if (!credential) {
            return res.status(400).json({ success: false, message: 'Google credential is required' });
        }

        const clientDoc = await resolveClient(clientCode);

        // Verify Google token
        let payload;
        try {
            const ticket = await googleClient.verifyIdToken({
                idToken: credential,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            payload = ticket.getPayload();
        } catch (verifyErr) {
            console.error('[PartnerReg] Google token error:', verifyErr);
            return res.status(401).json({ success: false, message: 'Invalid Google credential' });
        }

        const email = payload.email;
        const name = payload.name;
        const picture = payload.picture;
        const emailVerified = payload.email_verified;

        let partner = await Partner.findOne({ email: email.toLowerCase(), clientId: clientDoc._id });

        if (partner && partner.registrationStep >= 3) {
            return res.json({
                success: true,
                message: 'Partner already registered. Please login.',
                registrationComplete: true,
                data: { email, clientId: clientDoc.clientId, clientName: clientDoc.businessName },
            });
        }

        if (partner) {
            partner.emailVerified = true;
            partner.authMethod = 'google';
            if (name && !partner.name) partner.name = name;
            if (picture && !partner.profilePicture) partner.profilePicture = picture;
            partner.registrationStep = Math.max(partner.registrationStep || 0, 1);
        } else {
            partner = new Partner({
                email: email.toLowerCase(),
                password: 'google_auth_' + Date.now(),
                name,
                profilePicture: picture || null,
                authMethod: 'google',
                emailVerified: emailVerified !== false,
                registrationStep: 1,
                verificationStatus: 'pending',
                isVerified: false,
                isActive: false,
                clientId: clientDoc._id,
            });
        }

        await partner.save();

        res.json({
            success: true,
            message: 'Email verified via Google! Please continue with phone verification.',
            registrationComplete: false,
            data: {
                email: partner.email,
                emailVerified: true,
                registrationStep: partner.registrationStep,
                nextStep: 'phone_verification',
                clientId: clientDoc.clientId,
                clientName: clientDoc.businessName,
            },
        });
    } catch (err) {
        console.error('[PartnerReg] step1/google error:', err);
        res.status(500).json({ success: false, message: err.message || 'Google sign-in failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Send Phone OTP
// Body: { email, phone, otpMethod: 'twilio'|'gupshup'|'whatsapp', clientId }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/step2', async (req, res) => {
    try {
        const { email, phone, otpMethod = 'gupshup', clientId: clientCode } = req.body;
        if (!phone) {
            return res.status(400).json({ success: false, message: 'Phone number is required' });
        }

        const clientDoc = await resolveClient(clientCode);
        const partner = await Partner.findOne({ email: email?.toLowerCase(), clientId: clientDoc._id });
        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found. Please complete step 1 first.' });
        }

        // Check phone not taken by another verified partner
        const phoneConflict = await Partner.findOne({
            clientId: clientDoc._id,
            phone,
            _id: { $ne: partner._id },
            phoneVerified: true,
        });
        if (phoneConflict) {
            return res.status(400).json({ success: false, message: 'Phone number already registered for this client' });
        }

        const otp = generateOTP();
        partner.phone = phone;
        partner.phoneOtp = otp;
        partner.phoneOtpExpiry = getOTPExpiry();
        partner.phoneOtpMethod = otpMethod;
        await partner.save();

        const result = await sendMobileOTP(phone, otp, otpMethod);
        if (!result.success) {
            console.warn('[PartnerReg] Phone OTP send issue (non-fatal):', result.message);
        }

        res.json({
            success: true,
            message: `OTP sent to your phone via ${otpMethod.toUpperCase()}.`,
            data: { email: partner.email, phone, otpMethod, clientId: clientDoc.clientId },
        });
    } catch (err) {
        console.error('[PartnerReg] step2 error:', err);
        res.status(500).json({ success: false, message: err.message || 'Step 2 failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 VERIFY — Verify Phone OTP
// Body: { email, otp, clientId }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/step2/verify', async (req, res) => {
    try {
        const { email, otp, clientId: clientCode } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ success: false, message: 'Email and OTP are required' });
        }

        const clientDoc = await resolveClient(clientCode);
        const partner = await Partner.findOne({ email: email.toLowerCase(), clientId: clientDoc._id });
        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found' });
        }

        const validation = validateOTP(partner.phoneOtp, otp, partner.phoneOtpExpiry);
        if (!validation.valid) {
            return res.status(400).json({ success: false, message: validation.message });
        }

        partner.phoneVerified = true;
        partner.phoneOtp = null;
        partner.phoneOtpExpiry = null;
        partner.phoneOtpMethod = null;
        partner.registrationStep = Math.max(partner.registrationStep || 0, 2);
        await partner.save();

        res.json({
            success: true,
            message: 'Phone verified successfully! Please complete your profile.',
            data: { email: partner.email, phoneVerified: true, clientId: clientDoc.clientId },
        });
    } catch (err) {
        console.error('[PartnerReg] step2/verify error:', err);
        res.status(500).json({ success: false, message: err.message || 'Verification failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Resend Phone OTP
// Body: { email, otpMethod, clientId }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/step2/resend', async (req, res) => {
    try {
        const { email, otpMethod = 'gupshup', clientId: clientCode } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

        const clientDoc = await resolveClient(clientCode);
        const partner = await Partner.findOne({ email: email.toLowerCase(), clientId: clientDoc._id });
        if (!partner || !partner.phone) {
            return res.status(404).json({ success: false, message: 'Partner or phone not found. Complete step 2 first.' });
        }

        const otp = generateOTP();
        partner.phoneOtp = otp;
        partner.phoneOtpExpiry = getOTPExpiry();
        partner.phoneOtpMethod = otpMethod;
        await partner.save();

        await sendMobileOTP(partner.phone, otp, otpMethod);

        res.json({ success: true, message: 'OTP resent to your phone' });
    } catch (err) {
        console.error('[PartnerReg] step2/resend error:', err);
        res.status(500).json({ success: false, message: err.message || 'Failed to resend OTP' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Profile Details
// Body: { email, clientId, name, designation, area, state, policeId, experience }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/step3', async (req, res) => {
    try {
        const { email, clientId: clientCode, name, designation, area, state, policeId, experience } = req.body;

        if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
        if (!name || !designation || !area || !state || !policeId) {
            return res.status(400).json({
                success: false,
                message: 'Name, Designation, Area, State and Police ID are required',
            });
        }

        const clientDoc = await resolveClient(clientCode);
        const partner = await Partner.findOne({ email: email.toLowerCase(), clientId: clientDoc._id });
        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found. Complete steps 1 and 2 first.' });
        }

        // Save profile — registration not yet complete; partner still needs approval
        partner.name = name;
        partner.designation = designation;
        partner.location = { area, state };
        partner.policeId = policeId;
        partner.experience = Number(experience) || 0;
        partner.registrationStep = Math.max(partner.registrationStep || 0, 3);
        // Partner stays isActive=false / verificationStatus=pending until client approves
        await partner.save();

        // Issue a temporary token so step 4 (image upload) can be authenticated
        const token = generateToken(partner._id, 'partner', partner.clientId);

        res.json({
            success: true,
            message: 'Profile saved! Please upload your profile photo.',
            data: {
                token,
                email: partner.email,
                registrationStep: 3,
                clientId: clientDoc.clientId,
                clientName: clientDoc.businessName,
            },
        });
    } catch (err) {
        console.error('[PartnerReg] step3 error:', err);
        res.status(500).json({ success: false, message: err.message || 'Step 3 failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Upload Profile Image  (requires the token from step 3)
// Headers: Authorization: Bearer <token>
// Content-Type: multipart/form-data   Field: image
// ─────────────────────────────────────────────────────────────────────────────
router.post('/step4', authenticate, upload.single('image'), async (req, res) => {
    try {
        if (req.user.role !== 'partner') {
            return res.status(403).json({ success: false, message: 'Access denied. Partner token required.' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Image file is required (field name: image)' });
        }

        const partner = await Partner.findById(req.user._id);
        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found' });
        }

        const ext = req.file.originalname.split('.').pop() || 'jpg';
        const imageKey = `images/partner/${partner._id}/profile/${uuidv4()}.${ext}`;

        const uploadCmd = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: imageKey,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        });
        await s3Client.send(uploadCmd);

        partner.profilePicture = imageKey;
        partner.profilePictureKey = imageKey;
        // Keep registrationStep=3, verificationStatus='pending', isActive=false
        // Partner goes to "Waiting for Approval" — client must approve
        await partner.save();

        let profileImageUrl = null;
        try {
            profileImageUrl = await getobject(imageKey);
        } catch (_) { /* non-fatal */ }

        res.json({
            success: true,
            message: 'Registration complete! Your account is pending approval from the organization.',
            data: {
                partner: {
                    id: partner._id,
                    name: partner.name,
                    email: partner.email,
                    profilePicture: profileImageUrl,
                    verificationStatus: partner.verificationStatus,
                },
                requiresApproval: true,
            },
        });
    } catch (err) {
        console.error('[PartnerReg] step4 error:', err);
        res.status(500).json({ success: false, message: err.message || 'Step 4 failed' });
    }
});

export default router;
