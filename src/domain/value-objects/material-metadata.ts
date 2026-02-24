import type { ChapterInfo } from './chapter-info';

export interface EnvironmentDefinition {
  cssClass: string;
  label: string;
}

export interface MaterialMetadata {
  title: string;
  author: string;
  subject: string;
  language: string;
  docclass: string;
  mainFile?: string;
  macros: Record<string, string>;
  customEnvironments: Record<string, EnvironmentDefinition>;
  chapters: ChapterInfo[];
}
