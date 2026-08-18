const list = document.querySelector('#task-list');
const form = document.querySelector('#task-form');
const input = document.querySelector('#task-title');
const summary = document.querySelector('#summary');
const message = document.querySelector('#message');
const emptyState = document.querySelector('#empty-state');
const clearButton = document.querySelector('#clear-completed');
const statusBadge = document.querySelector('.status');

let tasks = [];

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

function setMessage(text = '') {
  message.textContent = text;
}

function render() {
  list.replaceChildren();
  const remaining = tasks.filter((task) => !task.completed).length;
  summary.textContent = `${tasks.length} งานทั้งหมด · เหลือ ${remaining} งาน`;
  emptyState.hidden = tasks.length !== 0;
  clearButton.hidden = !tasks.some((task) => task.completed);

  for (const task of tasks) {
    const item = document.createElement('li');
    item.className = `task${task.completed ? ' done' : ''}`;

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'toggle';
    toggle.checked = task.completed;
    toggle.setAttribute('aria-label', `เปลี่ยนสถานะ ${task.title}`);
    toggle.addEventListener('change', () => updateTask(task.id, { completed: toggle.checked }));

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = task.title;

    const actions = document.createElement('div');
    actions.className = 'actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'แก้ไข';
    edit.addEventListener('click', () => editTask(task));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'ลบ';
    remove.addEventListener('click', () => deleteTask(task.id));
    actions.append(edit, remove);
    item.append(toggle, title, actions);
    list.append(item);
  }
}

async function loadTasks() {
  try {
    tasks = await api('/api/tasks');
    statusBadge.classList.remove('offline');
    statusBadge.lastChild.textContent = ' API connected';
    render();
  } catch (error) {
    statusBadge.classList.add('offline');
    statusBadge.lastChild.textContent = ' API unavailable';
    setMessage(`โหลดข้อมูลไม่สำเร็จ: ${error.message}`);
  }
}

async function updateTask(id, changes) {
  try {
    const updated = await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
    tasks = tasks.map((task) => task.id === id ? updated : task);
    setMessage();
    render();
  } catch (error) {
    setMessage(`แก้ไขไม่สำเร็จ: ${error.message}`);
    await loadTasks();
  }
}

function editTask(task) {
  const title = window.prompt('แก้ไขชื่องาน', task.title);
  if (title !== null && title.trim() && title.trim() !== task.title) {
    updateTask(task.id, { title: title.trim() });
  }
}

async function deleteTask(id) {
  try {
    await api(`/api/tasks/${id}`, { method: 'DELETE' });
    tasks = tasks.filter((task) => task.id !== id);
    setMessage();
    render();
  } catch (error) {
    setMessage(`ลบไม่สำเร็จ: ${error.message}`);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  try {
    const created = await api('/api/tasks', { method: 'POST', body: JSON.stringify({ title }) });
    tasks.unshift(created);
    input.value = '';
    setMessage();
    render();
    input.focus();
  } catch (error) {
    setMessage(`เพิ่มงานไม่สำเร็จ: ${error.message}`);
  }
});

clearButton.addEventListener('click', async () => {
  const completed = tasks.filter((task) => task.completed);
  const results = await Promise.allSettled(completed.map((task) => api(`/api/tasks/${task.id}`, { method: 'DELETE' })));
  if (results.some((result) => result.status === 'rejected')) {
    setMessage('ลบบางรายการไม่สำเร็จ กรุณาลองอีกครั้ง');
  }
  await loadTasks();
});

loadTasks();

