// Vercel Function — proxy para a API do Notion (sem CORS)
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-notion-token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = req.headers['x-notion-token'];
  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const notionPath = req.query.path;
  if (!notionPath) {
    return res.status(400).json({ error: 'Path não informado' });
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/${notionPath}`, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: ['POST', 'PATCH', 'PUT'].includes(req.method)
        ? JSON.stringify(req.body)
        : undefined,
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
