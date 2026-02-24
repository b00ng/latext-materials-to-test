import type { SectionInfo } from './section-info';

export interface ChapterInfo {
  number: number;
  title: string;
  sections: SectionInfo[];
}
