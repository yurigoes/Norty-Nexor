/**
 * Roteiro da apresentação
 *
 * A sequência não é uma lista de funcionalidades: ela é um argumento.
 * Primeiro o problema que o empresário reconhece como dele, depois o
 * ciclo inteiro, e só então cada módulo — porque módulo apresentado
 * antes do problema vira catálogo, e catálogo não convence ninguém.
 */

export interface BlocoSecao {
  titulo: string;
  texto: string;
}

export interface SecaoDeck {
  id: string;
  numero: number;
  /** Rótulo curto do índice lateral. */
  rotulo: string;
  eyebrow?: string;
  titulo: string;
  linha?: string;
  blocos?: BlocoSecao[];
  /** Números grandes: [valor, rótulo]. */
  numeros?: [string, string][];
  /** Etapas do fluxo; a marcada aparece com a borda em gradiente. */
  fluxo?: { rotulo: string; destaque?: boolean }[];
  lista?: string[];
  tipo?: 'capa' | 'padrao' | 'encerramento';
}

export const SECOES: SecaoDeck[] = [
  {
    id: 'capa',
    numero: 1,
    rotulo: 'Capa',
    tipo: 'capa',
    titulo: 'VEYRA',
    linha: 'A inteligência por trás da operação comercial.',
  },
  {
    id: 'problema',
    numero: 2,
    rotulo: 'O problema',
    eyebrow: 'O ponto de partida',
    titulo: 'A operação não perde venda por falta de lead. Perde por falta de memória.',
    linha:
      'O lead chega pelo WhatsApp pessoal de um vendedor. A cotação sai por PDF no e-mail de outro. O contrato vira uma pasta no computador de um terceiro. A comissão é conferida numa planilha que só uma pessoa entende. Nada disso está errado isoladamente — o problema é que nenhuma dessas partes sabe da existência das outras.',
    blocos: [
      { titulo: 'O lead esfria em silêncio', texto: 'Ninguém sabe que ele existe até alguém lembrar. Quando lembra, o concorrente já respondeu.' },
      { titulo: 'O histórico vive na cabeça de quem atendeu', texto: 'Se essa pessoa sai de férias, o cliente recomeça a conversa do zero.' },
      { titulo: 'A comissão vira discussão', texto: 'Duas planilhas, dois números, uma reunião por mês para decidir qual está certo.' },
      { titulo: 'O dono só descobre o problema depois', texto: 'O relatório fecha no dia 5. A venda que não aconteceu foi no dia 12 do mês anterior.' },
    ],
  },
  {
    id: 'visao',
    numero: 3,
    rotulo: 'A visão',
    eyebrow: 'A proposta',
    titulo: 'Um lugar só, do primeiro contato à renovação.',
    linha:
      'O VEYRA não é um CRM com módulos extras. É a operação comercial inteira em uma plataforma: quem entrou, quem atendeu, o que foi oferecido, o que fechou, quanto entrou, quanto se pagou de comissão e o que precisa renovar.',
    fluxo: [
      { rotulo: 'Captura' },
      { rotulo: 'IA', destaque: true },
      { rotulo: 'Qualificação' },
      { rotulo: 'Atendimento' },
      { rotulo: 'Cotação' },
      { rotulo: 'Proposta' },
      { rotulo: 'Venda' },
      { rotulo: 'Financeiro' },
      { rotulo: 'Comissão' },
      { rotulo: 'Pós-venda' },
      { rotulo: 'Renovação' },
      { rotulo: 'Nova oportunidade', destaque: true },
    ],
  },
  {
    id: 'ecossistema',
    numero: 4,
    rotulo: 'Ecossistema',
    eyebrow: 'Como o produto se organiza',
    titulo: 'Nove produtos que compartilham o mesmo dado.',
    linha:
      'Cada família resolve uma parte do ciclo. Elas não são sistemas integrados: são o mesmo sistema, lendo a mesma base. Por isso o CSAT de um chamado aparece no cliente, e o cliente aparece na conversa.',
    blocos: [
      { titulo: 'VEYRA CRM', texto: 'Leads, funil e clientes.' },
      { titulo: 'VEYRA Connect', texto: 'WhatsApp, e-mail e Instagram numa caixa só.' },
      { titulo: 'VEYRA Intelligence', texto: 'Score, previsão e recomendação.' },
      { titulo: 'VEYRA Finance', texto: 'Cobrança, fluxo de caixa e comissões.' },
      { titulo: 'VEYRA Campaigns', texto: 'Segmentação, disparo e ROI.' },
      { titulo: 'VEYRA Partners', texto: 'Afiliados com portal próprio.' },
      { titulo: 'VEYRA Support', texto: 'Protocolo, SLA e CSAT.' },
      { titulo: 'VEYRA Knowledge', texto: 'A base que a equipe e a IA consultam.' },
      { titulo: 'VEYRA Admin', texto: 'A plataforma vista pelo dono dela.' },
    ],
  },
  {
    id: 'dashboard',
    numero: 5,
    rotulo: 'Dashboard',
    eyebrow: 'Módulo',
    titulo: 'A primeira tela responde "o que exige a minha atenção agora?".',
    linha:
      'Não "quantos registros existem". Leads quentes trazem o link para a fila. Contas vencidas trazem o valor. SLA violado traz o protocolo. Todo número vem com o que fazer a respeito.',
    numeros: [
      ['1.842', 'leads no mês'],
      ['5,8%', 'conversão lead → venda'],
      ['R$ 328,9 mil', 'receita reconhecida'],
      ['4,1', 'CSAT médio'],
    ],
  },
  {
    id: 'ia',
    numero: 6,
    rotulo: 'IA',
    eyebrow: 'Módulo',
    titulo: 'A IA atende primeiro — e entrega o lead pronto para o vendedor.',
    linha:
      '"Quero fazer um consórcio de 150 mil." A partir daí ela identifica o produto, o valor, a intenção, faz as perguntas que faltam, cria o lead, calcula o score e transfere para gente quando o assunto pede gente.',
    blocos: [
      { titulo: 'Entende linguagem natural', texto: 'Inclusive áudio. O cliente fala como fala; a IA transcreve e classifica.' },
      { titulo: 'Qualifica de verdade', texto: 'Coleta os dados que faltam antes de passar adiante, em vez de só encaminhar.' },
      { titulo: 'Sabe a hora de sair', texto: 'Objeção de preço, pedido de humano ou assunto sensível transferem na hora.' },
      { titulo: 'Ajuda quem atende', texto: 'Sugere resposta, resume a conversa, analisa o sentimento e propõe o próximo passo.' },
    ],
  },
  {
    id: 'memoria',
    numero: 7,
    rotulo: 'Memória da IA',
    eyebrow: 'A decisão que muda o custo',
    titulo: 'A inteligência mora dentro do VEYRA, não na fatura de um fornecedor.',
    linha:
      'Toda resposta desce uma ordem fixa e para na primeira fonte que resolve: base interna, conhecimento da empresa, histórico autorizado, dados do produto e — só então — provedor externo. Como a base cresce a cada conversa registrada, o custo por atendimento cai com o uso.',
    numeros: [
      ['84%', 'resolvido sem provedor externo'],
      ['180 ms', 'latência da base interna'],
      ['1.420 ms', 'latência do provedor externo'],
      ['Trocável', 'o fornecedor é configuração'],
    ],
  },
  {
    id: 'whatsapp',
    numero: 8,
    rotulo: 'WhatsApp',
    eyebrow: 'Módulo',
    titulo: 'O atendimento acontece dentro da plataforma. Não "abre no WhatsApp".',
    linha:
      'Redirecionar para fora custa histórico, transferência, SLA e auditoria no primeiro clique. Aqui a conversa fica: com o dado do cliente ao lado, o score visível e a transferência entre IA, vendedor e supervisor registrada.',
    lista: [
      'Texto, áudio, imagem, documento, vídeo, localização e contato',
      'Fila por estado: não lida, IA atendendo, humano atendendo, aguardando cliente',
      'Transferência IA → vendedor, vendedor → vendedor, vendedor → supervisor',
      'Dados do CRM na mesma tela: produto, score, responsável, próxima ação',
    ],
  },
  {
    id: 'email',
    numero: 9,
    rotulo: 'E-mail',
    eyebrow: 'Módulo',
    titulo: 'E-mail na mesma caixa, na mesma linha do tempo.',
    linha:
      'Caixa compartilhada por equipe, com assinatura, template e anexo. O e-mail se vincula sozinho ao lead, ao cliente e ao protocolo — e aparece junto do WhatsApp, porque para o cliente foi tudo a mesma conversa.',
  },
  {
    id: 'omnichannel',
    numero: 10,
    rotulo: 'Omnichannel',
    eyebrow: 'O princípio',
    titulo: 'Um cliente, uma linha do tempo.',
    linha:
      'WhatsApp, e-mail, ligação registrada, nota interna, cotação, proposta, pagamento e chamado aparecem em ordem, no mesmo lugar. Ninguém precisa reconstruir a história abrindo cinco telas.',
    fluxo: [
      { rotulo: 'WhatsApp' },
      { rotulo: 'E-mail' },
      { rotulo: 'Ligação' },
      { rotulo: 'Nota interna' },
      { rotulo: 'Cotação', destaque: true },
      { rotulo: 'Proposta' },
      { rotulo: 'Pagamento' },
      { rotulo: 'Chamado' },
    ],
  },
  {
    id: 'crm',
    numero: 11,
    rotulo: 'CRM',
    eyebrow: 'Módulo',
    titulo: 'A lista de leads é fila de trabalho, não relatório.',
    linha:
      'Ordenada por score, com a última interação visível. O que decide a próxima ligação é quem está quente e há quanto tempo ninguém fala com a pessoa — então é isso que a tela mostra primeiro.',
    lista: [
      'Origem, campanha e UTM preservados desde a captura',
      'Score de 0 a 100 calculado, nunca digitado',
      'Treze estados, do "novo" ao "reativado", incluindo motivo de perda',
      'Responsável, equipe e próxima atividade sempre preenchidos',
    ],
  },
  {
    id: 'funil',
    numero: 12,
    rotulo: 'Funil',
    eyebrow: 'Módulo',
    titulo: 'Cada segmento tem o próprio funil, porque as etapas realmente diferem.',
    linha:
      'Seguro passa por vistoria. Saúde, por declaração de saúde. Consórcio, por análise de crédito. Um funil único faria "documentação" significar três coisas — e a previsão de fechamento deixaria de valer.',
    numeros: [
      ['3', 'pipelines prontos'],
      ['8', 'etapas no consórcio'],
      ['Ponderada', 'previsão por probabilidade de etapa'],
      ['Ilimitados', 'pipelines personalizados'],
    ],
  },
  {
    id: 'cotacoes',
    numero: 13,
    rotulo: 'Cotações',
    eyebrow: 'Módulo',
    titulo: 'Opções comparáveis num link — e você vê o que o cliente olhou.',
    linha:
      'Versões salvas, aprovação interna, PDF e link público rastreável. Saber que a cotação foi aberta três vezes em seis horas muda a hora de ligar. Convertida em proposta com um clique.',
  },
  {
    id: 'propostas',
    numero: 14,
    rotulo: 'Propostas',
    eyebrow: 'Módulo',
    titulo: 'Da proposta ao contrato, o que trava é documento.',
    linha:
      'Por isso a proposta carrega checklist com obrigatório marcado. A barra de progresso responde "falta o quê" sem ninguém abrir a pasta nem ligar para o cliente perguntando de novo.',
  },
  {
    id: 'clientes',
    numero: 15,
    rotulo: 'Cliente 360°',
    eyebrow: 'Módulo',
    titulo: 'Nenhuma pergunta sobre o cliente exige abrir outra aba.',
    linha:
      'Dados, contratos, cotações, propostas, faturas, pagamentos, chamados, conversas, documentos, comissões e renovações. Tudo na mesma página, com a linha do tempo que mistura os canais porque foi assim que o relacionamento aconteceu.',
  },
  {
    id: 'consorcio',
    numero: 16,
    rotulo: 'Consórcio',
    eyebrow: 'Segmento',
    titulo: 'Grupo, cota, carta, lance embutido e contemplação.',
    linha:
      'Campos que só existem em consórcio, tratados como consórcio. Nada de formulário genérico com metade dos campos vazios e a informação que importa perdida num campo "observações".',
    lista: [
      'Administradora, grupo e cota',
      'Carta de crédito, prazo e parcela',
      'Taxa de administração e fundo de reserva',
      'Lance ofertado e lance embutido',
      'Contemplação com data e forma',
    ],
  },
  {
    id: 'seguros',
    numero: 17,
    rotulo: 'Seguros',
    eyebrow: 'Segmento',
    titulo: 'Apólice, coberturas, franquia, prêmio e renovação.',
    linha:
      'Cotação multi-seguradora comparável lado a lado, vistoria como etapa do funil e o aviso de renovação disparado 60 dias antes — que é quando a conversa ainda dá para ser ganha.',
  },
  {
    id: 'saude',
    numero: 18,
    rotulo: 'Saúde',
    eyebrow: 'Segmento',
    titulo: 'Titular, dependentes, faixas, carência e reajuste.',
    linha:
      'Plano empresarial com relação de vidas, declaração de saúde no checklist e o aniversário do contrato marcado — porque o reajuste anual é a conversa mais difícil do ano e ninguém deveria ser pego de surpresa por ela.',
  },
  {
    id: 'campanhas',
    numero: 19,
    rotulo: 'Campanhas',
    eyebrow: 'Módulo',
    titulo: 'Segmentação por qualquer coisa que a plataforma já sabe.',
    linha:
      'Produto, cidade, origem, status, última interação, data da cotação, motivo da perda, cliente inativo, renovação próxima, score. E métrica que fecha: entrega, resposta, lead, venda, receita e ROI.',
  },
  {
    id: 'automacao',
    numero: 20,
    rotulo: 'Automação',
    eyebrow: 'Módulo',
    titulo: 'Quando acontecer X, se Y, então Z.',
    linha:
      'Construtor visual, porque quem escreve a regra é quem conhece a operação, não quem programa. Treze gatilhos, dez tipos de ação e espera entre passos.',
    numeros: [
      ['13', 'gatilhos disponíveis'],
      ['3.002', 'execuções em 30 dias'],
      ['99,2%', 'taxa de sucesso'],
      ['412 h', 'trabalho manual poupado'],
    ],
  },
  {
    id: 'followup',
    numero: 21,
    rotulo: 'Follow-up',
    eyebrow: 'Módulo',
    titulo: 'O lead não morre de esquecimento.',
    linha:
      'Cadência configurável: mensagem no dia 1, no dia 3, no dia 5 e encerramento no dia 7 com o lead indo para nutrição. Tudo registrado — inclusive a decisão de parar de insistir.',
  },
  {
    id: 'blacklist',
    numero: 22,
    rotulo: 'Não contatar',
    eyebrow: 'Módulo',
    titulo: 'Quem pediu para não ser contatado não é contatado. Ponto.',
    linha:
      'A verificação acontece no motor de envio, não na tela de quem monta o público — assim ela não depende de ninguém lembrar. O registro guarda quem pediu, quando, por qual canal e por quê. A reativação exige nova manifestação do titular.',
  },
  {
    id: 'financeiro',
    numero: 23,
    rotulo: 'Financeiro',
    eyebrow: 'Módulo',
    titulo: 'A receita deixa de ser estimativa.',
    linha:
      'Contas a receber e a pagar, categorias próprias, fluxo de caixa com previsão calculada a partir de parcelas já contratadas — não de tendência. Dinheiro é decimal de duas casas no banco: em ponto flutuante, 0,1 + 0,2 não fecha caixa.',
  },
  {
    id: 'pagamentos',
    numero: 24,
    rotulo: 'Pagamentos',
    eyebrow: 'Módulo',
    titulo: 'PIX, boleto, cartão e link — sem casar com um gateway.',
    linha:
      'A fatura, o vencimento, a régua de cobrança e a baixa vivem na plataforma. Qual provedor processa é configuração. Amarrar o produto a um gateway seria hipotecar o roadmap à política comercial de terceiro.',
  },
  {
    id: 'comissoes',
    numero: 25,
    rotulo: 'Comissões',
    eyebrow: 'Módulo',
    titulo: 'A comissão sai do contrato, não da planilha.',
    linha:
      'Percentual ou valor fixo, por produto, vendedor, afiliado ou supervisor, com recorrência de até 24 meses e estorno automático quando o contrato cai. O número deixa de ser assunto de reunião.',
  },
  {
    id: 'afiliados',
    numero: 26,
    rotulo: 'Partners',
    eyebrow: 'Módulo',
    titulo: 'Cada parceiro com link próprio, extrato e portal — e nada além disso.',
    linha:
      'O afiliado entra num portal externo e vê apenas o que a própria indicação gerou. A restrição não é escondida na tela: é o papel dele na matriz de permissões, aplicado no servidor.',
  },
  {
    id: 'suporte',
    numero: 27,
    rotulo: 'Suporte',
    eyebrow: 'Módulo',
    titulo: 'Todo atendimento vira protocolo.',
    linha:
      'VEY-2026-000184. É o número que o cliente cita ao ligar de novo e o que a auditoria segue depois. Sem ele, "eu já pedi isso semana passada" não tem como ser verificado.',
  },
  {
    id: 'sla',
    numero: 28,
    rotulo: 'SLA',
    eyebrow: 'Módulo',
    titulo: 'O prazo é regra de negócio, não configuração de tela.',
    linha:
      'Crítica em 15 minutos, alta em 1 hora, normal em 4 horas, baixa em 24. O número vive no domínio compartilhado: a API e a interface leem o mesmo valor, e a exceção precisa ser decisão explícita.',
    numeros: [
      ['15 min', 'prioridade crítica'],
      ['1 h', 'prioridade alta'],
      ['4 h', 'prioridade normal'],
      ['24 h', 'prioridade baixa'],
    ],
  },
  {
    id: 'csat',
    numero: 29,
    rotulo: 'CSAT',
    eyebrow: 'Módulo',
    titulo: 'A avaliação chega sozinha ao encerrar o atendimento.',
    linha:
      'Nota de 1 a 5 e um campo aberto. Nota baixa aciona automaticamente um chamado de retenção — porque o cliente insatisfeito que ninguém procura é o cliente que cancela sem avisar.',
  },
  {
    id: 'relatorios',
    numero: 30,
    rotulo: 'Relatórios',
    eyebrow: 'Módulo',
    titulo: 'Cinco famílias lendo a mesma base.',
    linha:
      'Comercial, marketing, equipe, financeiro e suporte. Se o mesmo número diverge entre dois relatórios, isso é bug — não interpretação. É essa garantia que faz o relatório ser usado para decidir.',
  },
  {
    id: 'intelligence',
    numero: 31,
    rotulo: 'Intelligence',
    eyebrow: 'Módulo',
    titulo: 'Não devolve número. Devolve a próxima ação e o motivo dela.',
    linha:
      '"87% de chance de fechar" é inútil sozinho. "87%, porque abriu a cotação três vezes em seis horas — ligue hoje entre 14h e 16h" é uma instrução. E os fatores ficam visíveis, porque score que ninguém consegue explicar não é usado: é contestado.',
  },
  {
    id: 'api',
    numero: 32,
    rotulo: 'API',
    eyebrow: 'Arquitetura',
    titulo: 'A interface é o primeiro consumidor da API, não um caso especial dela.',
    linha:
      'Tudo que a tela faz, um sistema de fora também faz — com a mesma autenticação, as mesmas permissões e o mesmo limite. É isso que permite plugar ERP, site próprio ou automação sem esperar uma "integração especial".',
    lista: [
      'REST versionada em /api/v1, documentada em OpenAPI',
      'Chaves de API com escopo, e o segredo exibido uma única vez',
      'Webhooks assinados com HMAC-SHA256 sobre o corpo cru',
      'Limite por minuto ajustado pelo plano da organização',
    ],
  },
  {
    id: 'integracoes',
    numero: 33,
    rotulo: 'Integrações',
    eyebrow: 'Arquitetura',
    titulo: 'Quinze conectores, e o erro exato quando um deles cai.',
    linha:
      'WhatsApp oficial e Evolution API, Meta, Instagram, Google Ads, SMTP e IMAP, gateways de pagamento, PIX, APIs de seguradora, administradora e operadora, n8n, webhooks e ERP. Cada um com estado, última sincronização e log — não um "algo deu errado".',
  },
  {
    id: 'seguranca',
    numero: 34,
    rotulo: 'Segurança',
    eyebrow: 'Fundação',
    titulo: 'Decisões que não devem ser desfeitas.',
    linha:
      'Segurança aqui não é uma lista de siglas: é um conjunto de escolhas que fecham portas específicas, cada uma com o motivo registrado no código.',
    blocos: [
      { titulo: 'Senha em Argon2id', texto: 'A API nunca devolve o hash — o tipo do usuário autenticado sequer tem esse campo.' },
      { titulo: 'Token de 15 minutos em memória', texto: 'Nunca em localStorage, onde qualquer script da página o leria.' },
      { titulo: 'Refresh com rotação a cada uso', texto: 'Em cookie httpOnly, com hash no banco. Token roubado vale por um uso só.' },
      { titulo: 'Login com resposta idêntica', texto: 'E-mail inexistente e senha errada respondem igual — a diferença revelaria quem tem conta.' },
      { titulo: 'Campo desconhecido é erro', texto: 'Corpo com campo não previsto é rejeitado, não ignorado em silêncio.' },
      { titulo: 'Erro genérico em produção', texto: 'Stack trace e texto do banco ficam no log, com código de rastreio para o suporte.' },
    ],
  },
  {
    id: 'lgpd',
    numero: 35,
    rotulo: 'LGPD',
    eyebrow: 'Fundação',
    titulo: 'Consentimento com evidência, finalidade e data.',
    linha:
      'Base legal registrada por titular, preferências de comunicação por canal, histórico de consentimento, exportação, anonimização e exclusão quando aplicável. E a blacklist checada no motor de envio, não na tela.',
  },
  {
    id: 'multitenant',
    numero: 36,
    rotulo: 'Multi-tenant',
    eyebrow: 'Fundação',
    titulo: 'Todo dado nasce escopado por organização.',
    linha:
      'O guard resolve a organização uma vez, validando o vínculo do usuário, e todo filtro de consulta começa por ela. Nenhum serviço confia num identificador vindo do corpo da requisição — é assim que o vazamento entre empresas deixa de ser "improvável" e passa a ser difícil de acontecer.',
  },
  {
    id: 'admin',
    numero: 37,
    rotulo: 'VEYRA Admin',
    eyebrow: 'Plataforma',
    titulo: 'A área do dono da plataforma fica fora do produto do cliente.',
    linha:
      'Outra rota, outra casca, outras permissões. Criar, ativar, suspender e bloquear empresas; definir planos e limites; liberar módulos; ver consumo, receita, MRR, ARR e churn. Toda ação registra usuário, horário, IP e o antes e depois do valor.',
    numeros: [
      ['6', 'organizações na base'],
      ['R$ 5.088', 'MRR'],
      ['R$ 61 mil', 'ARR projetado'],
      ['1,8%', 'churn mensal'],
    ],
  },
  {
    id: 'escala',
    numero: 38,
    rotulo: 'Escalabilidade',
    eyebrow: 'Arquitetura',
    titulo: 'Preparado para crescer sem ser reescrito.',
    linha:
      'Frontend em React e TypeScript; API REST versionada; PostgreSQL normalizado com as regras que não podem ser burladas garantidas no próprio banco; cache, filas e armazenamento de objetos como peças separadas; tudo em contêiner.',
    lista: [
      'Unicidade de horário, um voto por unidade, uma avaliação por atendimento: restrições no banco, não só na aplicação',
      'Dinheiro em decimal de duas casas, convertido para número uma única vez, na fronteira da API',
      'Domínio compartilhado entre interface e servidor — um campo muda em um lugar só',
      'Provedor de IA, gateway de pagamento e canal de mensagem são peças trocáveis',
    ],
  },
  {
    id: 'fases',
    numero: 39,
    rotulo: 'Fases',
    eyebrow: 'Entrega',
    titulo: 'Seis fases. A primeira já resolve o problema que dói.',
    linha:
      'A plataforma é completa, mas a entrega é por fases — e cada fase entrega uma operação inteira funcionando, não um pedaço que só faz sentido quando a próxima chegar.',
    blocos: [
      { titulo: 'Fase 1 · Core', texto: 'A operação para de viver no WhatsApp pessoal. Lead entra, é qualificado e tem dono.' },
      { titulo: 'Fase 2 · Comercial', texto: 'Do interesse ao contrato assinado, com o cálculo da comissão saindo junto.' },
      { titulo: 'Fase 3 · Operação', texto: 'O que foi vendido passa a ser acompanhado: vigência, renovação e pós-venda.' },
      { titulo: 'Fase 4 · Financeiro', texto: 'A receita deixa de ser estimativa. Cobrança, baixa e fluxo de caixa fecham.' },
      { titulo: 'Fase 5 · Intelligence', texto: 'A base acumulada vira previsão, score e recomendação de próxima ação.' },
      { titulo: 'Fase 6 · Ecossistema', texto: 'A plataforma deixa de ser destino e vira infraestrutura para outros sistemas.' },
    ],
  },
  {
    id: 'encerramento',
    numero: 40,
    rotulo: 'Encerramento',
    tipo: 'encerramento',
    titulo: 'Do primeiro contato à fidelização. Tudo conectado.',
    linha: 'VEYRA — a inteligência por trás da operação comercial.',
  },
];
