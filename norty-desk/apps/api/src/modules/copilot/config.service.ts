import { BadRequestException, Injectable } from '@nestjs/common';
import type { AiConfigView } from '@norty-desk/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { cifrar } from '../channels/segredos';

/**
 * A configuração do Copilot.
 *
 * Separada do serviço que fala com o provedor porque são dois assuntos:
 * um é de quem administra, outro é de quem atende — e a permissão que
 * cada um exige é diferente.
 *
 * **A chave nunca sai daqui.** A tela recebe `temChave: boolean`, pela
 * mesma razão que a senha de canal não volta: um payload que carrega o
 * segredo é um segredo a mais no log de quem estiver depurando.
 */
@Injectable()
export class ConfigDoCopilotoService {
  constructor(private readonly prisma: PrismaService) {}

  async ler(organizationId: string): Promise<AiConfigView | null> {
    const config = await this.prisma.aiConfig.findUnique({ where: { organizationId } });
    if (!config) return null;

    return {
      provider: config.provider,
      model: config.model,
      isActive: config.isActive,
      temChave: Boolean(config.apiKeyCifrada),
    };
  }

  async escrever(
    organizationId: string,
    dados: { provider: 'GEMINI' | 'GROQ'; model: string; isActive?: boolean; apiKey?: string },
  ): Promise<AiConfigView> {
    const atual = await this.prisma.aiConfig.findUnique({
      where: { organizationId },
      select: { apiKeyCifrada: true },
    });

    // `undefined` mantém, string vazia apaga, texto cifra. Sem isto,
    // mexer no modelo obrigaria a redigitar a chave — e quem redigita
    // acaba deixando a chave num histórico de terminal.
    const apiKeyCifrada =
      dados.apiKey === undefined
        ? (atual?.apiKeyCifrada ?? null)
        : dados.apiKey.trim() === ''
          ? null
          : cifrar(dados.apiKey.trim());

    const querLigar = dados.isActive ?? false;
    if (querLigar && !apiKeyCifrada) {
      throw new BadRequestException('Informe a chave do provedor antes de ligar o Copilot.');
    }

    const salva = await this.prisma.aiConfig.upsert({
      where: { organizationId },
      update: {
        provider: dados.provider,
        model: dados.model.trim(),
        isActive: querLigar,
        apiKeyCifrada,
      },
      create: {
        organizationId,
        provider: dados.provider,
        model: dados.model.trim(),
        isActive: querLigar,
        apiKeyCifrada,
      },
    });

    return {
      provider: salva.provider,
      model: salva.model,
      isActive: salva.isActive,
      temChave: Boolean(salva.apiKeyCifrada),
    };
  }
}
