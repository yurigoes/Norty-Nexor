/**
 * Gerador pseudoaleatório determinístico.
 *
 * O MVP não persiste centenas de milhares de registros: ele os **reconstrói**
 * a partir de uma semente fixa a cada carregamento. Isso garante que o mesmo
 * condomínio fictício apareça sempre igual, mantém o localStorage livre para
 * armazenar apenas as alterações feitas durante a demonstração e torna o
 * dataset reproduzível em qualquer máquina.
 */
export class Rng {
  private state: number;

  constructor(seed: number | string) {
    let s = typeof seed === 'number' ? seed : 0;
    if (typeof seed === 'string') {
      for (let i = 0; i < seed.length; i += 1) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    }
    this.state = (s || 1) >>> 0;
  }

  next(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    this.state = x;
    return x / 0xffffffff;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min: number, max: number, decimals = 2): number {
    const v = this.next() * (max - min) + min;
    return Number(v.toFixed(decimals));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Escolhe com pesos: [[valor, peso], ...] */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.next() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    return entries[entries.length - 1][0];
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const out: T[] = [];
    for (let i = 0; i < count && pool.length; i += 1) {
      out.push(pool.splice(Math.floor(this.next() * pool.length), 1)[0]);
    }
    return out;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

/* ---------------- Pools de dados fictícios ---------------- */

export const FIRST_NAMES_M = [
  'Carlos', 'Rafael', 'Bruno', 'Eduardo', 'Marcelo', 'Felipe', 'Thiago', 'André', 'Gustavo', 'Rodrigo',
  'Leonardo', 'Diego', 'Vinícius', 'Lucas', 'Matheus', 'Fernando', 'Paulo', 'Ricardo', 'Alexandre', 'Daniel',
  'Henrique', 'Otávio', 'Renato', 'Sérgio', 'Fábio', 'Caio', 'Murilo', 'Igor', 'Danilo', 'Roberto',
  'Anderson', 'Wesley', 'Júlio', 'Emerson', 'Vitor', 'Adriano', 'Cauã', 'Enzo', 'Davi', 'Arthur',
];

export const FIRST_NAMES_F = [
  'Ana', 'Mariana', 'Juliana', 'Camila', 'Fernanda', 'Patrícia', 'Larissa', 'Beatriz', 'Carolina', 'Amanda',
  'Renata', 'Letícia', 'Gabriela', 'Bruna', 'Aline', 'Vanessa', 'Priscila', 'Tatiane', 'Débora', 'Cristina',
  'Luciana', 'Simone', 'Roberta', 'Isabela', 'Natália', 'Manuela', 'Helena', 'Sofia', 'Valentina', 'Clarice',
  'Elaine', 'Márcia', 'Sandra', 'Regina', 'Cláudia', 'Bianca', 'Yasmin', 'Raquel', 'Michele', 'Tainá',
];

export const SURNAMES = [
  'Almeida', 'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima',
  'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Rocha', 'Barbosa', 'Araújo', 'Cardoso', 'Nascimento',
  'Correia', 'Teixeira', 'Moreira', 'Azevedo', 'Cavalcanti', 'Monteiro', 'Mendes', 'Freitas', 'Batista', 'Dias',
  'Pinto', 'Machado', 'Fonseca', 'Nunes', 'Moraes', 'Campos', 'Duarte', 'Vieira', 'Ramos', 'Peixoto',
];

export const VEHICLES = [
  ['Volkswagen', 'Nivus'], ['Volkswagen', 'T-Cross'], ['Volkswagen', 'Polo'], ['Volkswagen', 'Virtus'],
  ['Chevrolet', 'Onix'], ['Chevrolet', 'Tracker'], ['Chevrolet', 'Spin'], ['Chevrolet', 'S10'],
  ['Fiat', 'Pulse'], ['Fiat', 'Argo'], ['Fiat', 'Toro'], ['Fiat', 'Mobi'],
  ['Toyota', 'Corolla'], ['Toyota', 'Corolla Cross'], ['Toyota', 'Yaris'], ['Toyota', 'Hilux'],
  ['Honda', 'HR-V'], ['Honda', 'City'], ['Honda', 'Civic'], ['Honda', 'CR-V'],
  ['Hyundai', 'Creta'], ['Hyundai', 'HB20'], ['Jeep', 'Compass'], ['Jeep', 'Renegade'],
  ['Renault', 'Kwid'], ['Renault', 'Duster'], ['Nissan', 'Kicks'], ['Ford', 'Ranger'],
  ['BYD', 'Dolphin'], ['BYD', 'Song Plus'], ['GWM', 'Haval H6'], ['Volvo', 'XC40'],
  ['BMW', '320i'], ['Mercedes-Benz', 'GLA 200'], ['Audi', 'Q3'], ['Peugeot', '208'],
] as const;

export const MOTORCYCLES = [
  ['Honda', 'CG 160'], ['Honda', 'PCX'], ['Yamaha', 'Fazer 250'], ['Yamaha', 'NMax'],
  ['Honda', 'Biz'], ['Shineray', 'Jet 50'],
] as const;

export const COLORS = ['Prata', 'Preto', 'Branco', 'Cinza', 'Vermelho', 'Azul', 'Grafite', 'Bege'];

export const CARRIERS = [
  'Mercado Livre', 'Amazon', 'Shopee', 'Correios', 'Magalu', 'iFood', 'Rappi', 'Loggi',
  'Jadlog', 'Total Express', 'Americanas', 'AliExpress', 'Farmácia Delivery', 'Sedex',
];

export const TICKET_CATEGORIES = [
  'Manutenção', 'Elétrica', 'Hidráulica', 'Limpeza', 'Elevadores', 'Jardinagem',
  'Portaria', 'Segurança', 'Infraestrutura', 'Áreas comuns',
];

export const TICKET_TITLES: Record<string, string[]> = {
  Manutenção: ['Lâmpada queimada no corredor', 'Porta do hall com folga', 'Fechadura emperrando', 'Piso solto na entrada'],
  Elétrica: ['Tomada sem energia', 'Disjuntor desarmando', 'Iluminação da garagem oscilando', 'Interfone sem sinal'],
  Hidráulica: ['Vazamento no subsolo', 'Infiltração na parede da garagem', 'Ralo entupido', 'Pressão baixa de água'],
  Limpeza: ['Lixeira do andar transbordando', 'Corredor com resíduos', 'Vidros do hall sujos', 'Limpeza pós-obra pendente'],
  Elevadores: ['Elevador social parado no 8º', 'Ruído anormal no elevador de serviço', 'Botão do 12º não acende', 'Porta demorando a fechar'],
  Jardinagem: ['Poda de árvore próxima à vaga', 'Grama alta na área de lazer', 'Irrigação com defeito'],
  Portaria: ['Cancela demorando a abrir', 'Interfone da guarita com ruído', 'Controle remoto sem função'],
  Segurança: ['Câmera do subsolo sem imagem', 'Portão de serviço sem travar', 'Sensor de presença desativado'],
  Infraestrutura: ['Rachadura na parede da rampa', 'Vazamento na caixa d’água', 'Sinalização de vaga apagada'],
  'Áreas comuns': ['Churrasqueira com grelha danificada', 'Equipamento da academia parado', 'Piscina com pH alterado'],
};

export const INCIDENT_TITLES: Record<string, string[]> = {
  barulho: ['Som alto após as 22h', 'Obra fora do horário permitido', 'Festa com ruído excessivo'],
  danos: ['Dano no portão da garagem', 'Risco na pintura do elevador', 'Vaso quebrado no hall'],
  acidente: ['Queda na área da piscina', 'Colisão leve na rampa da garagem', 'Escorregão no hall molhado'],
  seguranca: ['Portão aberto sem supervisão', 'Pessoa não identificada no subsolo', 'Tentativa de acesso sem autorização'],
  estrutural: ['Infiltração no teto da garagem', 'Trinca na parede da escada', 'Vazamento na prumada'],
  regras: ['Animal sem coleira na área comum', 'Uso de vaga de terceiros', 'Lixo fora do horário'],
  outros: ['Objeto esquecido na portaria', 'Veículo estacionado em local proibido'],
};

export const STAFF_ROLES_CONDO = [
  'Porteiro', 'Zelador', 'Auxiliar de limpeza', 'Jardineiro', 'Manutenção predial',
  'Supervisor de segurança', 'Recepcionista', 'Piscineiro',
];

export const STAFF_ROLES_UNIT = [
  'Funcionária doméstica', 'Diarista', 'Babá', 'Cuidador(a)', 'Motorista particular', 'Personal trainer',
];

export const SERVICE_COMPANIES = [
  'Elevalux Elevadores', 'HidroPrime Serviços', 'Verde Vivo Paisagismo', 'CleanMax Facilities',
  'SegurPro Sistemas', 'Clima Ideal Refrigeração', 'Alpha Dedetizadora', 'FixPredial Manutenção',
];

export const EXPENSE_CATEGORIES = [
  'Folha de pagamento', 'Energia elétrica', 'Água e esgoto', 'Manutenção predial', 'Limpeza e conservação',
  'Segurança', 'Elevadores', 'Seguro predial', 'Administração', 'Jardinagem', 'Materiais', 'Internet e telefonia',
];

export const REVENUE_CATEGORIES = [
  'Taxa condominial', 'Fundo de reserva', 'Reserva de áreas comuns', 'Multas e juros',
  'Receita de estacionamento', 'Rendimento de aplicações',
];

/* ---------------- Fábricas utilitárias ---------------- */

export function fullName(rng: Rng): string {
  const first = rng.bool() ? rng.pick(FIRST_NAMES_M) : rng.pick(FIRST_NAMES_F);
  const middle = rng.bool(0.45) ? ` ${rng.pick(SURNAMES)}` : '';
  return `${first}${middle} ${rng.pick(SURNAMES)}`;
}

export function cpf(rng: Rng): string {
  const d = () => rng.int(0, 9);
  return `${d()}${d()}${d()}.${d()}${d()}${d()}.${d()}${d()}${d()}-${d()}${d()}`;
}

export function phone(rng: Rng): string {
  return `(11) 9${rng.int(1000, 9999)}-${rng.int(1000, 9999)}`;
}

/** Placa no padrão Mercosul: ABC1D23 */
export function plate(rng: Rng): string {
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const l = () => L[rng.int(0, 25)];
  return `${l()}${l()}${l()}${rng.int(0, 9)}${l()}${rng.int(0, 9)}${rng.int(0, 9)}`;
}

export function email(name: string, index: number): string {
  const clean = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, '')
    .split(' ')
    .filter(Boolean);
  const domain = ['gmail.com', 'outlook.com', 'hotmail.com', 'uol.com.br', 'icloud.com'][index % 5];
  return `${clean[0]}.${clean[clean.length - 1]}${index % 7 === 0 ? index : ''}@${domain}`;
}

export function shortCode(rng: Rng, prefix = ''): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += chars[rng.int(0, chars.length - 1)];
  return prefix ? `${prefix}-${out}` : out;
}

/* ---------------- Profissionais recomendados ---------------- */

export const PROFESSIONAL_CATALOG: Record<string, { roles: string[]; specialties: string[]; suffixes: string[] }> = {
  eletrica: {
    roles: ['Eletricista', 'Eletricista predial', 'Técnico eletricista'],
    specialties: ['Quadro de distribuição', 'Tomadas e interruptores', 'Iluminação', 'Chuveiro elétrico', 'Aterramento', 'Automação residencial'],
    suffixes: ['Elétrica', 'Energia', 'Instalações'],
  },
  hidraulica: {
    roles: ['Encanador', 'Bombeiro hidráulico'],
    specialties: ['Vazamentos', 'Desentupimento', 'Troca de registro', 'Caixa acoplada', 'Instalação de filtro', 'Detecção de infiltração'],
    suffixes: ['Hidráulica', 'Águas', 'Reparos'],
  },
  reformas: {
    roles: ['Pedreiro', 'Mestre de obras', 'Gesseiro'],
    specialties: ['Pequenos reparos', 'Revestimentos', 'Drywall', 'Rejunte', 'Impermeabilização', 'Forro de gesso'],
    suffixes: ['Reformas', 'Construções', 'Acabamentos'],
  },
  limpeza: {
    roles: ['Diarista', 'Auxiliar de limpeza', 'Limpeza pós-obra'],
    specialties: ['Limpeza pesada', 'Pós-obra', 'Vidros e fachadas internas', 'Estofados', 'Organização'],
    suffixes: ['Limpeza', 'Clean', 'Serviços'],
  },
  climatizacao: {
    roles: ['Técnico em refrigeração', 'Instalador de ar-condicionado'],
    specialties: ['Instalação split', 'Higienização', 'Carga de gás', 'Manutenção preventiva'],
    suffixes: ['Climatização', 'Refrigeração', 'Clima'],
  },
  montagem: {
    roles: ['Montador de móveis', 'Marceneiro'],
    specialties: ['Montagem e desmontagem', 'Fixação em parede', 'Ajustes de portas', 'Móveis planejados'],
    suffixes: ['Montagens', 'Marcenaria', 'Móveis'],
  },
  chaveiro: {
    roles: ['Chaveiro', 'Técnico em fechaduras'],
    specialties: ['Abertura de portas', 'Troca de segredo', 'Fechadura digital', 'Cópia de chaves', 'Atendimento 24h'],
    suffixes: ['Chaves', 'Segurança', 'Fechaduras'],
  },
  pintura: {
    roles: ['Pintor', 'Pintor residencial'],
    specialties: ['Pintura interna', 'Textura', 'Massa corrida', 'Grafiato', 'Pequenos retoques'],
    suffixes: ['Pinturas', 'Cores', 'Acabamentos'],
  },
  tecnologia: {
    roles: ['Técnico em informática', 'Instalador de redes'],
    specialties: ['Wi-Fi e roteadores', 'Cabeamento de rede', 'Instalação de TV', 'Suporte a computadores', 'Câmeras residenciais'],
    suffixes: ['Tech', 'Redes', 'Informática'],
  },
  jardinagem: {
    roles: ['Jardineiro', 'Paisagista'],
    specialties: ['Poda', 'Jardim de inverno', 'Vasos e floreiras', 'Irrigação'],
    suffixes: ['Paisagismo', 'Jardins', 'Verde'],
  },
  pet: {
    roles: ['Pet sitter', 'Adestrador', 'Banho e tosa a domicílio'],
    specialties: ['Passeio diário', 'Hospedagem', 'Adestramento básico', 'Banho e tosa'],
    suffixes: ['Pet', 'Patas', 'Amigo Fiel'],
  },
  aulas: {
    roles: ['Professor particular', 'Personal trainer', 'Professor de natação'],
    specialties: ['Reforço escolar', 'Inglês', 'Musculação', 'Natação infantil', 'Pilates'],
    suffixes: ['Educação', 'Performance', 'Aulas'],
  },
  mudancas: {
    roles: ['Carreto e mudanças', 'Transportador'],
    specialties: ['Mudança residencial', 'Frete pequeno', 'Içamento', 'Embalagem'],
    suffixes: ['Mudanças', 'Transportes', 'Fretes'],
  },
  dedetizacao: {
    roles: ['Dedetizador', 'Controlador de pragas'],
    specialties: ['Dedetização', 'Descupinização', 'Controle de roedores', 'Sanitização'],
    suffixes: ['Controle de Pragas', 'Sanitização', 'Ambiental'],
  },
};

export const REVIEW_COMMENTS_GOOD = [
  'Chegou no horário combinado e resolveu na primeira visita.',
  'Trabalho caprichado e preço justo. Deixou tudo limpo ao sair.',
  'Muito atencioso, explicou o problema antes de começar.',
  'Atendeu no mesmo dia. Recomendo sem ressalvas.',
  'Profissional educado e pontual. Já é a terceira vez que chamo.',
  'Resolveu um problema que outros dois não conseguiram.',
  'Orçamento claro, sem surpresa no valor final.',
  'Ótimo acabamento. A portaria já conhece, entrou sem burocracia.',
  'Rápido e organizado. Voltaria a contratar.',
  'Preço acima da média, mas o serviço compensou.',
];

export const REVIEW_COMMENTS_MIXED = [
  'Serviço bem feito, mas atrasou cerca de uma hora.',
  'Resolveu o problema. A comunicação por mensagem poderia ser melhor.',
  'Bom trabalho, embora tenha precisado voltar para um ajuste.',
  'Atendeu bem, só achei o orçamento um pouco alto.',
];

export const SERVICE_REQUEST_SUBJECTS = [
  'Troca de tomadas da sala', 'Vazamento embaixo da pia', 'Instalação de ar-condicionado no quarto',
  'Montagem de armário planejado', 'Pintura da sala e do corredor', 'Limpeza pós-obra',
  'Instalação de fechadura digital', 'Configuração da rede Wi-Fi', 'Poda das plantas da varanda',
  'Higienização do ar-condicionado', 'Reparo no rejunte do banheiro', 'Passeio diário com o cachorro',
];
