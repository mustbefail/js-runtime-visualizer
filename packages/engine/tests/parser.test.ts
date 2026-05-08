import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser';

describe('parse', () => {
  it('returns ok=true with an AST for valid code', () => {
    const result = parse('let x = 1;');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ast.type).toBe('Program');
      expect(result.ast.body).toHaveLength(1);
      const first = result.ast.body[0];
      expect(first?.type).toBe('VariableDeclaration');
    }
  });

  it('returns ok=false with line/col for syntax errors', () => {
    const result = parse('let x =;');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/unexpected/i);
      expect(result.error.line).toBe(1);
      expect(typeof result.error.col).toBe('number');
    }
  });

  it('preserves source locations on every node', () => {
    const result = parse('const a = 1;\nconst b = 2;');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const second = result.ast.body[1];
      expect(second?.loc?.start.line).toBe(2);
    }
  });
});
