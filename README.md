# Promptly

Promptly is a teaching aid for demonstrating terminal commands in a classroom.
It consists of a Node.js backend, a simple browser frontend, and a Bash
command-line recorder.

## Features

* GitHub OAuth authentication for professors and teaching assistants.
* Professors can create class sessions that produce activation tokens.
* A Bash CLI captures commands and outputs and uploads them to the server.
* The backend stores commands in SQLite and generates brief explanations using
  OpenAI's GPT-4.1 API (if configured).
* Live updates are streamed to learners via WebSockets.
* TAs and professors can insert section headers, edit or delete commands, and
  annotate explanations.
* Professors manage sessions and authorized users via `/admin.html`.

## Development

```bash
npm install
npm start       # start backend on http://localhost:3000
# Open http://localhost:3000?token=SESSION_TOKEN in the browser
```

To capture commands on a machine, source the CLI script with the provided token
and your GitHub username:

```bash
source cli/promptly.sh YOUR_TOKEN YOUR_GITHUB_USERNAME http://localhost:3000
```

Only usernames listed in the `authorized_users` table with role `professor` or
`ta` may upload commands or make changes.
