import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type {
  AberturaPublicaResposta,
  ConsultaPublica,
  EmpresaPublica,
} from '@norty-desk/shared';
import { nomeDeEmpresaNormalizado } from '@norty-desk/shared';

import { type Api, type Fixtura, limparBanco, prisma, semear, subirApi } from './apoio';

/**
 * Abertura de chamado sem login.
 *
 * O que esta suíte protege, em ordem de importância:
 *
 * 1. Que a normalização do nome em JavaScript e a coluna gerada no
 *    banco produzam **a mesma coisa**. São duas implementações da mesma
 *    regra, e divergirem faz a busca não achar o que está gravado.
 * 2. Que o documento seja achado escrito de qualquer jeito.
 * 3. Que o nome seja achado com erro de digitação.
 * 4. Que esta porta, que não tem sessão, não vire um jeito de baixar a
 *    carteira de clientes da Norty.
 */

let api: Api;
let f: Fixtura;

before(async () => {
  await limparBanco();
  f = await semear();
  api = await subirApi();
});

after(async () => {
  await api.fechar();
  await prisma.$disconnect();
});

/** Nada de cabeçalho de autorização: é o ponto do bloco. */
async function buscar(q: string) {
  const r = await fetch(`${api.url}/publico/empresas?q=${encodeURIComponent(q)}`);
  const texto = await r.text();
  return { status: r.status, corpo: texto ? (JSON.parse(texto) as EmpresaPublica[]) : [] };
}

async function abrir(corpo: Record<string, unknown>) {
  const r = await fetch(`${api.url}/publico/chamados`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : null };
}

const liberar = () => prisma.loginThrottle.deleteMany({});

/**
 * `@@unique([organizationId, name])` vale aqui como vale em produção,
 * e dois casos que escolhem o mesmo nome derrubam um ao outro por um
 * motivo que nada tem a ver com o que eles provam.
 *
 * O número vai na **frente**. Posto atrás, ele empurraria a forma
 * societária para o meio do nome — "Alpha LTDA 5" — e ela deixaria de
 * ser tirada, que é justamente o que um dos casos aqui prova. A busca
 * não se incomoda com o prefixo: ela compara o melhor trecho do nome,
 * não o nome inteiro.
 */
let sequencial = 0;
async function criarCliente(name: string, document: string | null, emailDomain: string) {
  sequencial += 1;
  return prisma.client.create({
    data: {
      organizationId: f.organizacao.id,
      name: `${sequencial}. ${name}`,
      document,
      emailDomain,
    },
    select: { id: true, name: true },
  });
}

describe('a regra do nome vale igual nos dois lados', () => {
  it('o JavaScript e a coluna gerada concordam', async () => {
    // Este é o teste que segura a duplicação. A coluna gerada existe
    // porque o banco precisa calcular; a função existe porque a tela e
    // a API precisam normalizar o que a pessoa digitou. Se as duas
    // divergirem, a busca deixa de achar o que está gravado — em
    // silêncio, e só para alguns nomes.
    const nomes = [
      'Empresa do João Comércio de Materiais LTDA',
      'Alpha Sistemas Ltda.',
      'Alpha Sistemas LTDA ME',
      'ME Informática',
      'SA Comércio de Peças',
      'Beta  Soluções   EIRELI',
      'Gama Serviços S/A',
      'Delta Transportes, LTDA',
      'Ômega Ação e Coração',
      'LTDA',
    ];

    for (const [i, nome] of nomes.entries()) {
      const criado = await criarCliente(nome, null, `concordancia${i}.com.br`);

      const [linha] = await prisma.$queryRaw<{ busca: string }[]>`
        SELECT "buscaNome" AS busca FROM "clients" WHERE "id" = ${criado.id}::uuid
      `;

      // Comparado contra o nome **como ficou gravado**, e não contra o
      // que foi passado: é o valor real da coluna que a busca usa.
      const esperado = nomeDeEmpresaNormalizado(criado.name);

      assert.equal(
        linha?.busca,
        esperado,
        `divergiram em "${criado.name}": banco="${linha?.busca}" js="${esperado}"`,
      );
    }
  });
});

describe('achar pelo documento', () => {
  it('acha com pontuação e sem, dando o mesmo resultado', async () => {
    await liberar();
    const cliente = await criarCliente('Empresa do João', '11.222.333/0001-81', 'joao.com.br');

    for (const digitado of [
      '11.222.333/0001-81',
      '11222333000181',
      ' 11 222 333 0001 81 ',
      '11222333/0001-81',
    ]) {
      await liberar();
      const r = await buscar(digitado);
      assert.equal(r.status, 200, digitado);
      assert.equal(r.corpo.length, 1, `"${digitado}" não achou`);
      assert.equal(r.corpo[0]?.id, cliente.id, digitado);
    }
  });

  it('acha mesmo quando o cadastro guardou o documento sem pontuação', async () => {
    await liberar();
    // O cadastro aceita dos dois jeitos; a busca não pode depender de
    // qual deles a pessoa que cadastrou escolheu.
    const cliente = await criarCliente('Beta Soluções', '11444777000161', 'beta.com.br');

    const r = await buscar('11.444.777/0001-61');
    assert.equal(r.corpo[0]?.id, cliente.id);
  });

  it('documento é exato: um dígito trocado não acha', async () => {
    await liberar();
    await criarCliente('Gama Serviços', '11.222.333/0001-81', 'gama.com.br');

    await liberar();
    const r = await buscar('11.222.333/0001-82');
    assert.equal(r.corpo.length, 0, 'documento não pode ser busca aproximada');
  });

  it('CPF de 11 dígitos também acha', async () => {
    await liberar();
    const cliente = await criarCliente('Delta MEI', '529.982.247-25', 'delta.com.br');

    const r = await buscar('52998224725');
    assert.equal(r.corpo[0]?.id, cliente.id);
  });
});

describe('achar pelo nome, com erro de digitação', () => {
  it('acha com letra trocada, letra faltando e sem acento', async () => {
    await liberar();
    const cliente = await criarCliente(
      'Empresa do João Comércio de Materiais LTDA',
      null,
      'joaocomercio.com.br',
    );

    for (const digitado of [
      'Empresa do João',      // como está
      'empresa do joao',      // sem acento e em minúsculas
      'Empreza do Joao',      // letra trocada
      'Emprsa do Joao',       // letra faltando
      'materiais',            // parte do meio
      'EMPRESA DO JOAO',      // tudo maiúsculo
    ]) {
      await liberar();
      const r = await buscar(digitado);
      assert.ok(
        r.corpo.some((e) => e.id === cliente.id),
        `"${digitado}" não achou a empresa`,
      );
    }
  });

  it('o limiar configurado vale — não o padrão do Postgres', async () => {
    await liberar();
    const cliente = await criarCliente(
      'Empresa do João Comércio de Materiais LTDA',
      null,
      'limiar.com.br',
    );

    // "emprza" casa 0,571 com este nome: acima do nosso limiar de 0,5 e
    // **abaixo** do padrão 0,6 do Postgres. É o único jeito de provar
    // que o `SET LOCAL` pegou. A primeira versão punha o `set_config`
    // num CTE ao lado do `SELECT`, e a ordem de avaliação não é
    // garantida: valia o padrão, e a busca perdia esta faixa inteira
    // sem dar erro nenhum.
    const r = await buscar('emprza');
    assert.ok(
      r.corpo.some((e) => e.id === cliente.id),
      'o limiar de 0,5 não está sendo aplicado: valeu o padrão 0,6 do Postgres',
    );
  });

  it('a forma societária sozinha não devolve a carteira inteira', async () => {
    await liberar();
    await criarCliente('Alpha Sistemas LTDA', null, 'alpha1.com.br');
    await criarCliente('Beta Comércio LTDA', null, 'beta1.com.br');

    // Sem tirar o sufixo dos dois lados, "ltda" casava 0,556 com todo
    // mundo — acima do limiar — e a busca virava listagem da carteira.
    await liberar();
    const r = await buscar('ltda');
    assert.equal(r.corpo.length, 0, `"ltda" devolveu ${r.corpo.length} empresas`);
  });

  it('nome de outra empresa não casa', async () => {
    await liberar();
    await criarCliente('Alpha Sistemas', null, 'alpha2.com.br');

    await liberar();
    const r = await buscar('Transportadora Pesada');
    assert.equal(r.corpo.length, 0);
  });

  it('devolve os mais parecidos primeiro', async () => {
    await liberar();
    const exata = await criarCliente('Construtora Horizonte', null, 'horizonte.com.br');
    await criarCliente('Construtora Horizonte Azul Engenharia', null, 'horizonteazul.com.br');

    const r = await buscar('Construtora Horizonte');
    assert.ok(r.corpo.length >= 1);
    assert.equal(r.corpo[0]?.id, exata.id, 'a mais parecida deveria vir primeiro');
  });
});

describe('o que a busca pública não entrega', () => {
  it('menos de três letras não busca', async () => {
    await liberar();
    await criarCliente('Alpha Sistemas', null, 'alpha3.com.br');

    for (const curto of ['', 'a', 'al']) {
      const r = await buscar(curto);
      assert.equal(r.status, 200, curto);
      assert.equal(r.corpo.length, 0, `"${curto}" devolveu empresa`);
    }
  });

  it('devolve só id e nome — nem documento, nem contato', async () => {
    await liberar();
    await prisma.client.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Sigilo Consultoria',
        document: '11.222.333/0001-81',
        emailDomain: 'sigilo.com.br',
        contactEmail: 'financeiro@sigilo.com.br',
        contactPhone: '+5511999999999',
        notes: 'Cliente em atraso.',
      },
    });

    const r = await buscar('Sigilo Consultoria');
    assert.equal(r.corpo.length, 1);
    assert.deepEqual(
      Object.keys(r.corpo[0]!).sort(),
      ['id', 'name'],
      'a busca sem sessão não pode devolver mais que o nome',
    );
    assert.ok(!JSON.stringify(r.corpo).includes('atraso'));
    assert.ok(!JSON.stringify(r.corpo).includes('financeiro@'));
  });

  it('empresa desativada não aparece', async () => {
    await liberar();
    await prisma.client.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Antiga Parceira',
        emailDomain: 'antiga.com.br',
        isActive: false,
      },
    });

    const r = await buscar('Antiga Parceira');
    assert.equal(r.corpo.length, 0);
  });

  it('varrer a carteira custa: busca que não acha conta como erro', async () => {
    await liberar();

    // É a busca que **não acha** que o varredor repete. Se ela saísse
    // de graça, o teto de cinco resultados não protegeria nada.
    for (let i = 0; i < 4; i += 1) {
      const r = await buscar(`inexistente${i}`);
      assert.equal(r.status, 200, `tentativa ${i + 1}`);
    }

    const barrada = await buscar('inexistente5');
    assert.equal(barrada.status, 429, JSON.stringify(barrada.corpo));
  });
});

describe('abrir o chamado', () => {
  it('abre, devolve o protocolo, e o chamado fica na empresa certa', async () => {
    await liberar();
    const cliente = await criarCliente('Indústria Modelo', null, 'modelo.com.br');

    const r = await abrir({
      clientId: cliente.id,
      requesterName: 'Yuri Souza Goes',
      requesterEmail: 'yuri@modelo.com.br',
      subject: 'Impressora da recepção parou',
      description: 'A luz laranja fica piscando desde a manhã de hoje.',
    });

    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    const aberto = r.corpo as AberturaPublicaResposta;
    assert.match(aberto.protocol, /^[234679CDFGHJKMNPQRTWXYZ]{8}$/);
    assert.ok(aberto.number > 0);

    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { protocol: aberto.protocol },
      select: { clientId: true, organizationId: true, subject: true, originChannel: true },
    });
    assert.equal(chamado.clientId, cliente.id, 'o chamado tem de ficar na empresa escolhida');
    assert.equal(chamado.organizationId, f.organizacao.id);
    assert.equal(chamado.subject, 'Impressora da recepção parou');
  });

  it('quem abriu entra como contato, não como usuário', async () => {
    await liberar();
    const cliente = await criarCliente('Padaria Central', null, 'padaria.com.br');

    const r = await abrir({
      clientId: cliente.id,
      requesterName: 'Maria Silva',
      requesterPhone: '+5511988887777',
      subject: 'Balança não liga',
      description: 'Desde ontem à noite não liga de jeito nenhum.',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const chamado = await prisma.ticket.findFirstOrThrow({
      where: { protocol: (r.corpo as AberturaPublicaResposta).protocol },
      include: { actors: { include: { contact: true } } },
    });

    const requerente = chamado.actors.find((a) => a.role === 'REQUERENTE');
    assert.ok(requerente?.contactId, 'o requerente deveria ser um contato');
    assert.equal(requerente?.userId, null, 'quem abre sem login não é usuário');
    assert.equal(requerente?.contact?.name, 'Maria Silva');
  });

  it('o protocolo devolvido abre a consulta pública', async () => {
    await liberar();
    const cliente = await criarCliente('Oficina Norte', null, 'oficinanorte.com.br');

    const aberto = await abrir({
      clientId: cliente.id,
      requesterName: 'Carlos Pereira',
      requesterEmail: 'carlos@oficinanorte.com.br',
      subject: 'Elevador hidráulico travado',
      description: 'Trava na metade do curso e não sobe mais.',
    });
    const { protocol } = aberto.corpo as AberturaPublicaResposta;

    // É o ciclo inteiro fechando: abriu sem login, e acompanha sem login.
    await liberar();
    const consulta = await fetch(`${api.url}/publico/protocolo/${protocol}`);
    assert.equal(consulta.status, 200);

    const corpo = (await consulta.json()) as ConsultaPublica;
    assert.equal(corpo.subject, 'Elevador hidráulico travado');
  });

  it('exige e-mail ou WhatsApp: sem retorno ninguém responde', async () => {
    await liberar();
    const cliente = await criarCliente('Mercado Sul', null, 'mercadosul.com.br');

    const r = await abrir({
      clientId: cliente.id,
      requesterName: 'João da Silva',
      subject: 'Caixa registradora travando',
      description: 'Trava ao fechar o cupom, várias vezes por dia.',
    });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  });

  it('recusa empresa que não existe', async () => {
    await liberar();
    const r = await abrir({
      clientId: '00000000-0000-4000-8000-000000000000',
      requesterName: 'Alguém',
      requesterEmail: 'alguem@exemplo.com',
      subject: 'Chamado órfão',
      description: 'Descrição com tamanho suficiente.',
    });
    assert.equal(r.status, 404, JSON.stringify(r.corpo));
  });

  it('recusa empresa desativada', async () => {
    await liberar();
    const antiga = await prisma.client.create({
      data: {
        organizationId: f.organizacao.id,
        name: 'Ex-cliente',
        emailDomain: 'excliente.com.br',
        isActive: false,
      },
      select: { id: true },
    });

    const r = await abrir({
      clientId: antiga.id,
      requesterName: 'Alguém',
      requesterEmail: 'alguem@excliente.com.br',
      subject: 'Chamado de quem saiu',
      description: 'Descrição com tamanho suficiente.',
    });
    assert.equal(r.status, 404, JSON.stringify(r.corpo));
  });

  it('a mesma pessoa abrindo de novo reaproveita o contato', async () => {
    await liberar();
    const cliente = await criarCliente('Clínica Vida', null, 'clinicavida.com.br');

    const comum = {
      clientId: cliente.id,
      requesterEmail: 'ana@clinicavida.com.br',
      description: 'Descrição com tamanho suficiente para passar.',
    };

    assert.equal(
      (await abrir({ ...comum, requesterName: 'Ana', subject: 'Primeiro chamado' })).status,
      201,
    );
    await liberar();
    assert.equal(
      (await abrir({ ...comum, requesterName: 'Ana Paula', subject: 'Segundo chamado' })).status,
      201,
    );

    const contatos = await prisma.contact.findMany({
      where: { organizationId: f.organizacao.id, email: 'ana@clinicavida.com.br' },
    });
    assert.equal(contatos.length, 1, 'duas aberturas não deveriam criar dois contatos');
    // O último nome que ela mesma escreveu é o melhor palpite.
    assert.equal(contatos[0]?.name, 'Ana Paula');
  });
});
