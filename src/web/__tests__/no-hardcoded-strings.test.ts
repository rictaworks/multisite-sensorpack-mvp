import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * Heuristic (deliberately a "skeleton" per Issue #2 acceptance criteria) check for
 * literal, user-facing text hardcoded directly in JSX instead of going through
 * next-intl's t()/useTranslations(). We use the TypeScript compiler's own AST
 * (already a project dependency, see .claude/rules/architecture.md: avoid
 * reinventing the wheel) so that plain TypeScript syntax such as generics
 * (`Omit<Foo, 'bar'>`) is never mistaken for JSX text.
 *
 * This is NOT a full i18n linter: it only catches literal JSX text children
 * (e.g. `<h1>Hello</h1>`), not hardcoded string literals passed as attributes
 * (e.g. `title="Hello"`). Extending this is left for a follow-up issue once
 * more screens exist.
 */

const SOURCE_DIRS = ['app', 'components'];
const ROOT = path.resolve(__dirname, '..');

// Matches Latin, Latin-1 supplement, Hiragana/Katakana, CJK, Hangul, Cyrillic and Arabic letters.
const HAS_LETTERS = /[A-Za-zÀ-ɏ぀-ヿ一-鿿가-힣Ѐ-ӿ؀-ۿ]/;

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(fullPath);
    }
    if (entry.isFile() && /\.tsx$/.test(entry.name)) {
      return [fullPath];
    }
    return [];
  });
}

function findHardcodedJsxText(filePath: string): string[] {
  const sourceText = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const violations: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isJsxText(node)) {
      const text = node.getText(sourceFile).trim();
      if (text.length > 0 && HAS_LETTERS.test(text)) {
        violations.push(text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

describe('hardcoded UI string detection (heuristic skeleton, .claude/rules/i18n.md)', () => {
  it('finds no literal JSX text outside of translation calls', () => {
    const files = SOURCE_DIRS.flatMap((dir) => {
      const fullDir = path.join(ROOT, dir);
      return fs.existsSync(fullDir) ? walk(fullDir) : [];
    });

    expect(files.length).toBeGreaterThan(0);

    const allViolations = files.flatMap((file) =>
      findHardcodedJsxText(file).map((text) => `${path.relative(ROOT, file)}: "${text}"`)
    );

    expect(allViolations).toEqual([]);
  });
});
