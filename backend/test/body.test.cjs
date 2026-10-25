'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {Readable} = require('node:stream');
const {readJsonBody} = require('../lib/body.cjs');
function req(data, headers={}) { const r=Readable.from([data]);r.headers=headers;return r; }
test('accepts JSON already parsed by Vercel', async()=>assert.deepEqual(await readJsonBody({body:{code:'ACVA6W'}}),{code:'ACVA6W'}));
test('parses a JSON string from Vercel', async()=>assert.deepEqual(await readJsonBody({body:'{"code":"ACVA6W"}'}),{code:'ACVA6W'}));
test('parses an unconsumed stream', async()=>assert.deepEqual(await readJsonBody(req('{"code":"ACVA6W"}',{'content-length':'17'})),{code:'ACVA6W'}));
test('rejects silently dropped JSON payload', async()=>assert.rejects(readJsonBody(req('',{'content-length':'17'})),/Corpo JSON não recebido/));
test('rejects malformed JSON', async()=>assert.rejects(readJsonBody({body:'{"code"'}),/JSON inválido/));
test('rejects arrays', async()=>assert.rejects(readJsonBody({body:[]}),/deve ser um objeto/));
test('accepts an empty body for create', async()=>assert.deepEqual(await readJsonBody({body:undefined,headers:{},[Symbol.asyncIterator]:async function*(){}}),{}));
