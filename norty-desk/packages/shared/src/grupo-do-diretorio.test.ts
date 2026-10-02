import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { chavesDoGrupo, grupoCasa } from './domain';

/**
 * Reconhecer o grupo do diretório.
 *
 * O AD devolve DN inteiro em `memberOf`; quem cadastra o mapa escreve o
 * nome do grupo. As duas formas têm de encontrar uma à outra, e é só
 * isto que decide se o mapa funciona — errar aqui é o mapa nunca casar,
 * e ninguém descobrir por quê.
 */

describe('as chaves de um grupo', () => {
  it('reconhece o DN inteiro e só o nome', () => {
    const chaves = chavesDoGrupo('CN=TI-Suporte,OU=Grupos,DC=norty,DC=local');

    assert.deepEqual(chaves, ['cn=ti-suporte,ou=grupos,dc=norty,dc=local', 'ti-suporte']);
  });

  it('não diferencia caixa, que o AD também não diferencia', () => {
    assert.deepEqual(chavesDoGrupo('CN=TI-Suporte,OU=X'), chavesDoGrupo('cn=ti-suporte,ou=x'));
  });

  it('aceita o nome solto, sem DN', () => {
    assert.deepEqual(chavesDoGrupo('TI-Suporte'), ['ti-suporte']);
  });

  it('respeita a vírgula escapada dentro do nome', () => {
    // Um grupo chamado "Suporte, N1" existe, e no DN a vírgula dele vem
    // com barra. Cortar no primeiro caractere de vírgula daria "suporte".
    const chaves = chavesDoGrupo('CN=Suporte\\, N1,OU=Grupos,DC=norty');

    assert.ok(chaves.includes('suporte, n1'), JSON.stringify(chaves));
  });

  it('é vazio para o que não nomeia grupo nenhum', () => {
    assert.deepEqual(chavesDoGrupo(''), []);
    assert.deepEqual(chavesDoGrupo('   '), []);
  });
});

describe('o mapa casa com o grupo', () => {
  it('pelo nome, contra o DN que o AD devolveu', () => {
    assert.equal(grupoCasa('TI-Suporte', 'CN=TI-Suporte,OU=Grupos,DC=norty,DC=local'), true);
  });

  it('pelo DN inteiro, quando foi assim que se cadastrou', () => {
    const dn = 'CN=TI-Suporte,OU=Grupos,DC=norty,DC=local';

    assert.equal(grupoCasa(dn, dn), true);
  });

  it('**não** casa o DN cadastrado com um homônimo de outro ramo', () => {
    // É a razão de guardar as duas chaves em vez de só o nome: quem tem
    // "TI-Suporte" em dois ramos cadastra o DN e distingue os dois.
    assert.equal(
      grupoCasa('CN=TI-Suporte,OU=Matriz,DC=norty', 'CN=TI-Suporte,OU=Filial,DC=norty'),
      false,
    );
  });

  it('casa o nome solto com qualquer ramo, que é o atalho de quem só tem um', () => {
    assert.equal(grupoCasa('TI-Suporte', 'CN=TI-Suporte,OU=Filial,DC=norty'), true);
  });

  it('não casa grupo diferente que começa igual', () => {
    assert.equal(grupoCasa('TI', 'CN=TI-Suporte,OU=Grupos,DC=norty'), false);
    assert.equal(grupoCasa('TI-Suporte', 'CN=TI-Suporte-N2,OU=Grupos,DC=norty'), false);
  });

  it('não casa nada quando o cadastro está vazio', () => {
    assert.equal(grupoCasa('', 'CN=TI-Suporte,OU=Grupos'), false);
    assert.equal(grupoCasa('  ', 'CN=TI-Suporte,OU=Grupos'), false);
  });
});
