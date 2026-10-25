'use strict';

function badRequest(message) {
  return Object.assign(new Error(message), {status:400});
}

async function readJsonBody(req) {
  let input = req.body;
  if (input === undefined || input === null) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += part.length;
      if (size > 65536) throw Object.assign(new Error('Corpo da requisição muito grande'), {status:413});
      chunks.push(part);
    }
    input = Buffer.concat(chunks).toString('utf8');
    if (!input && Number(req.headers?.['content-length'] || 0) > 0) {
      throw badRequest('Corpo JSON não recebido pelo backend');
    }
  }
  if (Buffer.isBuffer(input)) input = input.toString('utf8');
  if (typeof input === 'string') {
    try { input = JSON.parse(input || '{}'); }
    catch { throw badRequest('JSON inválido'); }
  }
  if (input === undefined || input === null) input = {};
  if (Array.isArray(input) || typeof input !== 'object') throw badRequest('JSON deve ser um objeto');
  return input;
}
module.exports = {readJsonBody};
