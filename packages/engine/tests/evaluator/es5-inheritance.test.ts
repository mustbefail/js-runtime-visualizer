import { describe, it, expect } from 'vitest';
import { runCode } from '../../src/evaluator';

describe('evaluator — ES5 inheritance pattern', () => {
  it('runs the canonical ES5 inheritance snippet end-to-end', () => {
    const code = `
      function Animal(name) { this.name = name; }
      Animal.prototype.speak = function() { return this.name + ' says hi'; };

      function Dog(name, breed) {
        Animal.call(this, name);
        this.breed = breed;
      }
      Dog.prototype = Object.create(Animal.prototype);
      Dog.prototype.constructor = Dog;
      Dog.prototype.bark = function() { return 'woof'; };

      const rex = new Dog('Rex', 'lab');
      rex.speak() + ' / ' + rex.bark() + ' / ' + rex.breed;
    `;
    const { finalValue } = runCode(code);
    expect(finalValue).toEqual({
      kind: 'string',
      value: 'Rex says hi / woof / lab',
    });
  });
});
