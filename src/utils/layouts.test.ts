import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_OPTIONS, hasTopBar, layoutOption, savedLayout } from './layouts';

test('Classic comes first, so it is the default', () => {
  assert.equal(LAYOUT_OPTIONS[0].id, 'classic');
  assert.deepEqual(
    LAYOUT_OPTIONS.map((o) => o.id),
    ['classic', 'timeline', 'portfolio']
  );
});

test('each layout has a name and a description', () => {
  for (const o of LAYOUT_OPTIONS) {
    assert.ok(o.name.length > 0, o.id);
    assert.ok(o.description.length > 0, o.id);
  }
});

test('a saved layout is kept; nothing or an unknown one means Classic', () => {
  assert.equal(savedLayout('timeline'), 'timeline');
  assert.equal(savedLayout('portfolio'), 'portfolio');
  assert.equal(savedLayout('classic'), 'classic');
  assert.equal(savedLayout(null), 'classic');
  assert.equal(savedLayout('bento'), 'classic');
  assert.equal(savedLayout(''), 'classic');
});

test('only Classic keeps the sidebar', () => {
  assert.equal(hasTopBar('classic'), false);
  assert.equal(hasTopBar('timeline'), true);
  assert.equal(hasTopBar('portfolio'), true);
});

test('layoutOption finds the layout, falling back to Classic', () => {
  assert.equal(layoutOption('timeline').name, 'Timeline');
  assert.equal(layoutOption('nope' as never).id, 'classic');
});
