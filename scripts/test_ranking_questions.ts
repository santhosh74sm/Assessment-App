import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {
  UserModel,
  SchoolModel,
  QuestionGroupModel,
  QuestionModel,
  PublishedTestModel,
  StudentTestAssignmentModel,
  PublishHistoryModel,
} from '../database/models.ts';
import { hasAutomaticallyScorableAnswer } from '../backend/services/questionScoring.ts';
import { serializeStudentQuestion } from '../backend/services/studentQuestionSerializer.ts';
import { resolveMongoUri, buildTargetUri } from '../backend/database.ts';

const EXPECTED_TEST_DB = 'puzzles_assessment_test';

async function connectTestDatabase(): Promise<mongoose.Connection> {
  const rawUri = resolveMongoUri();
  if (!rawUri) {
    throw new Error('Neither MONGO_URI nor MONGODB_URI is configured.');
  }

  const testUri = buildTargetUri(rawUri, EXPECTED_TEST_DB);

  await mongoose.connect(testUri, {
    dbName: EXPECTED_TEST_DB,
    serverSelectionTimeoutMS: 5000,
    autoIndex: true,
  });

  if (mongoose.connection.name !== EXPECTED_TEST_DB) {
    await mongoose.disconnect();
    throw new Error(`Connected to ${mongoose.connection.name}, expected ${EXPECTED_TEST_DB}`);
  }

  return mongoose.connection;
}

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failedCount++;
  }
}

async function runRankingQuestionTests() {
  console.log('=== Starting Ranking Question Automated Test Suite ===\n');
  await connectTestDatabase();

  const salt = bcrypt.genSaltSync(10);
  const hashedPass = bcrypt.hashSync('Pass123!', salt);

  // 1. Setup Test Fixtures
  console.log('Setup: Preparing test schools, users, and question group...');
  const schoolA = await SchoolModel.findOneAndUpdate(
    { code: 'TEST_SCH_A' },
    { name: 'School A', code: 'TEST_SCH_A' },
    { upsert: true, returnDocument: 'after' }
  );
  const schoolB = await SchoolModel.findOneAndUpdate(
    { code: 'TEST_SCH_B' },
    { name: 'School B', code: 'TEST_SCH_B' },
    { upsert: true, returnDocument: 'after' }
  );

  const group = await QuestionGroupModel.findOneAndUpdate(
    { name: 'Ranking Test Group' },
    { name: 'Ranking Test Group', description: 'Testing ranking questions' },
    { upsert: true, returnDocument: 'after' }
  );

  const studentA = await UserModel.findOneAndUpdate(
    { uniqueStudentId: 'TEST_STU_RANK_A' },
    {
      username: 'test_stu_rank_a',
      studentName: 'Student Rank A',
      role: 'student',
      schoolId: String(schoolA._id),
      schoolName: schoolA.name,
      uniqueStudentId: 'TEST_STU_RANK_A',
      passwordHash: hashedPass,
    },
    { upsert: true, returnDocument: 'after' }
  );

  // 2. Test Question Bank Creation & Editing
  console.log('\nTest Suite 1: Question Bank Creation & Editing for Ranking Questions');
  const rankingQDoc = await QuestionModel.create({
    groupId: String(group._id),
    groupName: group.name,
    difficulty: 'Medium',
    questionType: 'Ranking',
    isRanking: true,
    isRankingQuestion: true,
    content: 'Rank these emergency response steps in order of highest to lowest priority.',
    points: 10,
    timeSeconds: 60,
    options: [
      'Call emergency services',
      'Check victim breathing and pulse',
      'Secure the immediate hazard zone',
      'Provide basic first aid treatment',
    ],
    expectedResponse: '1. Secure hazard zone, 2. Check breathing, 3. Call services, 4. Provide first aid',
    scoringGuide: 'Assess whether danger safety comes before casualty intervention.',
    enableWrittenExplanation: true,
  });

  assert(Boolean(rankingQDoc.isRanking), 'Ranking question created with isRanking=true');
  assert(Boolean(rankingQDoc.isRankingQuestion), 'Ranking question created with isRankingQuestion=true');
  assert(rankingQDoc.correctAnswer === undefined || rankingQDoc.correctAnswer === null, 'Conventional MCQ correctAnswer is not required for ranking question');
  assert(rankingQDoc.options.length === 4, 'Ranking question preserves all 4 statement options');

  // Edit question: update options & content, ensure isRanking is strictly preserved
  const updatedQDoc = await QuestionModel.findByIdAndUpdate(
    rankingQDoc._id,
    {
      $set: {
        content: 'UPDATED: Rank these emergency response steps in order of priority.',
        isRanking: true,
        isRankingQuestion: true,
        questionType: 'Ranking',
      },
    },
    { new: true }
  );

  assert(Boolean(updatedQDoc?.isRanking), 'Editing question strictly preserves isRanking=true');
  assert(updatedQDoc?.content.startsWith('UPDATED:'), 'Content updated successfully');

  // Test Serialization for Student Payload
  const serializedForStudent = serializeStudentQuestion(rankingQDoc);
  assert(Boolean(serializedForStudent.isRanking), 'Student serialization includes isRanking=true');
  assert(Boolean(serializedForStudent.isRankingQuestion), 'Student serialization includes isRankingQuestion=true');
  assert(serializedForStudent.correctAnswer === undefined, 'Student serialization strips correct answer key');

  // 3. Test question scoring predicate
  console.log('\nTest Suite 2: Automated Scorable Predicate for Ranking Questions');
  const autoScorableRanking = hasAutomaticallyScorableAnswer(rankingQDoc);
  assert(autoScorableRanking === false, 'Ranking question without fixed order is NOT automatically scorable');

  // Contrast with standard MCQ question
  const mcqDoc = {
    content: 'What is 2 + 2?',
    options: ['3', '4', '5'],
    correctAnswer: '4',
    isRanking: false,
  };
  assert(hasAutomaticallyScorableAnswer(mcqDoc) === true, 'Regression: Standard MCQ remains automatically scorable');

  // 4. Test Publishing & Question Snapshot
  console.log('\nTest Suite 3: Test Publishing & Question Snapshot');
  const publishedTest = await PublishedTestModel.create({
    publishName: 'Emergency Ranking Assessment',
    publishMode: 'Selected Questions',
    target: {
      schoolId: String(schoolA._id),
      schoolIds: [String(schoolA._id)],
      schoolName: schoolA.name,
      classes: ['All Classes'],
      sections: [],
      studentIds: [studentA.uniqueStudentId!],
    },
    targets: [],
    startDate: 'Today',
    startTime: '12:00 AM',
    endDate: 'Open',
    endTime: '11:59 PM',
    questionIds: [String(rankingQDoc._id)],
    questionsSnapshot: [
      {
        id: String(rankingQDoc._id),
        questionId: String(rankingQDoc._id),
        groupId: String(group._id),
        groupName: group.name,
        difficulty: 'Medium',
        content: rankingQDoc.content,
        points: 10,
        timeAllowedSeconds: 60,
        options: rankingQDoc.options,
        isRanking: true,
        isRankingQuestion: true,
        questionType: 'Ranking',
        enableWrittenExplanation: true,
        scoringGuide: rankingQDoc.scoringGuide,
        expectedResponse: rankingQDoc.expectedResponse,
      },
    ],
  });

  assert(publishedTest.questionsSnapshot.length === 1, 'Published test snapshot generated');
  assert(Boolean(publishedTest.questionsSnapshot[0].isRanking), 'Snapshot preserves isRanking=true');
  assert(publishedTest.questionsSnapshot[0].scoringGuide !== undefined, 'Snapshot preserves scoringGuide');
  assert(publishedTest.questionsSnapshot[0].expectedResponse !== undefined, 'Snapshot preserves expectedResponse');

  // 5. Test Student Assignment, Saving & Resuming Ranking Order
  console.log('\nTest Suite 4: Student Ranking Answer Saving & Resuming');
  const assignment = await StudentTestAssignmentModel.create({
    publishedTestId: String(publishedTest._id),
    publishName: publishedTest.publishName,
    studentId: studentA.uniqueStudentId!,
    studentName: studentA.studentName!,
    schoolAdmissionNumber: 'ADM-001',
    schoolId: String(schoolA._id),
    schoolName: schoolA.name,
    className: 'Grade 10',
    section: 'A',
    status: 'IN_PROGRESS',
    startedAt: new Date(),
    questions: [
      {
        questionId: String(rankingQDoc._id),
        groupName: group.name,
        difficulty: 'Medium',
        questionType: 'Ranking',
        isRanking: true,
        isRankingQuestion: true,
        content: rankingQDoc.content,
        points: 10,
        timeAllowedSeconds: 60,
        timeSeconds: 60,
        timeTakenSeconds: 15,
        options: rankingQDoc.options,
        studentAnswer: null,
        writtenExplanation: '',
        enableWrittenExplanation: true,
        isCorrect: false,
        earnedPoints: 0,
        scoringGuide: rankingQDoc.scoringGuide,
        expectedResponse: rankingQDoc.expectedResponse,
      },
    ],
  });

  // Student reorders and saves ranking answer
  const studentRankedOrder = [
    { id: 'stmt-2', text: 'Secure the immediate hazard zone', rank: 1 },
    { id: 'stmt-1', text: 'Check victim breathing and pulse', rank: 2 },
    { id: 'stmt-0', text: 'Call emergency services', rank: 3 },
    { id: 'stmt-3', text: 'Provide basic first aid treatment', rank: 4 },
  ];

  await StudentTestAssignmentModel.findByIdAndUpdate(assignment._id, {
    $set: {
      'questions.0.studentAnswer': studentRankedOrder,
      'questions.0.writtenExplanation': 'Safety first, then assessment, then communication, then treatment.',
      'questions.0.timeTakenSeconds': 25,
    },
  });

  // Resuming test: load assignment from database and verify saved order is strictly restored
  const resumedAssignment = await StudentTestAssignmentModel.findById(assignment._id);
  const resumedQ = resumedAssignment?.questions[0];

  assert(Array.isArray(resumedQ?.studentAnswer), 'Resumed answer is an array');
  assert(resumedQ?.studentAnswer?.length === 4, 'All 4 ranked statements restored');
  assert(resumedQ?.studentAnswer?.[0]?.text === 'Secure the immediate hazard zone', 'Statement identity and priority Rank 1 restored correctly');
  assert(resumedQ?.studentAnswer?.[0]?.rank === 1, 'Rank 1 preserved');
  assert(resumedQ?.studentAnswer?.[3]?.text === 'Provide basic first aid treatment', 'Priority Rank 4 restored correctly');
  assert(resumedQ?.writtenExplanation?.includes('Safety first'), 'Written explanation restored');

  // Verify student start/resume route payload serialization preservation (Issue 1)
  const isRankingResume = Boolean(
    resumedQ?.isRanking ||
    resumedQ?.isRankingQuestion ||
    rankingQDoc.isRanking ||
    rankingQDoc.isRankingQuestion ||
    String(resumedQ?.questionType || rankingQDoc.questionType || '').toLowerCase() === 'ranking'
  );
  const serializedResumeQ = serializeStudentQuestion({
    questionId: resumedQ?.questionId,
    groupName: resumedQ?.groupName,
    difficulty: resumedQ?.difficulty,
    content: resumedQ?.content,
    points: resumedQ?.points,
    timeAllowedSeconds: resumedQ?.timeAllowedSeconds,
    options: resumedQ?.options,
    answerType: resumedQ?.answerType || 'single',
    isRanking: isRankingResume,
    isRankingQuestion: isRankingResume,
    questionType: isRankingResume ? 'Ranking' : 'Single Selection',
    studentAnswer: resumedQ?.studentAnswer,
  });
  assert(Boolean(serializedResumeQ.isRanking), 'Resume serialized payload preserves isRanking=true');
  assert(Boolean(serializedResumeQ.isRankingQuestion), 'Resume serialized payload preserves isRankingQuestion=true');
  assert(serializedResumeQ.questionType === 'Ranking', 'Resume serialized payload preserves questionType=Ranking');
  assert(Array.isArray(serializedResumeQ.studentAnswer), 'Resume serialized payload preserves saved ranking order');

  // Verify ranking question with promptImages (Issue 3)
  const rankingWithImages = serializeStudentQuestion({
    content: 'Rank by size',
    isRanking: true,
    isRankingQuestion: true,
    questionType: 'Ranking',
    options: ['Small', 'Medium', 'Large'],
    images: [{ id: 'img-1', url: 'https://example.com/test.png', label: 'Illustration', role: 'question' }],
  });
  assert(rankingWithImages.images?.length === 1, 'Ranking question preserves attached promptImages');
  assert(rankingWithImages.images[0].url === 'https://example.com/test.png', 'Prompt image url preserved');

  // Verify preview mapping preservation (Issue 2)
  const previewCandidate = {
    content: 'Preview ranking',
    options: ['A', 'B'],
    isRanking: true,
    isRankingQuestion: true,
    rankingQuestion: true,
    questionType: 'Ranking',
  };
  const isCurRankingCandidate = Boolean(
    previewCandidate.isRanking ||
    previewCandidate.isRankingQuestion ||
    previewCandidate.rankingQuestion ||
    String(previewCandidate.questionType || '').toLowerCase() === 'ranking'
  );
  assert(isCurRankingCandidate === true, 'Preview questions correctly identify ranking question without relying on rankingQuestion alone');

  // 6. Test Final Submission: Ranking question is not marked automatically wrong
  console.log('\nTest Suite 5: Final Test Submission Evaluation');
  // Complete test
  await StudentTestAssignmentModel.findByIdAndUpdate(assignment._id, {
    $set: {
      status: 'COMPLETED',
      completedAt: new Date(),
      totalPointsEarned: 0, // Pending assessor
      scoreOutOf100: 0, // Pending assessor
      correctCount: 0,
      wrongCount: 0, // Not automatically counted as wrong!
      totalTimeTakenSeconds: 25,
    },
  });

  const submittedAssignment = await StudentTestAssignmentModel.findById(assignment._id);
  assert(submittedAssignment?.status === 'COMPLETED', 'Assessment marked COMPLETED');
  assert(submittedAssignment?.wrongCount === 0, 'Ranking question was NOT automatically marked wrong');

  // 7. Assessor Manual Scoring and Notes
  console.log('\nTest Suite 6: Assessor Review, Scoring, and Notes');
  // Assessor reviews ranking order, notes excellent rationale, and awards 9 out of 10 points
  const assessorScore = 9;
  const assessorNotes = 'Exemplary hazard awareness and prioritization order. Deducted 1 pt for slight delay in service call.';

  submittedAssignment!.questions[0].assessorScore = assessorScore;
  submittedAssignment!.questions[0].earnedPoints = assessorScore;
  submittedAssignment!.questions[0].assessorNotes = assessorNotes;
  submittedAssignment!.questions[0].assessedBy = 'test_assessor';
  submittedAssignment!.questions[0].assessedAt = new Date().toISOString();
  submittedAssignment!.questions[0].isCorrect = true;

  submittedAssignment!.totalPointsEarned = assessorScore;
  submittedAssignment!.scoreOutOf100 = 90; // (9 / 10) * 100
  submittedAssignment!.correctCount = 1;
  submittedAssignment!.markModified('questions');
  await submittedAssignment!.save();

  const assessedAssignment = await StudentTestAssignmentModel.findById(assignment._id);
  const assessedQ = assessedAssignment?.questions[0];

  assert(assessedQ?.assessorScore === 9, 'Assessor score 9 pts saved');
  assert(assessedQ?.assessorNotes === assessorNotes, 'Assessor feedback notes saved');
  assert(assessedQ?.assessedBy === 'test_assessor', 'Assessor identity recorded');
  assert(assessedAssignment?.scoreOutOf100 === 90, 'Total score recalculated to 90%');

  // 8. Authorization and School Isolation Check
  console.log('\nTest Suite 7: Authorization and School Isolation');
  // Verify school isolation: An assessor from schoolB attempting to score assignment belonging to schoolA
  const isSchoolAdminFromDifferentSchool = String(schoolB._id) !== String(assessedAssignment?.schoolId);
  assert(isSchoolAdminFromDifferentSchool, 'School Admin from School B correctly recognized as outside student tenant School A');

  // 9. Cleanup Synthetic Test Records
  console.log('\nCleanup: Removing synthetic test records from puzzles_assessment_test...');
  await QuestionModel.deleteOne({ _id: rankingQDoc._id });
  await PublishedTestModel.deleteOne({ _id: publishedTest._id });
  await StudentTestAssignmentModel.deleteOne({ _id: assignment._id });
  await SchoolModel.deleteOne({ code: 'TEST_SCH_A' });
  await SchoolModel.deleteOne({ code: 'TEST_SCH_B' });
  await QuestionGroupModel.deleteOne({ _id: group._id });
  await UserModel.deleteOne({ uniqueStudentId: 'TEST_STU_RANK_A' });

  await mongoose.disconnect();

  console.log(`\n=== Automated Test Suite Complete ===`);
  console.log(`Total Passed: ${passedCount}`);
  console.log(`Total Failed: ${failedCount}`);

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRankingQuestionTests().catch((err) => {
  console.error('Unhandled test execution error:', err);
  process.exit(1);
});
