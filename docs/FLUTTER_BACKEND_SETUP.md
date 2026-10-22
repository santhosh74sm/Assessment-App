# Puzzles App — Node.js + Express Backend Setup Guide

This guide is for running the **Node.js + Express + MongoDB** backend alongside your Flutter frontend located at:
`C:\Users\DELL\OneDrive\Documents\New folder\puzzles_app`

---

## 1. Directory Structure

Place the `backend` folder inside your `puzzles_app` project (or alongside it) without modifying any Flutter files:

```text
puzzles_app/
│
├── android/                   # Flutter Android files (Untouched)
├── ios/                       # Flutter iOS files (Untouched)
├── lib/                       # Flutter source code (Untouched)
├── pubspec.yaml               # Flutter dependencies (Untouched)
│
└── backend/                   # Node.js + Express Backend
    ├── server.ts              # Express HTTP server & API mounting
    ├── package.json           # Backend dependencies (express, mongoose, bcryptjs, jsonwebtoken, etc.)
    ├── tsconfig.json          # TypeScript config
    ├── .env                   # Local environment file (port, local mongo uri, jwt secret)
    │
    ├── database/
    │   ├── connection.ts      # Local MongoDB connection logic (Strictly mongodb://127.0.0.1:27017/puzzles_assessment_dev)
    │   └── models.ts          # Mongoose Schemas (User, School, QuestionGroup, Question, PublishedTest, StudentTestAssignment, PublishHistory)
    │
    ├── middleware/
    │   └── auth.ts            # JWT authentication and school isolation middleware
    │
    ├── services/
    │   └── randomEngine.ts    # Rule-based adaptive question selection engine (zero AI)
    │
    ├── routes.ts              # API endpoints for Flutter frontend & Admin web portal
    └── seed/
        └── seed_local_mongo.ts # Schema structure verification script
```

---

## 2. Requirements & Prerequisites

1. **MongoDB Server**: Ensure your local MongoDB Community Server or Atlas Cluster is running:
   - Port: `27017`
   - Connection URI: `mongodb://127.0.0.1:27017/puzzles_assessment_dev`
2. **Node.js**: Node.js 18+ or 20+ installed.

---

## 3. Quick Start

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Initialize Database Structure
To ensure `puzzles_assessment_dev` and all collection structures are verified in **MongoDB Compass**:
```bash
npx tsx seed/seed_local_mongo.ts
```

All 7 collections (`users`, `schools`, `questiongroups`, `questions`, `publishedtests`, `studenttestassignments`, `publishhistories`) are verified clean and ready for real production data entry with 0 documents.

### Step 3: Start the Backend Server
```bash
npm run dev
```
Server starts on: `http://localhost:3000` (or `http://10.0.2.2:3000` when accessed from the Android Emulator).

---

## 4. Production Initial Super Admin Setup

The initial Super Admin credentials are:
- **Username**: `san`
- **Initial Password**: `san`
- **First Login**: Mandatory password change is strictly enabled on first login.
- Subsequent logins utilize the updated password. Additional Super Admins, School Admins, and Student accounts can then be generated via the UI.

---

## 5. API Endpoints Available for the Flutter Frontend

- `GET  /api/health` — System & MongoDB connection health check
- `GET  /api/database/status` — Live status of `puzzles_assessment_dev`
- `GET  /api/auth/setup-status` — Verification of initialization status
- `POST /api/auth/setup-first-admin` — Initial Super Admin creation when 0 users exist
- `POST /api/auth/login` — Authentication for all roles, returns JWT token
- `POST /api/auth/change-password` — Password update endpoint
- `GET  /api/student/tests` — Tests assigned to authenticated student
- `POST /api/student/tests/:id/start` — Start a test attempt (consumes attempt)
- `POST /api/student/tests/:id/submit` — Submit answers and calculate normalized score
- `GET  /api/student/timeline` — Student personal test history and scores
- `GET  /api/schools` — School list (Admin)
- `POST /api/publish` — Publish test to school/class/section
