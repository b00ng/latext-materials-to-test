import { describe, expect, it } from 'vitest';

import { QuestionDetector } from '../../src/domain/services/question-detector';
import type { SectionInfo } from '../../src/domain/value-objects/section-info';

const buildSection = (overrides: Partial<SectionInfo>): SectionInfo => ({
  title: 'Section',
  rawLatex: '',
  textContent: '',
  mathExpressions: [],
  lists: [],
  environments: [],
  questionBlocks: [],
  ...overrides
});

describe('QuestionDetector', () => {
  it('detects Vietnamese numbered questions with answer and difficulty', () => {
    const detector = new QuestionDetector();
    const section = buildSection({
      textContent: `Câu 1: Tìm x sao cho x^2 = 4\nA. x=1\nB. x=2\nC. x=3\nD. x=4\nĐáp án: B\nMức 7`
    });

    const blocks = detector.detect(section);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].questionNumber).toBe(1);
    expect(blocks[0].choiceContents).toEqual(['x=1', 'x=2', 'x=3', 'x=4']);
    expect(blocks[0].correctAnswerHint).toBe('B');
    expect(blocks[0].difficulty).toBe(7);
  });

  it('detects enumerate list questions from parsed lists', () => {
    const detector = new QuestionDetector();
    const section = buildSection({
      textContent: 'fallback text',
      lists: [
        {
          type: 'enumerate',
          items: [
            'Giải phương trình\nA. 1\nB. 2\nC. 3\nD. 4',
            'Tính tổng\nA. 10\nB. 11\nC. 12\nD. 13'
          ]
        }
      ]
    });

    const blocks = detector.detect(section);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].questionNumber).toBe(1);
    expect(blocks[1].questionNumber).toBe(2);
    expect(blocks[0].choiceContents).toHaveLength(4);
  });

  it('detects questions inside exam-style environments', () => {
    const detector = new QuestionDetector();
    const section = buildSection({
      textContent: 'no direct markers',
      environments: [
        {
          name: 'exercise',
          title: null,
          content: 'Question 2: Solve\nA. one\nB. two\nC. three\nD. four\nAnswer: D',
          cssClass: 'env-example',
          label: 'Exercise'
        }
      ]
    });

    const blocks = detector.detect(section);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].questionNumber).toBe(2);
    expect(blocks[0].correctAnswerHint).toBe('D');
  });

  it('falls back to paragraph heuristic when needed', () => {
    const detector = new QuestionDetector();
    const section = buildSection({
      textContent: `Find result\nA. 1\nB. 2\nC. 3\nD. 4\n\nOther text without choices`
    });

    const blocks = detector.detect(section);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].questionNumber).toBe(1);
    expect(blocks[0].choiceContents).toHaveLength(4);
  });
});
