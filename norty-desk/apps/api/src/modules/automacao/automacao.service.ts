import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import { SaidaService } from '../channels/saida.service';

/** Quanto tempo o link vale. Curto porque o canal é lido por terceiros. */
const MINUTOS_DO_LINK = 15;

/** Quantos links por pessoa por hora. Acima disso vira incômodo dirigido. */
const LIMITE_POR_HORA = 3;

/**
 * O que o sistema resolve sozinho.
 *
 * Hoje uma ação só: mandar à pessoa um link para ela trocar a própria
 * senha. A lista é curta de propósito — automação que erra no escuro
 * custa mais que o tempo que economiza, e cada ação nova traz o próprio
 * conjunto de cercas.
 *
 * ## Duas decisões que valem mais que o código
 *
 * **1. O sistema não manda senha; manda um convite para escolher uma.**
 * O pedido era "enviar para o e-mail e o WhatsApp dele". O link vai
 * pelos dois — a senha, não, e nunca chegou a existir. Mensagem é lida
 * no aparelho destravado de quem estiver por perto, fica no histórico e
 * é encaminhada; senha dentro dela continua valendo depois de tudo
 * isso. Este link vale quinze minutos, uma vez só, e o sistema nunca
 * conhece a senha escolhida.
 *
 * **2. A ação exige identidade provada, e e-mail não prova.**
 * Quem abre chamado por e-mail provou apenas que uma mensagem chegou
 * com aquele remetente — que é falsificável. Na tela sem login, provou
 * menos ainda: digitou um nome. Então a ação só corre quando o chamado
 * nasceu **logado** (canal WEB) ou **pelo integrador** (canal API, com
 * o token da empresa, que já viu a pessoa autenticada no sistema de
 * origem — `docs/13`, seção 13). Nos outros canais o chamado abre
 * normalmente e espera uma pessoa: é mais lento, e é o certo.
 *
 * Recusa nunca é silenciosa. Cada cerca que barra escreve na linha do
 * tempo o motivo, em português, para quem for atender saber por que o
 * chamado chegou às mãos dele.
 */
@Injectable()
export class AutomacaoService {
  private readonly logger = new Logger(AutomacaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly saida: SaidaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Executa a ação do modelo, se houver uma e se as cercas deixarem.
   *
   * Chamada na abertura e de novo quando uma aprovação passa. Chamar
   * duas vezes é seguro: o chamado já resolvido não executa de novo.
   */
  async executarSeHouver(ticketId: string): Promise<boolean> {
    const chamado = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        number: true,
        status: true,
        organizationId: true,
        originChannel: true,
        form: { select: { acaoAutomatica: true } },
        actors: {
          where: { role: 'REQUERENTE' },
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                isActive: true,
                passwordHash: true,
                authSourceId: true,
                authSource: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const acao = chamado?.form?.acaoAutomatica;
    if (!chamado || !acao) return false;

    // Já resolvido ou fechado: a ação já correu, ou alguém resolveu à
    // mão. Executar agora seria mandar um segundo link sem pedido.
    if (chamado.status === 'SOLUCIONADO' || chamado.status === 'FECHADO') return false;

    // Aval pendente segura a ação. Quando a aprovação passar,
    // `AprovacoesService` chama este método de novo.
    //
    // A pergunta é pela **aprovação em aberto**, e não pelo status: o
    // aval exigido por uma categoria não leva o chamado a
    // `EM_APROVACAO`, ele segue o curso normal enquanto espera
    // (`docs/13`, seção 10). Olhar só o status deixaria passar direto
    // justamente o caso que o pedido descreve — "se a categoria exigir
    // aval, o gestor aprova primeiro".
    const pendentes = await this.prisma.approval.count({
      where: { ticketId: chamado.id, status: 'AGUARDANDO' },
    });
    if (pendentes > 0) return false;

    if (acao === 'RESET_DE_SENHA') return this.resetDeSenha(chamado);

    return false;
  }

  // -------------------------------------------------------------------
  // Trocar a própria senha
  // -------------------------------------------------------------------

  private async resetDeSenha(chamado: {
    id: string;
    number: number;
    organizationId: string;
    originChannel: string;
    actors: {
      userId: string | null;
      user: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
        isActive: boolean;
        passwordHash: string | null;
        authSourceId: string | null;
        authSource: { name: string } | null;
      } | null;
    }[];
  }): Promise<boolean> {
    const pessoa = chamado.actors[0]?.user ?? null;

    // A cerca da identidade. Ver o cabeçalho da classe: e-mail e
    // WhatsApp não provam quem é, e a tela sem login prova menos ainda.
    if (chamado.originChannel !== 'WEB' && chamado.originChannel !== 'API') {
      return this.recusar(
        chamado,
        'A troca automática de senha só vale para quem abriu o chamado logado ou pelo ' +
          'integrador. Este chegou por outro canal, que não confirma quem pediu — ' +
          'confirme a identidade e troque a senha à mão.',
      );
    }

    if (!pessoa) {
      return this.recusar(
        chamado,
        'A troca automática de senha precisa de um solicitante cadastrado. Este chamado foi ' +
          'aberto por um contato sem conta no Desk.',
      );
    }

    if (!pessoa.isActive) {
      return this.recusar(
        chamado,
        `A conta de ${pessoa.name} está inativa. Reative antes de trocar a senha.`,
      );
    }

    // Cadastro de uso: a pessoa existe para o inventário e não tem senha
    // porque alguém decidiu que ela não entra. Mandar o link daria
    // acesso justamente a quem a organização escolheu não dar — e sem
    // ninguém decidir de novo. O pedido vira chamado de gente, que é
    // onde a decisão cabe.
    if (pessoa.passwordHash === null) {
      return this.recusar(
        chamado,
        `${pessoa.name} tem cadastro de uso e não acessa a central. Dar acesso é decisão de ` +
          'quem administra, não da automação — o cadastro existe por causa do inventário.',
      );
    }

    // Conta de diretório: a senha é do AD, e o Desk não a guarda. Trocar
    // aqui daria a impressão de ter funcionado e não mudaria nada no
    // lugar onde a pessoa de fato entra.
    if (pessoa.authSourceId) {
      return this.recusar(
        chamado,
        `A senha de ${pessoa.name} é do diretório ${pessoa.authSource?.name ?? 'da empresa'}, ` +
          'não do Desk. A troca precisa ser feita lá.',
      );
    }

    if (!pessoa.email && !pessoa.phone) {
      return this.recusar(
        chamado,
        `${pessoa.name} não tem e-mail nem WhatsApp cadastrado: não há para onde mandar o link.`,
      );
    }

    // Limite por pessoa. Sem ele, abrir o mesmo chamado dez vezes vira
    // dez mensagens no telefone de alguém — incômodo dirigido, e feito
    // pelo próprio sistema.
    const recentes = await this.prisma.passwordResetToken.count({
      where: { userId: pessoa.id, createdAt: { gt: new Date(Date.now() - 3600_000) } },
    });

    if (recentes >= LIMITE_POR_HORA) {
      return this.recusar(
        chamado,
        `${pessoa.name} já recebeu ${recentes} links de troca de senha na última hora. ` +
          'O envio automático parou por aqui — confira se é a pessoa mesmo que está pedindo.',
      );
    }

    const link = await this.criarLink(pessoa.id, chamado.id);

    const texto =
      `Olá, ${pessoa.name}.\n\n` +
      `Você pediu para trocar a senha do Norty Desk (chamado #${chamado.number}).\n\n` +
      `Escolha a nova senha aqui — o link vale ${MINUTOS_DO_LINK} minutos e só abre uma vez:\n` +
      `${link}\n\n` +
      'Se não foi você quem pediu, ignore esta mensagem: sua senha continua a mesma.';

    if (pessoa.email) {
      await this.saida.enfileirarAviso({
        organizationId: chamado.organizationId,
        ticketId: chamado.id,
        channel: 'EMAIL',
        para: pessoa.email,
        assunto: 'Troca de senha do Norty Desk',
        corpo: texto,
      });
    }

    if (pessoa.phone) {
      await this.saida.enfileirarAviso({
        organizationId: chamado.organizationId,
        ticketId: chamado.id,
        channel: 'WHATSAPP',
        para: pessoa.phone,
        corpo: texto,
      });
    }

    const onde = [pessoa.email ? 'e-mail' : null, pessoa.phone ? 'WhatsApp' : null]
      .filter(Boolean)
      .join(' e ');

    // O evento é **público** e **não carrega o link**. Público porque a
    // pessoa precisa ver na tela do chamado que o envio aconteceu; sem
    // o link porque a linha do tempo é lida por quem atende, e o link
    // troca a senha de quem pediu.
    await this.prisma.ticketEvent.create({
      data: {
        ticketId: chamado.id,
        type: 'SOLUCAO',
        visibility: 'PUBLICA',
        channel: 'SISTEMA',
        body:
          `Link de troca de senha enviado por ${onde}. ` +
          `Ele vale ${MINUTOS_DO_LINK} minutos e abre uma vez só. ` +
          'A senha é escolhida por você — o Desk não a conhece.',
      },
    });

    await this.prisma.ticket.update({
      where: { id: chamado.id },
      data: { status: 'SOLUCIONADO', solvedAt: new Date() },
    });

    this.logger.log(`Chamado #${chamado.number}: link de troca de senha enviado.`);
    return true;
  }

  /**
   * Cria o link e guarda só o hash.
   *
   * Os links anteriores da pessoa são queimados: um pedido novo
   * invalida o anterior, para que um link antigo esquecido numa caixa
   * de e-mail não continue valendo.
   */
  private async criarLink(userId: string, ticketId: string): Promise<string> {
    const cru = randomBytes(32).toString('base64url');

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
        data: { expiresAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId,
          ticketId,
          tokenHash: AutomacaoService.hash(cru),
          expiresAt: new Date(Date.now() + MINUTOS_DO_LINK * 60_000),
        },
      }),
    ]);

    const origem =
      this.config.get<string>('WEB_ORIGIN')?.split(',')[0] ?? 'https://chamados.norty.com.br';

    return `${origem.replace(/\/$/, '')}/definir-senha/${cru}`;
  }

  /**
   * A ação não correu, e o chamado segue para gente.
   *
   * A nota é **interna**: o motivo é conversa da equipe. Dizer ao
   * solicitante "sua identidade não foi confirmada" na linha pública
   * não o ajuda e ensina a quem estiver tentando se passar por ele
   * exatamente qual cerca precisa contornar.
   */
  private async recusar(chamado: { id: string; number: number }, motivo: string): Promise<boolean> {
    await this.prisma.ticketEvent.create({
      data: {
        ticketId: chamado.id,
        type: 'NOTA_INTERNA',
        visibility: 'INTERNA',
        channel: 'SISTEMA',
        body: `Ação automática não executada. ${motivo}`,
      },
    });

    this.logger.debug(`Chamado #${chamado.number}: ação automática recusada — ${motivo}`);
    return false;
  }

  static hash(cru: string): string {
    return createHash('sha256').update(cru).digest('hex');
  }
}
