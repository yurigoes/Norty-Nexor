import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { LoginStep, SessionInfo, SessionTokens } from '@nortycar/shared';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, MfaDisableDto, MfaDto, ResetConfirmDto, ResetRequestDto, SelectContextDto } from './dto';
import { AllowTicket, AnyContext, Ctx, Public, type RequestContext } from '../../common/context';
import type { TicketPayload } from '../../common/tokens';
import { loadConfig } from '../../config/env';

const config = loadConfig();
/** Tentativas por minuto por IP nas rotas de credencial (configurável para a bancada de testes). */
const AUTH_LIMIT = Number(process.env.AUTH_RATE_LIMIT ?? 10);
export const REFRESH_COOKIE = 'nortycar_refresh';

type TicketRequest = Request & { ticket?: TicketPayload; ctx?: RequestContext };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Limite apertado por IP: o login é o alvo natural de força bruta. O
   * bloqueio por conta (no service) cobre o ataque distribuído.
   */
  @Public()
  @Throttle({ default: { limit: AUTH_LIMIT, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<LoginStep> {
    const result = await this.auth.login(dto.email, dto.password, {
      ip: request.ip, userAgent: request.headers['user-agent'],
    });
    setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
    return result.step;
  }

  @AllowTicket()
  @Throttle({ default: { limit: AUTH_LIMIT, ttl: 60_000 } })
  @Post('mfa')
  @HttpCode(HttpStatus.OK)
  mfa(@Body() dto: MfaDto, @Req() request: TicketRequest): Promise<LoginStep> {
    const ticket = request.ticket;
    if (!ticket?.mfaPending) throw new UnauthorizedException('Ticket de MFA inválido.');
    return this.auth.verifyMfa(ticket, dto.code);
  }

  /** Contextos disponíveis: com o ticket do login ou com a sessão já aberta. */
  @AllowTicket()
  @AnyContext()
  @Get('contexts')
  contexts(@Req() request: TicketRequest) {
    const userId = request.ticket?.sub ?? request.ctx?.userId;
    if (!userId || request.ticket?.mfaPending) throw new UnauthorizedException('Sessão inválida.');
    return this.auth.listContexts(userId);
  }

  /** Escolhe (ou troca) o contexto sem novo login. */
  @AllowTicket()
  @AnyContext()
  @Post('context')
  @HttpCode(HttpStatus.OK)
  selectContext(@Body() dto: SelectContextDto, @Req() request: TicketRequest): Promise<SessionTokens> {
    const userId = request.ticket?.sub ?? request.ctx?.userId;
    const sessionId = request.ticket?.sid ?? request.ctx?.sessionId;
    if (!userId || !sessionId || request.ticket?.mfaPending) throw new UnauthorizedException('Sessão inválida.');
    return this.auth.selectContext(userId, sessionId, dto.key, request.ctx ?? null);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<SessionTokens> {
    const token = request.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException('Sessão não encontrada.');
    const result = await this.auth.refresh(token);
    setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
    return result.tokens;
  }

  @AllowTicket()
  @AnyContext()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: TicketRequest, @Res({ passthrough: true }) response: Response): Promise<void> {
    const sessionId = request.ctx?.sessionId ?? request.ticket?.sid;
    if (sessionId) await this.auth.logout(sessionId);
    response.clearCookie(REFRESH_COOKIE, cookieOptions(new Date(0)));
  }

  @AnyContext()
  @Get('session')
  session(@Ctx() ctx: RequestContext): Promise<SessionInfo> {
    return this.auth.sessionInfo(ctx);
  }

  @AnyContext()
  @Get('sessions')
  sessions(@Ctx() ctx: RequestContext) {
    return this.auth.listSessions(ctx.userId, ctx.sessionId);
  }

  @AnyContext()
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.auth.revokeSession(ctx.userId, id);
  }

  @AnyContext()
  @Post('sessions/revoke-others')
  async revokeOthers(@Ctx() ctx: RequestContext): Promise<{ revoked: number }> {
    return { revoked: await this.auth.revokeOtherSessions(ctx.userId, ctx.sessionId) };
  }

  @AnyContext()
  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(@Ctx() ctx: RequestContext, @Body() dto: ChangePasswordDto): Promise<void> {
    return this.auth.changePassword(ctx, dto.currentPassword, dto.newPassword);
  }

  @Public()
  @Throttle({ default: { limit: Math.max(5, Math.floor(AUTH_LIMIT / 2)), ttl: 60_000 } })
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgot(@Body() dto: ResetRequestDto): Promise<{ message: string }> {
    await this.auth.requestReset(dto.email);
    return { message: 'Se o e-mail estiver cadastrado, enviaremos as instruções de redefinição.' };
  }

  @Public()
  @Throttle({ default: { limit: AUTH_LIMIT, ttl: 60_000 } })
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  reset(@Body() dto: ResetConfirmDto): Promise<void> {
    return this.auth.confirmReset(dto.token, dto.newPassword);
  }

  @AnyContext()
  @Post('mfa/setup')
  mfaSetup(@Ctx() ctx: RequestContext) {
    return this.auth.mfaSetup(ctx);
  }

  @AnyContext()
  @Post('mfa/enable')
  @HttpCode(HttpStatus.NO_CONTENT)
  mfaEnable(@Ctx() ctx: RequestContext, @Body() dto: MfaDto): Promise<void> {
    return this.auth.mfaEnable(ctx, dto.code);
  }

  @AnyContext()
  @Post('mfa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  mfaDisable(@Ctx() ctx: RequestContext, @Body() dto: MfaDisableDto): Promise<void> {
    return this.auth.mfaDisable(ctx, dto.password, dto.code);
  }
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: config.cookies.secure,
    // `strict` não serve: o app e a API ficam em subdomínios diferentes.
    sameSite: 'lax' as const,
    domain: config.cookies.domain,
    path: '/v1/auth',
    expires,
  };
}

function setRefreshCookie(response: Response, token: string, expires: Date): void {
  response.cookie(REFRESH_COOKIE, token, cookieOptions(expires));
}
