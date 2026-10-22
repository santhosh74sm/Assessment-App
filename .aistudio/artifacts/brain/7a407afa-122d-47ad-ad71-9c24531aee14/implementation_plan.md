# Implementation Plan: Pictorial Questions with AWS S3 Storage

Comprehensive inspection findings, architectural strategy, and implementation blueprint for integrating Pictorial Questions and AWS S3 image storage into the Puzzles Assessment platform while strictly preserving all existing question types and workflows.

---

## Inspected Facts vs. Assumptions

### Inspected Facts (Codebase Ground Truth)
1. **Question Schemas (`database/models.ts` & `src/types.ts`)**:
   - `IQuestionDocument` and `Question` interface have: `groupId`, `groupName`, `difficulty`, `questionType`, `answerType`, `isRanking`, `isRankingQuestion`, `content`, `timeSeconds`, `points`, `options`, `correctAnswer`, `correctAnswers`, `enableWrittenExplanation`, `scoringGuide`, `expectedResponse`, `metadata`.
   - Neither `images` nor `imageLayout` currently exist in `IQuestionDocument`, `QuestionSchema`, or `src/types.ts`.
2. **Student Security & Serialization (`backend/services/studentQuestionSerializer.ts`)**:
   - `serializeStudentQuestion()` uses a strict allowlist: `allowedFields = ['groupId', 'groupName', 'difficulty', 'questionType', 'answerType', 'content', 'timeSeconds', 'timeAllowedSeconds', 'points', 'options', 'studentAnswer', 'writtenExplanation', 'timeTakenSeconds', 'isRanking', 'isRankingQuestion']`.
   - **Critical finding**: Any new image field (`images`, `imageLayout`) will be silently stripped from student assessments unless explicitly added to `allowedFields`.
3. **AWS S3 & Upload Status**:
   - Neither `@aws-sdk/client-s3` nor `@aws-sdk/s3-request-presigner` is present in `package.json`.
   - No AWS environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`) exist in `.env.example`.
   - No multipart upload handler (e.g., `multer`) or S3 upload service exists in `backend/` or `server.ts`.
4. **Excel Source File (`Pictorial(1).xlsx`)**:
   - Checked filesystem: `Pictorial(1).xlsx` is currently **not present** in the workspace directory.
5. **Question Bank UI (`src/components/QuestionBankSection.tsx`)**:
   - Admin manages questions via `ReadOnlyQuestionDetailCard`, `questionForm`, `handleCreateQuestion`, and `handleStartEditQuestion`.
   - No image upload, image preview, or image ordering controls currently exist in the question form.
6. **Student Test Experience (`src/components/StudentPortal.tsx` & `src/components/FlameMiniGameCanvas.tsx`)**:
   - Questions are rendered inside `FlameMiniGameCanvas`. Question content is displayed as text heading (`<h3>{content}</h3>`), and answer choices are displayed in an options grid button list (`{options.map(...)}`).
   - Images are currently not rendered in either the question prompt area or option buttons.
7. **Assessment Reports & History (`src/components/StudentReportDetailView.tsx`)**:
   - Question breakdown displays question text, difficulty, group, points, options, and student answer. It does not render question images.

### Assumptions & Inferences
- AWS S3 credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`) will be configured in the environment (`.env`).
- For private S3 buckets, pre-signed GET URLs (with configurable TTL, e.g. 1 hour) or an authenticated backend media streaming route will be used to deliver images securely without making the bucket public.
- The 50 pictorial questions from `Pictorial(1).xlsx` comprise different visual formats: single illustration (diagram/puzzle), multi-image comparison (e.g. Picture A vs Picture B), and pictorial options (Options A, B, C, D having associated images).

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Decision Gate 1: S3 Bucket Access Policy & Image Delivery Mechanism**
> - **Option A (Recommended)**: **Secure Backend Proxy / Presigned URLs**. The S3 bucket remains strictly **private**. The backend signs time-limited pre-signed GET URLs (or streams images through `/api/media/image/:key`), ensuring student and admin access control without public bucket exposure.
> - **Option B**: Direct Public S3 URLs. Only suitable if the user's bucket already allows public read access for assessment assets.
> *Recommended Default*: **Option A** (Private bucket + backend-signed delivery).

> [!IMPORTANT]
> **Decision Gate 2: Source File `Pictorial(1).xlsx` & Image Assets Location**
> - Since `Pictorial(1).xlsx` is not yet present in the file tree, we provide an automated import route (`/api/questions/import-excel`) and a seeding/CLI utility.
> - The import tool will parse Excel rows, validate required columns, map them to question groups and difficulty, allow linking to uploaded S3 image keys, and report any missing answers or unassigned images for administrative review.

---

## 1. Overview & Core Concept

Pictorial Questions enhance the Puzzles Assessment platform by introducing rich visual evaluation capabilities alongside existing text and ranking questions. Administrators can create, upload, label, reorder, and edit multiple images per question. Students view the illustrations cleanly formatted (single main image, side-by-side comparison, or visual options) in their assessment test interface and submit their selections seamlessly.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PICTORIAL QUESTION SYSTEM                         │
├──────────────────────────┬────────────────────────────┬─────────────────────┤
│   Question Bank UI       │     Backend & S3 Storage   │  Student Test Page  │
│  (Admin Management)      │    (Secure Orchestration)  │  & Assessor Reports │
├──────────────────────────┼────────────────────────────┼─────────────────────┤
│ • File upload / drag-drop│ • AWS SDK v3 Client        │ • Dynamic Layouts:  │
│ • Image label picker     │ • MIME & Size validation   │   - Single Hero     │
│   (Pic A, B, Opt A..D)   │ • Unique key generation    │   - Comparison (A/B)│
│ • Reorder / delete / swap│ • MongoDB metadata only    │   - Option Grid     │
│ • Instant preview modal  │ • Presigned / Proxy URLs   │ • Zoom / Lightbox   │
│ • Excel batch import     │ • Strict sanitization      │ • Preserved MCQ flow│
└──────────────────────────┴────────────────────────────┴─────────────────────┘
```

---

## 2. User Experience & Visual Design

### Question Bank Admin Interface (`QuestionBankSection.tsx`)
- **Image Management Card**: Integrated directly into Add Question and Edit Question containers.
- **Upload Zone**: Clean dropzone supporting drag-and-drop or file picker (JPEG, PNG, WebP, SVG, GIF up to 5MB).
- **Image Thumbnail List**:
  - Interactive thumbnail preview with zoom modal on click.
  - Image Label Dropdown: "Main Image", "Picture A", "Picture B", "Picture C", "Picture D", "Option A", "Option B", "Option C", "Option D", or custom label.
  - Position Controls: Move Left/Right or Drag-to-Reorder badges (1, 2, 3...).
  - Quick Actions: Replace Image button and Delete button with confirmation.
- **Read-Only Detail Card**: Displays visual thumbnail strip with labels for every pictorial question in the bank.

### Student Test Engine (`StudentPortal.tsx` & `FlameMiniGameCanvas.tsx`)
- **Responsive Layout Engine**:
  - **Single Main Illustration**: Large centered hero image (max height 360px, rounded-xl border, responsive zoom preview).
  - **Comparison Layout (Picture A & Picture B)**: 2-column comparison card side-by-side on desktop, stacked on mobile, with prominent labels.
  - **Visual Options Grid (Options A, B, C, D as images)**: Clean 2x2 or 4-column card grid where each choice contains its labeled illustration with keyboard/click radio selection.
- **Zero Distraction**: Maintains existing countdown timer, written explanation textarea, and single-click advance.

### Assessment Reports (`StudentReportDetailView.tsx`)
- Includes thumbnail previews of the question's pictorial assets in the question breakdown so evaluators can inspect exactly what visual prompt the student responded to.

---

## 3. Technical Architecture & Data Strategy

### System Component Diagram

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                           ARCHITECTURE DATA FLOW                              │
└───────────────────────────────────────────────────────────────────────────────┘

  [Admin Browser]
        │
        ├─► POST /api/uploads/image (Multipart File)
        │         │
        │         ▼
        │   [Backend S3 Service (s3Service.ts)]
        │         │  (Validates MIME, size <= 5MB, generates uuid key)
        │         ├─► PutObjectCommand ──► [AWS S3 Bucket: puzzles-assessments]
        │         ▼
        │   Returns { url, s3Key, originalName, mimeType, size }
        │
        ├─► POST / PUT /api/questions
        │         │  (Question payload with images metadata array)
        │         ▼
        │   [MongoDB: QuestionModel / PublishedTestModel / StudentTestAssignment]
        │         │
        │         ▼
  [Student Browser]
        │
        ├─► GET /api/student/tests (or active test start)
        │         │
        │         ▼
        │   [studentQuestionSerializer.ts]
        │         │  (Allows 'images' and 'imageLayout', strips answer keys)
        │         ▼
        └─► Renders [FlameMiniGameCanvas] with Pictorial Layout Engine
```

### Database Schema Updates (`database/models.ts` & `src/types.ts`)

```typescript
export interface QuestionImage {
  id: string;             // unique identifier, e.g. "img_1713..."
  url: string;            // public CDN or secure access URL
  s3Key: string;          // S3 object key, e.g. "questions/2026/img-xxx.png"
  label?: string;         // e.g. "Picture A", "Picture B", "Option A", "Main Diagram"
  caption?: string;       // optional descriptive caption
  order: number;          // display sequence index (0, 1, 2...)
  role?: 'question' | 'option'; // whether image is part of prompt or option visual
  optionIndex?: number;   // 0 for A, 1 for B, 2 for C, 3 for D if attached to choice
}

export type QuestionImageLayout = 'single_top' | 'comparison' | 'options_grid' | 'auto';
```

Additions to `QuestionSchema`:
- `images`: `[{ type: Schema.Types.Mixed, default: [] }]`
- `imageLayout`: `{ type: String, enum: ['single_top', 'comparison', 'options_grid', 'auto'], default: 'auto' }`

### Exact Files Targeted for Modification

| File Path | Nature of Change |
| :--- | :--- |
| `package.json` | Add `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `multer`, `@types/multer`, `xlsx` |
| `.env.example` | Document AWS S3 environment variables (`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_S3_ENDPOINT`) |
| `database/models.ts` | Update `IQuestionDocument` and `QuestionSchema` with `images` and `imageLayout` fields |
| `src/types.ts` & `backend/types.ts` | Add `QuestionImage`, `QuestionImageLayout`, and update `Question`, `QuestionAttemptLog` interfaces |
| `backend/services/s3Service.ts` *(new)* | Dedicated AWS S3 upload, signed URL generator, file validation, and delete utility |
| `backend/services/studentQuestionSerializer.ts` | Add `images` and `imageLayout` to `allowedFields` in `serializeStudentQuestion` |
| `backend/routes.ts` | Add `/api/uploads/image` (POST), `/api/uploads/image` (DELETE), update question create/edit sync, add `/api/questions/import-excel` |
| `src/components/QuestionBankSection.tsx` | Add Image Management UI (Upload, Reorder, Label, Replace, Remove) and visual thumbnail display |
| `src/components/FlameMiniGameCanvas.tsx` | Add Pictorial Layout rendering (Single Main, Comparison A/B, Option Grid A-D, Lightbox Zoom) |
| `src/components/StudentPortal.tsx` | Ensure question images are passed down and preserved during advance and submission |
| `src/components/StudentAssessmentPreviewModal.tsx` | Ensure admin preview displays pictorial questions identically to students |
| `src/components/StudentReportDetailView.tsx` | Display pictorial thumbnails in student assessment audit report |
| `scripts/import_pictorial_excel.ts` *(new)* | CLI & automated import runner for `Pictorial(1).xlsx` with dry-run and validation reporting |

---

## 4. Excel Import Workflow (`Pictorial(1).xlsx`)

1. **Pre-Import File Inspection**:
   - The script inspects workbook sheets, column headers (e.g. `Question Number`, `Question Text`, `Image Name / Reference`, `Option A`, `Option B`, `Option C`, `Option D`, `Correct Answer`, `Difficulty`, `Group`, `Explanation`).
2. **Image Association Strategy**:
   - The script matches referenced image names against an image folder or S3 directory (e.g., `images/q1_main.png`, `images/q1_opt_a.png`).
   - If images are provided locally, the script automatically uploads them to the configured S3 bucket, retrieves the assigned S3 keys, and links them to the question record.
3. **Data Integrity & Validation**:
   - Verifies all 50 questions for valid options, difficulty assignment, and question group.
   - **Zero Guessing Rule**: Any question lacking an explicit correct answer will be marked with a review flag and imported with manual assessor scoring enabled.
   - Provides a dry-run report outputting total parsed questions, images linked, and warnings.

---

## 5. Security & S3 Access Guarantees

1. **Credentials Isolation**: AWS access keys and secret keys reside strictly on the server (`process.env`). They are never bundled into Vite or exposed to client code.
2. **Access Control**: S3 upload and delete routes require `authenticate` and `requireRole('super_admin')`.
3. **Upload Validation**:
   - MIME type restriction: `image/jpeg`, `image/png`, `image/webp`, `image/svg+xml`, `image/gif`.
   - File size cap: 5MB per image.
   - Magic byte header inspection to prevent extension spoofing.
   - UUID-based key generation (`pictorial/${uuidv4()}.${ext}`) prevents filename collision and path traversal attacks.
4. **Answer Key Protection**: Student serialization excludes `correctAnswer`, `correctAnswers`, `scoringGuide`, and `expectedResponse`, even for pictorial questions.

---

## 6. Backward Compatibility & Regression Defense

- **Existing Question Preservation**: Questions without images continue to render identically as standard MCQs, Ranking, or Text Input questions.
- **Snapshot Integrity**: Historical assessment attempts (`status === 'COMPLETED'`) remain strictly immutable.
- **Sync Defense**: Editing a pictorial question updates active assignments and published tests snapshots without disturbing existing student records.
- **Scoring Engine Compatibility**: `hasAutomaticallyScorableAnswer()` and `evaluateQuestionCorrectness()` continue working seamlessly for pictorial MCQs.

---

## 7. Step-by-Step Test Plan

1. **S3 Upload & Validation Tests**:
   - Upload valid PNG/JPEG -> verify S3 key generated, stored in DB, thumbnail loaded.
   - Attempt upload with non-image file (.exe / .pdf) -> verify 400 Bad Request rejection.
   - Attempt upload with unauthenticated client -> verify 401 Unauthorized rejection.
2. **Question Bank UI Tests**:
   - Create pictorial question with 1 main image -> verify label and preview.
   - Create pictorial question with comparison images (Picture A & Picture B) -> verify ordering and labels.
   - Reorder images -> verify updated order index.
   - Delete image from question form -> verify UI updates and S3 object cleanup.
   - Edit existing text MCQ -> verify existing fields remain unaffected.
3. **Student Test Experience Tests**:
   - Student starts assessment containing pictorial question -> verify images render with correct order and layout.
   - Student selects answer and submits written explanation -> verify payload recorded without answer key disclosure.
   - Verify timer auto-advances correctly on pictorial questions.
4. **Reports & Admin Preview Tests**:
   - Open Student Assessment Preview Modal -> verify exact student layout renders.
   - Open Student Report Detail View -> verify evaluator sees pictorial prompt alongside student's submitted answer.
5. **Excel Import Verification**:
   - Run dry-run on sample pictorial dataset -> verify row parsing and error reporting.
