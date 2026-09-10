import { Injectable } from '@nestjs/common';
import type { AuthSource } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { decifrar } from '../channels/segredos';
import { autenticar, testarFonte, type FonteLdap, type ResultadoDoTeste, type ResultadoLdap } from './ldap';

/**
 * A ponte entre as fontes guardadas no banco e o cliente LDAP.
 *
 * É o único lugar que decifra a senha da conta de serviço, e ela não sai
 * daqui: vai direto para o bind.
 */
@Injectable()
export class DiretorioService {
  constructor(private readonly prisma: PrismaService) {}

  static paraFonte(f: AuthSource): FonteLdap {
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
    };
  }

  private static senhaDeServico(f: AuthSource): string | null {
    return f.bindPassword ? decifrar(f.bindPassword) : null;
  }

  /** As fontes que o login tenta, na ordem configurada (`position`, depois nome). */
  fontesAtivas(organizationId: string): Promise<AuthSource[]> {
    return this.prisma.authSource.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }

  autenticar(fonte: AuthSource, login: string, senha: string): Promise<ResultadoLdap> {
    return autenticar(DiretorioService.paraFonte(fonte), DiretorioService.senhaDeServico(fonte), login, senha);
  }

  /** Testa e guarda o resultado na fonte, para a lista mostrar o último teste. */
  async testar(fonte: AuthSource, login?: string | null): Promise<ResultadoDoTeste> {
    let resultado: ResultadoDoTeste;
    try {
      resultado = await testarFonte(DiretorioService.paraFonte(fonte), DiretorioService.senhaDeServico(fonte), login);
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
}
