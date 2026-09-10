import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { LoginResponse, MeResponse } from '@norty-desk/shared';
import type { Request, Response } from 'express';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { COOKIE_REFRESH, gravarRefresh, limparRefresh } from './cookie';
import { AtualizarPerfilDto, LoginDto, OrganizacaoAtivaDto, TrocarSenhaDto } from './dto';

/**
 * Decisões que não devem ser desfeitas (`docs/11-infra.md`, seção 6):
 *
 * - senha em Argon2id; a API nunca devolve o hash;
 * - access token de 15 min, que o cliente guarda em memória;
 * - refresh token em cookie httpOnly, com rotação a cada uso e hash no
 *   banco;
 * - login com mensagem idêntica para e-mail inexistente e senha errada.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<LoginResponse> {
    const sessao = await this.auth.login(dto.login ?? dto.email ?? '', dto.password, dto.organization);

    // A primeira organização da lista é a ativa — no login por usuário é a
    // informada, que o serviço põe na frente. Trocar depois é uma chamada
    // explícita, que emite token novo.
    const primeira = sessao.organizations[0]!;
    const tokens = await this.auth.emitirTokens(sessao.user.id, primeira.id);

    gravarRefresh(resposta, tokens.refreshToken, tokens.refreshExpiraEm);
    return { ...sessao, accessToken: tokens.accessToken };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() requisicao: Request,
    @Body() corpo: { organizationId?: string },
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<{ accessToken: string }> {
    const cru: string | undefined = requisicao.cookies?.[COOKIE_REFRESH];
    if (!cru) {
      limparRefresh(resposta);
      throw new UnauthorizedException('Sessão inválida.');
    }

    // A organização vem do corpo porque o refresh não carrega JWT para
    // consultá-la. O `emitirTokens` valida o vínculo de qualquer forma.
    const organizationId =
      corpo?.organizationId ?? (await this.auth.organizacaoMaisRecente(cru));

    const tokens = await this.auth.rotacionar(cru, organizationId);
    gravarRefresh(resposta, tokens.refreshToken, tokens.refreshExpiraEm);
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() requisicao: Request,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<void> {
    await this.auth.encerrar(requisicao.cookies?.[COOKIE_REFRESH]);
    limparRefresh(resposta);
  }

  @Post('organizacao-ativa')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async trocarOrganizacao(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: OrganizacaoAtivaDto,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<{ accessToken: string }> {
    const tokens = await this.auth.emitirTokens(usuario.userId, dto.organizationId);
    gravarRefresh(resposta, tokens.refreshToken, tokens.refreshExpiraEm);
    return { accessToken: tokens.accessToken };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() usuario: UsuarioAutenticado): Promise<MeResponse> {
    return this.auth.me(usuario);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  atualizarPerfil(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: AtualizarPerfilDto,
  ): Promise<MeResponse> {
    return this.auth.atualizarPerfil(usuario, dto);
  }

  @Post('trocar-senha')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  trocarSenha(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: TrocarSenhaDto,
  ): Promise<void> {
    return this.auth.trocarSenha(usuario.userId, dto.atual, dto.nova);
  }
}
