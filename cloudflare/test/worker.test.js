import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/index.js';

class MemoryD1 {
  constructor() {
    this.tasks = [];
    this.nextId = 1;
  }

  prepare(sql) {
    const database = this;
    const normalized = sql.replace(/\s+/g, ' ').trim();
    let values = [];
    return {
      bind(...args) {
        values = args;
        return this;
      },
      async first() {
        if (normalized === 'SELECT 1') return { 1: 1 };
        if (normalized.includes('FROM tasks WHERE id = ?')) {
          return database.tasks.find((task) => task.id === values[0]) ?? null;
        }
        throw new Error(`Unhandled first query: ${normalized}`);
      },
      async all() {
        if (normalized.includes('FROM tasks ORDER BY')) {
          return { results: [...database.tasks].sort((a, b) => b.id - a.id) };
        }
        throw new Error(`Unhandled all query: ${normalized}`);
      },
      async run() {
        if (normalized.startsWith('INSERT INTO tasks')) {
          const task = {
            id: database.nextId++,
            title: values[0],
            completed: 0,
            created_at: new Date().toISOString(),
          };
          database.tasks.push(task);
          return { meta: { changes: 1, last_row_id: task.id } };
        }
        if (normalized.startsWith('UPDATE tasks SET')) {
          const id = values.at(-1);
          const task = database.tasks.find((item) => item.id === id);
          if (!task) return { meta: { changes: 0 } };
          let index = 0;
          if (normalized.includes('title = ?')) task.title = values[index++];
          if (normalized.includes('completed = ?')) task.completed = values[index++];
          return { meta: { changes: 1 } };
        }
        if (normalized.startsWith('DELETE FROM tasks')) {
          const before = database.tasks.length;
          database.tasks = database.tasks.filter((task) => task.id !== values[0]);
          return { meta: { changes: before - database.tasks.length } };
        }
        throw new Error(`Unhandled run query: ${normalized}`);
      },
    };
  }
}

function createEnvironment() {
  return {
    DB: new MemoryD1(),
    ASSETS: { fetch: async () => new Response('asset') },
  };
}

async function jsonBody(response) {
  return response.json();
}

test('health and CRUD flow preserve the existing API contract', async () => {
  const env = createEnvironment();
  let response = await handleRequest(new Request('https://example.test/health'), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await jsonBody(response), { status: 'ok' });

  response = await handleRequest(new Request('https://example.test/api/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '  Deploy Worker  ' }),
  }), env);
  assert.equal(response.status, 201);
  const created = await jsonBody(response);
  assert.equal(created.title, 'Deploy Worker');
  assert.equal(created.completed, false);

  response = await handleRequest(new Request(`https://example.test/api/tasks/${created.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Share URL', completed: true }),
  }), env);
  const updated = await jsonBody(response);
  assert.equal(updated.title, 'Share URL');
  assert.equal(updated.completed, true);

  response = await handleRequest(new Request('https://example.test/api/tasks'), env);
  assert.equal((await jsonBody(response)).length, 1);

  response = await handleRequest(
    new Request(`https://example.test/api/tasks/${created.id}`, { method: 'DELETE' }),
    env
  );
  assert.equal(response.status, 204);
});

test('validates payloads, ids, missing tasks, and JSON syntax', async () => {
  const env = createEnvironment();
  let response = await handleRequest(new Request('https://example.test/api/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{bad json',
  }), env);
  assert.equal(response.status, 400);

  response = await handleRequest(new Request('https://example.test/api/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: ' ' }),
  }), env);
  assert.equal(response.status, 400);

  response = await handleRequest(new Request('https://example.test/api/tasks/nope', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ completed: true }),
  }), env);
  assert.equal(response.status, 400);

  response = await handleRequest(new Request('https://example.test/api/tasks/999', {
    method: 'DELETE',
  }), env);
  assert.equal(response.status, 404);
});

test('falls back to static assets for non-API requests', async () => {
  const response = await handleRequest(new Request('https://example.test/'), createEnvironment());
  assert.equal(await response.text(), 'asset');
});

