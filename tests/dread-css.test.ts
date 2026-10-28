import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The burning-kingdom layers lift the desk contents above the fire glow. The axe
// halves and bullet shards are absolutely positioned clones of the paper, so the
// lift must never turn them into relative boxes (that broke both effects from 186).
describe('late-game atmosphere stacking', () => {
  const css = readFileSync('src/ui/style.css', 'utf8');

  it('keeps axe halves and bullet shards out of the relative lift', () => {
    expect(css).toMatch(
      /\.desk\.dread \.stage > :not\(\.embers, \.axe-half, \.shot-shard\) \{\s*position: relative;/,
    );
    expect(css).not.toMatch(/\.desk\.dread \.stage > :not\(\.embers\) \{/);
  });

  it('still stacks the effect clones above the glow', () => {
    expect(css).toMatch(
      /\.desk\.dread \.stage > :is\(\.axe-half, \.shot-shard\) \{\s*z-index: 1;/,
    );
  });
});
