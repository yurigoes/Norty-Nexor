import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cidrTexto,
  contem,
  hostsUtilizaveis,
  normalizarCidr,
  normalizarIp,
  normalizarMac,
  proximoLivre,
} from './ip';

describe('endereços e sub-redes', () => {
  it('normaliza IP e recusa lixo', () => {
    assert.equal(normalizarIp(' 192.168.015.7 '), null); // zero à esquerda é ambíguo: o Node recusa
    assert.equal(normalizarIp('192.168.15.7'), '192.168.15.7');
    assert.equal(normalizarIp('FE80::1'), 'fe80::1');
    assert.equal(normalizarIp('192.168.15.7/24'), null);
    assert.equal(normalizarIp('300.1.1.1'), null);
  });

  it('corrige a rede digitada com bits de host', () => {
    assert.equal(cidrTexto(normalizarCidr('192.168.15.7/24')!), '192.168.15.0/24');
    assert.equal(cidrTexto(normalizarCidr('10.0.0.130/25')!), '10.0.0.128/25');
    assert.equal(normalizarCidr('192.168.15.0'), null);
    assert.equal(normalizarCidr('192.168.15.0/33'), null);
    assert.equal(normalizarCidr('192.168.15.0/24/1'), null);
  });

  it('conta hosts como quem monta rede conta', () => {
    assert.equal(hostsUtilizaveis(normalizarCidr('192.168.15.0/24')!), 254);
    assert.equal(hostsUtilizaveis(normalizarCidr('10.0.0.0/30')!), 2);
    assert.equal(hostsUtilizaveis(normalizarCidr('10.0.0.0/31')!), 2);
    assert.equal(hostsUtilizaveis(normalizarCidr('10.0.0.5/32')!), 1);
    assert.equal(hostsUtilizaveis(normalizarCidr('2001:db8::/64')!), null);
  });

  it('contém e próximo livre', () => {
    const c = normalizarCidr('192.168.15.0/29')!; // .1 a .6
    assert.equal(contem(c, '192.168.15.6'), true);
    assert.equal(contem(c, '192.168.15.8'), false);
    assert.equal(proximoLivre(c, ['192.168.15.1', '192.168.15.2']), '192.168.15.3');
    assert.equal(proximoLivre(c, ['1', '2', '3', '4', '5', '6'].map((n) => `192.168.15.${n}`)), null);
  });

  it('normaliza MAC em qualquer formato comum', () => {
    assert.equal(normalizarMac('AA-BB-CC-DD-EE-FF'), 'aa:bb:cc:dd:ee:ff');
    assert.equal(normalizarMac('aabb.ccdd.eeff'), 'aa:bb:cc:dd:ee:ff');
    assert.equal(normalizarMac('aabbccddeeff'), 'aa:bb:cc:dd:ee:ff');
    assert.equal(normalizarMac('aa:bb:cc:dd:ee'), null);
    assert.equal(normalizarMac('zz:bb:cc:dd:ee:ff'), null);
  });
});
