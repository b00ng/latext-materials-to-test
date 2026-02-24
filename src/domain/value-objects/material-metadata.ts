import type { ChapterInfo } from './chapter-info';

export interface EnvironmentDefinition {
  cssClass: string;
  label: string;
}

export interface MaterialMetadata {
  title: string;
  subtitle?: string;
  author: string;
  date?: string;
  subject: string;
  language: string;
  docclass: string;
  bibliography?: string;
  imageDirectories?: string[];
  tikzPreamble?: string;
  mainFile?: string;
  macros: Record<string, string>;
  customEnvironments: Record<string, EnvironmentDefinition>;
  chapters: ChapterInfo[];
}
