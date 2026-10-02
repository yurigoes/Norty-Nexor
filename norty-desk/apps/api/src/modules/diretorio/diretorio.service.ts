import { Injectable } from '@nestjs/common';
import type { AuthSource, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { decifrar } from '../channels/segredos';
import {
  abrirConexao,
  autenticar,
  testarFonte,
  type ConexaoLdap,
  type FonteLdap,
  type ResultadoDoTeste,
  type ResultadoLdap,
  type Servidor,
} from './ldap';

/**
 * A fonte com as réplicas já carregadas — é a forma que o cliente LDAP
 * pede, e por isso o tipo exige o campo em vez de deixá-lo opcional:
 * quem esquecesse o `include` perderia o servidor reserva em silêncio,
 * e isso só apareceria no dia em que o principal caísse.
 */
export type FonteComReplicas = AuthSource & { replicas: Servidor[] };

/** Réplica ativa, na ordem de tentativa. Desativada não entra na fila. */
const REPLICAS_ATIVAS = {
  where: { isActive: true },
  orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  select: { host: true, port: true },
} satisfies Prisma.AuthSource$replicasArgs;

/**
 * De quanto em quanto tempo a réplica que atendeu é anotada.
 *
 * Gravar a cada login seria um UPDATE por autenticação durante toda a
 * queda do principal — e a tela não fica melhor por saber o segundo
 * exato. De minuto em minuto basta para dizer quem está carregando.
 */
const INTERVALO_DA_ANOTACAO = 60_000;

/**
 * A ponte entre as fontes guardadas no banco e o cliente LDAP.
 *
 * É o único lugar que decifra a senha da conta de serviço, e ela não sai
 * daqui: vai direto para o bind.
 */
@Injectable()
export class DiretorioService {
  constructor(private readonly prisma: PrismaService) {}

  static paraFonte(f: FonteComReplicas): FonteLdap {
    return {
      host: f.host,
      port: f.port,
      security: f.security,
      baseDn: f.baseDn,
      bindDn: f.bindDn,
      loginField: f.loginField,
      syncField: f.syncField,
      userFilter: f.userFilter,
      emailField: f.emailField,
      nameField: f.nameField,
      phoneField: f.phoneField,
      timeoutMs: f.timeoutMs,
      grupos: {
        busca: f.groupSearch,
        campoDoUsuario: f.groupField,
        campoDoMembro: f.groupMemberField,
        filtro: f.groupFilter,
        baseDn: f.groupBaseDn,
        aninhados: f.groupNested,
      },
      replicas: f.replicas.map(({ host, port }) => ({ host, port })),
    };
  }

  private static senhaDeServico(f: AuthSource): string | null {
    return f.bindPassword ? decifrar(f.bindPassword) : null;
  }

  /** As fontes que o login tenta, na ordem configurada (`position`, depois nome). */
  fontesAtivas(organizationId: string): Promise<FonteComReplicas[]> {
    return this.prisma.authSource.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { replicas: REPLICAS_ATIVAS },
    });
  }

  /** Uma fonte pelo id, pronta para o cliente LDAP. */
  fonte(id: string): Promise<FonteComReplicas | null> {
    return this.prisma.authSource.findUnique({
      where: { id },
      include: { replicas: REPLICAS_ATIVAS },
    });
  }

  /**
   * `abrir` existe pela mesma razão que no cliente LDAP: a suíte troca a
   * conexão por uma falsa para conferir a escolha do servidor e a
   * anotação de quem atendeu, sem um Active Directory no caminho.
   */
  async autenticar(
    fonte: FonteComReplicas,
    login: string,
    senha: string,
    abrir: (f: FonteLdap) => Promise<ConexaoLdap> = abrirConexao,
  ): Promise<ResultadoLdap> {
    const resultado = await autenticar(
      DiretorioService.paraFonte(fonte),
      DiretorioService.senhaDeServico(fonte),
      login,
      senha,
      abrir,
    );
    // Anota mesmo quando a senha da pessoa estava errada: o que se está
    // registrando é qual servidor respondeu, e ele respondeu.
    if (resultado.servidor) await this.anotarQuemAtendeu(fonte, resultado.servidor);
    return resultado;
  }

  /** Testa e guarda o resultado na fonte, para a lista mostrar o último teste. */
  async testar(
    fonte: AuthSource,
    login?: string | null,
    abrir: (f: FonteLdap) => Promise<ConexaoLdap> = abrirConexao,
  ): Promise<ResultadoDoTeste> {
    let resultado: ResultadoDoTeste;
    try {
      const comReplicas: FonteComReplicas = {
        ...fonte,
        replicas: await this.prisma.authSourceReplica.findMany({
          where: { authSourceId: fonte.id, ...REPLICAS_ATIVAS.where },
          orderBy: REPLICAS_ATIVAS.orderBy,
          select: REPLICAS_ATIVAS.select,
        }),
      };
      resultado = await testarFonte(
        DiretorioService.paraFonte(comReplicas),
        DiretorioService.senhaDeServico(fonte),
        login,
        abrir,
      );
      if (resultado.servidor) await this.anotarQuemAtendeu(fonte, resultado.servidor);
    } catch (e) {
      // Só o decifrar lança aqui: CHANNEL_SECRET_KEY trocada desde que a senha foi salva.
      resultado = { ok: false, mensagem: `Não foi possível ler a senha guardada: ${(e as Error).message}` };
    }

    await this.prisma.authSource.update({
      where: { id: fonte.id },
      data: { lastTestAt: new Date(), lastTestOk: resultado.ok, lastTestMessage: resultado.mensagem.slice(0, 500) },
    });
    return resultado;
  }

  /**
   * Marca a réplica que atendeu, para a tela dizer quem está de pé.
   *
   * O servidor principal não tem linha — ele é a própria fonte, e o
   * `lastTestAt` dela já conta essa história.
   */
  private async anotarQuemAtendeu(fonte: AuthSource, servidor: Servidor): Promise<void> {
    if (servidor.host === fonte.host && servidor.port === fonte.port) return;

    const agora = new Date();
    await this.prisma.authSourceReplica.updateMany({
      where: {
        authSourceId: fonte.id,
        host: servidor.host,
        port: servidor.port,
        OR: [
          { lastUsedAt: null },
          { lastUsedAt: { lt: new Date(agora.getTime() - INTERVALO_DA_ANOTACAO) } },
        ],
      },
      data: { lastUsedAt: agora },
    });
  }
}
