import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { paraCaminhoPublico, prefixoPublico } from './prefixo-publico';

const com = (valor?: string | string[]) => ({ headers: valor === undefined ? {} : { 'x-forwarded-prefix': valor } });

describe('prefixo público da API', () => {
  it('sem o cabeçalho do nginx, é o prefixo da própria API', () => {
    assert.equal(prefixoPublico(), '/v1');
    assert.equal(prefixoPublico(com()), '/v1');
  });

  it('atrás do nginx do front, ganha o /api', () => {
    assert.equal(prefixoPublico(com('/api')), '/api/v1');
    assert.equal(prefixoPublico(com('/api/')), '/api/v1');
    assert.equal(prefixoPublico(com(['/api', '/outro'])), '/api/v1');
  });

  it('valor estranho no cabeçalho é ignorado — ele iria parar no Set-Cookie', () => {
    assert.equal(prefixoPublico(com('/api; Domain=evil.dev')), '/v1');
    assert.equal(prefixoPublico(com('https://evil.dev')), '/v1');
    assert.equal(prefixoPublico(com('/api\r\nX: y')), '/v1');
  });

  it('reescreve só caminhos da API', () => {
    assert.equal(paraCaminhoPublico('/v1/brand/logo?v=4', com('/api')), '/api/v1/brand/logo?v=4');
    assert.equal(paraCaminhoPublico('/v1/brand/logo?v=4'), '/v1/brand/logo?v=4');
    assert.equal(paraCaminhoPublico('https://cdn.dev/logo.png', com('/api')), 'https://cdn.dev/logo.png');
    assert.equal(paraCaminhoPublico(null, com('/api')), null);
  });
});
