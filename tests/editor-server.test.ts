import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import cards from '../data/cards/m1.json';
import { saveCards, editorPlugin } from '../tools/editor-server';
import { validateCards } from '../tools/validate-cards';
let directory: string;
afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  directory = mkdtempSync(join(tmpdir(), 'ner-editor-'));
  const folder = join(directory, 'data/cards');
  mkdirSync(folder, { recursive: true });
  const path = join(folder, 'm1.json');
  writeFileSync(path, 'original\n');
  return path;
}
it('imports the validator without executing its CLI', () => {
  expect(validateCards(cards)).toEqual([]);
  expect(validateCards(null)).toHaveLength(1);
  expect(editorPlugin().apply).toBe('serve');
});
it('rejects invalid arrays and non-array bodies without touching the file or creating backups', () => {
  const path = fixture();
  for (const body of [null, {}, [], [{ ...cards[0], title: '' }]])
    expect(saveCards(path, body).status).toBe(400);
  expect(readFileSync(path, 'utf8')).toBe('original\n');
  expect(readdirSync(directory)).toEqual(['data']);
});
it('backs up old bytes, writes raw UTF-8 with two spaces and newline, keeps the last 20 backups', () => {
  const path = fixture();
  expect(saveCards(path, cards).status).toBe(200);
  const backups = join(directory, '.cache/card-backups');
  expect(readFileSync(join(backups, readdirSync(backups)[0]!), 'utf8')).toBe(
    'original\n',
  );
  expect(readFileSync(path, 'utf8')).toBe(
    JSON.stringify(cards, null, 2) + '\n',
  );
  for (let i = 0; i < 22; i++) {
    const stamp = String(i).padStart(2, '0');
    writeFileSync(join(backups, `m1-2000-${stamp}.json`), 'old');
  }
  saveCards(path, cards);
  expect(readdirSync(backups)).toHaveLength(20);
  expect(readdirSync(backups)).not.toContain('m1-2000-00.json');
});
