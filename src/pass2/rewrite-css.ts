import type { SelectorKind } from "../graph/cross-asset-links";

export type SelectorRenameMap = Record<SelectorKind, Map<string, string>>;

export function rewriteCssSelectors(code: string, mapping: SelectorRenameMap): string {
  const selectorPreludePattern = /([^{}]+)(\{)/g;

  return code.replace(selectorPreludePattern, (full, prelude: string, brace: string) => {
    const rewrittenPrelude = prelude.replace(/([.#])([A-Za-z_][A-Za-z0-9_-]*)/g, (token, marker: string, name: string) => {
      const kind: SelectorKind = marker === "." ? "class" : "id";
      const replacement = mapping[kind].get(name);
      if (!replacement) {
        return token;
      }
      return `${marker}${replacement}`;
    });
    return `${rewrittenPrelude}${brace}`;
  });
}
