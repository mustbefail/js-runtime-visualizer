import { describe, it, expect } from 'vitest';
import { EnvironmentRecord } from '../src/runtime/env';
import { num, u } from '../src/types';

describe('EnvironmentRecord', () => {
  it('defines and reads a binding in the current scope', () => {
    const env = new EnvironmentRecord(null);
    env.define('x', num(42), 'let');
    expect(env.lookup('x')).toEqual(num(42));
  });

  it('walks outer chain on lookup', () => {
    const outer = new EnvironmentRecord(null);
    outer.define('x', num(1), 'const');
    const inner = new EnvironmentRecord(outer);
    expect(inner.lookup('x')).toEqual(num(1));
  });

  it('returns undefined sentinel when var lookup misses', () => {
    const env = new EnvironmentRecord(null);
    expect(env.lookup('nope')).toEqual(u());
  });

  it('rejects redeclaration of let in same scope', () => {
    const env = new EnvironmentRecord(null);
    env.define('x', num(1), 'let');
    expect(() => env.define('x', num(2), 'let')).toThrow(/already (been )?declared/i);
  });

  it('refuses to assign to const', () => {
    const env = new EnvironmentRecord(null);
    env.define('x', num(1), 'const');
    expect(() => env.assign('x', num(2))).toThrow(/const/i);
  });

  it('assigns to let in outer scope when inner does not have it', () => {
    const outer = new EnvironmentRecord(null);
    outer.define('x', num(1), 'let');
    const inner = new EnvironmentRecord(outer);
    inner.assign('x', num(2));
    expect(outer.lookup('x')).toEqual(num(2));
  });
});
