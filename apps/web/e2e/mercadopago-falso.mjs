// e2e/mercadopago-falso.mjs — Mercado Pago FALSO para o e2e do navegador (a API sobe com
// MERCADOPAGO_API_URL apontando para cá). Aceita só tokens `APP_USR-TESTE-UI-…`.
// O spec "paga" um Pix chamando POST /__aprovar/:id e depois manda o aviso à API.
import { createServer } from 'node:http';

const pagamentos = new Map();
// Ids que não se repetem entre rodadas (o banco local guarda as cobranças das anteriores).
let proximo = Number(String(Date.now()).slice(-10));
createServer((req, res) => {
  let corpo = ''; req.on('data', (c) => (corpo += c));
  req.on('end', () => {
    const responder = (status, b) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
    const aprovar = req.method === 'POST' && req.url?.match(/^\/__aprovar\/(\d+)$/);
    if (aprovar) { const p = pagamentos.get(Number(aprovar[1])); if (!p) return responder(404, {}); p.status = 'approved'; p.date_approved = new Date().toISOString(); return responder(200, p); }
    if (!String(req.headers.authorization).startsWith('Bearer APP_USR-TESTE-UI-')) return responder(401, { message: 'invalid access token' });
    if (req.method === 'GET' && req.url === '/users/me') return responder(200, { id: 4242, nickname: 'LOJA-FALSA', email: 'financeiro@loja-falsa.com.br' });
    if (req.method === 'POST' && req.url === '/v1/payments') {
      const b = JSON.parse(corpo); const id = proximo++;
      pagamentos.set(id, { id, status: 'pending', status_detail: 'pending_waiting_transfer', external_reference: b.external_reference });
      return responder(201, { id, status: 'pending', date_of_expiration: b.date_of_expiration, point_of_interaction: { transaction_data: { qr_code: `00020101021226MPUI${id}5303986` } } });
    }
    const m = req.method === 'GET' && req.url?.match(/^\/v1\/payments\/(\d+)$/);
    if (m) { const p = pagamentos.get(Number(m[1])); return p ? responder(200, p) : responder(404, { message: 'Payment not found' }); }
    responder(404, { message: 'rota falsa inexistente' });
  });
}).listen(3399, '127.0.0.1');
