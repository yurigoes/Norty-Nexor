/* =========================================================
   LICITA+ API — Manutenção de contas
   ---------------------------------------------------------
   Um erro de digitação no e-mail do cadastro trava a empresa:
   a conta fica com o CNPJ, o link de confirmação foi para um
   endereço que não existe, e tentar de novo esbarra em "este
   CNPJ já tem conta". Sem uma saída, o único caminho seria
   editar o banco à mão.

   Este comando é a saída — de operação, não de produto. A tela
   não oferece troca de e-mail porque ela exigiria confirmar o
   endereço novo antes de valer, e isso é outra funcionalidade.

     docker compose exec -T licita-api node dist/tarefas/conta.js
     docker compose exec -T licita-api node dist/tarefas/conta.js trocar-email antigo@x novo@y
     docker compose exec -T licita-api node dist/tarefas/conta.js remover email@x
   ========================================================= */

import { PrismaClient } from '../../gerado/prisma';

const prisma = new PrismaClient();

const verde = (t: string) => `\x1b[32m${t}\x1b[0m`;
const vermelho = (t: string) => `\x1b[31m${t}\x1b[0m`;
const amarelo = (t: string) => `\x1b[33m${t}\x1b[0m`;

const normalizar = (email: string) => email.toLowerCase().trim();

async function listar(): Promise<void> {
  const usuarios = await prisma.usuario.findMany({
    include: { empresa: { select: { razaoSocial: true, cnpj: true } } },
    orderBy: { criadoEm: 'asc' },
  });

  if (usuarios.length === 0) {
    console.log(amarelo('  Nenhuma conta cadastrada.'));
    return;
  }

  console.log(`  ${usuarios.length} conta(s):\n`);
  for (const u of usuarios) {
    const estado = u.emailConfirmadoEm ? verde('confirmada') : amarelo('pendente  ');
    console.log(`  ${estado}  ${u.email.padEnd(38)}  ${u.empresa.cnpj}  ${u.empresa.razaoSocial}`);
  }
}

async function trocarEmail(antigo: string, novo: string): Promise<void> {
  const de = normalizar(antigo);
  const para = normalizar(novo);

  if (!para.includes('@')) {
    console.log(vermelho(`  "${para}" não parece um e-mail.`));
    process.exitCode = 1;
    return;
  }

  const usuario = await prisma.usuario.findUnique({ where: { email: de } });
  if (!usuario) {
    console.log(vermelho(`  Nenhuma conta com ${de}.`));
    console.log(amarelo('  Liste as existentes com: node dist/tarefas/conta.js'));
    process.exitCode = 1;
    return;
  }

  if (await prisma.usuario.findUnique({ where: { email: para } })) {
    console.log(vermelho(`  Já existe uma conta com ${para}.`));
    process.exitCode = 1;
    return;
  }

  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: usuario.id },
      // O endereço novo também não está confirmado — trocar aqui
      // não prova que ele existe. O usuário confirma pelo link,
      // como qualquer outro.
      data: { email: para, emailConfirmadoEm: null },
    }),
    // Tokens emitidos para o endereço antigo perdem a validade:
    // eles foram para uma caixa que não é mais a da conta.
    prisma.tokenEmail.updateMany({
      where: { usuarioId: usuario.id, usadoEm: null },
      data: { usadoEm: new Date() },
    }),
    // E as sessões abertas caem, pelo mesmo motivo.
    prisma.sessao.updateMany({
      where: { usuarioId: usuario.id, revogadaEm: null },
      data: { revogadaEm: new Date() },
    }),
  ]);

  console.log(verde(`  ${de} → ${para}`));
  console.log('');
  console.log(amarelo('  A conta voltou a ficar pendente de confirmação.'));
  console.log(amarelo('  Peça o link novo em "Entrar" → "Reenviar o link", ou:'));
  console.log(`      curl -s -X POST http://127.0.0.1:3501/v1/auth/reenviar-confirmacao \\`);
  console.log(`        -H 'content-type: application/json' -d '{"email":"${para}"}'`);
}

async function remover(email: string): Promise<void> {
  const alvo = normalizar(email);

  const usuario = await prisma.usuario.findUnique({
    where: { email: alvo },
    include: { empresa: { include: { usuarios: { select: { id: true } } } } },
  });

  if (!usuario) {
    console.log(vermelho(`  Nenhuma conta com ${alvo}.`));
    process.exitCode = 1;
    return;
  }

  const sozinho = usuario.empresa.usuarios.length === 1;

  if (sozinho) {
    // Apagar a empresa leva junto usuários, linhas, avaliações,
    // favoritos, monitoramentos e participações — é o `onDelete:
    // Cascade` do schema. Sem isso o CNPJ continuaria ocupado.
    await prisma.empresa.delete({ where: { id: usuario.empresaId } });
    console.log(verde(`  Conta e empresa removidas (CNPJ ${usuario.empresa.cnpj} liberado).`));
  } else {
    await prisma.usuario.delete({ where: { id: usuario.id } });
    console.log(verde(`  Conta removida. A empresa segue com os demais usuários.`));
  }
}

async function principal(): Promise<void> {
  const [comando, ...resto] = process.argv.slice(2);
  console.log('');

  try {
    if (!comando) return await listar();

    if (comando === 'trocar-email') {
      if (resto.length !== 2) {
        console.log(vermelho('  Uso: conta.js trocar-email antigo@x novo@y'));
        process.exitCode = 1;
        return;
      }
      return await trocarEmail(resto[0], resto[1]);
    }

    if (comando === 'remover') {
      if (resto.length !== 1) {
        console.log(vermelho('  Uso: conta.js remover email@x'));
        process.exitCode = 1;
        return;
      }
      return await remover(resto[0]);
    }

    console.log(vermelho(`  Comando desconhecido: ${comando}`));
    console.log(amarelo('  Disponíveis: (nenhum) | trocar-email | remover'));
    process.exitCode = 1;
  } finally {
    console.log('');
    await prisma.$disconnect();
  }
}

principal().catch(async (erro) => {
  console.error(vermelho(erro instanceof Error ? erro.message : String(erro)));
  await prisma.$disconnect();
  process.exitCode = 1;
});
