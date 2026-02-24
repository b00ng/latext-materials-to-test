import type { QuestionRepository } from '../../application/ports/output/question-repository';
import type { MCQQuestion } from '../../domain/entities/mcq-question';
import { mapQuestionRow, type QuestionRow } from './d1-question-mapper';

export class D1QuestionRepository implements QuestionRepository {
  constructor(private readonly db: D1Database) {}

  async createMany(questions: MCQQuestion[]): Promise<void> {
    if (questions.length === 0) {
      return;
    }

    const statement = this.db.prepare(
      `INSERT INTO questions (
        id, material_id, stem, stem_latex, choices, correct_answer, answer_status,
        explanation, explanation_latex, difficulty, topic, tags,
        source_chapter, source_section, source_question_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const inserts = questions.map((question) =>
      statement.bind(
        question.id,
        question.materialId,
        question.stem,
        question.stemLatex,
        JSON.stringify(question.choices),
        question.correctAnswer,
        question.answerStatus,
        question.explanation,
        question.explanationLatex,
        question.difficulty,
        question.topic,
        JSON.stringify(question.tags),
        question.sourceRef.chapter,
        question.sourceRef.section,
        question.sourceRef.questionIndex
      )
    );

    await this.db.batch(inserts);
  }

  async findById(id: string): Promise<MCQQuestion | null> {
    const row = await this.db
      .prepare('SELECT * FROM questions WHERE id = ?')
      .bind(id)
      .first<QuestionRow>();
    return row ? mapQuestionRow(row) : null;
  }

  async findByMaterialId(materialId: string): Promise<MCQQuestion[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM questions
         WHERE material_id = ?
         ORDER BY source_question_index ASC`
      )
      .bind(materialId)
      .all<QuestionRow>();
    return result.results.map(mapQuestionRow);
  }

  async findAll(params?: {
    topic?: string;
    difficulty?: { min: number; max: number };
    materialId?: string;
    limit?: number;
    offset?: number;
  }): Promise<MCQQuestion[]> {
    let sql = 'SELECT * FROM questions WHERE 1 = 1';
    const binds: unknown[] = [];

    if (params?.materialId) {
      sql += ' AND material_id = ?';
      binds.push(params.materialId);
    }
    if (params?.topic) {
      sql += ' AND topic = ?';
      binds.push(params.topic);
    }
    if (params?.difficulty) {
      sql += ' AND difficulty >= ? AND difficulty <= ?';
      binds.push(params.difficulty.min, params.difficulty.max);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    binds.push(params?.limit ?? 50, params?.offset ?? 0);

    const result = await this.db
      .prepare(sql)
      .bind(...binds)
      .all<QuestionRow>();
    return result.results.map(mapQuestionRow);
  }

  async update(id: string, updates: Partial<MCQQuestion>): Promise<MCQQuestion | null> {
    const sets: string[] = [];
    const binds: unknown[] = [];

    if (updates.stem !== undefined) {
      sets.push('stem = ?');
      binds.push(updates.stem);
    }
    if (updates.stemLatex !== undefined) {
      sets.push('stem_latex = ?');
      binds.push(updates.stemLatex);
    }
    if (updates.choices !== undefined) {
      sets.push('choices = ?');
      binds.push(JSON.stringify(updates.choices));
    }
    if (updates.correctAnswer !== undefined) {
      sets.push('correct_answer = ?');
      binds.push(updates.correctAnswer);
    }
    if (updates.answerStatus !== undefined) {
      sets.push('answer_status = ?');
      binds.push(updates.answerStatus);
    }
    if (updates.explanation !== undefined) {
      sets.push('explanation = ?');
      binds.push(updates.explanation);
    }
    if (updates.explanationLatex !== undefined) {
      sets.push('explanation_latex = ?');
      binds.push(updates.explanationLatex);
    }
    if (updates.difficulty !== undefined) {
      sets.push('difficulty = ?');
      binds.push(updates.difficulty);
    }
    if (updates.topic !== undefined) {
      sets.push('topic = ?');
      binds.push(updates.topic);
    }
    if (updates.tags !== undefined) {
      sets.push('tags = ?');
      binds.push(JSON.stringify(updates.tags));
    }
    if (updates.sourceRef !== undefined) {
      sets.push('source_chapter = ?', 'source_section = ?', 'source_question_index = ?');
      binds.push(updates.sourceRef.chapter, updates.sourceRef.section, updates.sourceRef.questionIndex);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    binds.push(id);
    await this.db
      .prepare(`UPDATE questions SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...binds)
      .run();

    return this.findById(id);
  }

  async deleteByMaterialId(materialId: string): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM questions WHERE material_id = ?')
      .bind(materialId)
      .run();
    const changes = Number(result.meta?.changes ?? 0);
    return Number.isFinite(changes) ? changes : 0;
  }
}
