fetch('/api/me')
  .then(res => res.json())
  .then(user => {
    if (!user || user.role !== 'professor') {
      document.getElementById('unauth').style.display = 'block';
      return;
    }
    document.getElementById('content').style.display = 'block';
    loadSessions();
    loadUsers();
    document.getElementById('create-session').onclick = createSession;
    document.getElementById('add-user').onsubmit = addUser;
  });

function loadSessions() {
  fetch('/api/sessions')
    .then(res => res.json())
    .then(sessions => {
      const ul = document.getElementById('sessions');
      ul.innerHTML = '';
      sessions.forEach(s => {
        const li = document.createElement('li');
        li.textContent = `${s.id} - ${s.token}`;
        ul.appendChild(li);
      });
    });
}

function createSession() {
  fetch('/api/session', { method: 'POST' })
    .then(res => res.json())
    .then(() => loadSessions());
}

function loadUsers() {
  fetch('/api/users')
    .then(res => res.json())
    .then(users => {
      const table = document.getElementById('user-table');
      table.innerHTML = '<tr><th>User</th><th>Role</th><th></th></tr>';
      users.forEach(u => {
        const tr = document.createElement('tr');
        const nameTd = document.createElement('td');
        nameTd.textContent = u.username;
        const roleTd = document.createElement('td');
        const sel = document.createElement('select');
        sel.className = 'form-select';
        ['professor','ta'].forEach(r => {
          const opt = document.createElement('option');
          opt.value = r;
          opt.textContent = r;
          if (u.role === r) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.onchange = () => fetch(`/api/users/${u.username}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ role: sel.value }) });
        roleTd.appendChild(sel);
        const delTd = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-danger';
        btn.textContent = 'Delete';
        btn.onclick = () => fetch(`/api/users/${u.username}`, { method:'DELETE' }).then(loadUsers);
        delTd.appendChild(btn);
        tr.appendChild(nameTd);
        tr.appendChild(roleTd);
        tr.appendChild(delTd);
        table.appendChild(tr);
      });
    });
}

function addUser(e) {
  e.preventDefault();
  const username = document.getElementById('new-username').value;
  const role = document.getElementById('new-role').value;
  fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, role })
  }).then(() => {
    document.getElementById('new-username').value = '';
    loadUsers();
  });
}
