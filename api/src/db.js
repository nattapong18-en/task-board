const { Pool } = require('pg');

function createTaskStore() {
  const pool = new Pool({
    host: process.env.PGHOST || 'db',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'taskboard',
    user: process.env.PGUSER || 'taskboard',
    password: process.env.PGPASSWORD,
    max: 10,
    connectionTimeoutMillis: 5000,
  });

  return {
    async initialize() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
          completed BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    },

    async health() {
      await pool.query('SELECT 1');
    },

    async list() {
      const result = await pool.query(
        'SELECT id, title, completed, created_at FROM tasks ORDER BY created_at DESC, id DESC'
      );
      return result.rows;
    },

    async create(title) {
      const result = await pool.query(
        'INSERT INTO tasks (title) VALUES ($1) RETURNING id, title, completed, created_at',
        [title]
      );
      return result.rows[0];
    },

    async update(id, changes) {
      const fields = [];
      const values = [];
      if ('title' in changes) {
        values.push(changes.title);
        fields.push(`title = $${values.length}`);
      }
      if ('completed' in changes) {
        values.push(changes.completed);
        fields.push(`completed = $${values.length}`);
      }
      values.push(id);
      const result = await pool.query(
        `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${values.length}
         RETURNING id, title, completed, created_at`,
        values
      );
      return result.rows[0] || null;
    },

    async remove(id) {
      const result = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
      return result.rowCount === 1;
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = { createTaskStore };

