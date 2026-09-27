const fs = require('fs');
const { OPENAI_API_KEY, OPENAI_MODEL } = require('../config');

const enabled = () => Boolean(OPENAI_API_KEY);

function dataUrl(filePath) {
  return `data:image/jpeg;base64,${fs.readFileSync(filePath).toString('base64')}`;
}

async function chatJSON(messages, maxTokens = 500) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return JSON.parse(body.choices[0].message.content);
}

async function describePhotos(filePaths, categories) {
  const content = [
    {
      type: 'text',
      text:
        'You are a lost-and-found vision agent. Look at these photos of ONE item and reply with JSON ' +
        '{"title": short item title, "category": one of ' +
        JSON.stringify(categories) +
        ', "colors": [..], "brand": string|null, "description": one-sentence description with distinguishing marks}.',
    },
    ...filePaths.slice(0, 5).map((p) => ({ type: 'image_url', image_url: { url: dataUrl(p), detail: 'low' } })),
  ];
  return chatJSON([{ role: 'user', content }]);
}

async function parseDescription(text, categories) {
  return chatJSON([
    {
      role: 'system',
      content:
        'Extract lost-item attributes. Reply JSON {"category": one of ' +
        JSON.stringify(categories) +
        ' or null, "colors": [..], "brand": string|null, "keywords": [..], "visual_query": a short visual description suitable for image search}.',
    },
    { role: 'user', content: text },
  ]);
}

async function verifyCandidates(queryPaths, queryText, candidates) {
  const content = [
    {
      type: 'text',
      text:
        'You are verifying lost & found matches. The owner lost the item shown in the first image(s)' +
        (queryText ? ` and described it as: "${queryText}"` : '') +
        '. Then candidate found items follow, each preceded by its id. Reply JSON {"results": [{"id": number, "confidence": 0-100, "reason": short reason}]} for every candidate.',
    },
    ...queryPaths.slice(0, 2).map((p) => ({ type: 'image_url', image_url: { url: dataUrl(p), detail: 'low' } })),
  ];
  for (const c of candidates) {
    content.push({ type: 'text', text: `Candidate id ${c.id}: ${c.title}. ${c.description || ''}` });
    if (c.photoPath) content.push({ type: 'image_url', image_url: { url: dataUrl(c.photoPath), detail: 'low' } });
  }
  const out = await chatJSON([{ role: 'user', content }], 700);
  return Array.isArray(out.results) ? out.results : [];
}

module.exports = { enabled, describePhotos, parseDescription, verifyCandidates };
