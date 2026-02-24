const DEFAULT_MAX_DEPTH = 20;

export interface ResolveIncludesOptions {
  currentDir?: string;
  rootDir?: string;
  maxDepth?: number;
}

export function resolveIncludes(
  content: string,
  fileMap: Map<string, string>,
  options: ResolveIncludesOptions = {}
): string {
  if (fileMap.size === 0) {
    return content;
  }

  const normalizedMap = normalizeFileMap(fileMap);
  const rootDir = normalizePath(options.rootDir ?? '');
  const currentDir = normalizePath(options.currentDir ?? rootDir);
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

  return resolveRecursive(
    content,
    normalizedMap,
    currentDir,
    rootDir,
    maxDepth,
    0,
    []
  );
}

function resolveRecursive(
  content: string,
  fileMap: Map<string, string>,
  currentDir: string,
  rootDir: string,
  maxDepth: number,
  depth: number,
  stack: string[]
): string {
  if (depth > maxDepth) {
    return '';
  }

  let text = content;
  text = text.replace(
    /\\(input|include)\{([^}]*)\}/g,
    (match, command, rawFilename, offset, source) => {
      if (isInsideComment(source, offset)) {
        return match;
      }

      const filename = String(rawFilename).trim();
      const resolved = resolveFilePath(filename, currentDir, rootDir, fileMap);
      if (!resolved || stack.includes(resolved)) {
        return match;
      }

      const nested = resolveRecursive(
        fileMap.get(resolved) ?? '',
        fileMap,
        dirname(resolved),
        rootDir,
        maxDepth,
        depth + 1,
        [...stack, resolved]
      );

      if (command === 'include') {
        return `\n\\clearpage\n${nested}\n\\clearpage\n`;
      }

      return nested;
    }
  );

  text = text.replace(
    /\\(?:sub)?import\{([^}]*)\}\{([^}]*)\}/g,
    (match, rawSubdir, rawFilename, offset, source) => {
      if (isInsideComment(source, offset)) {
        return match;
      }

      const subdir = String(rawSubdir).trim();
      const filename = String(rawFilename).trim();
      const searchDir = subdir ? joinPath(currentDir, subdir) : currentDir;
      const resolved = resolveFilePath(filename, searchDir, rootDir, fileMap);
      if (!resolved || stack.includes(resolved)) {
        return match;
      }

      return resolveRecursive(
        fileMap.get(resolved) ?? '',
        fileMap,
        dirname(resolved),
        rootDir,
        maxDepth,
        depth + 1,
        [...stack, resolved]
      );
    }
  );

  return text;
}

function resolveFilePath(
  filename: string,
  currentDir: string,
  rootDir: string,
  fileMap: Map<string, string>
): string | null {
  const normalizedFilename = normalizePath(filename);
  const candidates: string[] = [];
  candidates.push(joinPath(currentDir, normalizedFilename));
  if (!normalizedFilename.endsWith('.tex')) {
    candidates.push(joinPath(currentDir, `${normalizedFilename}.tex`));
  }

  if (normalizePath(currentDir) !== normalizePath(rootDir)) {
    candidates.push(joinPath(rootDir, normalizedFilename));
    if (!normalizedFilename.endsWith('.tex')) {
      candidates.push(joinPath(rootDir, `${normalizedFilename}.tex`));
    }
  }

  for (const candidate of candidates) {
    if (fileMap.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeFileMap(fileMap: Map<string, string>): Map<string, string> {
  const normalized = new Map<string, string>();
  for (const [file, text] of fileMap.entries()) {
    normalized.set(normalizePath(file), text);
  }
  return normalized;
}

function joinPath(baseDir: string, file: string): string {
  if (!baseDir) {
    return normalizePath(file);
  }
  if (!file) {
    return normalizePath(baseDir);
  }
  return normalizePath(`${baseDir}/${file}`);
}

function dirname(path: string): string {
  const normalized = normalizePath(path);
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? '' : normalized.slice(0, idx);
}

function normalizePath(path: string): string {
  const segments = path.replace(/\\/g, '/').split('/');
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  return normalized.join('/');
}

function isInsideComment(source: string, offset: number): boolean {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  const lineBefore = source.slice(lineStart, offset);
  for (let i = 0; i < lineBefore.length; i += 1) {
    if (lineBefore[i] === '%' && !isEscaped(lineBefore, i)) {
      return true;
    }
  }
  return false;
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}
