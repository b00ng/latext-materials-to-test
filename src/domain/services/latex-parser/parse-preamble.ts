import type { MaterialMetadata } from '../../value-objects/material-metadata';

export function parsePreamble(preamble: string): MaterialMetadata {
  const metadata: MaterialMetadata = {
    title: '',
    subtitle: '',
    author: '',
    date: '',
    subject: 'math',
    language: 'vi',
    docclass: 'book',
    bibliography: '',
    imageDirectories: [],
    tikzPreamble: '',
    macros: {},
    customEnvironments: {},
    chapters: []
  };

  const docclassMatch = preamble.match(/\\documentclass(?:\[[^\]]*\])?\{(\w+)\}/);
  if (docclassMatch) {
    metadata.docclass = docclassMatch[1];
  }

  const titleMatch = preamble.match(/\\title\{((?:[^{}]|\{[^{}]*\})*)\}/);
  if (titleMatch) {
    metadata.title = cleanLatex(titleMatch[1]);
  }

  const subtitleMatch = preamble.match(/\\subtitle\{((?:[^{}]|\{[^{}]*\})*)\}/);
  if (subtitleMatch) {
    metadata.subtitle = cleanLatex(subtitleMatch[1]);
  }

  const authorMatch = preamble.match(/\\author\{((?:[^{}]|\{[^{}]*\})*)\}/);
  if (authorMatch) {
    metadata.author = cleanLatex(authorMatch[1]);
  }

  const dateMatch = preamble.match(/\\date\{((?:[^{}]|\{[^{}]*\})*)\}/);
  if (dateMatch) {
    metadata.date = cleanLatex(dateMatch[1]);
  }

  const addBibMatch = preamble.match(/\\addbibresource\{([^}]*)\}/);
  if (addBibMatch) {
    metadata.bibliography = addBibMatch[1].trim();
  } else {
    const bibliographyMatch = preamble.match(/\\bibliography\{([^}]*)\}/);
    if (bibliographyMatch) {
      const value = bibliographyMatch[1].trim();
      metadata.bibliography = value.endsWith('.bib') ? value : `${value}.bib`;
    }
  }

  const graphicspathMatch = preamble.match(/\\graphicspath\{((?:\{[^}]*\})+)\}/);
  if (graphicspathMatch) {
    metadata.imageDirectories = Array.from(
      graphicspathMatch[1].matchAll(/\{([^}]*)\}/g),
      (match) => match[1]
    );
  }

  for (const match of preamble.matchAll(/\\newtheorem\{(\w+)\}(?:\[(\w+)\])?\{([^}]*)\}/g)) {
    const envName = match[1];
    metadata.customEnvironments[envName] = {
      cssClass: 'env-theorem',
      label: match[3].trim()
    };
  }

  for (const match of preamble.matchAll(/\\(?:newtcolorbox|NewTColorBox|DeclareTColorBox)\{(\w+)\}/g)) {
    const envName = match[1];
    if (!metadata.customEnvironments[envName]) {
      metadata.customEnvironments[envName] = {
        cssClass: 'box-green',
        label: capitalize(envName)
      };
    }
  }

  for (const match of preamble.matchAll(/\\newtcolorbox\{(\w+)\}(?:\[[^\]]*\])?\{[\s\S]*?title\s*=\s*\{?([^},]+)/g)) {
    const envName = match[1];
    metadata.customEnvironments[envName] = {
      cssClass: 'box-green',
      label: match[2].trim().replace(/}$/, '')
    };
  }

  for (const match of preamble.matchAll(/\\DeclareMathOperator\*?\{\\(\w+)\}\{([^}]*)\}/g)) {
    metadata.macros[`\\${match[1]}`] = `\\mathrm{${match[2]}}`;
  }

  addMacroMatches(
    metadata.macros,
    preamble,
    /\\(?:new|renew)command\{\\(\w+)\}\{(\\math\w+\{[^}]*\}[^}]*)\}/g
  );
  addMacroMatches(
    metadata.macros,
    preamble,
    /\\(?:new|renew)command\{\\(\w+)\}\{(\\mathrm\{[^}]*\})\}/g,
    true
  );
  addMacroMatches(
    metadata.macros,
    preamble,
    /\\(?:new|renew)command\{\\(\w+)\}\{(\\mathcal\{[^}]*\}(?:[_^]\{[^}]*(?:\{[^}]*\}[^}]*)?\})*)\}/g,
    true
  );
  addMacroMatches(
    metadata.macros,
    preamble,
    /\\def\\(\w+)\{(\\math\w+\{[^}]*\}[^}]*)\}/g,
    true
  );

  for (const match of preamble.matchAll(/\\(?:new|renew)command\{\\(\w+)\}\[\d+\]\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
    const key = `\\${match[1]}`;
    const value = match[2].trim();
    if (!metadata.macros[key] && value.includes('#')) {
      metadata.macros[key] = value;
    }
  }

  const tikzLines: string[] = [];
  collectLines(tikzLines, preamble, /\\usetikzlibrary\{[^}]*\}/g);
  collectLines(tikzLines, preamble, /\\usepackage(?:\[[^\]]*\])?\{tikz[^}]*\}/g);
  collectLines(tikzLines, preamble, /\\usepackage(?:\[[^\]]*\])?\{pgfplots[^}]*\}/g);
  collectLines(tikzLines, preamble, /\\pgfplotsset\{[^}]*\}/g);
  metadata.tikzPreamble = tikzLines.join('\n');

  return metadata;
}

function addMacroMatches(
  macros: Record<string, string>,
  preamble: string,
  pattern: RegExp,
  onlyIfMissing = false
): void {
  for (const match of preamble.matchAll(pattern)) {
    const key = `\\${match[1]}`;
    if (!onlyIfMissing || !macros[key]) {
      macros[key] = match[2];
    }
  }
}

function collectLines(lines: string[], source: string, pattern: RegExp): void {
  for (const match of source.matchAll(pattern)) {
    lines.push(match[0]);
  }
}

function cleanLatex(text: string): string {
  return text
    .replace(/\\texorpdfstring\{([^}]*)\}\{[^}]*\}/g, '$1')
    .replace(/\\textbf\{([^}]*)\}/g, '$1')
    .replace(/\\textit\{([^}]*)\}/g, '$1')
    .replace(/\\emph\{([^}]*)\}/g, '$1')
    .replace(/\\\\(?:\[\d+\w*\])?/g, ' ')
    .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}
