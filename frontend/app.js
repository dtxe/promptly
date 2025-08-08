const params = new URLSearchParams(window.location.search);
const token = params.get('token');
let isAdmin = false;
let userRole = null;

fetch('/api/me')
  .then(res => res.json())
  .then(user => {
    if (user && ['ta', 'professor'].includes(user.role)) {
      isAdmin = true;
      userRole = user.role;
      document.getElementById('admin').style.display = 'block';
      document.getElementById('add-section').onclick = addSection;
    }
  });

if (!token) {
  document.getElementById('log').innerText = 'Missing session token';
} else {
  const ws = new WebSocket(`ws://${window.location.host}?token=${token}`);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'command') appendCommand(msg.data);
    if (msg.type === 'commandUpdate') updateCommand(msg.data);
    if (msg.type === 'section') appendSection(msg.data);
    if (msg.type === 'sectionUpdate') updateSection(msg.data);
    if (msg.type === 'deleteSection') removeSection(msg.data.id);
    if (msg.type === 'deleteCommand') removeCommand(msg.data.id);
  };

  fetch(`/api/session/${token}`)
    .then(res => res.json())
    .then(data => {
      data.sections.forEach(appendSection);
      data.commands.forEach(appendCommand);
    });
}

function addSection() {
  const title = document.getElementById('section-title').value;
  fetch('/api/section', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken: token, title })
  }).then(()=>{ document.getElementById('section-title').value=''; });
}

let count = 1;
const sectionElements = new Map();
const commandElements = new Map();

function appendSection(section) {
  const log = document.getElementById('log');
  const h = document.createElement('h3');
  h.textContent = section.title;
  h.dataset.id = section.id;
  if (isAdmin) {
    const btns = document.createElement('span');
    btns.innerHTML = ` <button class="btn btn-sm btn-secondary edit-section">Edit</button> <button class="btn btn-sm btn-danger delete-section">Delete</button>`;
    h.appendChild(btns);
    btns.querySelector('.edit-section').onclick = () => {
      const title = prompt('New title', section.title);
      if (title) fetch(`/api/section/${section.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title }) });
    };
    btns.querySelector('.delete-section').onclick = () => fetch(`/api/section/${section.id}`, { method:'DELETE' });
  }
  log.appendChild(h);
  sectionElements.set(section.id, h);
}

function updateSection(section) {
  const h = sectionElements.get(section.id);
  if (h) h.firstChild ? h.firstChild.textContent = section.title : h.textContent = section.title;
}

function removeSection(id) {
  const h = sectionElements.get(id);
  if (h) h.remove();
  sectionElements.delete(id);
}

function appendCommand(cmd) {
  const log = document.getElementById('log');
  const wrapper = document.createElement('div');
  wrapper.className = 'mb-3';
  wrapper.dataset.id = cmd.id;
  const num = document.createElement('div');
  num.innerHTML = `<strong>${count++}.</strong> <code>${cmd.command}</code>`;
  const out = document.createElement('pre');
  out.textContent = cmd.output;
  const expl = document.createElement('div');
  expl.className = 'expl';
  const html = DOMPurify.sanitize(marked.parse(cmd.explanation || ''));
  expl.innerHTML = html;
  wrapper.appendChild(num);
  wrapper.appendChild(out);
  wrapper.appendChild(expl);
  if (isAdmin) {
    const btns = document.createElement('div');
    btns.innerHTML = `<button class="btn btn-sm btn-secondary edit-cmd">Edit</button> <button class="btn btn-sm btn-danger delete-cmd">Delete</button>`;
    wrapper.appendChild(btns);
    btns.querySelector('.edit-cmd').onclick = () => {
      const explanation = prompt('New explanation', cmd.explanation || '');
      if (explanation !== null) fetch(`/api/command/${cmd.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ explanation }) });
    };
    btns.querySelector('.delete-cmd').onclick = () => fetch(`/api/command/${cmd.id}`, { method:'DELETE' });
  }
  log.appendChild(wrapper);
  log.scrollTop = log.scrollHeight;
  commandElements.set(cmd.id, wrapper);
}

function updateCommand(cmd) {
  const el = commandElements.get(cmd.id);
  if (!el) return;
  el.querySelector('code').textContent = cmd.command;
  el.querySelector('pre').textContent = cmd.output;
  const expl = el.querySelector('.expl');
  const html = DOMPurify.sanitize(marked.parse(cmd.explanation || ''));
  expl.innerHTML = html;
}

function removeCommand(id) {
  const el = commandElements.get(id);
  if (el) el.remove();
  commandElements.delete(id);
}
