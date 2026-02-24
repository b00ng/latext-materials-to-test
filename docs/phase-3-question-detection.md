# Phase 3: Question Detection + Async Processing (Week 3)

> Implement the `QuestionDetector` and `MCQFormatter` domain services for extracting and structuring MCQ questions from parsed LaTeX content, plus the Queue-based async processing pipeline.

---

## Context Links

- [Master plan: implementation_plan.md](./implementation_plan.md)
- [Phase 2 parser plan](./phase-2-latex-parser-port.md)
- Python reference: `/Users/khangvt/projects/latex-book-to-html/src/tex2html_book/resolve_tex.py`
- Python reference: `/Users/khangvt/projects/latex-book-to-html/src/tex2html_book/tex2html.py`

## Overview

- Priority: P0
- Status: In Progress (2026-02-24)
- Scope: deterministic detection + queue orchestration for `latex`/`pdf`/`docx`/`image`

## Key Insights

- JS regex must avoid Python-only anchors (`\Z`).
- Correct answer cannot be guessed; unresolved must be explicit review state.
- Queue job rows must be source of truth for progress and failures.

## Requirements

- Functional: detect questions, format MCQs, process async jobs, persist status/progress.
- Non-functional: deterministic extraction, idempotent retries, explicit failure visibility.

## Architecture

- Non-LaTeX sources are normalized first, then run through same detector/formatter.
- Queue consumer updates `extraction_jobs` on start, progress, success, failure.

## Related Code Files

- `src/domain/services/QuestionDetector.ts`
- `src/domain/services/MCQFormatter.ts`
- `src/application/use-cases/ExtractQuestionsUseCase.ts`
- `src/adapters/queue/extraction-consumer.ts`
- `src/infrastructure/persistence/D1MaterialRepository.ts`

## Implementation Steps

1. Finalize detector/formatter contracts.
2. Integrate normalization-aware extraction use case.
3. Implement queue consumer with durable job-state updates.
4. Add unit + integration tests for each strategy and status transition.

## Todo List

- [x] Implement queue-based normalization flow for `pdf`/`docx`/`image` with KV job state.
- [ ] Replace Python-incompatible regex anchors in detector/parser implementation.
- [ ] Implement `QuestionDetector` and `MCQFormatter`.
- [ ] Persist extracted questions + `answer_status` into D1.
- [ ] Implement durable D1-backed job progress/status writes.

## Success Criteria

- Regex behavior stable in V8/Workers.
- No stored question has fabricated `correctAnswer`.
- Job table shows full lifecycle for every queue message.

## Risk Assessment

- Mixed-format normalization quality can impact detector precision.
- Retry loops can duplicate work if idempotency is weak.

## Security Considerations

- Sanitize and bound normalized payload sizes.
- Never execute source text/macros as code.

## Next Steps

- Phase 4 API and auth enforcement.

## 3.1 Question Detector

**New logic** — no direct equivalent in the original codebase. This service identifies MCQ question blocks within the parsed LaTeX content using regex pattern matching.

### `src/domain/services/QuestionDetector.ts`

```typescript
import { QuestionBlock } from '../entities/QuestionBlock';
import { SectionInfo, ParsedList } from '../value-objects/SectionInfo';
import { generateId } from '../../shared/types';

/**
 * Detects MCQ question blocks in parsed LaTeX sections.
 *
 * Detection strategies (all regex-based, no AI):
 *   1. Vietnamese numbered questions: "Câu 1:", "Bài 2."
 *   2. English numbered questions: "Question 1:", "Problem 2."
 *   3. Enumerate lists with choice sub-items (A), (B), (C), (D)
 *   4. Explicit exam environments: \begin{questions}, \begin{exercise}
 *   5. Fallback: heuristic paragraph splitting for unstructured content
 */

// --- Question stem patterns ---
const QUESTION_PATTERNS = [
  /^Câu\s+(\d+)[.:]\s*([\s\S]*?)(?=^Câu\s+\d+[.:]|\s*$)/gm,
  /^Bài\s+(\d+)[.:]\s*([\s\S]*?)(?=^Bài\s+\d+[.:]|\s*$)/gm,
  /^Question\s+(\d+)[.:]\s*([\s\S]*?)(?=^Question\s+\d+[.:]|\s*$)/gm,
  /^Problem\s+(\d+)[.:]\s*([\s\S]*?)(?=^Problem\s+\d+[.:]|\s*$)/gm,
];

// --- Choice extraction patterns ---
const CHOICE_PATTERNS = [
  /^\s*([A-D])[.)]\s+([\s\S]*?)(?=^\s*[A-D][.)]|\s*$)/gm,   // A. choice text
  /\\item\s*\(?([A-Da-d])\)?\s+([\s\S]*?)(?=\\item|\s*$)/gm,  // \item (A) text
];

// --- Answer key patterns ---
const ANSWER_KEY_PATTERNS = [
  /Đáp\s+án[:\s]+([A-D])/gi,           // "Đáp án: B"
  /Answer[:\s]+([A-D])/gi,              // "Answer: C"
  /\\textbf\{([A-D])\}/g,              // \textbf{A} — bold marks correct
  /\\underline\{([A-D])\}/g,           // \underline{B}
  /\\boxed\{([A-D])\}/g,               // \boxed{C}
];

// --- Difficulty patterns ---
const DIFFICULTY_PATTERNS = [
  /(?:Mức|Level|Difficulty)[:\s]*(\d+)/gi,
  /\[(\d+)\s*(?:điểm|points?)\]/gi,
];

export class QuestionDetector {

  /**
   * Main entry: detect all question blocks in a section.
   */
  detect(section: SectionInfo): QuestionBlock[] {
    const content = section.textContent;
    let blocks: QuestionBlock[] = [];

    // Strategy 1: Try Vietnamese/English numbered patterns
    blocks = this.detectByNumberedPatterns(content);
    if (blocks.length > 0) return blocks;

    // Strategy 2: Try enumerate lists as question containers
    blocks = this.detectByEnumerateLists(section.lists, content);
    if (blocks.length > 0) return blocks;

    // Strategy 3: Try exam-style environments
    blocks = this.detectByEnvironments(section.environments, content);
    if (blocks.length > 0) return blocks;

    // Strategy 4: Heuristic paragraph splitting
    blocks = this.detectByParagraphHeuristic(content);
    return blocks;
  }

  /**
   * Strategy 1: Match "Câu N:" / "Question N:" patterns.
   * Split content at each question marker, extract choices within each.
   */
  private detectByNumberedPatterns(content: string): QuestionBlock[] {
    const blocks: QuestionBlock[] = [];

    for (const pattern of QUESTION_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      const matches = [...content.matchAll(re)];
      if (matches.length === 0) continue;

      // Split content at question boundaries
      const questionTexts: { num: number; text: string }[] = [];
      for (let i = 0; i < matches.length; i++) {
        const num = parseInt(matches[i][1]);
        const start = matches[i].index! + matches[i][0].indexOf(matches[i][2]);
        const end = i + 1 < matches.length ? matches[i + 1].index! : content.length;
        questionTexts.push({ num, text: content.substring(start, end).trim() });
      }

      for (const qt of questionTexts) {
        const block = this.extractQuestionBlock(qt.text, qt.num);
        if (block) blocks.push(block);
      }

      if (blocks.length > 0) return blocks;
    }

    return blocks;
  }

  /**
   * Strategy 2: Use parsed enumerate lists.
   * Each top-level \item is a question, nested enumerate items are choices.
   */
  private detectByEnumerateLists(
    lists: ParsedList[],
    content: string
  ): QuestionBlock[] {
    const blocks: QuestionBlock[] = [];

    for (const list of lists) {
      if (list.type !== 'enumerate') continue;

      for (let i = 0; i < list.items.length; i++) {
        const block = this.extractQuestionBlock(list.items[i], i + 1);
        if (block && block.choiceContents.length >= 2) {
          blocks.push(block);
        }
      }
    }

    return blocks;
  }

  /**
   * Strategy 3: Look inside exercise/questions environments.
   */
  private detectByEnvironments(
    environments: { name: string; content: string }[],
    content: string
  ): QuestionBlock[] {
    const blocks: QuestionBlock[] = [];
    const examEnvNames = ['questions', 'exercise', 'exercises', 'baitap', 'exam'];

    for (const env of environments) {
      if (examEnvNames.includes(env.name)) {
        // Recursively detect within environment content
        const innerBlocks = this.detectByNumberedPatterns(env.content);
        blocks.push(...innerBlocks);
      }
    }

    return blocks;
  }

  /**
   * Strategy 4: Fallback heuristic — split by double newlines,
   * look for blocks that contain choice-like patterns.
   */
  private detectByParagraphHeuristic(content: string): QuestionBlock[] {
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());
    const blocks: QuestionBlock[] = [];

    let questionNum = 1;
    for (const para of paragraphs) {
      const choices = this.extractChoices(para);
      if (choices.length >= 3) {
        const block = this.extractQuestionBlock(para, questionNum);
        if (block) {
          blocks.push(block);
          questionNum++;
        }
      }
    }

    return blocks;
  }

  /**
   * Extract a structured QuestionBlock from raw text.
   */
  private extractQuestionBlock(text: string, num: number): QuestionBlock | null {
    const choices = this.extractChoices(text);
    if (choices.length < 2) return null;

    // Stem = everything before the first choice
    const firstChoiceIdx = this.findFirstChoiceIndex(text);
    const stem = firstChoiceIdx > 0 ? text.substring(0, firstChoiceIdx).trim() : text.trim();

    // Detect correct answer
    const correctAnswer = this.detectCorrectAnswer(text);

    // Detect difficulty
    const difficulty = this.detectDifficulty(text);

    return {
      id: generateId(),
      rawLatex: text,
      questionNumber: num,
      stemContent: stem,
      choiceContents: choices,
      correctAnswerHint: correctAnswer,
      difficulty,
      topic: null,
    };
  }

  /**
   * Extract answer choices (A, B, C, D) from text.
   */
  private extractChoices(text: string): string[] {
    const choices: string[] = [];

    for (const pattern of CHOICE_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      const matches = [...text.matchAll(re)];
      if (matches.length >= 2) {
        return matches.map(m => m[2].trim());
      }
    }

    return choices;
  }

  private findFirstChoiceIndex(text: string): number {
    const patterns = [
      /^\s*A[.)]/m,
      /\\item\s*\(?A\)?/,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m && m.index !== undefined) return m.index;
    }
    return -1;
  }

  /**
   * Detect the correct answer from explicit markers.
   */
  private detectCorrectAnswer(text: string): string | null {
    for (const pattern of ANSWER_KEY_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      const m = re.exec(text);
      if (m) return m[1].toUpperCase();
    }
    return null;
  }

  /**
   * Detect difficulty level from text markers.
   */
  private detectDifficulty(text: string): number | null {
    for (const pattern of DIFFICULTY_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      const m = re.exec(text);
      if (m) {
        const val = parseInt(m[1]);
        if (val >= 1 && val <= 10) return val;
      }
    }
    return null;
  }
}
```

---

## 3.2 MCQ Formatter

### `src/domain/services/MCQFormatter.ts`

```typescript
import { MCQQuestion } from '../entities/MCQQuestion';
import { QuestionBlock } from '../entities/QuestionBlock';
import { Choice } from '../entities/Choice';
import { SourceReference } from '../value-objects/SourceReference';
import { generateId } from '../../shared/types';

/**
 * Formats detected QuestionBlocks into structured MCQQuestion entities.
 *
 * Responsibilities:
 *   - Map choice contents to labeled Choice objects (A, B, C, D)
 *   - Set correct answer from detected hints
 *   - Preserve LaTeX in both stem and choices
 *   - Assign source references for traceability
 */
export class MCQFormatter {

  format(
    block: QuestionBlock,
    materialId: string,
    chapterNum: number | null,
    sectionTitle: string | null,
    questionIndex: number
  ): MCQQuestion {
    const labels: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    const normalizedHint = block.correctAnswerHint?.toUpperCase() ?? null;
    const correctAnswer = normalizedHint && labels.includes(normalizedHint as any)
      ? (normalizedHint as 'A' | 'B' | 'C' | 'D')
      : null;
    const answerStatus = correctAnswer ? 'confirmed' : 'needs_review';

    const choices: Choice[] = block.choiceContents
      .slice(0, 4)
      .map((content, i) => ({
        label: labels[i],
        text: this.stripLatexForDisplay(content),
        latex: content,
        isCorrect: correctAnswer === labels[i],
      }));

    const sourceRef: SourceReference = {
      materialId,
      chapter: chapterNum,
      section: sectionTitle,
      questionIndex,
    };

    return {
      id: generateId(),
      materialId,
      stem: this.stripLatexForDisplay(block.stemContent),
      stemLatex: block.stemContent,
      choices,
      correctAnswer,
      answerStatus,
      explanation: null,
      explanationLatex: null,
      difficulty: block.difficulty ?? 5,
      topic: block.topic,
      tags: [],
      sourceRef,
      createdAt: new Date(),
    };
  }

  /**
   * Strip LaTeX markup for display text, preserving math.
   * Math expressions ($...$, $$...$$) are kept.
   * Commands like \textbf{}, \emph{} are unwrapped.
   */
  private stripLatexForDisplay(latex: string): string {
    return latex
      .replace(/\\textbf\{([^}]*)\}/g, '$1')
      .replace(/\\textit\{([^}]*)\}/g, '$1')
      .replace(/\\emph\{([^}]*)\}/g, '$1')
      .replace(/\\underline\{([^}]*)\}/g, '$1')
      .replace(/\\text\{([^}]*)\}/g, '$1')
      .replace(/\\\\/g, ' ')
      .replace(/\\quad/g, ' ')
      .replace(/\\,/g, ' ')
      .replace(/~/g, ' ')
      .trim();
  }
}
```

---

## 3.3 Extraction Use Case

### `src/application/use-cases/ExtractQuestionsUseCase.ts`

```typescript
import { MCQQuestion } from '../../domain/entities/MCQQuestion';
import { LaTeXParser } from '../../domain/services/LaTeXParser';
import { QuestionDetector } from '../../domain/services/QuestionDetector';
import { MCQFormatter } from '../../domain/services/MCQFormatter';
import { MaterialRepository } from '../ports/output/MaterialRepository';
import { QuestionRepository } from '../ports/output/QuestionRepository';
import { FileStoragePort } from '../ports/output/FileStoragePort';
import { NormalizationPort } from '../ports/output/NormalizationPort';

export class ExtractQuestionsUseCase {
  private parser = new LaTeXParser();
  private detector = new QuestionDetector();
  private formatter = new MCQFormatter();

  constructor(
    private materialRepo: MaterialRepository,
    private questionRepo: QuestionRepository,
    private storage: FileStoragePort,
    private normalizer: NormalizationPort,
  ) {}

  async execute(materialId: string): Promise<MCQQuestion[]> {
    try {
      // 1. Fetch source from R2
      const material = await this.materialRepo.findById(materialId);
      if (!material) throw new Error(`Material ${materialId} not found`);

      const fileMap = await this.storage.downloadAsFileMap(
        material.r2Key,
        material.manifestKey
      );
      if (fileMap.size === 0) throw new Error(`No files found for material ${materialId}`);

      // 2. Normalize if needed
      if (material.sourceType !== 'latex') {
        await this.materialRepo.updateStatus(materialId, 'normalizing');
      }
      const normalized = material.sourceType === 'latex'
        ? {
            mainFile: material.metadata?.mainFile ?? 'main.tex',
            fileMap: new Map(
              [...fileMap.entries()].map(([name, bytes]) => [name, new TextDecoder().decode(bytes)])
            ),
          }
        : await this.normalizer.normalize({
            materialId,
            sourceType: material.sourceType,
            fileMap,
          });

      // 3. Parse normalized LaTeX-like content
      await this.materialRepo.updateStatus(materialId, 'processing');
      const parsed = this.parser.parse(normalized.fileMap, normalized.mainFile);

      // 4. Detect and format questions
      const allQuestions: MCQQuestion[] = [];
      let globalIndex = 0;

      for (const chapter of parsed.chapters) {
        for (const section of chapter.sections) {
          const blocks = this.detector.detect(section);

          for (const block of blocks) {
            const question = this.formatter.format(
              block,
              materialId,
              chapter.number,
              section.title,
              globalIndex++
            );
            allQuestions.push(question);
          }
        }
      }

      // 5. Store questions
      if (allQuestions.length > 0) {
        await this.questionRepo.createMany(allQuestions);
      }

      // 6. Update metadata & status
      await this.materialRepo.updateMetadata(materialId, parsed.metadata);
      await this.materialRepo.updateStatus(materialId, 'completed');

      return allQuestions;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.materialRepo.updateStatus(materialId, 'failed', message);
      throw error;
    }
  }
}
```

---

## 3.4 Queue Consumer

### `src/adapters/queue/extraction-consumer.ts`

```typescript
import { Env } from '../../index';
import { ExtractQuestionsUseCase } from '../../application/use-cases/ExtractQuestionsUseCase';
import { D1MaterialRepository } from '../../infrastructure/persistence/D1MaterialRepository';
import { D1QuestionRepository } from '../../infrastructure/persistence/D1QuestionRepository';
import { R2FileStorage } from '../../infrastructure/storage/R2FileStorage';
import { HttpNormalizationClient } from '../../infrastructure/normalization/HttpNormalizationClient';

interface ExtractionJobMessage {
  materialId: string;
  jobId: string;
}

export async function handleExtractionMessage(
  message: Message<ExtractionJobMessage>,
  env: Env
): Promise<void> {
  const { materialId, jobId } = message.body;
  console.log(`Processing extraction job ${jobId} for material ${materialId}`);

  const materialRepo = new D1MaterialRepository(env.DB);
  const questionRepo = new D1QuestionRepository(env.DB);
  const storage = new R2FileStorage(env.STORAGE);
  const normalizer = new HttpNormalizationClient(env.NORMALIZER_URL, env.NORMALIZER_TOKEN);

  const useCase = new ExtractQuestionsUseCase(materialRepo, questionRepo, storage, normalizer);
  await env.DB.prepare(
    `UPDATE extraction_jobs
     SET status = 'processing', progress = 10, started_at = datetime('now')
     WHERE id = ?`
  ).bind(jobId).run();

  try {
    const questions = await useCase.execute(materialId);
    await env.DB.prepare(
      `UPDATE extraction_jobs
       SET status = 'completed', progress = 100, completed_at = datetime('now'),
           result = json_object('questionCount', ?)
       WHERE id = ?`
    ).bind(questions.length, jobId).run();
    console.log(`Extracted ${questions.length} questions from material ${materialId}`);
    message.ack();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await env.DB.prepare(
      `UPDATE extraction_jobs
       SET status = 'failed', error = ?, completed_at = datetime('now')
       WHERE id = ?`
    ).bind(errorMessage, jobId).run();
    console.error(`Extraction failed for material ${materialId}:`, error);
    message.retry();
  }
}
```

---

## 3.5 Infrastructure Adapters

### `src/infrastructure/persistence/D1MaterialRepository.ts`

```typescript
import { MaterialRepository } from '../../application/ports/output/MaterialRepository';
import { TestMaterial, MaterialStatus } from '../../domain/entities/TestMaterial';
import { MaterialMetadata } from '../../domain/value-objects/MaterialMetadata';

export class D1MaterialRepository implements MaterialRepository {
  constructor(private db: D1Database) {}

  async create(material: TestMaterial): Promise<void> {
    await this.db.prepare(
      `INSERT INTO materials (id, title, source_type, status, r2_key, manifest_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      material.id,
      material.title,
      material.sourceType,
      material.status,
      material.r2Key,
      material.manifestKey
    ).run();
  }

  async findById(id: string): Promise<TestMaterial | null> {
    const row = await this.db.prepare('SELECT * FROM materials WHERE id = ?').bind(id).first();
    return row ? this.mapRow(row) : null;
  }

  async findAll(params?: { status?: MaterialStatus; limit?: number; offset?: number }): Promise<TestMaterial[]> {
    let sql = 'SELECT * FROM materials';
    const binds: any[] = [];
    if (params?.status) { sql += ' WHERE status = ?'; binds.push(params.status); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    binds.push(params?.limit ?? 50, params?.offset ?? 0);
    const { results } = await this.db.prepare(sql).bind(...binds).all();
    return results.map(r => this.mapRow(r));
  }

  async updateStatus(id: string, status: MaterialStatus, error?: string): Promise<void> {
    await this.db.prepare(
      `UPDATE materials SET status = ?, error_message = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(status, error ?? null, id).run();
  }

  async updateMetadata(id: string, metadata: MaterialMetadata): Promise<void> {
    await this.db.prepare(
      `UPDATE materials SET metadata = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(JSON.stringify(metadata), id).run();
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM materials WHERE id = ?').bind(id).run();
  }

  private mapRow(row: any): TestMaterial {
    return {
      id: row.id, sourceType: row.source_type, rawContent: '',
      title: row.title,
      status: row.status, r2Key: row.r2_key,
      manifestKey: row.manifest_key,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      errorMessage: row.error_message,
      createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
    };
  }
}
```

### `src/infrastructure/persistence/D1QuestionRepository.ts`

```typescript
import { QuestionRepository } from '../../application/ports/output/QuestionRepository';
import { MCQQuestion } from '../../domain/entities/MCQQuestion';

export class D1QuestionRepository implements QuestionRepository {
  constructor(private db: D1Database) {}

  async createMany(questions: MCQQuestion[]): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT INTO questions (id, material_id, stem, stem_latex, choices, correct_answer,
        answer_status, explanation, explanation_latex, difficulty, topic, tags,
        source_chapter, source_section, source_question_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const batch = questions.map(q =>
      stmt.bind(q.id, q.materialId, q.stem, q.stemLatex,
        JSON.stringify(q.choices), q.correctAnswer,
        q.answerStatus, q.explanation, q.explanationLatex, q.difficulty,
        q.topic, JSON.stringify(q.tags),
        q.sourceRef.chapter, q.sourceRef.section, q.sourceRef.questionIndex)
    );
    await this.db.batch(batch);
  }

  async findById(id: string): Promise<MCQQuestion | null> {
    const row = await this.db.prepare('SELECT * FROM questions WHERE id = ?').bind(id).first();
    return row ? this.mapRow(row) : null;
  }

  async findByMaterialId(materialId: string): Promise<MCQQuestion[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM questions WHERE material_id = ? ORDER BY source_question_index'
    ).bind(materialId).all();
    return results.map(r => this.mapRow(r));
  }

  async findAll(params?: any): Promise<MCQQuestion[]> {
    let sql = 'SELECT * FROM questions WHERE 1=1';
    const binds: any[] = [];
    if (params?.materialId) { sql += ' AND material_id = ?'; binds.push(params.materialId); }
    if (params?.topic) { sql += ' AND topic = ?'; binds.push(params.topic); }
    if (params?.difficulty?.min) { sql += ' AND difficulty >= ?'; binds.push(params.difficulty.min); }
    if (params?.difficulty?.max) { sql += ' AND difficulty <= ?'; binds.push(params.difficulty.max); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    binds.push(params?.limit ?? 50, params?.offset ?? 0);
    const { results } = await this.db.prepare(sql).bind(...binds).all();
    return results.map(r => this.mapRow(r));
  }

  async update(id: string, updates: Partial<MCQQuestion>): Promise<MCQQuestion | null> {
    // Build dynamic UPDATE for editable fields only
    const sets: string[] = [];
    const binds: any[] = [];
    if (updates.stem !== undefined) { sets.push('stem = ?'); binds.push(updates.stem); }
    if (updates.stemLatex !== undefined) { sets.push('stem_latex = ?'); binds.push(updates.stemLatex); }
    if (updates.choices !== undefined) { sets.push('choices = ?'); binds.push(JSON.stringify(updates.choices)); }
    if (updates.correctAnswer !== undefined) { sets.push('correct_answer = ?'); binds.push(updates.correctAnswer); }
    if (updates.answerStatus !== undefined) { sets.push('answer_status = ?'); binds.push(updates.answerStatus); }
    if (updates.difficulty !== undefined) { sets.push('difficulty = ?'); binds.push(updates.difficulty); }
    if (updates.topic !== undefined) { sets.push('topic = ?'); binds.push(updates.topic); }
    if (sets.length === 0) return this.findById(id);
    binds.push(id);
    await this.db.prepare(`UPDATE questions SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
    return this.findById(id);
  }

  async deleteByMaterialId(materialId: string): Promise<number> {
    const result = await this.db.prepare('DELETE FROM questions WHERE material_id = ?').bind(materialId).run();
    return result.meta.changes ?? 0;
  }

  private mapRow(row: any): MCQQuestion {
    return {
      id: row.id, materialId: row.material_id,
      stem: row.stem, stemLatex: row.stem_latex,
      choices: JSON.parse(row.choices), correctAnswer: row.correct_answer,
      answerStatus: row.answer_status,
      explanation: row.explanation, explanationLatex: row.explanation_latex,
      difficulty: row.difficulty, topic: row.topic,
      tags: row.tags ? JSON.parse(row.tags) : [],
      sourceRef: { materialId: row.material_id, chapter: row.source_chapter,
        section: row.source_section, questionIndex: row.source_question_index },
      createdAt: new Date(row.created_at),
    };
  }
}
```

### `src/infrastructure/storage/R2FileStorage.ts`

```typescript
import { FileStoragePort } from '../../application/ports/output/FileStoragePort';

export class R2FileStorage implements FileStoragePort {
  constructor(private bucket: R2Bucket) {}

  async upload(key: string, content: string | ArrayBuffer): Promise<void> {
    await this.bucket.put(key, content);
  }

  async download(key: string): Promise<string | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return await obj.text();
  }

  async downloadBytes(key: string): Promise<ArrayBuffer | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return await obj.arrayBuffer();
  }

  async downloadAsFileMap(
    rootKey: string,
    manifestKey?: string | null
  ): Promise<Map<string, ArrayBuffer>> {
    const fileMap = new Map<string, ArrayBuffer>();

    if (!manifestKey) {
      const content = await this.downloadBytes(rootKey);
      if (content) fileMap.set('main.tex', content);
      return fileMap;
    }

    const manifestRaw = await this.download(manifestKey);
    if (!manifestRaw) return fileMap;
    const manifest = JSON.parse(manifestRaw) as {
      files: Array<{ name: string }>;
    };

    const rootPrefix = manifestKey.replace(/\/manifest\.json$/, '');
    for (const file of manifest.files) {
      const content = await this.downloadBytes(`${rootPrefix}/${file.name}`);
      if (content !== null) {
        fileMap.set(file.name, content);
      }
    }

    return fileMap;
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const obj = await this.bucket.head(key);
    return obj !== null;
  }
}
```

---

## 3.6 Test Plan

| Test File | Covers |
|-----------|--------|
| `tests/domain/question-detector.test.ts` | All 4 detection strategies, Vietnamese + English patterns |
| `tests/domain/mcq-formatter.test.ts` | Choice mapping, answer detection, LaTeX stripping |
| `tests/application/extract-questions.test.ts` | Full extraction pipeline integration |

### Key test cases for `QuestionDetector`

```typescript
describe('QuestionDetector', () => {
  it('detects Vietnamese "Câu N:" pattern', () => {
    const content = `Câu 1: Tìm x biết $x^2 = 4$
A. $x = 2$
B. $x = -2$
C. $x = \\pm 2$
D. $x = 4$
Đáp án: C`;
    // Should detect 1 question with 4 choices, correct = C
  });

  it('detects enumerate-based questions', () => {
    const content = `\\begin{enumerate}
\\item Giải phương trình $2x + 3 = 7$
  \\begin{enumerate}
    \\item[(A)] $x = 1$
    \\item[(B)] $x = 2$
    \\item[(C)] $x = 3$
    \\item[(D)] $x = 4$
  \\end{enumerate}
\\end{enumerate}`;
    // Should detect question with 4 choices
  });

  it('extracts correct answer from bold marker', () => {
    const content = `Câu 5: ...
A. wrong  B. wrong  \\textbf{C}. correct  D. wrong`;
    // Should detect correct = C
  });
});
```

---

## Deliverables

Current implementation (2026-02-24):
- [x] Normalization-aware extraction flow for `pdf`/`docx`/`image` sources
- [x] Queue consumer for async normalization jobs
- [x] R2-backed temporary file staging + cleanup
- [x] KV-backed extraction job status endpoint under `/api/extraction/jobs/:jobId`

Remaining target deliverables:
- [ ] `QuestionDetector` — 4 detection strategies (Vietnamese, English, enumerate, heuristic)
- [ ] `MCQFormatter` — structures blocks into `MCQQuestion` entities with `answerStatus`
- [ ] `ExtractQuestionsUseCase` — orchestrates parse → detect → format → store
- [ ] `D1MaterialRepository` — CRUD operations for materials table
- [ ] `D1QuestionRepository` — CRUD operations with batch insert for questions
- [ ] Test suite for detector and formatter
