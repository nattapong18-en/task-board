const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');

function createMemoryStore() {
  let nextId = 2;
  let tasks = [{ id: 1, title: 'Learn Compose', completed: false, created_at: new Date().toISOString() }];
  return {
    async health() {},
    async list() { return tasks; },
    async create(title) {
      const task = { id: nextId++, title, completed: false, created_at: new Date().toISOString() };
      tasks = [task, ...tasks];
      return task;
    },
    async update(id, changes) {
      const task = tasks.find((item) => item.id === id);
      if (!task) return null;
      Object.assign(task, changes);
      return task;
    },
    async remove(id) {
      const before = tasks.length;
      tasks = tasks.filter((item) => item.id !== id);
      return tasks.length !== before;
    },
  };
}

test('health and task CRUD flow', async () => {
  const app = createApp(createMemoryStore());

  await request(app).get('/health').expect(200, { status: 'ok' });
  const created = await request(app).post('/api/tasks').send({ title: '  Build image  ' }).expect(201);
  assert.equal(created.body.title, 'Build image');
  assert.equal(created.body.completed, false);

  const updated = await request(app)
    .patch(`/api/tasks/${created.body.id}`)
    .send({ title: 'Push image', completed: true })
    .expect(200);
  assert.equal(updated.body.title, 'Push image');
  assert.equal(updated.body.completed, true);

  await request(app).get('/api/tasks').expect(200).expect((response) => {
    assert.equal(response.body.length, 2);
  });
  await request(app).delete(`/api/tasks/${created.body.id}`).expect(204);
  await request(app).delete(`/api/tasks/${created.body.id}`).expect(404);
});

test('validates task payloads and ids', async () => {
  const app = createApp(createMemoryStore());
  await request(app).post('/api/tasks').send({ title: '   ' }).expect(400);
  await request(app).post('/api/tasks').send({ title: 'x'.repeat(201) }).expect(400);
  await request(app).patch('/api/tasks/nope').send({ completed: true }).expect(400);
  await request(app).patch('/api/tasks/1').send({ completed: 'yes' }).expect(400);
  await request(app).patch('/api/tasks/1').send({ unknown: true }).expect(400);
  await request(app).patch('/api/tasks/999').send({ completed: true }).expect(404);
});

test('reports dependency failure through health endpoint', async () => {
  const store = createMemoryStore();
  store.health = async () => { throw new Error('database unavailable'); };
  await request(createApp(store)).get('/health').expect(503, { status: 'unavailable' });
});

