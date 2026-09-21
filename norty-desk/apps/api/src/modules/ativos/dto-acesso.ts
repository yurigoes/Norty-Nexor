import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { REMOTE_ACCESS_KINDS, type RemoteAccessKind } from '@norty-desk/shared';

export class EscreverAcessoRemotoDto {
  @IsOptional() @IsString() @MaxLength(45) tailscaleIp?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) vpnNotes?: string | null;
  @IsOptional() @IsEnum(REMOTE_ACCESS_KINDS) remoteAccessKind?: RemoteAccessKind | null;
  @IsOptional() @IsString() @MaxLength(120) remoteAccessId?: string | null;

  /** Omitir mantém a senha atual; `null` apaga. Ver o serviço. */
  @IsOptional() @IsString() @MaxLength(200) remoteAccessSecret?: string | null;
}
