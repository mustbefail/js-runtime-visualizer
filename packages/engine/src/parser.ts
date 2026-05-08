import * as acorn from 'acorn';
import type { Program } from 'acorn';

export type ParseResult =
  | { ok: true; ast: Program }
  | { ok: false; error: { message: string; line: number; col: number } };

export function parse(code: string): ParseResult {
  try {
    const ast = acorn.parse(code, {
      ecmaVersion: 2022,
      sourceType: 'script',
      locations: true,
    }) as Program;
    return { ok: true, ast };
  } catch (e: unknown) {
    if (e instanceof SyntaxError && 'loc' in e) {
      const loc = (e as SyntaxError & { loc: { line: number; column: number } }).loc;
      return {
        ok: false,
        error: { message: e.message, line: loc.line, col: loc.column },
      };
    }
    throw e;
  }
}
