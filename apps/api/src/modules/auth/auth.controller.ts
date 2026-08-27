import {
  Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { LoginResponse, SessionResponse } from '@myhome/shared';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './dto';
import { CondominiumId, CurrentUser, Public } from '../../common/decorators';
import { loadConfig } from '../../config/env';
import type { RequestUser } from '../../common/types';

const config = loadConfig();
const REFRESH_COOKIE = 'myhome_refresh';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Limite apertado: o login é o alvo natural de força bruta, e a
   * restrição por IP é a defesa que não depende do usuário ter
   * escolhido uma senha boa.
   */
  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.auth.login(dto.email, dto.password, describeDevice(request));
    setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
    return result.response;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const token = request.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException('Sessão não encontrada.');

    const result = await this.auth.refresh(token);
    setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken, expiresIn: result.expiresIn };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    const sessionId = (request as Request & { sessionId?: string }).sessionId;
    if (sessionId) await this.auth.logout(sessionId);
    response.clearCookie(REFRESH_COOKIE, cookieOptions(new Date(0)));
  }

  @Get('session')
  session(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
  ): Promise<SessionResponse> {
    return this.auth.session(user.id, condominiumId);
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: RequestUser,
    @Req() request: Request,
  ): Promise<void> {
    const sessionId = (request as Request & { sessionId?: string }).sessionId ?? '';
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword, sessionId);
  }
}

/* ---------------- Cookie do refresh token ---------------- */

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    // Em produção o cookie só viaja em HTTPS; `SameSite=lax` permite a
    // navegação normal entre myhome e api-myhome no mesmo domínio raiz.
    secure: config.cookies.secure,
    sameSite: 'lax' as const,
    domain: config.cookies.domain,
    path: '/',
    expires,
  };
}

function setRefreshCookie(response: Response, token: string, expires: Date): void {
  response.cookie(REFRESH_COOKIE, token, cookieOptions(expires));
}

function describeDevice(request: Request) {
  const agent = request.headers['user-agent'] ?? '';
  return {
    device: detectDevice(agent),
    browser: detectBrowser(agent),
    location: (request.headers['x-client-location'] as string) ?? 'Desconhecido',
    ip: request.ip,
  };
}

function detectDevice(agent: string): string {
  if (/iPhone/i.test(agent)) return 'iPhone';
  if (/iPad/i.test(agent)) return 'iPad';
  if (/Android/i.test(agent)) return 'Android';
  if (/Macintosh/i.test(agent)) return 'Mac';
  if (/Windows/i.test(agent)) return 'Windows';
  if (/Linux/i.test(agent)) return 'Linux';
  return 'Dispositivo';
}

function detectBrowser(agent: string): string {
  if (/Edg\//i.test(agent)) return 'Edge';
  if (/Chrome\//i.test(agent) && !/Chromium/i.test(agent)) return 'Chrome';
  if (/Safari\//i.test(agent) && !/Chrome/i.test(agent)) return 'Safari';
  if (/Firefox\//i.test(agent)) return 'Firefox';
  return 'Navegador';
}
