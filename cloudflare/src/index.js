const taskFields = 'id, title, completed, created_at';

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function parseTaskId(value) {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizeTitle(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function serializeTask(task) {
  if (!task) return null;
  return { ...task, completed: Boolean(task.completed) };
}

async function readJson(request) {
  try {
    return { value: await request.json() };
  } catch (_error) {
    return { error: json({ error: 'invalid JSON body' }, 400) };
  }
}

async function findTask(database, id) {
  const task = await database
    .prepare(`SELECT ${taskFields} FROM tasks WHERE id = ?`)
    .bind(id)
    .first();
  return serializeTask(task);
}

async function listTasks(database) {
  const result = await database
    .prepare(`SELECT ${taskFields} FROM tasks ORDER BY created_at DESC, id DESC`)
    .all();
  return result.results.map(serializeTask);
}

async function createTask(request, database) {
  const body = await readJson(request);
  if (body.error) return body.error;

  const title = normalizeTitle(body.value?.title);
  if (!title || title.length > 200) {
    return json({ error: 'title must contain 1-200 characters' }, 400);
  }

  const result = await database.prepare('INSERT INTO tasks (title) VALUES (?)').bind(title).run();
  const task = await findTask(database, Number(result.meta.last_row_id));
  return json(task, 201);
}

async function updateTask(request, database, id) {
  const body = await readJson(request);
  if (body.error) return body.error;

  const allowedKeys = ['title', 'completed'];
  const suppliedKeys = Object.keys(body.value ?? {});
  if (suppliedKeys.length === 0 || suppliedKeys.some((key) => !allowedKeys.includes(key))) {
    return json({ error: 'provide title and/or completed only' }, 400);
  }

  const fields = [];
  const values = [];
  if ('title' in body.value) {
    const title = normalizeTitle(body.value.title);
    if (!title || title.length > 200) {
      return json({ error: 'title must contain 1-200 characters' }, 400);
    }
    fields.push('title = ?');
    values.push(title);
  }
  if ('completed' in body.value) {
    if (typeof body.value.completed !== 'boolean') {
      return json({ error: 'completed must be a boolean' }, 400);
    }
    fields.push('completed = ?');
    values.push(body.value.completed ? 1 : 0);
  }

  const result = await database
    .prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values, id)
    .run();
  if (result.meta.changes === 0) return json({ error: 'task not found' }, 404);
  return json(await findTask(database, id));
}

async function deleteTask(database, id) {
  const result = await database.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
  return result.meta.changes === 0
    ? json({ error: 'task not found' }, 404)
    : new Response(null, { status: 204 });
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/health' && request.method === 'GET') {
    try {
      await env.DB.prepare('SELECT 1').first();
      return json({ status: 'ok' });
    } catch (_error) {
      return json({ status: 'unavailable' }, 503);
    }
  }

  if (url.pathname === '/api/tasks') {
    if (request.method === 'GET') return json(await listTasks(env.DB));
    if (request.method === 'POST') return createTask(request, env.DB);
    return json({ error: 'method not allowed' }, 405);
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch) {
    const id = parseTaskId(taskMatch[1]);
    if (!id) return json({ error: 'invalid task id' }, 400);
    if (request.method === 'PATCH') return updateTask(request, env.DB, id);
    if (request.method === 'DELETE') return deleteTask(env.DB, id);
    return json({ error: 'method not allowed' }, 405);
  }

  if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error(error);
      return json({ error: 'internal server error' }, 500);
    }
  },
};

