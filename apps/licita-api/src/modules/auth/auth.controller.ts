import {
  Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CadastrarDto, EmailDto, EntrarDto, RedefinirDto, TokenDto } from './dto';
import { Publica, Usuario } from '../../common/decorators';
import type { UsuarioRequisicao } from '../../common/types';
import { carregarConfig } from '../../config/env';

const config = carregarConfig();
const COOKIE_REFRESH = 'licita_refresh';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Cadastro é o alvo mais óbvio de abuso numa página pública:
   * limite apertado por IP. Cinco tentativas em dez minutos não
   * incomoda quem está criando uma conta e inviabiliza quem está
   * criando mil.
   */
  @Post('cadastrar')
  @Publica()
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  cadastrar(@Body() dto: CadastrarDto) {
    return this.auth.cadastrar(dto);
  }

  @Post('confirmar')
  @Publica()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  confirmar(@Body() dto: TokenDto) {
    return this.auth.confirmarEmail(dto.token);
  }

  @Post('reenviar-confirmacao')
  @Publica()
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  reenviar(@Body() dto: EmailDto) {
    return this.auth.reenviarConfirmacao(dto.email);
  }

  @Post('entrar')
  @Publica()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  async entrar(
    @Body() dto: EntrarDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, refreshExpiraEm, ...resposta } = await this.auth.entrar(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    gravarCookie(res, refreshToken, refreshExpiraEm);
    return resposta;
  }

  /**
   * O refresh token nunca aparece no corpo da resposta: ele viaja
   * em cookie httpOnly, fora do alcance de JavaScript. Um XSS
   * consegue ler o access token de 15 minutos, mas não o que
   * renova a sessão por 30 dias.
   */
  @Post('renovar')
  @Publica()
  @HttpCode(200)
  async renovar(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const bruto = req.cookies?.[COOKIE_REFRESH];
    if (!bruto) throw new UnauthorizedException('Sessão não encontrada. Entre novamente.');

    const { refreshToken, refreshExpiraEm, ...resposta } = await this.auth.renovar(bruto);
    gravarCookie(res, refreshToken, refreshExpiraEm);
    return resposta;
  }

  @Post('sair')
  @HttpCode(204)
  async sair(@Usuario() usuario: UsuarioRequisicao, @Res({ passthrough: true }) res: Response) {
    await this.auth.sair(usuario.sessaoId);
    res.clearCookie(COOKIE_REFRESH, { path: '/', domain: config.cookie.dominio });
  }

  @Post('sair-de-tudo')
  @HttpCode(200)
  async sairDeTudo(
    @Usuario() usuario: UsuarioRequisicao,
    @Res({ passthrough: true }) res: Response,
  ) {
    const resultado = await this.auth.sairDeTudo(usuario.id);
    res.clearCookie(COOKIE_REFRESH, { path: '/', domain: config.cookie.dominio });
    return resultado;
  }

  @Post('esqueci-senha')
  @Publica()
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  esqueci(@Body() dto: EmailDto) {
    return this.auth.pedirRedefinicao(dto.email);
  }

  @Post('redefinir-senha')
  @Publica()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  redefinir(@Body() dto: RedefinirDto) {
    return this.auth.redefinirSenha(dto);
  }

  /** Quem sou eu — usado pelo cliente ao recarregar a página. */
  @Get('eu')
  eu(@Usuario() usuario: UsuarioRequisicao) {
    return usuario;
  }
}

function gravarCookie(res: Response, token: string, expiraEm: Date): void {
  res.cookie(COOKIE_REFRESH, token, {
    httpOnly: true,
    secure: config.cookie.seguro,
    // `strict` recusaria o cookie numa navegação vinda de fora, o
    // que quebraria o retorno do link de confirmação por e-mail.
    sameSite: 'lax',
    domain: config.cookie.dominio,
    path: '/',
    expires: expiraEm,
  });
}
