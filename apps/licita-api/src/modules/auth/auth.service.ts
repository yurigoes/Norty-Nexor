/* =========================================================
   LICITA+ API — Autenticação
   ---------------------------------------------------------
   Cadastro aberto, o que muda o peso de cada decisão: com
   página pública de criação de conta, quem sonda não precisa de
   convite para tentar.

   As garantias, e o motivo de cada uma:

   - **Argon2id** para a senha. Custo de memória alto torna ataque
     por GPU caro; hash rápido não protege senha.
   - **Mensagem idêntica** para e-mail inexistente e senha errada,
     com o mesmo tempo de resposta. Distinguir os dois transforma
     o login num verificador de quem tem conta.
   - **Cadastro também não confirma existência**: pedir conta com
     e-mail já cadastrado responde igual a um cadastro novo, e
     quem já tem conta recebe um aviso por e-mail em vez de a tela
     dizer "esse e-mail existe".
   - **Refresh com rotação.** Cada uso queima o token e emite
     outro. Um token vazado usado depois do legítimo já não existe.
   - **Tokens de e-mail em hash**, com validade e uso único.
   ========================================================= */

import {
  BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { TipoToken, type Usuario } from '../../../gerado/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { carregarConfig } from '../../config/env';
import type { CargaJwt } from '../../common/types';
import type { EntrarDto, CadastrarDto, RedefinirDto } from './dto';

const config = carregarConfig();

/**
 * Hash descartável de uma senha aleatória. Serve para gastar o
 * mesmo tempo de verificação quando o e-mail não existe — sem
 * isso, a resposta instantânea denunciaria que não há conta.
 */
const HASH_FALSO =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZS1zYWx0LXZhbHVl$8vB1kZ1qF0z8wJZ3sQe9YhV6t0mN4pXcR2aL7dK5gTs';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

export interface Dispositivo {
  ip?: string;
  userAgent?: string;
}

export interface UsuarioResposta {
  id: string;
  nome: string;
  email: string;
  papel: string;
  cargo: string | null;
  empresa: { id: string; razaoSocial: string; nomeFantasia: string | null; cnpj: string };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
  ) {}

  /* ---------- Cadastro ---------- */

  async cadastrar(dto: CadastrarDto): Promise<{ mensagem: string }> {
    const email = normalizarEmail(dto.email);
    const cnpj = somenteDigitos(dto.cnpj);

    if (cnpj.length !== 14) {
      throw new BadRequestException('CNPJ deve ter 14 dígitos.');
    }

    const jaExiste = await this.prisma.usuario.findUnique({ where: { email } });

    // Resposta idêntica para e-mail novo e já cadastrado. Quem já
    // tem conta recebe um aviso por e-mail; a tela não confirma
    // nem nega a existência do cadastro.
    if (jaExiste) {
      this.logger.warn(`Cadastro tentado com e-mail existente: ${email}`);
      await this.email.redefinicaoDeSenha(email, jaExiste.nome, await this.emitirToken(jaExiste.id, TipoToken.redefinicao, HORA));
      return { mensagem: MENSAGEM_CADASTRO };
    }

    const cnpjEmUso = await this.prisma.empresa.findUnique({ where: { cnpj } });
    if (cnpjEmUso) {
      // Aqui a colisão é informativa: o CNPJ é público e o usuário
      // precisa saber que a empresa já tem conta para pedir acesso
      // a quem administra, em vez de criar uma segunda.
      throw new ConflictException(
        'Este CNPJ já tem conta no LICITA+. Peça um convite a quem administra a conta da empresa.',
      );
    }

    const senhaHash = await hash(dto.senha);

    const usuario = await this.prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({
        data: {
          razaoSocial: dto.razaoSocial.trim(),
          nomeFantasia: dto.nomeFantasia?.trim() || null,
          cnpj,
          uf: dto.uf.toUpperCase(),
          municipioIbge: dto.municipioIbge,
          estadosAtuacao: [dto.uf.toUpperCase()],
        },
      });

      return tx.usuario.create({
        data: {
          empresaId: empresa.id,
          nome: dto.nome.trim(),
          email,
          senhaHash,
          papel: 'dono',
        },
      });
    });

    const token = await this.emitirToken(usuario.id, TipoToken.confirmacao, DIA);
    await this.email.confirmacaoDeConta(email, usuario.nome, token);

    this.logger.log(`Conta criada: ${email} (empresa ${cnpj})`);
    return { mensagem: MENSAGEM_CADASTRO };
  }

  async confirmarEmail(tokenBruto: string): Promise<{ mensagem: string }> {
    const registro = await this.consumirToken(tokenBruto, TipoToken.confirmacao);

    await this.prisma.usuario.update({
      where: { id: registro.usuarioId },
      data: { emailConfirmadoEm: new Date() },
    });

    this.logger.log(`E-mail confirmado: usuário ${registro.usuarioId}`);
    return { mensagem: 'E-mail confirmado. Você já pode entrar.' };
  }

  async reenviarConfirmacao(emailBruto: string): Promise<{ mensagem: string }> {
    const email = normalizarEmail(emailBruto);
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });

    if (usuario && !usuario.emailConfirmadoEm) {
      const token = await this.emitirToken(usuario.id, TipoToken.confirmacao, DIA);
      await this.email.confirmacaoDeConta(email, usuario.nome, token);
    }

    // Mesma resposta em todos os casos.
    return { mensagem: 'Se houver uma conta pendente com este e-mail, o link foi reenviado.' };
  }

  /* ---------- Entrada ---------- */

  async entrar(dto: EntrarDto, dispositivo: Dispositivo): Promise<{
    accessToken: string;
    expiraEm: number;
    usuario: UsuarioResposta;
    refreshToken: string;
    refreshExpiraEm: Date;
  }> {
    const email = normalizarEmail(dto.email);

    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      include: { empresa: true },
    });

    const invalido = new UnauthorizedException('E-mail ou senha incorretos.');

    if (!usuario) {
      // Gasta o mesmo tempo do caminho válido.
      await verify(HASH_FALSO, dto.senha).catch(() => false);
      throw invalido;
    }

    const senhaOk = await verify(usuario.senhaHash, dto.senha).catch(() => false);
    if (!senhaOk) throw invalido;

    if (!usuario.emailConfirmadoEm) {
      throw new UnauthorizedException(
        'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.',
      );
    }
    if (!usuario.ativo || !usuario.empresa.ativa) {
      throw new UnauthorizedException('Conta desativada.');
    }

    const { token: refreshToken, hash: refreshHash } = criarRefresh();
    const refreshExpiraEm = new Date(Date.now() + config.jwt.refreshTtlDias * DIA);

    const sessao = await this.prisma.sessao.create({
      data: {
        usuarioId: usuario.id,
        refreshHash,
        ip: dispositivo.ip,
        userAgent: dispositivo.userAgent?.slice(0, 400),
        expiraEm: refreshExpiraEm,
      },
    });

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoLoginEm: new Date() },
    });

    this.logger.log(`Entrada: ${email}`);

    return {
      accessToken: await this.assinarAcesso(usuario, sessao.id),
      expiraEm: config.jwt.accessTtlSegundos,
      usuario: paraResposta(usuario, usuario.empresa),
      refreshToken,
      refreshExpiraEm,
    };
  }

  /** Rotação: cada uso queima o token e emite outro. */
  async renovar(tokenBruto: string): Promise<{
    accessToken: string;
    expiraEm: number;
    usuario: UsuarioResposta;
    refreshToken: string;
    refreshExpiraEm: Date;
  }> {
    const sessao = await this.prisma.sessao.findUnique({
      where: { refreshHash: hashToken(tokenBruto) },
      include: { usuario: { include: { empresa: true } } },
    });

    if (!sessao || sessao.revogadaEm || sessao.expiraEm < new Date()) {
      throw new UnauthorizedException('Sessão expirada. Entre novamente.');
    }
    if (!sessao.usuario.ativo || !sessao.usuario.empresa.ativa) {
      throw new UnauthorizedException('Conta desativada.');
    }

    const { token: refreshToken, hash: refreshHash } = criarRefresh();
    const refreshExpiraEm = new Date(Date.now() + config.jwt.refreshTtlDias * DIA);

    await this.prisma.sessao.update({
      where: { id: sessao.id },
      data: { refreshHash, expiraEm: refreshExpiraEm, ultimoUsoEm: new Date() },
    });

    return {
      accessToken: await this.assinarAcesso(sessao.usuario, sessao.id),
      expiraEm: config.jwt.accessTtlSegundos,
      usuario: paraResposta(sessao.usuario, sessao.usuario.empresa),
      refreshToken,
      refreshExpiraEm,
    };
  }

  async sair(sessaoId: string): Promise<void> {
    await this.prisma.sessao.updateMany({
      where: { id: sessaoId, revogadaEm: null },
      data: { revogadaEm: new Date() },
    });
  }

  /* ---------- Senha ---------- */

  async pedirRedefinicao(emailBruto: string): Promise<{ mensagem: string }> {
    const email = normalizarEmail(emailBruto);
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });

    if (usuario) {
      const token = await this.emitirToken(usuario.id, TipoToken.redefinicao, HORA);
      await this.email.redefinicaoDeSenha(email, usuario.nome, token);
    }

    // Resposta idêntica exista ou não a conta.
    return {
      mensagem: 'Se houver uma conta com este e-mail, enviamos um link para redefinir a senha.',
    };
  }

  async redefinirSenha(dto: RedefinirDto): Promise<{ mensagem: string }> {
    const registro = await this.consumirToken(dto.token, TipoToken.redefinicao);
    const senhaHash = await hash(dto.senha);

    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id: registro.usuarioId },
        // Trocar a senha também confirma o e-mail: só chega aqui
        // quem abriu um link enviado para ele.
        data: { senhaHash, emailConfirmadoEm: new Date() },
      }),
      // Trocar a senha derruba todas as sessões. Se a troca foi
      // por suspeita de invasão, deixar as sessões antigas vivas
      // anularia o gesto.
      this.prisma.sessao.updateMany({
        where: { usuarioId: registro.usuarioId, revogadaEm: null },
        data: { revogadaEm: new Date() },
      }),
    ]);

    this.logger.log(`Senha redefinida: usuário ${registro.usuarioId}`);
    return { mensagem: 'Senha alterada. Entre com a nova senha.' };
  }

  /* ---------- Internos ---------- */

  private async assinarAcesso(usuario: Usuario, sessaoId: string): Promise<string> {
    const carga: CargaJwt = {
      sub: usuario.id,
      emp: usuario.empresaId,
      ses: sessaoId,
      pap: usuario.papel,
    };
    return this.jwt.signAsync(carga, { expiresIn: config.jwt.accessTtlSegundos });
  }

  private async emitirToken(usuarioId: string, tipo: TipoToken, validadeMs: number): Promise<string> {
    const bruto = randomBytes(32).toString('base64url');

    // Um pedido novo invalida os anteriores do mesmo tipo: dois
    // links de redefinição válidos ao mesmo tempo dobram a janela
    // de quem interceptar um deles.
    await this.prisma.tokenEmail.updateMany({
      where: { usuarioId, tipo, usadoEm: null },
      data: { usadoEm: new Date() },
    });

    await this.prisma.tokenEmail.create({
      data: {
        usuarioId,
        tipo,
        tokenHash: hashToken(bruto),
        expiraEm: new Date(Date.now() + validadeMs),
      },
    });

    return bruto;
  }

  private async consumirToken(bruto: string, tipo: TipoToken) {
    const registro = await this.prisma.tokenEmail.findUnique({
      where: { tokenHash: hashToken(bruto) },
    });

    const invalido = new BadRequestException('Link inválido ou expirado. Peça um novo.');

    if (!registro || registro.tipo !== tipo || registro.usadoEm || registro.expiraEm < new Date()) {
      throw invalido;
    }

    await this.prisma.tokenEmail.update({
      where: { id: registro.id },
      data: { usadoEm: new Date() },
    });

    return registro;
  }
}

/* ---------- Auxiliares ---------- */

const MENSAGEM_CADASTRO =
  'Conta criada. Enviamos um link de confirmação para o seu e-mail — ' +
  'ele vale por 24 horas.';

const normalizarEmail = (email: string): string => email.toLowerCase().trim();
const somenteDigitos = (texto: string): string => texto.replace(/\D/g, '');

const hashToken = (bruto: string): string => createHash('sha256').update(bruto).digest('hex');

function criarRefresh(): { token: string; hash: string } {
  const token = randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
}

/** A resposta nunca carrega `senhaHash` — o tipo não tem o campo. */
function paraResposta(
  usuario: Usuario,
  empresa: { id: string; razaoSocial: string; nomeFantasia: string | null; cnpj: string },
): UsuarioResposta {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel,
    cargo: usuario.cargo,
    empresa: {
      id: empresa.id,
      razaoSocial: empresa.razaoSocial,
      nomeFantasia: empresa.nomeFantasia,
      cnpj: empresa.cnpj,
    },
  };
}
