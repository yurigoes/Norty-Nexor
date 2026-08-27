/* =========================================================
   LICITA+ — Dados de demonstração
   ---------------------------------------------------------
   Fictícios, montados para parecerem plausíveis: órgãos que
   existem, modalidades da Lei 14.133, valores e prazos
   coerentes entre si.

   Nada aqui é licitação real, e a interface diz isso em tela.
   Um protótipo comercial que insinua dado real cria
   expectativa que o produto ainda não pode cumprir.

   As datas são relativas ao momento em que o arquivo carrega,
   então a demonstração nunca aparece com tudo vencido.
   ========================================================= */

const HOJE = new Date();

/** Data deslocada em dias a partir de hoje, em ISO curto. */
function dia(offset, hora = 9) {
  const d = new Date(HOJE);
  d.setDate(d.getDate() + offset);
  d.setHours(hora, 0, 0, 0);
  return d.toISOString();
}

export const empresa = {
  razaoSocial: 'Yuri Comércio e Serviços de Tecnologia LTDA',
  nomeFantasia: 'Nexor Suprimentos',
  cnpj: '32874100000159',
  porte: 'epp',
  segmento: 'Comércio varejista e serviços de TI',
  cidade: 'Salvador',
  uf: 'BA',
  fundacao: '2021-03-14',
  cnaes: [
    { codigo: '4751-2/01', descricao: 'Comércio varejista especializado de equipamentos de informática', principal: true },
    { codigo: '6209-1/00', descricao: 'Suporte técnico, manutenção e outros serviços em TI', principal: false },
    { codigo: '4649-4/08', descricao: 'Comércio atacadista de produtos de higiene, limpeza e conservação', principal: false },
  ],
  estadosAtuacao: ['BA', 'SE', 'PE'],
  produtos: ['Notebooks', 'Desktops', 'Monitores', 'Impressoras', 'Nobreaks', 'Periféricos', 'Toner e cartucho'],
  servicos: ['Suporte técnico', 'Manutenção preventiva', 'Instalação de rede', 'Licenciamento de software'],
  faixaMin: 20000,
  faixaMax: 400000,
  modalidades: ['Pregão Eletrônico', 'Dispensa Eletrônica', 'Credenciamento'],
  perfilCompleto: 92,
  usuario: { nome: 'Yuri Góes', cargo: 'Sócio-administrador', email: 'yuri@nexorsuprimentos.com.br' },
};

export const orgaos = [
  { id: 'org-1', nome: 'Prefeitura Municipal de Salvador', sigla: 'PMS', cidade: 'Salvador', uf: 'BA', esfera: 'Municipal' },
  { id: 'org-2', nome: 'Governo do Estado da Bahia — SAEB', sigla: 'SAEB', cidade: 'Salvador', uf: 'BA', esfera: 'Estadual' },
  { id: 'org-3', nome: 'Universidade Federal da Bahia', sigla: 'UFBA', cidade: 'Salvador', uf: 'BA', esfera: 'Federal' },
  { id: 'org-4', nome: 'Câmara Municipal de Feira de Santana', sigla: 'CMFS', cidade: 'Feira de Santana', uf: 'BA', esfera: 'Municipal' },
  { id: 'org-5', nome: 'Hospital Geral Roberto Santos', sigla: 'HGRS', cidade: 'Salvador', uf: 'BA', esfera: 'Estadual' },
  { id: 'org-6', nome: 'Secretaria Municipal de Educação de Camaçari', sigla: 'SEDUC', cidade: 'Camaçari', uf: 'BA', esfera: 'Municipal' },
  { id: 'org-7', nome: 'Instituto Federal de Sergipe', sigla: 'IFS', cidade: 'Aracaju', uf: 'SE', esfera: 'Federal' },
  { id: 'org-8', nome: 'Prefeitura Municipal de Lauro de Freitas', sigla: 'PMLF', cidade: 'Lauro de Freitas', uf: 'BA', esfera: 'Municipal' },
  { id: 'org-9', nome: 'Tribunal de Justiça do Estado da Bahia', sigla: 'TJBA', cidade: 'Salvador', uf: 'BA', esfera: 'Estadual' },
  { id: 'org-10', nome: 'Prefeitura Municipal do Recife', sigla: 'PMR', cidade: 'Recife', uf: 'PE', esfera: 'Municipal' },
];

const porId = Object.fromEntries(orgaos.map((o) => [o.id, o]));

export const categorias = [
  'Equipamentos de informática',
  'Serviços de TI',
  'Material de expediente',
  'Manutenção predial',
  'Material de limpeza',
  'Mobiliário',
  'Equipamentos médicos',
];

export const modalidades = [
  'Pregão Eletrônico',
  'Dispensa Eletrônica',
  'Concorrência Eletrônica',
  'Credenciamento',
  'Inexigibilidade',
];

/**
 * Cada razão traz `peso`: é ele que compõe o percentual e o
 * que a tela de detalhe mostra. Compatibilidade sem
 * justificativa é número mágico — o usuário precisa poder
 * discordar do critério, e para discordar precisa vê-lo.
 */
function razoes({ cnae, segmento, regiao, valor, produtos, historico, prazo }) {
  return [
    { chave: 'cnae', titulo: 'CNAE compatível', peso: 22, ok: cnae, detalhe: cnae ? '4751-2/01 — comércio de equipamentos de informática' : 'Nenhum CNAE seu cobre este objeto' },
    { chave: 'segmento', titulo: 'Segmento compatível', peso: 18, ok: segmento, detalhe: segmento ? 'Comércio varejista e serviços de TI' : 'Objeto fora do seu segmento declarado' },
    { chave: 'regiao', titulo: 'Região de atuação', peso: 16, ok: regiao, detalhe: regiao ? 'Dentro dos estados em que você atua' : 'Fora dos estados declarados no seu perfil' },
    { chave: 'valor', titulo: 'Faixa de valor adequada', peso: 14, ok: valor, detalhe: valor ? 'Dentro da faixa que seu caixa comporta' : 'Acima da faixa declarada no perfil' },
    { chave: 'produtos', titulo: 'Produtos e serviços compatíveis', peso: 16, ok: produtos, detalhe: produtos ? 'Itens do edital batem com seu catálogo' : 'Poucos itens batem com o seu catálogo' },
    { chave: 'historico', titulo: 'Histórico de participação', peso: 8, ok: historico, detalhe: historico ? 'Você já participou de certames deste órgão' : 'Primeira vez com este órgão' },
    { chave: 'prazo', titulo: 'Prazo adequado', peso: 6, ok: prazo, detalhe: prazo ? 'Tempo suficiente para montar a proposta' : 'Prazo curto para o seu tempo de preparo' },
  ];
}

const calcularScore = (lista) =>
  Math.round(lista.reduce((soma, r) => soma + (r.ok ? r.peso : 0), 0));

function criar(dados) {
  const lista = razoes(dados.razoes);
  return {
    ...dados,
    orgao: porId[dados.orgaoId],
    razoes: lista,
    compatibilidade: calcularScore(lista),
  };
}

export const licitacoes = [
  criar({
    id: 'LIC-2026-0007',
    objeto: 'Aquisição de equipamentos de informática — notebooks, monitores e nobreaks para as unidades escolares',
    orgaoId: 'org-1',
    modalidade: 'Pregão Eletrônico',
    categoria: 'Equipamentos de informática',
    numero: '090/2026',
    processo: '2026.0114.0873-PG',
    valor: 185400,
    abertura: dia(-4),
    encerramento: dia(6, 14),
    situacao: 'Recebendo propostas',
    plataforma: 'Compras.gov.br',
    srp: false,
    resumo:
      'Aquisição de 120 notebooks, 90 monitores de 24 polegadas e 60 nobreaks de 1200VA, com entrega parcelada em até 45 dias e garantia mínima de 36 meses on-site. O edital reserva cota de 25% para ME e EPP e exige atestado de capacidade técnica compatível com 50% do quantitativo.',
    razoes: { cnae: true, segmento: true, regiao: true, valor: true, produtos: true, historico: true, prazo: true },
    itens: [
      { n: 1, descricao: 'Notebook 15,6" — i5, 16 GB RAM, SSD 512 GB', qtd: 120, un: 'un', unitario: 4200 },
      { n: 2, descricao: 'Monitor LED 24" Full HD, entrada HDMI', qtd: 90, un: 'un', unitario: 890 },
      { n: 3, descricao: 'Nobreak 1200VA bivolt, 6 tomadas', qtd: 60, un: 'un', unitario: 780 },
    ],
    documentos: [
      { nome: 'Edital completo', tipo: 'Edital', tamanho: '2,4 MB', paginas: 68 },
      { nome: 'Termo de referência', tipo: 'Anexo I', tamanho: '890 KB', paginas: 22 },
      { nome: 'Planilha de composição de preços', tipo: 'Anexo II', tamanho: '124 KB', paginas: 3 },
      { nome: 'Minuta do contrato', tipo: 'Anexo III', tamanho: '410 KB', paginas: 14 },
    ],
  }),

  criar({
    id: 'LIC-2026-0012',
    objeto: 'Contratação de serviços de suporte técnico e manutenção preventiva de parque computacional',
    orgaoId: 'org-2',
    modalidade: 'Pregão Eletrônico',
    categoria: 'Serviços de TI',
    numero: '044/2026',
    processo: '0200.2026.0004412',
    valor: 342000,
    abertura: dia(-9),
    encerramento: dia(11, 10),
    situacao: 'Recebendo propostas',
    plataforma: 'Compras.gov.br',
    srp: false,
    resumo:
      'Serviço continuado de suporte técnico presencial e remoto para 1.400 estações, com atendimento em nível 1 e 2, SLA de 4 horas para chamados críticos e vigência de 12 meses prorrogáveis. Exige equipe mínima de 6 técnicos certificados e posto fixo na sede.',
    razoes: { cnae: true, segmento: true, regiao: true, valor: true, produtos: true, historico: false, prazo: true },
    itens: [
      { n: 1, descricao: 'Posto de suporte técnico nível 1 — 8h/dia', qtd: 4, un: 'posto/mês', unitario: 5400 },
      { n: 2, descricao: 'Posto de suporte técnico nível 2 — 8h/dia', qtd: 2, un: 'posto/mês', unitario: 7800 },
      { n: 3, descricao: 'Manutenção preventiva por estação', qtd: 1400, un: 'un/ano', unitario: 42 },
    ],
    documentos: [
      { nome: 'Edital completo', tipo: 'Edital', tamanho: '3,1 MB', paginas: 84 },
      { nome: 'Termo de referência', tipo: 'Anexo I', tamanho: '1,2 MB', paginas: 31 },
      { nome: 'Acordo de nível de serviço', tipo: 'Anexo IV', tamanho: '260 KB', paginas: 8 },
    ],
  }),

  criar({
    id: 'LIC-2026-0018',
    objeto: 'Registro de preços para aquisição de material de expediente e papel A4',
    orgaoId: 'org-4',
    modalidade: 'Pregão Eletrônico',
    categoria: 'Material de expediente',
    numero: '012/2026',
    processo: 'CMFS-2026-00231',
    valor: 78500,
    abertura: dia(-2),
    encerramento: dia(2, 9),
    situacao: 'Recebendo propostas',
    plataforma: 'Licitações-e',
    srp: true,
    resumo:
      'Sistema de registro de preços com vigência de 12 meses para fornecimento parcelado de material de expediente. Itens de baixo valor unitário e alta rotatividade, com entrega em até 10 dias corridos após cada ordem de fornecimento.',
    razoes: { cnae: false, segmento: true, regiao: true, valor: true, produtos: true, historico: false, prazo: false },
    itens: [
      { n: 1, descricao: 'Papel A4 75g — resma 500 folhas', qtd: 3000, un: 'resma', unitario: 19.9 },
      { n: 2, descricao: 'Caneta esferográfica azul', qtd: 8000, un: 'un', unitario: 1.15 },
      { n: 3, descricao: 'Toner compatível — impressora laser mono', qtd: 240, un: 'un', unitario: 68 },
    ],
    documentos: [
      { nome: 'Edital completo', tipo: 'Edital', tamanho: '1,6 MB', paginas: 42 },
      { nome: 'Termo de referência', tipo: 'Anexo I', tamanho: '520 KB', paginas: 12 },
    ],
  }),

  criar({
    id: 'LIC-2026-0023',
    objeto: 'Aquisição de licenças de software de gestão acadêmica com suporte e treinamento',
    orgaoId: 'org-3',
    modalidade: 'Dispensa Eletrônica',
    categoria: 'Serviços de TI',
    numero: '2026/00871',
    processo: '23066.008712/2026-14',
    valor: 58900,
    abertura: dia(-1),
    encerramento: dia(3, 17),
    situacao: 'Recebendo propostas',
    plataforma: 'Compras.gov.br',
    srp: false,
    resumo:
      'Licenciamento anual de solução de gestão acadêmica para 2.000 usuários, incluindo migração de dados, treinamento de 40 horas e suporte durante a vigência. Contratação por dispensa, com prazo curto de propostas.',
    razoes: { cnae: true, segmento: true, regiao: true, valor: true, produtos: true, historico: false, prazo: false },
    itens: [
      { n: 1, descricao: 'Licença anual — gestão acadêmica, 2.000 usuários', qtd: 1, un: 'licença/ano', unitario: 44000 },
      { n: 2, descricao: 'Treinamento presencial — 40 horas', qtd: 1, un: 'serviço', unitario: 9800 },
      { n: 3, descricao: 'Migração de base de dados', qtd: 1, un: 'serviço', unitario: 5100 },
    ],
    documentos: [
      { nome: 'Aviso de dispensa', tipo: 'Aviso', tamanho: '340 KB', paginas: 6 },
      { nome: 'Termo de referência', tipo: 'Anexo I', tamanho: '780 KB', paginas: 18 },
    ],
  }),

  criar({
    id: 'LIC-2026-0031',
    objeto: 'Contratação de empresa para manutenção predial preventiva e corretiva das unidades administrativas',
    orgaoId: 'org-8',
    modalidade: 'Concorrência Eletrônica',
    categoria: 'Manutenção predial',
    numero: '007/2026',
    processo: 'PMLF-2026-1188',
    valor: 1240000,
    abertura: dia(-14),
    encerramento: dia(18, 10),
    situacao: 'Recebendo propostas',
    plataforma: 'Portal de Compras Públicas',
    srp: false,
    resumo:
      'Manutenção predial com equipe residente para 22 unidades, incluindo elétrica, hidráulica, alvenaria e climatização. Exige engenheiro responsável, registro no CREA e atestado de obra de porte equivalente.',
    razoes: { cnae: false, segmento: false, regiao: true, valor: false, produtos: false, historico: false, prazo: true },
    itens: [
      { n: 1, descricao: 'Equipe residente de manutenção — 12 meses', qtd: 12, un: 'mês', unitario: 78000 },
      { n: 2, descricao: 'Materiais de reposição — verba estimada', qtd: 1, un: 'verba', unitario: 304000 },
    ],
    documentos: [
      { nome: 'Edital completo', tipo: 'Edital', tamanho: '5,8 MB', paginas: 142 },
      { nome: 'Planilha orçamentária', tipo: 'Anexo II', tamanho: '2,1 MB', paginas: 46 },
    ],
  }),

  criar({
    id: 'LIC-2026-0034',
    objeto: 'Aquisição de mobiliário corporativo — mesas, cadeiras e armários para salas administrativas',
    orgaoId: 'org-9',
    modalidade: 'Pregão Eletrônico',
    categoria: 'Mobiliário',
    numero: '061/2026',
    processo: 'TJ-ADM-2026/0442',
    valor: 268000,
    abertura: dia(-6),
    encerramento: dia(9, 14),
    situacao: 'Recebendo propostas',
    plataforma: 'Licitações-e',
    srp: true,
    resumo:
      'Registro de preços para mobiliário corporativo com certificação ABNT NBR 13966, entrega montada e garantia de 5 anos. Amostra obrigatória para os itens 1 e 3 antes da homologação.',
    razoes: { cnae: false, segmento: false, regiao: true, valor: true, produtos: false, historico: true, prazo: true },
    itens: [
      { n: 1, descricao: 'Mesa em L 1,60 × 1,40 m com gaveteiro', qtd: 180, un: 'un', unitario: 940 },
      { n: 2, descricao: 'Cadeira giratória ergonômica com braços', qtd: 240, un: 'un', unitario: 690 },
      { n: 3, descricao: 'Armário alto 2 portas 1,60 m', qtd: 90, un: 'un', unitario: 780 },
    ],
    documentos: [
      { nome: 'Edital completo', tipo: 'Edital', tamanho: '2,9 MB', paginas: 76 },
      { nome: 'Termo de referência', tipo: 'Anexo I', tamanho: '1,1 MB', paginas: 28 },
    ],
  }),

  criar({
    id: 'LIC-2026-0040',
    objeto: 'Aquisição de material de limpeza e higienização para unidades de saúde',
    orgaoId: 'org-5',
    modalidade: 'Pregão Eletrônico',
    categoria: 'Material de limpeza',
    numero: '028/2026',
    processo: 'HGRS-2026-0771',
    valor: 96300,
    abertura: dia(-3),
    encerramento: dia(8, 9),
    situacao: 'Recebendo propostas',
    plataforma: 'Compras.gov.br',
    srp: true,
    resumo:
      'Fornecimento parcelado de material de limpeza hospitalar com registro na ANVISA para os itens saneantes. Entrega quinzenal conforme cronograma da unidade.',
    razoes: { cnae: true, segmento: false, regiao: true, valor: true, produtos: false, historico: false, prazo: true },
    itens: [
      { n: 1, descricao: 'Álcool 70% — galão 5 L', qtd: 1200, un: 'galão', unitario: 28 },
      { n: 2, descricao: 'Papel toalha interfolhado — fardo 1.000 folhas', qtd: 2400, un: 'fardo', unitario: 21 },
    ],
    documentos: [{ nome: 'Edital completo', tipo: 'Edital', tamanho: '1,9 MB', paginas: 54 }],
  }),

  criar({
    id: 'LIC-2026-0046',
    objeto: 'Aquisição de computadores desktop e periféricos para laboratórios de informática',
    orgaoId: 'org-7',
    modalidade: 'Pregão Eletrônico',
    categoria: 'Equipamentos de informática',
    numero: '019/2026',
    processo: '23289.001904/2026-88',
    valor: 214700,
    abertura: dia(-5),
    encerramento: dia(13, 10),
    situacao: 'Recebendo propostas',
    plataforma: 'Compras.gov.br',
    srp: false,
    resumo:
      'Aquisição de 140 desktops com monitor, teclado e mouse para laboratórios, com garantia on-site de 48 meses e instalação inclusa. Cota de 25% reservada a ME e EPP.',
    razoes: { cnae: true, segmento: true, regiao: true, valor: true, produtos: true, historico: false, prazo: true },
    itens: [
      { n: 1, descricao: 'Desktop i5, 16 GB RAM, SSD 512 GB, monitor 21,5"', qtd: 140, un: 'un', unitario: 1380 },
      { n: 2, descricao: 'Kit teclado e mouse USB ABNT2', qtd: 140, un: 'kit', unitario: 92 },
      { n: 3, descricao: 'Switch 24 portas gigabit gerenciável', qtd: 8, un: 'un', unitario: 1450 },
    ],
    documentos: [
      { nome: 'Edital completo', tipo: 'Edital', tamanho: '2,7 MB', paginas: 71 },
      { nome: 'Termo de referência', tipo: 'Anexo I', tamanho: '940 KB', paginas: 24 },
    ],
  }),

  criar({
    id: 'LIC-2026-0052',
    objeto: 'Credenciamento de empresas para fornecimento de suprimentos de impressão sob demanda',
    orgaoId: 'org-6',
    modalidade: 'Credenciamento',
    categoria: 'Material de expediente',
    numero: '003/2026',
    processo: 'SEDUC-CAM-2026-0093',
    valor: 145000,
    abertura: dia(-20),
    encerramento: dia(24, 17),
    situacao: 'Recebendo propostas',
    plataforma: 'Portal de Compras Públicas',
    srp: false,
    resumo:
      'Credenciamento com preço fixado em tabela para fornecimento contínuo de toner e cartucho. Todos os credenciados que atenderem aos requisitos são contratados, com rateio por ordem de demanda.',
    razoes: { cnae: true, segmento: true, regiao: true, valor: true, produtos: true, historico: false, prazo: true },
    itens: [
      { n: 1, descricao: 'Toner compatível — laser mono, 3.000 páginas', qtd: 600, un: 'un', unitario: 72 },
      { n: 2, descricao: 'Cartucho de tinta colorido — jato de tinta', qtd: 480, un: 'un', unitario: 96 },
    ],
    documentos: [
      { nome: 'Edital de credenciamento', tipo: 'Edital', tamanho: '1,4 MB', paginas: 38 },
      { nome: 'Tabela de preços', tipo: 'Anexo II', tamanho: '180 KB', paginas: 5 },
    ],
  }),

  criar({
    id: 'LIC-2026-0058',
    objeto: 'Aquisição de equipamentos médico-hospitalares para centro cirúrgico',
    orgaoId: 'org-5',
    modalidade: 'Pregão Eletrônico',
    categoria: 'Equipamentos médicos',
    numero: '031/2026',
    processo: 'HGRS-2026-0812',
    valor: 890000,
    abertura: dia(-7),
    encerramento: dia(15, 10),
    situacao: 'Recebendo propostas',
    plataforma: 'Compras.gov.br',
    srp: false,
    resumo:
      'Aquisição de monitores multiparamétricos, bombas de infusão e focos cirúrgicos com registro ANVISA vigente, instalação, treinamento da equipe e assistência técnica em 24 horas.',
    razoes: { cnae: false, segmento: false, regiao: true, valor: false, produtos: false, historico: true, prazo: true },
    itens: [
      { n: 1, descricao: 'Monitor multiparamétrico 12"', qtd: 24, un: 'un', unitario: 22000 },
      { n: 2, descricao: 'Bomba de infusão volumétrica', qtd: 40, un: 'un', unitario: 6800 },
    ],
    documentos: [{ nome: 'Edital completo', tipo: 'Edital', tamanho: '4,2 MB', paginas: 98 }],
  }),

  criar({
    id: 'LIC-2026-0061',
    objeto: 'Contratação de link de internet dedicado e serviços de conectividade',
    orgaoId: 'org-10',
    modalidade: 'Pregão Eletrônico',
    categoria: 'Serviços de TI',
    numero: '072/2026',
    processo: 'PMR-2026-04417',
    valor: 420000,
    abertura: dia(-11),
    encerramento: dia(20, 14),
    situacao: 'Recebendo propostas',
    plataforma: 'Compras.gov.br',
    srp: false,
    resumo:
      'Link dedicado de 1 Gbps com SLA de 99,5%, IP fixo e redundância por caminho distinto, para 6 pontos de presença. Vigência de 24 meses.',
    razoes: { cnae: true, segmento: true, regiao: false, valor: false, produtos: false, historico: false, prazo: true },
    itens: [{ n: 1, descricao: 'Link dedicado 1 Gbps — ponto principal', qtd: 24, un: 'mês', unitario: 11500 }],
    documentos: [{ nome: 'Edital completo', tipo: 'Edital', tamanho: '2,2 MB', paginas: 63 }],
  }),

  criar({
    id: 'LIC-2026-0065',
    objeto: 'Aquisição de impressoras multifuncionais e contratação de outsourcing de impressão',
    orgaoId: 'org-1',
    modalidade: 'Pregão Eletrônico',
    categoria: 'Equipamentos de informática',
    numero: '098/2026',
    processo: '2026.0114.0991-PG',
    valor: 132800,
    abertura: dia(-8),
    encerramento: dia(5, 15),
    situacao: 'Recebendo propostas',
    plataforma: 'Compras.gov.br',
    srp: false,
    resumo:
      'Fornecimento de 60 multifuncionais monocromáticas em regime de outsourcing, com franquia mensal de 3.000 páginas por equipamento, insumos inclusos e software de bilhetagem.',
    razoes: { cnae: true, segmento: true, regiao: true, valor: true, produtos: true, historico: true, prazo: true },
    itens: [
      { n: 1, descricao: 'Multifuncional laser mono A4 — locação mensal', qtd: 720, un: 'un/mês', unitario: 148 },
      { n: 2, descricao: 'Página excedente monocromática', qtd: 180000, un: 'página', unitario: 0.08 },
    ],
    documentos: [
      { nome: 'Edital completo', tipo: 'Edital', tamanho: '2,1 MB', paginas: 59 },
      { nome: 'Termo de referência', tipo: 'Anexo I', tamanho: '760 KB', paginas: 19 },
    ],
  }),
];

export const monitoramentos = [
  { id: 'mon-1', nome: 'Equipamentos de informática', termos: ['notebook', 'desktop', 'monitor', 'impressora'], estados: ['BA', 'SE'], novas: 12, total: 84, ativo: true, criadoEm: dia(-64) },
  { id: 'mon-2', nome: 'Manutenção e suporte técnico', termos: ['suporte técnico', 'manutenção', 'help desk'], estados: ['BA'], novas: 7, total: 41, ativo: true, criadoEm: dia(-38) },
  { id: 'mon-3', nome: 'Salvador e Região Metropolitana', termos: [], estados: ['BA'], cidades: ['Salvador', 'Lauro de Freitas', 'Camaçari', 'Simões Filho'], novas: 19, total: 137, ativo: true, criadoEm: dia(-96) },
  { id: 'mon-4', nome: 'Material de expediente acima de R$ 50 mil', termos: ['papel', 'expediente', 'toner'], estados: ['BA', 'SE', 'PE'], valorMin: 50000, novas: 0, total: 23, ativo: false, criadoEm: dia(-22) },
];

export const notificacoes = [
  { id: 'not-1', tipo: 'sucesso', icone: 'faisca', titulo: 'Nova oportunidade compatível', texto: 'Encontramos "Aquisição de impressoras multifuncionais" com 96% de compatibilidade com seu perfil.', quando: dia(0, 8), link: '#/oportunidade/LIC-2026-0065' },
  { id: 'not-2', tipo: 'aviso', icone: 'relogio', titulo: 'Prazo se aproximando', texto: 'A licitação "Registro de preços para material de expediente" encerra em 2 dias.', quando: dia(0, 7), link: '#/oportunidade/LIC-2026-0018' },
  { id: 'not-3', tipo: 'info', icone: 'radar', titulo: 'Novo resultado no monitoramento', texto: 'Foram encontradas 12 novas oportunidades em "Equipamentos de informática".', quando: dia(-1, 18), link: '#/monitoramentos' },
  { id: 'not-4', tipo: 'sucesso', icone: 'check_circulo', titulo: 'Participação homologada', texto: 'Sua proposta no Pregão 044/2025 da UFBA foi homologada.', quando: dia(-2, 11), link: '#/participacoes' },
  { id: 'not-5', tipo: 'info', icone: 'documento', titulo: 'Edital retificado', texto: 'O edital 090/2026 da Prefeitura de Salvador teve o anexo II republicado.', quando: dia(-3, 15), link: '#/oportunidade/LIC-2026-0007' },
];

export const participacoes = [
  { id: 'p-1', licitacao: 'Pregão 044/2025 — Aquisição de notebooks', orgao: 'Universidade Federal da Bahia', valor: 148900, situacao: 'ganha', data: dia(-38) },
  { id: 'p-2', licitacao: 'Pregão 112/2025 — Material de expediente', orgao: 'Prefeitura Municipal de Salvador', valor: 62400, situacao: 'ganha', data: dia(-66) },
  { id: 'p-3', licitacao: 'Pregão 087/2025 — Suporte técnico', orgao: 'Governo do Estado da Bahia — SAEB', valor: 284000, situacao: 'perdida', data: dia(-51) },
  { id: 'p-4', licitacao: 'Dispensa 2025/00412 — Licenças de software', orgao: 'Instituto Federal de Sergipe', valor: 41200, situacao: 'ganha', data: dia(-24) },
  { id: 'p-5', licitacao: 'Pregão 019/2026 — Desktops para laboratório', orgao: 'Instituto Federal de Sergipe', valor: 214700, situacao: 'analise', data: dia(-5) },
  { id: 'p-6', licitacao: 'Pregão 061/2026 — Mobiliário corporativo', orgao: 'Tribunal de Justiça do Estado da Bahia', valor: 268000, situacao: 'analise', data: dia(-6) },
  { id: 'p-7', licitacao: 'Pregão 055/2025 — Nobreaks', orgao: 'Hospital Geral Roberto Santos', valor: 38700, situacao: 'perdida', data: dia(-88) },
];

/* ---------- Séries dos relatórios ---------- */

export const serieMensal = [
  { rotulo: 'Set', valor: 84 }, { rotulo: 'Out', valor: 96 }, { rotulo: 'Nov', valor: 78 },
  { rotulo: 'Dez', valor: 61 }, { rotulo: 'Jan', valor: 103 }, { rotulo: 'Fev', valor: 118 },
  { rotulo: 'Mar', valor: 127 }, { rotulo: 'Abr', valor: 112 }, { rotulo: 'Mai', valor: 134 },
  { rotulo: 'Jun', valor: 141 }, { rotulo: 'Jul', valor: 149 }, { rotulo: 'Ago', valor: 157 },
];

export const porCategoria = [
  { rotulo: 'Equipamentos de informática', valor: 48 },
  { rotulo: 'Serviços de TI', valor: 37 },
  { rotulo: 'Material de expediente', valor: 29 },
  { rotulo: 'Mobiliário', valor: 18 },
  { rotulo: 'Manutenção predial', valor: 14 },
  { rotulo: 'Material de limpeza', valor: 11 },
];

export const porEstado = [
  { rotulo: 'BA', valor: 96 }, { rotulo: 'SE', valor: 27 }, { rotulo: 'PE', valor: 19 },
  { rotulo: 'AL', valor: 8 }, { rotulo: 'SP', valor: 4 }, { rotulo: 'DF', valor: 3 },
];

/* ---------- Agregados ---------- */

export const indicadores = {
  encontradas: 157,
  encontradasDelta: 24,
  valorTotal: 12_600_000,
  valorDelta: 18,
  altaCompatibilidade: licitacoes.filter((l) => l.compatibilidade >= 80).length * 8 + 17,
  altaDelta: 31,
  novasHoje: 23,
};

export const buscasSugeridas = [
  { rotulo: 'Oportunidades para meu CNAE', consulta: 'informática', icone: 'maleta' },
  { rotulo: 'Oportunidades em Salvador', consulta: 'Salvador', icone: 'pin' },
  { rotulo: 'Acima de R$ 100 mil', consulta: '', icone: 'carteira', valorMin: 100000 },
  { rotulo: 'Novas licitações hoje', consulta: '', icone: 'faisca', novas: true },
];

export const termosPopulares = [
  'notebook', 'suporte técnico', 'papel A4', 'toner', 'nobreak',
  'licença de software', 'manutenção', 'mobiliário',
];

export const licitacaoPorId = (id) => licitacoes.find((l) => l.id === id) ?? null;
