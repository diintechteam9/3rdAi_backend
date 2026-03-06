# 3rdAI — Complete API Documentation

> **Base URL:** `http://localhost:4000/api`
> **Version:** v1.0 | **Updated:** 2026-03-01

---

## 📌 Token Reference

| Role | Token Key | Where Used |
|------|-----------|------------|
| Citizen (User) | `{{token_user}}` | All `/api/alerts/user`, `/api/notifications` routes |
| Partner (Officer) | `{{partner_token}}` | All `/api/alerts/partner`, `/api/partners` routes |
| Client (Police HQ) | `token_client` | All `/api/alerts` (client CRUD) routes |
| Admin / Super Admin | `token_admin` | Admin management routes |

> **Authorization Header Format:** `Bearer <token>`

---

## 🔐 Authentication: How JWT Works

```
Login API call
    → Backend verifies credentials
    → Returns JWT token (valid 7 days)
    → Store token locally (localStorage)
    → Send token in every protected API call header
```

---

---

# 👤 USER

---

## 1. User — Registration

> **Base Path:** `POST /api/mobile/user/register/...`
> **No Auth required for registration steps**

### Flow Overview
```
Step 1: Email + Password → OTP sent to email
Step 1 Verify: Enter email OTP → Email verified
Step 2: Mobile number → OTP sent to mobile
Step 2 Verify: Enter mobile OTP → Mobile verified
Step 3: Complete profile → JWT token returned ✅
Step 4 (Optional): Upload profile image
```

---

### 1.1 Send Email OTP (Step 1)

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/mobile/user/register/step1/:clientId` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{
  "email": "testuser@example.com",
  "password": "Test@1234",
  "clientId": "REPLACE_WITH_CLIENT_ID"
}
```

**Success Response `200`:**
```json
{
  "success": true,
  "message": "OTP sent to your email. Please verify to continue.",
  "data": {
    "email": "testuser@example.com",
    "registrationStep": 1,
    "clientId": "CLI-ABC123"
  }
}
```

> ℹ️ `clientId` is the organization code (e.g. `CLI-ABC123`) given by Police HQ admin.

---

### 1.2 Verify Email OTP (Step 1 Verify)

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/mobile/user/register/step1/verify/:clientId` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{
  "email": "testuser@example.com",
  "otp": "123456",
  "clientId": "REPLACE_WITH_CLIENT_ID"
}
```

**Success Response `200`:**
```json
{
  "success": true,
  "message": "Email verified successfully",
  "data": {
    "email": "testuser@example.com",
    "emailVerified": true,
    "mobileVerified": false,
    "profileCompleted": false
  }
}
```

---

### 1.3 Send Mobile OTP (Step 2)

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/mobile/user/register/step2/:clientId` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{
  "email": "testuser@example.com",
  "mobile": "919876543210",
  "otpMethod": "gupshup",
  "clientId": "REPLACE_WITH_CLIENT_ID"
}
```

> ℹ️ `otpMethod` options: `gupshup` | `twilio` | `whatsapp`
> ℹ️ Mobile format: country code + number (e.g. `919876543210` for India)

**Success Response `200`:**
```json
{
  "success": true,
  "message": "OTP sent to your mobile via GUPSHUP.",
  "data": {
    "email": "testuser@example.com",
    "mobile": "919876543210",
    "otpMethod": "gupshup",
    "registrationStep": 2
  }
}
```

---

### 1.4 Verify Mobile OTP (Step 2 Verify)

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/mobile/user/register/step2/verify/:clientId` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{
  "email": "testuser@example.com",
  "mobile": "919876543210",
  "otp": "123456",
  "clientId": "REPLACE_WITH_CLIENT_ID"
}
```

**Success Response `200`:**
```json
{
  "success": true,
  "message": "Mobile verified successfully",
  "data": {
    "email": "testuser@example.com",
    "mobileVerified": true,
    "emailVerified": true,
    "profileCompleted": false
  }
}
```

---

### 1.5 Complete Profile (Step 3)

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/mobile/user/register/step3/:clientId` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{
  "email": "testuser@example.com",
  "clientId": "REPLACE_WITH_CLIENT_ID",
  "name": "John Doe",
  "policeStation": "Andheri East",
  "address": "123 Main St, Mumbai"
}
```

**Success Response `201`:**
```json
{
  "success": true,
  "message": "Registration complete",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "user": { "id": "...", "email": "testuser@example.com", "name": "John Doe" }
  }
}
```

> ✅ **Save this `token` as `{{token_user}}`** — required for all further authenticated APIs.

---

### 1.6 Upload Profile Image (Step 4 — Optional)

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/mobile/user/profile/image` |
| **Auth** | ✅ `Bearer {{token_user}}` (from Step 3) |
| **Body Type** | `form-data` |

**Form Data:**
| Key | Type | Value |
|-----|------|-------|
| `image` | File | Select image file (JPG/PNG, max 5MB) |

---

### 1.7 Resend Email OTP

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/mobile/user/register/resend-email-otp/:clientId` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{ "email": "testuser@example.com" }
```

---

### 1.8 Resend Mobile OTP

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/mobile/user/register/resend-mobile-otp` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{ "email": "testuser@example.com" }
```

---

### 1.9 Google Sign-In / Register

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/mobile/user/register/google/:clientId` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{
  "credential": "REPLACE_WITH_GOOGLE_ID_TOKEN",
  "clientId": "REPLACE_WITH_CLIENT_ID"
}
```

> ℹ️ If user is fully registered → returns `token` directly.
> ℹ️ If new user → skips only Step 1 (email OTP), still needs to complete Steps 2 & 3.

---

---

## 2. User — Login

> **Base Path:** `/api/auth/user/...`

---

### 2.1 Login with Email & Password

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/auth/user/login/:clientId` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{
  "email": "testuser@example.com",
  "password": "Test@1234",
  "clientId": "REPLACE_WITH_CLIENT_ID"
}
```

**Success Response `200`:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "...",
      "email": "testuser@example.com",
      "name": "John Doe",
      "role": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "clientId": "CLI-ABC123",
    "clientName": "Bangalore Police Headquarter",
    "organizationName": "Bangalore Police Headquarter"
  }
}
```

> ✅ **Save `token` as `{{token_user}}`**

---

### 2.2 Get Current User Profile (/me)

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **URL** | `/api/auth/user/me` |
| **Auth** | ✅ `Bearer {{token_user}}` |

**Success Response `200`:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "email": "testuser@example.com",
      "name": "John Doe",
      "mobile": "919876543210",
      "clientId": { "clientId": "CLI-ABC123" },
      "loginApproved": true,
      "isActive": true
    },
    "clientId": "CLI-ABC123",
    "clientName": "Bangalore Police Headquarter",
    "organizationName": "Bangalore Police Headquarter"
  }
}
```

---

### 2.3 Forgot Password — Send OTP

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/auth/user/forgot-password` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{
  "email": "testuser@example.com",
  "clientId": "REPLACE_WITH_CLIENT_ID"
}
```

---

### 2.4 Verify Reset OTP

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/auth/user/verify-reset-otp` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{
  "email": "testuser@example.com",
  "otp": "123456"
}
```

---

### 2.5 Reset Password

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/auth/user/reset-password` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{
  "email": "testuser@example.com",
  "otp": "123456",
  "newPassword": "NewPass@1234"
}
```

---

---

## 3. User — Report a Case

> **All APIs require:** `Authorization: Bearer {{token_user}}`
> **Role required:** `user`

---

### 3.1 Submit Case (GPS Auto-Route)

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/alerts/user` |
| **Auth** | ✅ `Bearer {{token_user}}` |

**Request Body:**
```json
{
  "title": "Snatching near Metro Pillar 12",
  "priority": "high",
  "latitude": 28.5672,
  "longitude": 77.2100,
  "formData": {
    "type": "snatching",
    "location": "Near Metro Pillar 12, Lajpat Nagar",
    "dateTime": "2026-03-01T10:30:00",
    "description": "Chain snatching incident near metro station by two men on bike",
    "isAnonymous": false,
    "snatchingType": "Chain",
    "itemStolen": "Gold Chain",
    "estimatedValue": "25000",
    "numberOfAttackers": "2",
    "weaponUsed": "No",
    "vehicleUsed": "Bike",
    "injuryHappened": "No"
  }
}
```

**`formData.type` Valid Values:**

| Type | Category |
|------|---------|
| `snatching` | Chain/Mobile/Bag Snatching |
| `theft` | Burglary, Shoplifting |
| `harassment` | Physical/Cyber Harassment |
| `accident` | Road Accident |
| `robbery` | Armed Robbery |
| `camera_issue` | CCTV Camera Problem |
| `unidentified_emergency` | Unknown Emergency |

**Success Response `201`:**
```json
{
  "success": true,
  "message": "Case reported successfully",
  "data": {
    "alert": { "_id": "alert_id_here", "status": "Reported", ... },
    "routing": {
      "areaMatched": "Lajpat Nagar",
      "partnerAssigned": true,
      "coordinates": [77.21, 28.57]
    }
  }
}
```

> ℹ️ Backend automatically finds the Area polygon containing the GPS point via `$geoIntersects` and inherits `clientId` + `assignedPartnerId` from that area.

---

### 3.2 Get My All Cases (Track Status)

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **URL** | `/api/alerts/user` |
| **Auth** | ✅ `Bearer {{token_user}}` |

**Success Response `200`:**
```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "_id": "...",
        "title": "Snatching near Metro",
        "status": "Under Review",
        "priority": "high",
        "location": { "type": "Point", "coordinates": [77.21, 28.57] },
        "timeline": [
          { "status": "Reported", "timestamp": "2026-03-01T05:00:00Z" },
          { "status": "Under Review", "basisType": "Eyewitness Account Recorded", "note": "Officers reached location..." }
        ],
        "assignedPartnerId": "...",
        "createdAt": "2026-03-01T05:00:00Z"
      }
    ],
    "total": 3
  }
}
```

---

### 3.3 Get Single Case Detail by ID

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **URL** | `/api/alerts/user/:alertId` |
| **Auth** | ✅ `Bearer {{token_user}}` |

**Example:**
```
GET /api/alerts/user/65f1a2b3c4d5e6f7a8b9c0d1
```

**Success Response `200`:**
```json
{
  "success": true,
  "data": {
    "alert": {
      "_id": "65f1a2b3c4d5e6f7a8b9c0d1",
      "title": "Snatching near Metro",
      "status": "Under Review",
      "timeline": [ ... ],
      "metadata": { "type": "snatching", "itemStolen": "Gold Chain", ... },
      "location": { "type": "Point", "coordinates": [77.21, 28.57] }
    }
  }
}
```

---

### 3.4 Get My Notifications

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **URL** | `/api/notifications?page=1&limit=20` |
| **Auth** | ✅ `Bearer {{token_user}}` |

**Query Params:**
| Param | Default | Description |
|-------|---------|-------------|
| `page` | `1` | Page number |
| `limit` | `20` | Results per page |

**Success Response `200`:**
```json
{
  "data": [
    {
      "_id": "notif_id",
      "type": "case_update",
      "title": "Case Status: Under Review",
      "message": "Your case #A8B9C0 has been updated to \"Under Review\". Officer Note: Officers reached location...",
      "isRead": false,
      "data": { "alertId": "65f1a2b3...", "status": "Under Review" },
      "sentAt": "2026-03-01T06:00:00Z"
    }
  ]
}
```

---

### 3.5 Mark Notification as Read

| Field | Value |
|-------|-------|
| **Method** | `PUT` |
| **URL** | `/api/notifications/:notificationId/read` |
| **Auth** | ✅ `Bearer {{token_user}}` |

**Example:**
```
PUT /api/notifications/65f1notif1234/read
```

---

### 3.6 Mark All Notifications as Read

| Field | Value |
|-------|-------|
| **Method** | `PUT` |
| **URL** | `/api/notifications/read-all` |
| **Auth** | ✅ `Bearer {{token_user}}` |

---

---

# 👮 PARTNER

---

## 4. Partner — Registration

> **Base Path:** `POST /api/mobile/partner/register/...`
> **No Auth required for registration steps**

### Flow Overview
```
Step 1: Email + Password → OTP sent to email
Step 1 Verify: Enter email OTP → Email verified
Step 2: Phone number → OTP sent to phone
Step 2 Verify: Enter phone OTP → Phone verified
Step 3: Complete profile → JWT token returned ✅ (awaits admin approval)
Step 4: Upload profile picture
```

---

### 4.1 Send Email OTP (Step 1)

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/mobile/partner/register/step1/:clientId` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{
  "email": "partner@example.com",
  "password": "Partner@1234",
  "clientId": "REPLACE_WITH_CLIENT_ID"
}
```

---

### 4.2 Verify Email OTP (Step 1 Verify)

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/mobile/partner/register/step1/verify/:clientId` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{
  "email": "partner@example.com",
  "otp": "123456",
  "clientId": "REPLACE_WITH_CLIENT_ID"
}
```

---

### 4.3 Send Phone OTP (Step 2)

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/mobile/partner/register/step2/:clientId` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{
  "email": "partner@example.com",
  "phone": "919876543210",
  "otpMethod": "gupshup",
  "clientId": "REPLACE_WITH_CLIENT_ID"
}
```

---

### 4.4 Verify Phone OTP (Step 2 Verify)

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/mobile/partner/register/step2/verify/:clientId` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{
  "email": "partner@example.com",
  "phone": "919876543210",
  "otp": "123456",
  "clientId": "REPLACE_WITH_CLIENT_ID"
}
```

---

### 4.5 Complete Profile (Step 3)

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/mobile/partner/register/step3/:clientId` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{
  "email": "partner@example.com",
  "clientId": "REPLACE_WITH_CLIENT_ID",
  "name": "Officer Sharma",
  "designation": "Inspector",
  "policeId": "POL-12345",
  "area": "Connaught Place",
  "state": "Delhi",
  "experience": 5
}
```

**Success Response `201`:**
```json
{
  "success": true,
  "message": "Registration complete. Awaiting admin approval.",
  "data": { "token": "eyJhbGciOiJIUzI1NiJ9..." }
}
```

> ⚠️ Partner **cannot login** until admin/client approves. `verificationStatus` will be `pending`.
> ✅ **Save `token` as `{{partner_token}}`**

---

### 4.6 Upload Profile Picture (Step 4)

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/mobile/partner/register/step4` |
| **Auth** | ✅ `Bearer {{partner_token}}` (from Step 3) |
| **Body Type** | `form-data` |

**Form Data:**
| Key | Type |
|-----|------|
| `image` | File |

---

---

## 5. Partner — Login

---

### 5.1 Login with Email & Password

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/partners/login` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{
  "email": "partner@example.com",
  "password": "Partner@1234"
}
```

**Success Response `200`:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "partner": { 
        "id": "...", 
        "name": "Officer Sharma", 
        "verificationStatus": "approved",
        "role": "partner" 
    },
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "clientId": "CLI-ABC123",
    "clientName": "Bangalore Police Headquarter",
    "organizationName": "Bangalore Police Headquarter"
  }
}
```

> ⚠️ Will fail with `403` if `verificationStatus` is `pending` or `rejected`.
> ✅ **Save `token` as `{{token_partner}}`**

---

### 5.2 Check Approval Status (Polling)

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **URL** | `/api/partners/approval-status?email=partner@example.com` |
| **Auth** | ❌ Not required |

> ℹ️ Use this on the "Waiting for Approval" screen. Poll every 10-15 seconds.

**Success Response `200`:**
```json
{
  "verificationStatus": "pending",
  "message": "Your application is under review"
}
```

---

### 5.3 Google Login

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/partners/google-login` |
| **Auth** | ❌ Not required |

**Request Body:**
```json
{ "credential": "REPLACE_WITH_GOOGLE_ID_TOKEN" }
```

---

---

## 6. Partner — Citizen Reports

> **All APIs require:** `Authorization: Bearer {{token_partner}}`
> **Role required:** `partner`

### How to Use (Correct Order):
```
1. Get all assigned cases          → API 6.1
2. Click on a case for detail      → API 6.2 (also get allowedNextStatuses + availableBasisTypes)
3. (Optional) Get basis types      → API 6.3
4. Update case status              → API 6.4
    → Citizen auto-gets notification on successful update
```

---

### 6.1 Get All Assigned Citizen Cases

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **URL** | `/api/alerts/partner?type=USER&limit=50&page=1` |
| **Auth** | ✅ `Bearer {{token_partner}}` |

**Query Parameters:**

| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `type` | ✅ Yes | — | `USER` for citizen reports, `CLIENT` for device alerts |
| `limit` | No | `100` | Max results per page |
| `page` | No | `1` | Page number |
| `status` | No | — | Filter: `Reported` \| `Under Review` \| `Verified` \| `Action Taken` \| `Resolved` \| `Rejected` |
| `priority` | No | — | Filter: `low` \| `medium` \| `high` \| `critical` |
| `includeUnassigned` | No | `false` | `true` = also show unassigned cases from same client |

**Success Response `200`:**
```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "_id": "65f1a2b3c4d5e6f7a8b9c0d1",
        "title": "Snatching near Metro Pillar 12",
        "status": "Reported",
        "priority": "high",
        "type": "USER",
        "metadata": { "type": "snatching", "location": "Near Metro Pillar 12" },
        "location": { "type": "Point", "coordinates": [77.21, 28.57] },
        "createdAt": "2026-03-01T05:00:00Z"
      }
    ],
    "total": 12,
    "newCount": 3,
    "page": 1,
    "limit": 50,
    "hasMore": false,
    "statusCounts": {
      "Reported": 3,
      "Under Review": 5,
      "Verified": 2,
      "Resolved": 2
    }
  }
}
```

---

### 6.2 Get Single Case Detail (Partner View)

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **URL** | `/api/alerts/partner/:alertId` |
| **Auth** | ✅ `Bearer {{partner_token}}` |

**Example:**
```
GET /api/alerts/partner/65f1a2b3c4d5e6f7a8b9c0d1
```

**Success Response `200`:**
```json
{
  "success": true,
  "data": {
    "alert": {
      "_id": "65f1a2b3c4d5e6f7a8b9c0d1",
      "title": "Snatching near Metro Pillar 12",
      "status": "Reported",
      "metadata": { "type": "snatching", ... },
      "timeline": [
        { "status": "Reported", "note": "Case reported by citizen", "timestamp": "..." }
      ]
    },
    "allowedNextStatuses": ["Under Review"],
    "availableBasisTypes": [
      "Eyewitness Account Recorded",
      "CCTV Footage Reviewed",
      "FIR Lodged",
      "Suspect Identified",
      "Suspect Apprehended",
      "Vehicle Traced",
      "Forensic Evidence Collected",
      "Victim Statement Recorded",
      "Case Under Investigation"
    ]
  }
}
```

> ℹ️ `allowedNextStatuses` tells you which status you can transition to next.
> ℹ️ `availableBasisTypes` gives you valid `basisType` values for the next update.

---

### 6.3 Get Basis Types (by Case Category)

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **URL** | `/api/alerts/partner/basis-types?category=snatching` |
| **Auth** | ✅ `Bearer {{partner_token}}` |

**Query Params:**
| Param | Description |
|-------|-------------|
| `category` | Case type: `robbery` \| `snatching` \| `theft` \| `harassment` \| `accident` \| `camera_issue` \| `unidentified_emergency` |

**Success Response `200` (category=snatching):**
```json
{
  "success": true,
  "data": {
    "basisTypes": [
      "Eyewitness Account Recorded",
      "CCTV Footage Reviewed",
      "Victim Statement Recorded",
      "FIR Lodged",
      "Suspect Traced via CCTV",
      "Suspect Apprehended",
      "Stolen Item Recovered",
      "Vehicle Number Traced",
      "Case Under Investigation"
    ]
  }
}
```

---

### 6.4 Update Case Status

| Field | Value |
|-------|-------|
| **Method** | `PATCH` |
| **URL** | `/api/alerts/partner/:alertId/status` |
| **Auth** | ✅ `Bearer {{partner_token}}` |

**Example:**
```
PATCH /api/alerts/partner/65f1a2b3c4d5e6f7a8b9c0d1/status
```

**Request Body:**
```json
{
  "status": "Under Review",
  "basisType": "Eyewitness Account Recorded",
  "description": "Officers reached the location and recorded eyewitness statement from nearby shopkeeper near Metro Pillar 12."
}
```

**Validation Rules:**
| Field | Rule |
|-------|------|
| `status` | Required. Must be a valid next status from `allowedNextStatuses` (see API 6.2) |
| `basisType` | Required. Must be from the valid list for this category (see API 6.3) |
| `description` | Required. **Minimum 20 characters** |

**Status Flow (STRICT — cannot skip steps):**
```
Reported → Under Review → Verified → Action Taken → Resolved
                        ↘ Rejected (only from Under Review or Verified)
```

**Success Response `200`:**
```json
{
  "success": true,
  "message": "Case status updated to \"Under Review\" successfully",
  "data": {
    "alert": { "_id": "...", "status": "Under Review", "timeline": [...] },
    "allowedNextStatuses": ["Verified", "Rejected"],
    "previousStatus": "Reported"
  }
}
```

**Error Responses:**

| Code | Scenario |
|------|---------|
| `400` | Missing status / basisType / description too short |
| `403` | Not a partner or admin |
| `404` | Case not found for this client |
| `422` | Invalid status transition (e.g. Reported → Resolved) |

> ✅ On success → Citizen automatically receives a notification about the status change.
> ℹ️ If partner is updating a case for the first time, they get `assignedPartnerId` set to themselves.

---

---

## 7. Partner — Profile

> **All APIs require:** `Authorization: Bearer {{partner_token}}`

---

### 7.1 Get My Profile

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **URL** | `/api/partners/profile` |
| **Auth** | ✅ `Bearer {{partner_token}}` |

---

### 7.2 Update Profile

| Field | Value |
|-------|-------|
| **Method** | `PUT` |
| **URL** | `/api/partners/profile` |
| **Auth** | ✅ `Bearer {{partner_token}}` |
| **Body Type** | `form-data` |

**Form Data Fields:**
| Key | Type | Description |
|-----|------|-------------|
| `name` | text | Updated name |
| `phone` | text | Updated phone |
| `bio` | text | Short bio |
| `designation` | text | Police designation |
| `skills` | text | JSON array string: `["Skill1","Skill2"]` |
| `languages` | text | JSON array string: `["Hindi","English"]` |
| `area` | text | Area of operation |
| `state` | text | State name |
| `profileImage` | file | New profile picture |

---

### 7.3 Upload Profile Picture (Standalone)

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **URL** | `/api/mobile/partner/profile/picture` |
| **Auth** | ✅ `Bearer {{partner_token}}` |
| **Body Type** | `form-data` |

**Form Data:**
| Key | Type |
|-----|------|
| `image` | File |

---

---

## 8. Partner — Chat Management

> **All APIs require:** `Authorization: Bearer {{partner_token}}`

---

### 8.1 Update Online Status

| | |
|-|-|
| **Method** | `PATCH` |
| **URL** | `/api/chat/partner/status` |

**Body:** `{ "status": "online" }` — Values: `online` | `offline` | `busy`

---

### 8.2 Get My Status

| | |
|-|-|
| **Method** | `GET` |
| **URL** | `/api/chat/partner/status` |

---

### 8.3 Get Pending Conversation Requests

| | |
|-|-|
| **Method** | `GET` |
| **URL** | `/api/chat/partner/requests` |

---

### 8.4 Accept Conversation Request

| | |
|-|-|
| **Method** | `POST` |
| **URL** | `/api/chat/partner/requests/:conversationId/accept` |

---

### 8.5 Reject Conversation Request

| | |
|-|-|
| **Method** | `POST` |
| **URL** | `/api/chat/partner/requests/:conversationId/reject` |

---

### 8.6 Get All My Conversations

| | |
|-|-|
| **Method** | `GET` |
| **URL** | `/api/chat/conversations` |

---

### 8.7 Get Messages in Conversation

| | |
|-|-|
| **Method** | `GET` |
| **URL** | `/api/chat/conversations/:conversationId/messages?page=1&limit=50` |

---

### 8.8 Get Pending Partners (Admin/Client View)

| | |
|-|-|
| **Method** | `GET` |
| **URL** | `/api/partners/pending` |
| **Auth** | `Bearer token_client` or `token_admin` |

---

### 8.9 Get All Partners (Admin/Client View)

| | |
|-|-|
| **Method** | `GET` |
| **URL** | `/api/partners/all` |
| **Auth** | `Bearer token_client` or `token_admin` |

---

### 8.10 Approve Partner (Admin/Client)

| | |
|-|-|
| **Method** | `PATCH` |
| **URL** | `/api/partners/:partnerId/approve` |
| **Auth** | `Bearer token_client` or `token_admin` |

---

### 8.11 Reject Partner (Admin/Client)

| | |
|-|-|
| **Method** | `PATCH` |
| **URL** | `/api/partners/:partnerId/reject` |
| **Auth** | `Bearer token_client` or `token_admin` |

**Body:** `{ "reason": "Documents incomplete" }`

---

---

## 9. AI Chat (User / Partner / Client)

> **All roles** can use AI Chat APIs.
> **Auth:** `Bearer <any_valid_token>`

---

### 9.1 Create Chat Session

| | |
|-|-|
| **Method** | `POST` |
| **URL** | `/api/mobile/chat` |

**Body:** `{ "title": "My first chat" }`

---

### 9.2 Get All Chats

| | |
|-|-|
| **Method** | `GET` |
| **URL** | `/api/mobile/chat` |

---

### 9.3 Get Chat by ID

| | |
|-|-|
| **Method** | `GET` |
| **URL** | `/api/mobile/chat/:chatId` |

---

### 9.4 Send Message (Get AI Reply)

| | |
|-|-|
| **Method** | `POST` |
| **URL** | `/api/mobile/chat/:chatId/message` |

**Body:** `{ "message": "Hello AI, how can you help me today?" }`

---

### 9.5 Delete Chat

| | |
|-|-|
| **Method** | `DELETE` |
| **URL** | `/api/mobile/chat/:chatId` |

---

### 9.6 Debug Auth (Check Token)

| | |
|-|-|
| **Method** | `GET` |
| **URL** | `/api/mobile/chat/debug` |

> ℹ️ Returns token role, userId, and access info. Useful for debugging 401 errors.

---

---

## 10. User ↔ Partner Real-time Chat

> **User-side APIs** for finding partners and creating consultation conversations.
> **Auth:** `Bearer {{token_user}}`

---

### 10.1 Get Available Partners

| | |
|-|-|
| **Method** | `GET` |
| **URL** | `/api/chat/partners` |

---

### 10.2 Get Partner Details by ID

| | |
|-|-|
| **Method** | `GET` |
| **URL** | `/api/chat/partners/:partnerId` |

---

### 10.3 Create Conversation Request

| | |
|-|-|
| **Method** | `POST` |
| **URL** | `/api/chat/conversations` |

**Body:** `{ "partnerId": "REPLACE_WITH_PARTNER_ID" }`

> ℹ️ Status starts as `pending` until partner accepts (API 8.4).

---

### 10.4 Get All My Conversations (User)

| | |
|-|-|
| **Method** | `GET` |
| **URL** | `/api/chat/conversations` |

---

---

## ❌ Common Error Codes

| HTTP Code | Meaning | Common Cause |
|-----------|---------|-------------|
| `400` | Bad Request | Missing required field / invalid value |
| `401` | Unauthorized | Missing or expired token |
| `403` | Forbidden | Wrong role for this endpoint |
| `404` | Not Found | Resource doesn't exist or wrong ID |
| `422` | Unprocessable | Invalid status transition in case update |
| `500` | Server Error | Backend crash — check server logs |

---

## 🔗 Quick Reference

| Use Case | API |
|----------|-----|
| Citizen registers | `POST /api/mobile/user/register/step1` → step1/verify → step2 → step2/verify → step3 |
| Citizen logs in | `POST /api/auth/user/login` |
| Citizen reports case | `POST /api/alerts/user` |
| Citizen tracks case | `GET /api/alerts/user` |
| Citizen checks notifications | `GET /api/notifications` |
| Partner registers | `POST /api/mobile/partner/register/step1` → step1/verify → step2 → step2/verify → step3 |
| Partner logs in | `POST /api/partners/login` |
| Partner sees assigned cases | `GET /api/alerts/partner?type=USER` |
| Partner updates case status | `PATCH /api/alerts/partner/:id/status` |
| Client approves partner | `PATCH /api/partners/:id/approve` |





