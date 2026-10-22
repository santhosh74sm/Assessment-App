import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { QuestionModel, QuestionGroupModel } from '../database/models.ts';
import { resolveMongoUri, buildTargetUri } from '../backend/database.ts';

dotenv.config();

const rawUri = resolveMongoUri() || 'mongodb://127.0.0.1:27017/puzzles_assessment';
const MONGO_URI = buildTargetUri(rawUri, 'puzzles_assessment_dev');

interface ImportStats {
  totalRows: number;
  imported: number;
  skipped: number;
  warnings: string[];
}

async function run() {
  const filePathArg = process.argv[2] || 'Pictorial(1).xlsx';
  const resolvedPath = path.isAbsolute(filePathArg) ? filePathArg : path.join(process.cwd(), filePathArg);

  console.log('----------------------------------------------------');
  console.log(' Puzzles Assessment App - Pictorial Questions Importer');
  console.log('----------------------------------------------------');
  console.log(`Target workbook: ${resolvedPath}`);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: File "${resolvedPath}" does not exist.`);
    console.log('Place "Pictorial(1).xlsx" in the project root or provide the path:');
    console.log('  tsx scripts/import_pictorial_excel.ts path/to/file.xlsx');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log(`Connected to MongoDB: ${MONGO_URI}`);

  // Fetch or create default pictorial question group
  let targetGroup = await QuestionGroupModel.findOne({
    name: { $regex: /pictorial|visual|puzzle/i },
  });

  if (!targetGroup) {
    targetGroup = await QuestionGroupModel.findOne();
  }

  if (!targetGroup) {
    targetGroup = await QuestionGroupModel.create({
      name: 'Pictorial & Visual Puzzles',
      description: 'Image-based visual reasoning, diagrammatic analysis, and spatial puzzles',
    });
    console.log(`Created new Question Group: "${targetGroup.name}" (${targetGroup._id})`);
  } else {
    console.log(`Using Question Group: "${targetGroup.name}" (${targetGroup._id})`);
  }

  const fileBuffer = fs.readFileSync(resolvedPath);
  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: '' });

  console.log(`Loaded sheet "${sheetName}" with ${rows.length} row(s).`);

  const stats: ImportStats = {
    totalRows: rows.length,
    imported: 0,
    skipped: 0,
    warnings: [],
  };

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = idx + 2; // Excel 1-based, plus header row

    // Find question prompt
    const content = String(
      row.Question ||
      row['Question Text'] ||
      row.Content ||
      row.Prompt ||
      row['Visual Description'] ||
      row.Description ||
      ''
    ).trim();

    if (!content) {
      stats.skipped++;
      stats.warnings.push(`Row #${rowNum}: Skipped due to empty question text or prompt.`);
      continue;
    }

    // Options
    const options: string[] = [];
    ['Option A', 'Option B', 'Option C', 'Option D', 'Option E', 'Option 1', 'Option 2', 'Option 3', 'Option 4'].forEach(k => {
      if (row[k] !== undefined && String(row[k]).trim() !== '') {
        options.push(String(row[k]).trim());
      }
    });

    if (options.length === 0 && row.Options) {
      String(row.Options).split(/[,|\n]/).forEach(o => {
        const trimmed = o.trim();
        if (trimmed) options.push(trimmed);
      });
    }

    // Default pictorial options if not explicitly listed
    if (options.length === 0) {
      options.push('Picture A', 'Picture B', 'Picture C', 'Picture D');
    }

    // Correct Answer
    const corrAnsRaw = String(row['Correct Answer'] || row.Answer || row.Key || '').trim();
    let correctAnswer: string | null = null;
    if (corrAnsRaw) {
      correctAnswer = corrAnsRaw;
    } else {
      stats.warnings.push(`Row #${rowNum}: No explicit correct answer provided. Flagged for educator calibration.`);
    }

    // Difficulty
    let difficulty: 'Easy' | 'Medium' | 'Hard' = 'Easy';
    const diffRaw = String(row.Difficulty || '').toLowerCase();
    if (diffRaw.includes('hard') || diffRaw.includes('difficult')) difficulty = 'Hard';
    else if (diffRaw.includes('med')) difficulty = 'Medium';

    // Points & time limit
    const points = Number(row.Points || row.Score) || 1;
    const timeSeconds = Number(row['Time Limit'] || row.TimeSeconds || row.Time) || 60;

    // Check for existing question with same content in the group
    const existing = await QuestionModel.findOne({
      groupId: targetGroup._id.toString(),
      content,
    });

    if (existing) {
      stats.skipped++;
      stats.warnings.push(`Row #${rowNum}: Duplicate question already exists. Skipped.`);
      continue;
    }

    // Extract visual prompt or notes if present
    const visualPrompt = String(row['Visual Prompt'] || row['Image Note'] || row['Image Description'] || '').trim();
    const images: any[] = [];
    if (visualPrompt) {
      images.push({
        id: `draft-ref-${idx + 1}`,
        url: '',
        key: '',
        label: 'Visual Prompt Note',
        caption: visualPrompt,
        order: 0,
        role: 'main_prompt',
      });
    }

    await QuestionModel.create({
      groupId: targetGroup._id.toString(),
      difficulty,
      content,
      points,
      timeSeconds,
      timeAllowedSeconds: timeSeconds,
      options,
      correctAnswer,
      correctAnswers: correctAnswer ? [correctAnswer] : [],
      answerType: 'single',
      questionType: 'Single Selection',
      isRanking: false,
      isRankingQuestion: false,
      enableWrittenExplanation: true,
      images,
      imageLayout: 'auto',
    });

    stats.imported++;
  }

  console.log('----------------------------------------------------');
  console.log('Import Complete Summary:');
  console.log(`  Total Rows Processed : ${stats.totalRows}`);
  console.log(`  Questions Imported   : ${stats.imported}`);
  console.log(`  Rows Skipped         : ${stats.skipped}`);
  console.log(`  Warnings Logged      : ${stats.warnings.length}`);
  if (stats.warnings.length > 0) {
    console.log('\nSample Warnings:');
    stats.warnings.slice(0, 10).forEach(w => console.log(`  - ${w}`));
    if (stats.warnings.length > 10) {
      console.log(`  ... and ${stats.warnings.length - 10} more.`);
    }
  }
  console.log('----------------------------------------------------');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Fatal import error:', err);
  process.exit(1);
});
