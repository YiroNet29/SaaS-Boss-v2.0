import type { Page } from '@playwright/test';

/** One piece of text that is too faint for its background. */
export interface LowContrast {
  text: string;
  ratio: number;
  needed: number;
  color: string;
  background: string;
  where: string;
}

/**
 * Measures every visible text on the page against the background behind it (WCAG 2 contrast:
 * 4.5:1 for normal text, 3:1 for large or bold-large text). Disabled controls, placeholders and
 * text over images or gradients are skipped, as the rule allows or as can't be measured reliably.
 */
export function findLowContrast(page: Page, root = 'body'): Promise<LowContrast[]> {
  return page.evaluate((rootSel) => {
    type RGBA = [number, number, number, number];
    // Any CSS colour (rgb, oklch, color-mix…) → sRGB, by painting one pixel.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const cache = new Map<string, RGBA | null>();
    const parse = (c: string): RGBA | null => {
      if (cache.has(c)) return cache.get(c)!;
      let out: RGBA | null = null;
      if (c && c !== 'transparent') {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#010203';
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        out = [r, g, b, a / 255];
      } else out = [0, 0, 0, 0];
      cache.set(c, out);
      return out;
    };
    const over = (top: RGBA, under: RGBA): RGBA => {
      const a = top[3] + under[3] * (1 - top[3]);
      if (!a) return [0, 0, 0, 0];
      const mix = (i: number) => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a;
      return [mix(0), mix(1), mix(2), a];
    };
    const lum = ([r, g, b]: RGBA) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: RGBA, b: RGBA) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const hex = (c: RGBA) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

    /** The colour behind an element, or null when an image or gradient is in the way. */
    const backgroundOf = (el: Element): RGBA | null => {
      const layers: RGBA[] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
        const bg = parse(cs.backgroundColor);
        if (bg && bg[3] > 0) {
          layers.push(bg);
          if (bg[3] >= 1) break;
        }
      }
      let base: RGBA = [255, 255, 255, 1];
      const bodyBg = parse(getComputedStyle(document.body).backgroundColor);
      if (bodyBg && bodyBg[3] > 0) base = over(bodyBg, base);
      for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
      return base;
    };

    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.1) return false;
      }
      return true;
    };
    const disabled = (el: Element) => Boolean(el.closest('[disabled], [aria-disabled="true"], fieldset:disabled'));
    const where = (el: Element) => {
      const parts: string[] = [];
      for (let n: Element | null = el; n && parts.length < 3; n = n.parentElement) {
        const label = n.getAttribute('aria-label') || n.id || '';
        parts.unshift(n.tagName.toLowerCase() + (label ? `[${label.slice(0, 30)}]` : ''));
      }
      return parts.join(' > ');
    };

    const out: LowContrast[] = [];
    const seen = new Set<string>();
    const root = document.querySelector(rootSel) ?? document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const text = (t.textContent || '').trim();
      if (!text || !/[\p{L}\p{N}]/u.test(text)) continue;
      const el = t.parentElement;
      if (!el || !visible(el) || disabled(el)) continue;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION', 'TITLE'].includes(el.tagName)) continue;
      const cs = getComputedStyle(el);
      const fg0 = parse(cs.color);
      const bg = backgroundOf(el);
      if (!fg0 || !bg) continue;
      // Element opacity (e.g. "opacity-60") fades the text towards the background.
      let opacity = 1;
      for (let n: Element | null = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
      const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * opacity], bg);
      const size = parseFloat(cs.fontSize);
      const bold = Number(cs.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const needed = large ? 3 : 4.5;
      const r = ratio(fg, bg);
      if (r + 0.005 >= needed) continue;
      const key = `${hex(fg)}|${hex(bg)}|${text.slice(0, 40)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: text.slice(0, 60), ratio: Math.round(r * 100) / 100, needed, color: hex(fg), background: hex(bg), where: where(el) });
    }
    return out;
  }, root);
}

const CONTROL_ROLES = 'button|link|textbox|combobox|checkbox|spinbutton|radio|switch|slider|searchbox|listbox|menuitem|tab';

/**
 * Buttons, links and form fields a screen reader would announce without a name (or with only a number,
 * such as a placeholder "0"), read from the browser's own accessibility tree.
 */
export async function findUnnamed(page: Page, root = 'body'): Promise<string[]> {
  const lines = (await page.locator(root).ariaSnapshot()).split('\n');
  const unnamed = new RegExp(`^\\s*- (${CONTROL_ROLES})(\\s*\\[[^\\]]*\\])*\\s*(:.*)?$`);
  const numberOnly = new RegExp(`^\\s*- (${CONTROL_ROLES}) "\\d*"`);
  return lines.flatMap((l, i) =>
    unnamed.test(l) || numberOnly.test(l) ? [`${l.trim()} (after: ${lines.slice(Math.max(0, i - 2), i).map((x) => x.trim()).join(' | ')})`] : []
  );
}
