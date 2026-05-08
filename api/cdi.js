// Proxy para a API do Banco Central (evita CORS no browser)
// Série 4391 = CDI/Over mensal acumulado
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400'); // cache 24h
  try {
    const url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados/ultimos/2?formato=json';
    const response = await fetch(url);
    if (!response.ok) throw new Error('Bacen API status: ' + response.status);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
