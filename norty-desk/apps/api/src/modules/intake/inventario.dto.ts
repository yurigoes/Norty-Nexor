import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ASSET_KINDS } from '@norty-desk/shared';

/**
 * O que o agente manda.
 *
 * Tudo opcional menos `uuid` e `hostname`: máquina velha não responde a
 * metade das consultas do CIM, e recusar a varredura inteira por causa
 * de um pente de memória sem série deixaria justamente as máquinas que
 * mais interessam fora do inventário.
 *
 * `forbidNonWhitelisted` está ligado na aplicação, então campo
 * desconhecido é erro — o que é bom aqui: agente novo mandando campo
 * que a API não conhece falha alto, em vez de gravar metade.
 */
class SistemaDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string | null;
  @IsOptional() @IsString() @MaxLength(80) version?: string | null;
}

class AgenteDto {
  @IsOptional() @IsString() @MaxLength(40) versao?: string | null;
}

class ProcessadorDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) nucleos?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) threads?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) frequencia?: number | null;
  @IsOptional() @IsString() @MaxLength(40) arquitetura?: string | null;
}

class MemoriaDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(120) serialNumber?: string | null;
  /** MB. Ver a ficha do componente em `packages/shared`. */
  @Type(() => Number) @IsInt() @Min(1) capacidade!: number;
  @IsOptional() @IsString() @MaxLength(40) tecnologia?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) frequencia?: number | null;
  @IsOptional() @IsString() @MaxLength(80) slot?: string | null;
}

class DiscoDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(120) serialNumber?: string | null;
  /** GB. */
  @Type(() => Number) @IsInt() @Min(1) capacidade!: number;
  @IsOptional() @IsString() @MaxLength(40) tecnologia?: string | null;
  @IsOptional() @IsString() @MaxLength(40) interface?: string | null;
}

/**
 * Um endereço encontrado na placa.
 *
 * `dhcp` decide o destino dele, e é a única coisa que importa aqui:
 * endereço emprestado é instantâneo, endereço fixo é cadastro.
 */
class EnderecoDeRedeDto {
  @IsString() @MinLength(7) @MaxLength(45) endereco!: string;
  @IsOptional() @IsBoolean() dhcp?: boolean;
}

/**
 * Uma placa de rede da máquina.
 *
 * O MAC é a identidade, e não o nome: "Ethernet" é o nome de metade das
 * placas do parque, e a mesma placa USB passa de máquina em máquina com
 * o mesmo MAC. Placa sem MAC ainda entra — pelo nome, dentro da
 * máquina —, porque máquina virtual e placa velha nem sempre respondem.
 */
class PortaDeRedeDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(40) mac?: string | null;
  /** Mbps. 400 Gb/s é o teto de placa que existe para comprar. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(400_000) velocidadeMbps?: number | null;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EnderecoDeRedeDto)
  enderecos?: EnderecoDeRedeDto[];
}

export class InventarioDto {
  @IsString() @MinLength(8) @MaxLength(120) uuid!: string;
  @IsString() @MinLength(1) @MaxLength(120) hostname!: string;

  @IsOptional() @IsString() @MaxLength(120) serialNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(160) manufacturer?: string | null;
  @IsOptional() @IsString() @MaxLength(160) model?: string | null;
  @IsOptional() @IsIn(ASSET_KINDS) kind?: (typeof ASSET_KINDS)[number];

  @IsOptional() @ValidateNested() @Type(() => SistemaDto) os?: SistemaDto;
  @IsOptional() @ValidateNested() @Type(() => AgenteDto) agente?: AgenteDto;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ProcessadorDto)
  processadores?: ProcessadorDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MemoriaDto)
  memorias?: MemoriaDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DiscoDto)
  discos?: DiscoDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PortaDeRedeDto)
  portas?: PortaDeRedeDto[];
}
