const OpenAI = require('openai');
const db = require('./db');

// Generate a brief explanation for a command using OpenAI's GPT-4.1 model.
// If OPENAI_API_KEY is not set, returns a placeholder explanation.
async function explainCommand(sessionId, command, output) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return `Explanation for: ${command}`;
  }

  const client = new OpenAI({ apiKey });

  // Fetch last 15 commands for context
  const history = db
    .prepare('SELECT command, output FROM commands WHERE session_id = ? ORDER BY id DESC LIMIT 15')
    .all(sessionId)
    .reverse();

  const messages = [
    { role: 'system', content: 'You are a helpful teaching assistant explaining terminal commands succinctly.' },
    ...history.map(h => ({ role: 'user', content: `Command: ${h.command}\nOutput: ${h.output}` })),
    { role: 'user', content: `Command: ${command}\nOutput: ${output}` }
  ];

  const response = await client.chat.completions.create({
    model: 'gpt-4.1',
    messages,
    max_tokens: 100
  });

  return response.choices[0].message.content.trim();
}

module.exports = { explainCommand };
