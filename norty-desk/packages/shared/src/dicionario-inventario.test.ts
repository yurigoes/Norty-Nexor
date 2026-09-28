import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canonizarModelo,
  canonizarSistemaOperacional,
  chaveDeModelo,
  chaveDeSistemaOperacional,
  modeloUtil,
} from './domain';

/**
 * Dicionário de modelo e de sistema operacional.
 *
 * O que se prova aqui é o que nenhum teste de API alcança: que as três
 * grafias que o SMBIOS devolve para o mesmo equipamento chegam à mesma
 * chave, e que o campo que a montadora não preencheu não vira cadastro.
 *
 * Os textos de entrada não são inventados — são os que
 * `Win32_ComputerSystem.Model` e `Win32_OperatingSystem.Caption`
 * devolvem de verdade em cada fabricante.
 */

describe('o modelo que a montadora não preencheu', () => {
  it('não é modelo', () => {
    for (const lixo of [
      'System Product Name',
      'SYSTEM PRODUCT NAME',
      'To Be Filled By O.E.M.',
      'To be filled by O.E.M.',
      'Default string',
      'All Series',
      'Not Applicable',
      'INVALID',
      'None',
      'OEM',
      '123456789',
      '   ',
      '---',
    ]) {
      assert.equal(modeloUtil(lixo), null, `"${lixo}" não deveria virar modelo`);
    }
  });

  it('não corta por comprimento, porque "X1" é modelo de verdade', () => {
    // A série corta em três caracteres; o modelo não pode. O ThinkPad X1
    // existe, e a regra da série o apagaria.
    assert.equal(modeloUtil('X1'), 'X1');
    assert.equal(modeloUtil('T14'), 'T14');
  });

  it('preserva a grafia e só colapsa os espaços', () => {
    assert.equal(modeloUtil('  Latitude   5420  '), 'Latitude 5420');
  });
});

describe('a chave do modelo', () => {
  it('junta as grafias que só diferem em caixa e pontuação', () => {
    const esperada = chaveDeModelo('Latitude 5420');

    for (const grafia of ['LATITUDE 5420', 'latitude 5420', 'Latitude-5420', 'Latitude  5420']) {
      assert.equal(chaveDeModelo(grafia), esperada, grafia);
    }
  });

  it('tira o fabricante colado na frente, que é como a HP manda', () => {
    // O agente manda "HP EliteBook 840 G8 Notebook PC"; quem cadastra na
    // tela escreve "EliteBook 840 G8". Um equipamento, duas grafias.
    assert.equal(
      chaveDeModelo('HP EliteBook 840 G8 Notebook PC', 'HP'),
      chaveDeModelo('EliteBook 840 G8', 'HP'),
    );
  });

  it('tira a sigla mesmo quando o fabricante está cadastrado pelo nome comprido', () => {
    // O caso real da HP: o cadastro diz "Hewlett-Packard" e o modelo
    // chega como "HP Compaq 6200 Pro SFF". O prefixo a cortar é o "HP",
    // que é a chave canônica do fabricante — não a chave do texto dele.
    assert.equal(
      chaveDeModelo('HP Compaq 6200 Pro SFF', 'Hewlett-Packard'),
      chaveDeModelo('Compaq 6200 Pro SFF', 'HP'),
    );
  });

  it('tira o nome comprido quando é ele que vem colado', () => {
    assert.equal(
      chaveDeModelo('Hewlett-Packard Compaq 6200 Pro', 'HP'),
      chaveDeModelo('Compaq 6200 Pro', 'HP'),
    );
  });

  it('não esvazia o modelo que é só o nome do fabricante', () => {
    // A impressora cujo modelo o firmware informa como "HP". Cortar o
    // prefixo deixaria chave vazia, e chave vazia sai do dicionário.
    assert.equal(chaveDeModelo('HP', 'HP'), 'hp');
  });

  it('tira o sufixo de gabinete genérico', () => {
    assert.equal(chaveDeModelo('EliteBook 840 G8 Notebook PC'), chaveDeModelo('EliteBook 840 G8'));
    assert.equal(chaveDeModelo('ProDesk 600 G5 Desktop PC'), chaveDeModelo('ProDesk 600 G5'));
  });

  it('**não** tira o formato que distingue dois equipamentos', () => {
    // "OptiPlex 7090 Tower" e "OptiPlex 7090 Small Form Factor" têm
    // placa e fonte diferentes. Juntá-los esconderia do técnico
    // justamente o que ele precisa antes de comprar peça.
    assert.notEqual(
      chaveDeModelo('OptiPlex 7090 Tower', 'Dell'),
      chaveDeModelo('OptiPlex 7090 Small Form Factor', 'Dell'),
    );
    assert.notEqual(
      chaveDeModelo('EliteDesk 800 G6 SFF', 'HP'),
      chaveDeModelo('EliteDesk 800 G6 Tower', 'HP'),
    );
  });
});

describe('o modelo canônico', () => {
  it('guarda o nome sem o fabricante, com a grafia de origem', () => {
    const canonico = canonizarModelo('HP EliteBook 840 G8 Notebook PC', 'HP');

    assert.ok(canonico);
    // O nome é para a tela, ao lado da coluna de fabricante: repetir
    // "HP" ali seria dizer duas vezes a mesma coisa. E a caixa é a que
    // veio — "EliteBook", não "elitebook".
    assert.equal(canonico.nome, 'EliteBook 840 G8 Notebook PC');
  });

  it('é nulo para o campo que a montadora não preencheu', () => {
    assert.equal(canonizarModelo('System Product Name', 'ASUS'), null);
    assert.equal(canonizarModelo(null), null);
    assert.equal(canonizarModelo(''), null);
  });

  it('não tira o fabricante quando ele não é o prefixo', () => {
    const canonico = canonizarModelo('Latitude 5420', 'Dell');

    assert.ok(canonico);
    assert.equal(canonico.nome, 'Latitude 5420');
  });
});

describe('o sistema operacional', () => {
  it('separa produto de edição, que são dois eixos', () => {
    const so = canonizarSistemaOperacional('Microsoft Windows 11 Pro', '10.0.22631');

    assert.ok(so);
    assert.equal(so.produto, 'Windows 11');
    assert.equal(so.edicao, 'Pro');
  });

  it('conta como um só produto o que só difere na edição', () => {
    const edicoes = ['Pro', 'Home', 'Enterprise', 'Education'].map(
      (e) => canonizarSistemaOperacional(`Microsoft Windows 10 ${e}`, '10.0.19045')?.produto,
    );

    assert.deepEqual(edicoes, ['Windows 10', 'Windows 10', 'Windows 10', 'Windows 10']);
  });

  it('ignora o "Microsoft" da frente', () => {
    // A máquina recém-instalada diz "Windows 11 Pro"; a que veio do
    // OEM diz "Microsoft Windows 11 Pro".
    const com = canonizarSistemaOperacional('Microsoft Windows 11 Pro', '10.0.22631');
    const sem = canonizarSistemaOperacional('Windows 11 Pro', '10.0.22631');

    assert.deepEqual(
      { produto: com?.produto, edicao: com?.edicao },
      { produto: sem?.produto, edicao: sem?.edicao },
    );
  });

  it('escreve "Professional" e "Pro" como a mesma edição', () => {
    // A Microsoft escreveu "Professional" até o Windows 7 e "Pro"
    // depois. Contá-las separado responde errado a "quantas licenças
    // Pro o parque precisa?".
    assert.equal(canonizarSistemaOperacional('Microsoft Windows 7 Professional')?.edicao, 'Pro');
    assert.equal(canonizarSistemaOperacional('Microsoft Windows 10 Pro')?.edicao, 'Pro');
  });

  it('reconhece o Windows Server pelo ano, não pela edição', () => {
    const so = canonizarSistemaOperacional('Microsoft Windows Server 2019 Standard');

    assert.ok(so);
    assert.equal(so.produto, 'Windows Server 2019');
    assert.equal(so.edicao, 'Standard');

    const r2 = canonizarSistemaOperacional('Microsoft Windows Server 2012 R2 Datacenter');
    assert.equal(r2?.produto, 'Windows Server 2012 R2');
    assert.equal(r2?.edicao, 'Datacenter');
  });

  it('corrige o caption que diz 10 numa máquina que é 11', () => {
    // `Win32_OperatingSystem.Version` diz `10.0` nos dois: a Microsoft
    // nunca subiu a versão maior. Só o build os separa, e é por isso
    // que o build entra como rede de segurança.
    const so = canonizarSistemaOperacional('Microsoft Windows 10 Pro', '10.0.22631');

    assert.equal(so?.produto, 'Windows 11');
  });

  it('não promove a build que ainda é Windows 10', () => {
    const so = canonizarSistemaOperacional('Microsoft Windows 10 Pro', '10.0.19045');

    assert.equal(so?.produto, 'Windows 10');
  });

  it('não se confunde sem a versão', () => {
    assert.equal(canonizarSistemaOperacional('Microsoft Windows 10 Pro')?.produto, 'Windows 10');
    assert.equal(canonizarSistemaOperacional('Microsoft Windows 10 Pro', null)?.produto, 'Windows 10');
    assert.equal(canonizarSistemaOperacional('Microsoft Windows 10 Pro', 'sei lá')?.produto, 'Windows 10');
  });

  it('põe a versão do Linux no produto, não na edição', () => {
    // "Ubuntu 22.04" e "Ubuntu 24.04" são dois alvos de atualização
    // diferentes; contá-los como "Ubuntu" esconde o que está vencendo.
    const so = canonizarSistemaOperacional('Ubuntu 22.04.3 LTS');

    assert.ok(so);
    assert.equal(so.produto, 'Ubuntu 22.04');
    assert.equal(so.edicao, 'LTS');
  });

  it('junta as correções da mesma versão do Linux', () => {
    assert.equal(
      canonizarSistemaOperacional('Ubuntu 22.04.3 LTS')?.produto,
      canonizarSistemaOperacional('Ubuntu 22.04.5 LTS')?.produto,
    );
  });

  it('preserva o caption que não reconhece, em vez de perdê-lo', () => {
    // Classificar errado é pior que não classificar: a pergunta "que SO
    // é esse?" ainda se responde olhando o texto.
    const so = canonizarSistemaOperacional('Pop!_OS 22.04 LTS');

    assert.ok(so);
    assert.equal(so.produto, 'Pop!_OS 22.04 LTS');
    assert.equal(so.edicao, null);
  });

  it('é nulo para o caption sem letra nem número', () => {
    assert.equal(canonizarSistemaOperacional(null), null);
    assert.equal(canonizarSistemaOperacional(''), null);
    assert.equal(canonizarSistemaOperacional('   '), null);
    assert.equal(canonizarSistemaOperacional('--- ---'), null);
  });

  it('dá a mesma chave para as grafias que só diferem em caixa', () => {
    assert.equal(
      chaveDeSistemaOperacional('Microsoft Windows 11 Pro'),
      chaveDeSistemaOperacional('MICROSOFT  WINDOWS 11 PRO'),
    );
  });

  it('mantém o ponto da versão na chave', () => {
    // "Windows 8.1" e "Windows 8" são produtos diferentes, e a chave é
    // o que o dicionário indexa: perder o ponto os juntaria.
    assert.notEqual(
      chaveDeSistemaOperacional('Windows 8.1 Pro'),
      chaveDeSistemaOperacional('Windows 8 Pro'),
    );
    assert.equal(canonizarSistemaOperacional('Microsoft Windows 8.1 Pro')?.produto, 'Windows 8.1');
  });
});
