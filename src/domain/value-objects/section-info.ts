import type { QuestionBlock } from '../entities/question-block';

export interface SectionInfo {
  title: string;
  rawLatex: string;
  textContent: string;
  mathExpressions: MathExpr[];
  lists: ParsedList[];
  environments: ParsedEnvironment[];
  questionBlocks: QuestionBlock[];
}

export interface MathExpr {
  type: 'inline' | 'display' | 'equation' | 'align';
  latex: string;
  position: {
    start: number;
    end: number;
  };
}

export interface ParsedList {
  type: 'itemize' | 'enumerate' | 'description';
  items: string[];
}

export interface ParsedEnvironment {
  name: string;
  title: string | null;
  content: string;
  cssClass: string;
  label: string;
}
