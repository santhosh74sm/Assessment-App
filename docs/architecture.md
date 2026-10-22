# System Architecture & Technical Design

## 1. High-Level Architecture

```
+-----------------------------------------------------------------------------------+
|                                  Client Layers                                    |
|   +------------------------------------+    +---------------------------------+   |
|   |    Flutter Web / PWA               |    |    Flutter Android App          |   |
|   |    (Flame Game/Puzzle Engine)      |    |    (Flame Game/Puzzle Engine)   |   |
|   +------------------------------------+    +---------------------------------+   |
+------------------------------------------+----------------------------------------+
                                           | HTTPS / REST API (JWT)
                                           v
+-----------------------------------------------------------------------------------+
|                             Node.js + Express REST API                            |
|  +-----------------------------------------------------------------------------+  |
|  | Middleware: Auth (JWT verification), Role Enforcement (SuperAdmin, Admin,   |  |
|  |             Student), Forced Password Change Guard, School Tenant Isolation |  |
|  +-----------------------------------------------------------------------------+  |
|  | Core Controllers & Services:                                                |  |
|  | - Auth & User Service (Bcrypt, JWT, First-login forced change)              |  |
|  | - School & Tenant Management Service                                        |  |
|  | - Question Bank & Groups Manager                                            |  |
|  | - Publishing Engine (Selected vs. Random)                                   |  |
|  | - Rule-Based Adaptive Question Engine (Performance history & repetition)    |  |
|  | - Attempt State Machine (Start, Answer, Auto-expire, Lock, Complete)          |  |
|  | - Scoring & Points Aggregator (100-point base scale)                        |  |
|  | - Publish History & Auditing Logger                                         |  |
|  | - Reporting & Analytics Query Service (School, class, student timeline)    |  |
|  +-----------------------------------------------------------------------------+  |
+------------------------------------------+----------------------------------------+
                                           | Mongoose ODM
                                           v
+-----------------------------------------------------------------------------------+
|                              MongoDB Atlas Database                               |
| Collections:                                                                      |
| - users (SuperAdmin, SchoolAdmin, Student with credentials & forcePasswordChange) |
| - schools (Name, Code, Timestamp)                                                |
| - questionGroups (Name, Description)                                              |
| - questions (Group, Difficulty, Type, Content, AnswerData, TimeSec, Points)       |
| - publishedTests (Name, Mode, Targets, Start/End Window, QuestionList, Shuffle)  |
| - studentTestAssignments (Recipient, Status: NOT_STARTED, IN_PROGRESS, etc.)     |
| - testAttempts (Answers, TimeTaken, QuestionResults, Score, Status)               |
| - publishHistory (Immutable audit snapshots)                                      |
+-----------------------------------------------------------------------------------+
```

## 2. Directory Layout
```
project-root/
|-- backend/
|   |-- config/          # DB connection, env config
|   |-- controllers/     # Route handlers
|   |-- middleware/      # Auth, RBAC, tenant isolation
|   |-- models/          # MongoDB / Mongoose schemas
|   |-- routes/          # Express route definitions
|   |-- services/        # Rule engine, scoring, publish logic
|   `-- server.ts        # Express entry point
|-- frontend/
|   |-- lib/             # Flutter architecture (models, providers, screens, widgets)
|   |-- flame/           # Flame puzzle components & mini-game canvases
|   |-- web/             # Flutter Web shell
|   `-- android/         # Flutter Android project config
|-- database/
|   `-- schema.ts        # Database schema definitions & indexing
|-- seed/
|   |-- dummy_questions.json  # Exactly 5 development questions
|   `-- seed.ts          # MongoDB seeder script
|-- docs/
|   |-- requirements.md
|   `-- architecture.md
`-- README.md
```
