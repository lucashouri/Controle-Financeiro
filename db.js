// Camada de dados do Controle Financeiro (Neon Postgres).
// Todas as chamadas do app passam por aqui e exigem o PIN (variável APP_PIN).
import { neon } from '@neondatabase/serverless';
import { timingSafeEqual } from 'node:crypto';

export const TABLES = {
  perfis: ['id', 'nome'],
  transacoes: ['id', 'user_id', 'descricao', 'tipo', 'categoria', 'valor', 'data', 'obs', 'created_at'],
  cartoes: ['id', 'user_id', 'nome', 'bandeira', 'limite', 'cor', 'dia_vencimento', 'created_at'],
  gastos_cartao: ['id', 'user_id', 'cartao_id', 'descricao', 'valor', 'data', 'obs', 'parcela', 'total_parcelas', 'grupo_id', 'created_at'],
  caixinhas: ['id', 'user_id', 'nome', 'emoji', 'dono', 'meta', 'ativa', 'meta_mensal', 'meta_percentual', 'percentual_cdi', 'data_inicio_cdi', 'created_at'],
  movimentacoes_caixinha: ['id', 'user_id', 'caixinha_id', 'descricao', 'tipo', 'valor', 'saldo_apos', 'data', 'created_at'],
  recorrentes: ['id', 'user_id', 'nome', 'tipo', 'categoria', 'valor', 'dia_mes', 'ativo', 'obs', 'created_at'],
  faturas_pagas: ['id', 'user_id', 'cartao_id', 'mes', 'ano', 'valor_pago', 'data_pagamento', 'created_at'],
};

const q = (c) => '"' + c + '"';
const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });

function checkPin(req) {
  const expected = process.env.APP_PIN || '';
  const got = String(req.headers['x-app-pin'] || '');
  if (!expected) throw fail('APP_PIN não configurado no servidor.', 500);
  const a = Buffer.from(got), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw fail('PIN incorreto.', 401);
}

// Freio simples contra tentativas seguidas de PIN (por instância do servidor)
const tentativas = new Map();
function freio(ip, ok) {
  const now = Date.now();
  const r = tentativas.get(ip) || { n: 0, ate: 0 };
  if (r.ate > now) throw fail('Muitas tentativas. Aguarde alguns minutos.', 429);
  if (ok) { tentativas.delete(ip); return; }
  r.n += 1;
  if (r.n >= 8) { r.ate = now + 5 * 60 * 1000; r.n = 0; }
  tentativas.set(ip, r);
}

function cols(table, list) {
  const allowed = TABLES[table];
  for (const c of list) if (!allowed.includes(c)) throw fail('Coluna inválida: ' + c);
  return list;
}

function where(table, filters, params) {
  if (!Array.isArray(filters) || !filters.length) return '';
  const parts = filters.map((f) => {
    cols(table, [f.col]);
    if (f.op === 'in') {
      if (!Array.isArray(f.val) || !f.val.length) return 'false';
      params.push(f.val);
      return q(f.col) + ' = ANY($' + params.length + ')';
    }
    params.push(f.val);
    return q(f.col) + ' = $' + params.length;
  });
  return ' where ' + parts.join(' and ');
}

export async function run(sql, b) {
  const table = b.table;
  if (!TABLES[table]) throw fail('Tabela inválida.');
  const params = [];
  let text;
  if (b.op === 'select') {
    let order = '';
    if (Array.isArray(b.order) && b.order.length) {
      order = ' order by ' + b.order.map((o) => { cols(table, [o.col]); return q(o.col) + (o.asc === false ? ' desc' : ' asc'); }).join(', ');
    }
    const lim = Number.isInteger(b.limit) && b.limit > 0 ? ' limit ' + b.limit : '';
    text = 'select * from ' + q(table) + where(table, b.filters, params) + order + lim;
  } else if (b.op === 'insert' || b.op === 'upsert') {
    const rows = Array.isArray(b.rows) ? b.rows : [b.rows];
    if (!rows.length || rows.length > 2000) throw fail('Quantidade de linhas inválida.');
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => TABLES[table].includes(k));
    if (!keys.length) throw fail('Nada para gravar.');
    const values = rows.map((r) => '(' + keys.map((k) => {
      if (r[k] === undefined) return 'DEFAULT';
      params.push(r[k]); return '$' + params.length;
    }).join(',') + ')').join(',');
    text = 'insert into ' + q(table) + ' (' + keys.map(q).join(',') + ') values ' + values;
    if (b.op === 'upsert') {
      const conf = cols(table, String(b.onConflict || 'id').split(',').map((s) => s.trim()));
      const sets = keys.filter((k) => !conf.includes(k)).map((k) => q(k) + '=EXCLUDED.' + q(k));
      text += ' on conflict (' + conf.map(q).join(',') + ') ' + (sets.length ? 'do update set ' + sets.join(',') : 'do nothing');
    } else if (b.ignoreConflicts) {
      text += ' on conflict do nothing';
    }
    text += ' returning *';
  } else if (b.op === 'update') {
    const keys = Object.keys(b.values || {}).filter((k) => TABLES[table].includes(k) && k !== 'id');
    if (!keys.length) throw fail('Nada para atualizar.');
    if (!Array.isArray(b.filters) || !b.filters.length) throw fail('Update sem filtro não é permitido.');
    const sets = keys.map((k) => { params.push(b.values[k]); return q(k) + ' = $' + params.length; });
    text = 'update ' + q(table) + ' set ' + sets.join(', ') + where(table, b.filters, params) + ' returning *';
  } else if (b.op === 'delete') {
    if (!Array.isArray(b.filters) || !b.filters.length) throw fail('Delete sem filtro não é permitido.');
    text = 'delete from ' + q(table) + where(table, b.filters, params) + ' returning id';
  } else {
    throw fail('Operação inválida.');
  }
  return sql.query(text, params);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') throw fail('Use POST.', 405);
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
    try { checkPin(req); freio(ip, true); } catch (e) { if (e.status === 401) freio(ip, false); throw e; }
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (b.op === 'ping') return res.status(200).json({ data: true, error: null });
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw fail('DATABASE_URL não configurada (conecte o Neon no Vercel).', 500);
    const rows = await run(neon(url), b);
    res.status(200).json({ data: rows, error: null });
  } catch (e) {
    res.status(e.status || 500).json({ data: null, error: { message: e.message } });
  }
}
