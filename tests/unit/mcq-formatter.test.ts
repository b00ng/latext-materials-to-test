import { describe, expect, it } from 'vitest';

import { MCQFormatter } from '../../src/domain/services/mcq-formatter';
import type { QuestionBlock } from '../../src/domain/entities/question-block';

const block: QuestionBlock = {
  id: 'block-1',
  rawLatex: 'raw',
  questionNumber: 1,
  stemContent: 'Tính \\textbf{x} + y',
  choiceContents: ['\\textit{one}', 'two', 'three', 'four', 'five'],
  correctAnswerHint: 'c',
  difficulty: 8,
  topic: 'algebra'
};

describe('MCQFormatter', () => {
  it('maps detected block to MCQQuestion with confirmed answer', () => {
    const formatter = new MCQFormatter();
    const question = formatter.format(block, 'material-1', 2, 'Intro', 7);

    expect(question.materialId).toBe('material-1');
    expect(question.stem).toBe('Tính x + y');
    expect(question.stemLatex).toBe('Tính \\textbf{x} + y');
    expect(question.choices).toHaveLength(4);
    expect(question.choices[0].label).toBe('A');
    expect(question.choices[2].label).toBe('C');
    expect(question.choices[2].isCorrect).toBe(true);
    expect(question.correctAnswer).toBe('C');
    expect(question.answerStatus).toBe('confirmed');
    expect(question.difficulty).toBe(8);
    expect(question.sourceRef.questionIndex).toBe(7);
  });

  it('marks answer as needs_review when hint is absent/invalid', () => {
    const formatter = new MCQFormatter();
    const question = formatter.format(
      { ...block, correctAnswerHint: 'Z', difficulty: null },
      'material-2',
      null,
      null,
      0
    );

    expect(question.correctAnswer).toBeNull();
    expect(question.answerStatus).toBe('needs_review');
    expect(question.difficulty).toBe(5);
    expect(question.sourceRef.chapter).toBeNull();
    expect(question.sourceRef.section).toBeNull();
  });

  it('cleans common latex display wrappers in choice text', () => {
    const formatter = new MCQFormatter();
    const question = formatter.format(
      {
        ...block,
        choiceContents: ['\\emph{a}', '\\underline{b}', '\\text{c}', 'd']
      },
      'material-3',
      1,
      'S',
      2
    );

    expect(question.choices.map((choice) => choice.text)).toEqual(['a', 'b', 'c', 'd']);
  });
});
