import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, expect, it } from 'vitest';
import system from '../data/system.json';
import { editorPlugin, saveSystem } from '../tools/editor-server';
import { validateSystem } from '../src/editor/copy-data';
let directory = '';
afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});
it('GET/PUT system round trips copy, keeps saved key order and rejects bad writes', async () => {
  directory = mkdtempSync(join(tmpdir(), 'ner-system-'));
  mkdirSync(join(directory, 'data'));
  const path = join(directory, 'data/system.json');
  writeFileSync(path, JSON.stringify(system, null, 2) + '\n');
  const routes = new Map<string, (req: any, res: any) => Promise<void>>();
  const plugin = editorPlugin();
  (plugin.configureServer as Function)({
    config: { root: directory },
    middlewares: {
      use: (route: string, handler: any) => routes.set(route, handler),
    },
  });
  const call = async (
    method: string,
    body?: unknown,
    origin = 'http://localhost',
  ) => {
    const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
    Object.assign(req, { method, headers: { host: 'localhost', origin } });
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (text: string) => {
        result = text;
      },
    };
    let result = '';
    await routes.get('/__editor/system')!(req, res);
    return { status: res.statusCode, body: JSON.parse(result || '{}') };
  };
  expect((await call('GET')).body).toEqual(system);
  const edited = structuredClone(system);
  edited.title.pick = '새 선택 안내';
  const reversed = Object.fromEntries(Object.entries(edited).reverse());
  expect((await call('PUT', reversed)).status).toBe(200);
  expect(readFileSync(path, 'utf8')).toBe(
    JSON.stringify(edited, null, 2) + '\n',
  );
  expect((await call('GET')).body.title.pick).toBe('새 선택 안내');
  const bytes = readFileSync(path, 'utf8');
  edited.scenes.stitch.art = 'bad';
  expect((await call('PUT', edited)).status).toBe(400);
  expect((await call('PUT', system, 'https://elsewhere.test')).status).toBe(
    403,
  );
  expect((await call('POST', system)).status).toBe(405);
  expect(readFileSync(path, 'utf8')).toBe(bytes);
});
it('requires copy strings, placeholders, valid focus and immutable structure', () => {
  expect(validateSystem(system, system)).toEqual([]);
  for (const mutate of [
    (v: typeof system) => {
      v.title.pick = ' ';
    },
    (v: typeof system) => {
      v.modes.bestYear = '{year}년';
    },
    (v: typeof system) => {
      v.tutorial.steps[0]!.focus = 'invalid';
    },
    (v: typeof system) => {
      v.speakers.erpin.color = '#fff';
    },
    (v: typeof system) => {
      v.gauges[0]!.key = 'oops';
    },
    (v: typeof system) => {
      v.tutorial.steps = [];
    },
    (v: typeof system) => {
      delete (v as Partial<typeof system>).notice;
    },
  ]) {
    const copy = structuredClone(system);
    mutate(copy);
    expect(validateSystem(copy, system).length).toBeGreaterThan(0);
  }
});
it('can save new dialogue after every existing line has been removed', () => {
  directory = mkdtempSync(join(tmpdir(), 'ner-system-'));
  const path = join(directory, 'system.json');
  const copy = structuredClone(system);
  copy.scenes.stitch.lines = [];
  writeFileSync(path, JSON.stringify(copy));
  copy.scenes.stitch.lines.push({ name: '네르', text: '새 대사' });
  expect(saveSystem(path, copy).status).toBe(200);
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(copy);
});
