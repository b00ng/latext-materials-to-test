import { describe, expect, it } from 'vitest';

import type { MCQQuestion } from '../../src/domain/entities/mcq-question';
import { D1QuestionRepository } from '../../src/infrastructure/persistence/d1-question-repository';
import { MockD1Database } from '../helpers/mock-d1';

const buildQuestion = (overrides: Partial<MCQQuestion> = {}): MCQQuestion => ({
  id: 'q-1',
  materialId: 'mat-1',
  stem: 'What is 1+1?',
  stemLatex: 'What is 1+1?',
  choices: [
    { label: 'A', text: '1', latex: '1', isCorrect: false },
    { label: 'B', text: '2', latex: '2', isCorrect: true },
    { label: 'C', text: '3', latex: '3', isCorrect: false },
    { label: 'D', text: '4', latex: '4', isCorrect: false }
  ],
  correctAnswer: 'B',
  answerStatus: 'confirmed',
  explanation: null,
  explanationLatex: null,
  difficulty: 5,
  topic: 'arithmetic',
  tags: ['easy'],
  sourceRef: {
    materialId: 'mat-1',
    chapter: 1,
    section: 'Section 1',
    questionIndex: 0
  },
  createdAt: new Date('2026-02-24T12:00:00.000Z'),
  ...overrides
});

describe('D1QuestionRepository', () => {
  it('batch inserts serialized questions', async () => {
    const db = new MockD1Database();
    const repo = new D1QuestionRepository(db);

    await repo.createMany([buildQuestion(), buildQuestion({ id: 'q-2' })]);

    expect(db.batchCalls).toHaveLength(1);
    expect(db.batchCalls[0]).toHaveLength(2);
    expect(db.batchCalls[0][0].sql).toContain('INSERT INTO questions');
    expect(db.batchCalls[0][0].binds[0]).toBe('q-1');
    expect(typeof db.batchCalls[0][0].binds[4]).toBe('string');
  });

  it('maps findByMaterialId rows into domain objects', async () => {
    const db = new MockD1Database();
    db.allQueue.push({
      success: true,
      meta: { changes: 1 },
      results: [
        {
          id: 'q-3',
          material_id: 'mat-3',
          stem: 'S',
          stem_latex: 'S',
          choices: JSON.stringify(buildQuestion().choices),
          correct_answer: null,
          answer_status: 'needs_review',
          explanation: null,
          explanation_latex: null,
          difficulty: 6,
          topic: 'algebra',
          tags: JSON.stringify(['tag-1']),
          source_chapter: 2,
          source_section: 'Sec',
          source_question_index: 9,
          created_at: '2026-02-24T12:00:00.000Z'
        }
      ]
    });
    const repo = new D1QuestionRepository(db);

    const result = await repo.findByMaterialId('mat-3');

    expect(result).toHaveLength(1);
    expect(result[0].answerStatus).toBe('needs_review');
    expect(result[0].tags).toEqual(['tag-1']);
    expect(result[0].sourceRef.questionIndex).toBe(9);
  });

  it('builds dynamic update statements and returns updated entity', async () => {
    const db = new MockD1Database();
    db.firstQueue.push({
      id: 'q-4',
      material_id: 'mat-4',
      stem: 'Updated stem',
      stem_latex: 'Updated stem',
      choices: JSON.stringify(buildQuestion().choices),
      correct_answer: 'A',
      answer_status: 'confirmed',
      explanation: 'explain',
      explanation_latex: null,
      difficulty: 7,
      topic: 'topic-x',
      tags: JSON.stringify(['reviewed']),
      source_chapter: 3,
      source_section: 'S',
      source_question_index: 2,
      created_at: '2026-02-24T12:00:00.000Z'
    });
    const repo = new D1QuestionRepository(db);

    const updated = await repo.update('q-4', {
      stem: 'Updated stem',
      correctAnswer: 'A',
      answerStatus: 'confirmed',
      tags: ['reviewed']
    });

    expect(db.runCalls[0].sql).toContain('UPDATE questions SET');
    expect(db.runCalls[0].binds.at(-1)).toBe('q-4');
    expect(updated?.stem).toBe('Updated stem');
    expect(updated?.correctAnswer).toBe('A');
  });

  it('returns deleted row count for material', async () => {
    const db = new MockD1Database();
    db.runQueue.push({
      success: true,
      meta: { changes: 3 },
      results: []
    });
    const repo = new D1QuestionRepository(db);

    const deleted = await repo.deleteByMaterialId('mat-5');

    expect(deleted).toBe(3);
    expect(db.runCalls[0].sql).toContain('DELETE FROM questions');
  });
});
