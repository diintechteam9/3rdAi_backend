# Brahmakosh Backend

**A holistic spiritual wellness platform** — astrology, numerology, spiritual activities, expert consultations, karma points, sankalpas, and AI-powered chat with astrologer partners.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [User Roles & Access](#user-roles--access)
- [Login Flow (Complete)](#login-flow-complete)
- [API Reference](#api-reference)
- [Environment Setup](#environment-setup)
- [Running the Project](#running-the-project)
- [Key Features](#key-features)

---

## Overview

Brahmakosh is a full-stack spiritual wellness application that provides:

- **Multi-tenant architecture** — Clients (organizations) manage their own users
- **Role-based dashboards** — Super Admin, Admin, Client, User, Partner
- **Astrology & Numerology** — Birth charts, kundali, panchang, remedies, doshas (Powered by AstrologyAPI)
- **Partner Chat** — Real-time chat between users and astrologer partners
- **Spiritual Activities** — Meditation, chanting, prayer, sankalpas, karma points
- **AI Integration** — Google Gemini AI for content generation
- **Mobile-first** — Multi-step registration, Firebase/Google auth, OTP verification

---

## Tech Stack

| Layer      | Technology                          |
|-----------|--------------------------------------|
| **Backend** | Node.js, Express, MongoDB, Socket.io |
| **Frontend** | Vue 3, Vite, Bootstrap 5             |
| **Auth**    | JWT, bcrypt, Google OAuth, Firebase  |
| **APIs**    | AstrologyAPI, Gemini AI, Deepgram    |
| **Storage** | AWS S3                               |
| **Realtime**| Socket.io (Chat), Twilio (Voice)     |

---

## Project Structure

```
Brahmakosh/
├── backend/                    # Node.js API server
│   ├── config/                 # Configuration (DB, SuperAdmin init)
│   ├── middleware/             # Auth & Error handling middleware
│   ├── models/                 # Mongoose Schemas (User, Partner, Chat, etc.)
│   ├── routes/                 # API Routes
│   │   ├── auth/               # Authentication routes
│   │   ├── mobile/             # Mobile app specific routes
│   │   └── *.js                # Feature routes (partners, chat, astrology)
│   ├── services/               # Business Logic Services
│   │   ├── astrologyService.js # AstrologyAPI integration
│   │   ├── geminiService.js    # AI content generation
│   │   └── chatWebSocket.js    # Real-time chat socket handler
│   └── utils/                  # Helper utilities (S3, OTP, etc.)
├── frontend/                   # Vue 3 SPA
│   └── src/
│       ├── router/             # Route definitions
│       ├── views/              # Page components by role
│       ├── store/              # State management
│       └── services/           # API service calls
└── testing/                    # Test scripts
```

---

## User Roles & Access

| Role          | Model      | Scope                                      |
|---------------|------------|--------------------------------------------|
| **Super Admin** | Admin      | Full system, create admins, approve logins |
| **Admin**       | Admin      | Manage clients/users, settings, prompts    |
| **Client**      | Client     | Own users, spiritual content, karma, tools |
| **User**        | User       | App users (web/mobile), astrology, chat    |
| **Partner**     | Partner    | Astrologers, chat with users, earnings     |

---

## Login Flow (Complete)

### 1. Super Admin, Admin, Client & Partner (Web)
Standard email/password login flow.
- **Super Admin**: Auto-created via environment variables.
- **Admin**: Needs approval from Super Admin.
- **Client**: Can self-register or be created by Admin.
- **Partner**: Can self-register or use Google Login.

### 2. User (Mobile & Web)
Supports multiple authentication methods:
- **Email/Password**: Traditional login.
- **OTP**: Phone number verification (via Twilio/Gupshup).
- **Social**: Google OAuth and Firebase Auth.
- **Registration**: Multi-step process for mobile users to capture profile and birth details.

---

## Environment Setup

Create `.env` in `backend/`:

```env
# Server
PORT=4000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/brahmakosh

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Super Admin (auto-created on startup)
SUPER_ADMIN_EMAIL=superadmin@brahmakosh.com
SUPER_ADMIN_PASSWORD=YourSecurePassword123

# Astrology API
ASTROLOGY_API_USER_ID=your_id
ASTROLOGY_API_KEY=your_key
ASTROLOGY_API_BASE_URL=https://json.astrologyapi.com/v1

# AI Services
GEMINI_API_KEY=your_gemini_key
ne # Optional: Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id

# Optional: AWS S3 (for uploads)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_BUCKET_NAME=
```

---

## Running the Project

### Backend

```bash
cd backend
npm install
npm run dev
# Server: http://localhost:4000
# Health: http://localhost:4000/api/health
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# App: http://localhost:5173
```

---

## Key Features

- **Astrology**: Birth details, planets, kundali, doshas, remedies, gemstones, vdasha, chardasha, yogini, sade sati, pitra dosha, panchang, numerology
- **Partner Chat**: Partner list, conversations, real-time messaging, astrology context
- **Spiritual**: Sankalpas, puja padhati, meditations, chantings, spiritual activities, karma points
- **Client Tools**: Testimonials, sponsors, experts, Geeta chapters/shlokas, branding
- **Karma & Rewards**: Spiritual stats, rewards, redemptions

---

*Brahmakosh — Spiritual Wellness Platform*
