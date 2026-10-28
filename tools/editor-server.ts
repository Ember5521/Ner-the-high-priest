import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Plugin } from 'vite';
import { validateCards } from './validate-cards';

import { orderedSystem, validateSystem } from '../src/editor/copy-data';

export function saveSystem(path: string, body: unknown) {
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  const errors = validateSystem(body, saved);
  if (errors.length) return { status: 400, errors };
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(
      temporary,
      JSON.stringify(orderedSystem(body, saved), null, 2) + '\n',
      'utf8',
    );
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
  return { status: 200, errors: [] };
}

let lastBackupTime = 0;

export function saveCards(path: string, body: unknown) {
  const errors = validateCards(body);
  if (errors.length) return { status: 400, errors };
  const backups = join(dirname(path), '../../.cache/card-backups');
  mkdirSync(backups, { recursive: true });
  lastBackupTime = Math.max(Date.now(), lastBackupTime + 1);
  const stamp = new Date(lastBackupTime).toISOString().replace(/[:.]/g, '-');
  copyFileSync(path, join(backups, `m1-${stamp}.json`));
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(body, null, 2) + '\n', 'utf8');
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
  const files = readdirSync(backups)
    .filter((name) => /^m1-.*\.json$/.test(name))
    .sort();
  for (const name of files.slice(0, -20)) rmSync(join(backups, name));
  return { status: 200, errors: [] };
}

export function editorPlugin(): Plugin {
  return {
    name: 'event-editor',
    apply: 'serve',
    configureServer(server) {
      for (const resource of ['cards', 'system']) {
        const path = join(
          server.config.root,
          resource === 'cards' ? 'data/cards/m1.json' : 'data/system.json',
        );
        server.middlewares.use(`/__editor/${resource}`, async (req, res) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          try {
            if (req.method === 'GET') {
              res.end(readFileSync(path, 'utf8'));
            } else if (req.method === (resource === 'cards' ? 'POST' : 'PUT')) {
              // Reject cross-origin writes even when a browser can reach localhost.
              if (
                req.headers.origin &&
                req.headers.origin !== `http://${req.headers.host}` &&
                req.headers.origin !== `https://${req.headers.host}`
              ) {
                res.statusCode = 403;
                res.end(JSON.stringify({ errors: ['Invalid origin'] }));
                return;
              }
              let body = '';
              req.setEncoding('utf8');
              for await (const chunk of req) body += chunk;
              let parsed: unknown;
              try {
                parsed = JSON.parse(body);
              } catch {
                res.statusCode = 400;
                res.end(JSON.stringify({ errors: ['Invalid JSON'] }));
                return;
              }
              const result =
                resource === 'cards'
                  ? saveCards(path, parsed)
                  : saveSystem(path, parsed);
              res.statusCode = result.status;
              res.end(JSON.stringify(result));
            } else {
              res.statusCode = 405;
              res.end();
            }
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ errors: [String(error)] }));
          }
        });
      }
    },
  };
}
