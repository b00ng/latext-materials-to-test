const MATH_PLACEHOLDER_PREFIX = '\x00MATH_';
const MATH_PLACEHOLDER_SUFFIX = '\x00';

const ALIGN_ENVS = new Set(['align', 'align*']);
const MATH_ENVS = [
  'align',
  'align*',
  'equation',
  'equation*',
  'gather',
  'gather*',
  'multline',
  'multline*'
];

export interface MathStore {
  expressions: string[];
}

function placeholder(index: number): string {
  return `${MATH_PLACEHOLDER_PREFIX}${index}${MATH_PLACEHOLDER_SUFFIX}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace math expressions with placeholders to protect them from later parsing steps.
 * Ported from tex2html.py:protect_math.
 */
export function protectMath(text: string): { text: string; store: MathStore } {
  const store: MathStore = { expressions: [] };
  let counter = 0;

  const save = (match: string): string => {
    store.expressions.push(match);
    const token = placeholder(counter);
    counter += 1;
    return token;
  };

  const saveDisplay = (match: string): string => {
    const content = match.slice(2, -2);
    store.expressions.push(`$$${content}$$`);
    const token = placeholder(counter);
    counter += 1;
    return token;
  };

  const saveAligned = (match: string, env: string): string => {
    const escapedEnv = escapeRegExp(env);
    const innerPattern = new RegExp(
      `\\\\begin\\{${escapedEnv}\\}([\\s\\S]*?)\\\\end\\{${escapedEnv}\\}`
    );
    const innerMatch = innerPattern.exec(match);

    if (innerMatch) {
      const body = innerMatch[1].replace(/\n\s*\n/g, '\n');
      if (ALIGN_ENVS.has(env)) {
        store.expressions.push(`$$\\begin{aligned}${body}\\end{aligned}$$`);
      } else {
        store.expressions.push(`$$${body.trim()}$$`);
      }
    } else {
      store.expressions.push(`$$${match}$$`);
    }

    const token = placeholder(counter);
    counter += 1;
    return token;
  };

  // 1) Display math: $$...$$
  text = text.replace(/\$\$[\s\S]*?\$\$/g, save);

  // 2) Display math: \[...\] while excluding \\[6pt]-style line break commands.
  text = text.replace(/(?<!\\)\\\[[\s\S]*?\\\]/g, saveDisplay);

  // 3) Named math environments.
  for (const env of MATH_ENVS) {
    const escapedEnv = escapeRegExp(env);
    const envPattern = new RegExp(
      `\\\\begin\\{${escapedEnv}\\}[\\s\\S]*?\\\\end\\{${escapedEnv}\\}`,
      'g'
    );
    text = text.replace(envPattern, (match) => saveAligned(match, env));
  }

  // 4) Inline math: $...$ (not $$...$$)
  text = text.replace(/(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/gs, save);

  return { text, store };
}

/**
 * Restore placeholders back to math expressions.
 * Inline math gets multiline content collapsed to one line for KaTeX compatibility.
 * Ported from tex2html.py:restore_math.
 */
export function restoreMath(text: string, store: MathStore): string {
  for (let i = 0; i < store.expressions.length; i += 1) {
    let restored = store.expressions[i];
    if (restored.startsWith('$') && !restored.startsWith('$$')) {
      restored = restored.replace(/\s*\n\s*/g, ' ');
    }
    text = text.replace(placeholder(i), () => restored);
  }

  return text;
}
