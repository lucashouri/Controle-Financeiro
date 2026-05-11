// Endpoint para o agente financeiro inserir transações
// A chave de serviço fica na variável de ambiente SUPABASE_SERVICE_KEY
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  // Verificar autorização básica (token simples)
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${process.env.AGENT_TOKEN}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const SUPA_URL = 'https://pirzmxhdbadihjzgbvrd.supabase.co';
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPA_KEY) return res.status(500).json({ error: 'Chave do Supabase não configurada' });

  const { action, data } = req.body;

  try {
    if (action === 'insert_transacao') {
      const resp = await fetch(`${SUPA_URL}/rest/v1/transacoes`, {
        method: 'POST',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(data)
      });
      const result = await resp.json();
      if (!resp.ok) return res.status(400).json({ error: result });
      return res.status(200).json({ ok: true, transacao: result[0] });
    }

    if (action === 'get_user_id') {
      const resp = await fetch(`${SUPA_URL}/rest/v1/transacoes?select=user_id&limit=1`, {
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`
        }
      });
      const result = await resp.json();
      if (!result.length) return res.status(404).json({ error: 'Nenhuma transação encontrada' });
      return res.status(200).json({ user_id: result[0].user_id });
    }

    if (action === 'get_resumo') {
      // Buscar últimas 10 transações
      const resp = await fetch(`${SUPA_URL}/rest/v1/transacoes?select=descricao,tipo,categoria,valor,data&order=data.desc&limit=10`, {
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`
        }
      });
      const result = await resp.json();
      return res.status(200).json({ transacoes: result });
    }

    return res.status(400).json({ error: 'Ação desconhecida' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
