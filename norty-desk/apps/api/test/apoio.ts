/**
 * Apoio da suíte de ponta a ponta.
 *
 * Sobe a aplicação Nest de verdade, contra um Postgres de verdade, numa
 * porta efêmera. Não há mock: o que falha aqui falha em produção pelo
 * mesmo motivo — inclusive as restrições do banco, que um mock não tem.
 */
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';

import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';

export const prisma = new PrismaClient();

export type Api = {
  url: string;
  fechar: () => Promise<void>;
};

export async function subirApi(): Promise<Api> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  app.setGlobalPrefix('v1');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());

  // Porta 0: o sistema escolhe uma livre. Suíte que fixa porta briga
  // com a aplicação em desenvolvimento na mesma máquina.
  await app.listen(0, '127.0.0.1');
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  return { url: `${url}/v1`, fechar: () => app.close() };
}

/**
 * Limpa o banco entre execuções.
 *
 * `TRUNCATE ... CASCADE` numa lista montada do catálogo: acrescentar uma
 * tabela ao schema não exige lembrar de acrescentá-la aqui.
 */
export async function limparBanco(): Promise<void> {
  const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(', ');
  if (lista) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} CASCADE`);
}

export type Fixtura = Awaited<ReturnType<typeof semear>>;

/** O mínimo para um chamado existir: organização, pessoas, time, categoria e acordos. */
export async function semear() {
  const senha = await argon2.hash('123456', { type: argon2.argon2id });

  const organizacao = await prisma.organization.create({
    data: { slug: 'teste', name: 'Organização de Teste' },
  });

  const outra = await prisma.organization.create({
    data: { slug: 'outra', name: 'Outra Organização' },
  });

  const criarUsuario = async (
    email: string,
    name: string,
    role: 'SOLICITANTE' | 'AGENTE' | 'SUPERVISOR' | 'GESTOR' | 'ADMINISTRADOR',
    org = organizacao.id,
  ) => {
    const usuario = await prisma.user.create({
      data: { email, name, passwordHash: senha, mustChangePassword: false },
    });
    await prisma.membership.create({
      data: { userId: usuario.id, organizationId: org, role },
    });
    return usuario;
  };

  const solicitante = await criarUsuario('solicitante@teste.dev', 'Solicitante', 'SOLICITANTE');
  const agente = await criarUsuario('agente@teste.dev', 'Agente', 'AGENTE');
  const outroAgente = await criarUsuario('agente2@teste.dev', 'Outro Agente', 'AGENTE');
  const supervisor = await criarUsuario('supervisor@teste.dev', 'Supervisora', 'SUPERVISOR');
  const gestor = await criarUsuario('gestor@teste.dev', 'Gestor', 'GESTOR');
  const forasteiro = await criarUsuario('forasteiro@teste.dev', 'Forasteiro', 'AGENTE', outra.id);

  const time = await prisma.team.create({
    data: { organizationId: organizacao.id, name: 'Suporte', email: 'suporte@teste.dev' },
  });
  await prisma.teamMember.create({ data: { teamId: time.id, userId: agente.id } });
  await prisma.teamMember.create({ data: { teamId: time.id, userId: supervisor.id } });

  const outroTime = await prisma.team.create({
    data: { organizationId: organizacao.id, name: 'Sustentação' },
  });
  await prisma.teamMember.create({ data: { teamId: outroTime.id, userId: outroAgente.id } });

  const calendario = await prisma.calendar.create({
    data: {
      organizationId: organizacao.id,
      name: 'Comercial',
      timezone: 'America/Sao_Paulo',
      segments: {
        create: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          startMinute: 9 * 60,
          endMinute: 18 * 60,
        })),
      },
    },
  });

  const tto = await prisma.agreement.create({
    data: {
      organizationId: organizacao.id,
      name: 'Primeiro atendimento',
      kind: 'SLA',
      target: 'TTO',
      durationSeconds: 2 * 3600,
      calendarId: calendario.id,
    },
  });

  const ttr = await prisma.agreement.create({
    data: {
      organizationId: organizacao.id,
      name: 'Resolução',
      kind: 'SLA',
      target: 'TTR',
      durationSeconds: 9 * 3600,
      calendarId: calendario.id,
    },
  });

  const categoria = await prisma.category.create({
    data: {
      organizationId: organizacao.id,
      name: 'Hardware',
      defaultTeamId: time.id,
      defaultAgreements: { connect: [{ id: tto.id }, { id: ttr.id }] },
    },
  });

  const semTime = await prisma.category.create({
    data: { organizationId: organizacao.id, name: 'Dúvida' },
  });

  const motivo = await prisma.pendingReason.create({
    data: {
      organizationId: organizacao.id,
      name: 'Aguardando o solicitante',
      followupIntervalSeconds: 0,
      followupsBeforeResolution: 0,
    },
  });

  return {
    organizacao, outra,
    solicitante, agente, outroAgente, supervisor, gestor, forasteiro,
    time, outroTime, categoria, semTime, motivo, tto, ttr, calendario,
  };
}

// ---------------------------------------------------------------------
// Cliente HTTP da suíte
// ---------------------------------------------------------------------

export type Resposta<T = unknown> = { status: number; corpo: T; cookies: string[] };

export class Cliente {
  private token = '';
  private cookie = '';

  constructor(private readonly base: string) {}

  async entrar(email: string, senha = '123456'): Promise<Resposta<{ accessToken: string }>> {
    const r = await this.chamar<{ accessToken: string }>('POST', '/auth/login', {
      email,
      password: senha,
    });
    if (r.status === 200) {
      this.token = r.corpo.accessToken;
      this.cookie = r.cookies.map((c) => c.split(';')[0]).join('; ');
    }
    return r;
  }

  get autenticado(): boolean {
    return this.token !== '';
  }

  async chamar<T = unknown>(
    metodo: string,
    caminho: string,
    corpo?: unknown,
  ): Promise<Resposta<T>> {
    const resposta = await fetch(`${this.base}${caminho}`, {
      method: metodo,
      headers: {
        ...(corpo ? { 'Content-Type': 'application/json' } : {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });

    const texto = await resposta.text();
    return {
      status: resposta.status,
      corpo: (texto ? JSON.parse(texto) : null) as T,
      cookies: resposta.headers.getSetCookie?.() ?? [],
    };
  }

  get = <T = unknown>(caminho: string) => this.chamar<T>('GET', caminho);
  post = <T = unknown>(caminho: string, corpo?: unknown) => this.chamar<T>('POST', caminho, corpo);
}
