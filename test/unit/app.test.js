const { expect } = require('chai');
const { addNumbers } = require('../../src/app');

describe('addNumbers', () => {
  it('should add two numbers correctly', () => {
    const result = addNumbers(2, 3);
    expect(result).to.equal(5);
  });

  it('should handle negative numbers', () => {
    const result = addNumbers(-1, 1);
    expect(result).to.equal(0);
  });
});