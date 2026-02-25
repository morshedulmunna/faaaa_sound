const test = require('node:test');
const assert = require('node:assert/strict');

test('intentional error test to validate failure handling', () => {
  assert.equal(1, 2, 'Intentional failure: 1 is not equal to 2');
});
