const express = require('express');

function parseTaskId(value) {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizeTitle(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createApp(taskStore) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', async (_req, res) => {
    try {
      await taskStore.health();
      res.json({ status: 'ok' });
    } catch (_error) {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.get('/api/tasks', async (_req, res, next) => {
    try {
      res.json(await taskStore.list());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/tasks', async (req, res, next) => {
    const title = normalizeTitle(req.body?.title);
    if (!title || title.length > 200) {
      return res.status(400).json({ error: 'title must contain 1-200 characters' });
    }

    try {
      const task = await taskStore.create(title);
      return res.status(201).json(task);
    } catch (error) {
      return next(error);
    }
  });

  app.patch('/api/tasks/:id', async (req, res, next) => {
    const id = parseTaskId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid task id' });

    const allowedKeys = ['title', 'completed'];
    const suppliedKeys = Object.keys(req.body ?? {});
    if (suppliedKeys.length === 0 || suppliedKeys.some((key) => !allowedKeys.includes(key))) {
      return res.status(400).json({ error: 'provide title and/or completed only' });
    }

    const changes = {};
    if ('title' in req.body) {
      const title = normalizeTitle(req.body.title);
      if (!title || title.length > 200) {
        return res.status(400).json({ error: 'title must contain 1-200 characters' });
      }
      changes.title = title;
    }
    if ('completed' in req.body) {
      if (typeof req.body.completed !== 'boolean') {
        return res.status(400).json({ error: 'completed must be a boolean' });
      }
      changes.completed = req.body.completed;
    }

    try {
      const task = await taskStore.update(id, changes);
      return task ? res.json(task) : res.status(404).json({ error: 'task not found' });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/tasks/:id', async (req, res, next) => {
    const id = parseTaskId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid task id' });

    try {
      const removed = await taskStore.remove(id);
      return removed ? res.status(204).end() : res.status(404).json({ error: 'task not found' });
    } catch (error) {
      return next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ error: 'invalid JSON body' });
    }
    console.error(error);
    return res.status(500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp };

