import { test, describe } from 'node:test';
import assert from 'node:assert';
import { THEME_OPTIONS, ALL_THEME_CLASSES, savedTheme, nextTheme, themeOption } from './themes';

describe('themes', () => {
  test('six themes: the original three first, then Noir Gold, Sage and Ember', () => {
    assert.deepStrictEqual(
      THEME_OPTIONS.map((o) => o.id),
      ['vscode', 'midnight', 'light', 'noir', 'sage', 'ember']
    );
  });

  test('each theme picks exactly one base (dark or light) and the old three keep their classes', () => {
    for (const o of THEME_OPTIONS) {
      const bases = o.classes.filter((c) => c === 'dark' || c === 'light');
      assert.strictEqual(bases.length, 1, `${o.id} has one base`);
    }
    assert.deepStrictEqual(themeOption('vscode').classes, ['dark', 'theme-vscode']);
    assert.deepStrictEqual(themeOption('midnight').classes, ['dark', 'theme-midnight']);
    assert.deepStrictEqual(themeOption('light').classes, ['light']);
    assert.deepStrictEqual(themeOption('sage').classes, ['light', 'theme-sage']);
  });

  test('switching removes every theme class, including the new ones', () => {
    for (const c of ['dark', 'light', 'theme-vscode', 'theme-midnight', 'theme-noir', 'theme-sage', 'theme-ember']) {
      assert.ok(ALL_THEME_CLASSES.includes(c), c);
    }
  });

  test('a saved theme is kept; anything else falls back to VS Code', () => {
    for (const o of THEME_OPTIONS) assert.strictEqual(savedTheme(o.id), o.id);
    assert.strictEqual(savedTheme(null), 'vscode');
    assert.strictEqual(savedTheme('dark'), 'vscode');
    assert.strictEqual(savedTheme('neon'), 'vscode');
  });

  test('the cycle button visits every theme once, then starts again', () => {
    const seen: string[] = [];
    let t = THEME_OPTIONS[0].id;
    for (let i = 0; i < THEME_OPTIONS.length; i++) {
      seen.push(t);
      t = nextTheme(t);
    }
    assert.deepStrictEqual(seen, THEME_OPTIONS.map((o) => o.id));
    assert.strictEqual(t, 'vscode');
  });
});
