import type { EnvironmentDefinition } from '../../value-objects/material-metadata';
import type { ParsedEnvironment } from '../../value-objects/section-info';

export const DEFAULT_ENVIRONMENTS: Record<string, EnvironmentDefinition> = {
  dinhly: { cssClass: 'env-theorem', label: 'Dinh ly' },
  bode: { cssClass: 'env-theorem', label: 'Bo de' },
  menhde: { cssClass: 'env-theorem', label: 'Menh de' },
  hequa: { cssClass: 'env-theorem', label: 'He qua' },
  dinhri: { cssClass: 'env-theorem', label: 'Dinh ly' },
  giaithiet: { cssClass: 'env-theorem', label: 'Gia thiet' },
  phongdoan: { cssClass: 'env-theorem', label: 'Phong doan' },
  vidu: { cssClass: 'env-example', label: 'Vi du' },
  baitap: { cssClass: 'env-example', label: 'Bai tap' },
  trucgiac: { cssClass: 'box-green', label: 'Truc giac' },
  chungminhsocap: { cssClass: 'env-proof', label: 'Chung minh' },
  chungminhnangcao: { cssClass: 'box-yellow', label: 'Chung minh (nang cao)' },
  phachoa: { cssClass: 'box-red', label: 'Phac hoa' },
  giaithoai: { cssClass: 'box-purple', label: 'Giai thoai' },
  luuy: { cssClass: 'box-yellow', label: 'Luu y' },
  tomtat: { cssClass: 'box-gray', label: 'Tom tat' },
  thuatngu: { cssClass: 'box-teal', label: 'Thuat ngu' },
  theorem: { cssClass: 'env-theorem', label: 'Theorem' },
  lemma: { cssClass: 'env-theorem', label: 'Lemma' },
  proposition: { cssClass: 'env-theorem', label: 'Proposition' },
  corollary: { cssClass: 'env-theorem', label: 'Corollary' },
  definition: { cssClass: 'env-theorem', label: 'Definition' },
  conjecture: { cssClass: 'env-theorem', label: 'Conjecture' },
  example: { cssClass: 'env-example', label: 'Example' },
  exercise: { cssClass: 'env-example', label: 'Exercise' },
  remark: { cssClass: 'box-yellow', label: 'Remark' },
  note: { cssClass: 'box-yellow', label: 'Note' }
};

export function parseEnvironments(
  text: string,
  customEnvironments: Record<string, EnvironmentDefinition> = {}
): { text: string; environments: ParsedEnvironment[] } {
  const environmentMap = { ...DEFAULT_ENVIRONMENTS, ...customEnvironments };
  const environments: ParsedEnvironment[] = [];
  let normalized = text;

  for (const [name, definition] of Object.entries(environmentMap)) {
    const escapedName = escapeRegExp(name);
    const withTitle = new RegExp(
      `\\\\begin\\{${escapedName}\\}\\[([^\\]]*)\\]([\\s\\S]*?)\\\\end\\{${escapedName}\\}`,
      'g'
    );
    normalized = normalized.replace(withTitle, (_all, rawTitle, rawContent) => {
      environments.push({
        name,
        title: String(rawTitle).trim(),
        content: String(rawContent).trim(),
        cssClass: definition.cssClass,
        label: definition.label
      });
      return `[ENV_${name}:${String(rawTitle).trim()}]`;
    });

    const withoutTitle = new RegExp(
      `\\\\begin\\{${escapedName}\\}([\\s\\S]*?)\\\\end\\{${escapedName}\\}`,
      'g'
    );
    normalized = normalized.replace(withoutTitle, (_all, rawContent) => {
      environments.push({
        name,
        title: null,
        content: String(rawContent).trim(),
        cssClass: definition.cssClass,
        label: definition.label
      });
      return `[ENV_${name}]`;
    });
  }

  const proofPattern = /\\begin\{proof\}([\s\S]*?)\\end\{proof\}/g;
  normalized = normalized.replace(proofPattern, (_all, rawContent) => {
    environments.push({
      name: 'proof',
      title: null,
      content: String(rawContent).trim(),
      cssClass: 'env-proof',
      label: 'Chung minh'
    });
    return '[ENV_proof]';
  });

  return { text: normalized, environments };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
