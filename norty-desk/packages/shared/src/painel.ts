/**
 * O estêncil: onde cada porta fica no painel do equipamento.
 *
 * É o `Stencil` do GLPI 11, com uma diferença que vale explicar antes do
 * código. Lá o estêncil é uma **foto** do painel com retângulos
 * desenhados por cima, um por porta. Aqui é uma **grade**: tantas
 * colunas, tantas linhas, e a numeração correndo por uma delas.
 *
 * A troca é de propósito. Painel de switch é grade — 24 portas em duas
 * fileiras de doze, 48 em duas de vinte e quatro, e a numeração corre
 * por coluna (ímpar em cima) ou por linha, segundo o fabricante. Pedir
 * uma foto e um editor de retângulos para descrever uma grade é pedir
 * trabalho manual para gerar o que uma conta dá: quem cadastra o modelo
 * digita 12, 2 e "por coluna", e o painel inteiro está descrito.
 *
 * O que a grade não descreve vive em **zona**: a porta de console, os
 * dois SFP+ que ficam fora da fileira, o buraco onde não há porta
 * nenhuma. A zona manda sobre a célula; a grade preenche o resto.
 *
 * Nada aqui fala com banco nem com rede: é desenho puro, e é o que os
 * testes de unidade exercitam.
 *
 * ## Para que serve, na prática
 *
 * O chamado diz "a internet da sala 3 caiu". O patch panel diz que a
 * sala 3 vai para a porta 17 do switch do rack B. Sem o painel, "porta
 * 17" é um número num cadastro; com ele, é a nona de cima na segunda
 * fileira — e o técnico de plantão não precisa contar RJ45 com o dedo
 * dentro de um rack escuro.
 */

/**
 * De que lado do equipamento está o painel.
 *
 * Dois registros, não um com dois campos: há equipamento com porta nas
 * duas faces (servidor com placa na traseira e console na frente), e as
 * duas grades não têm por que ter o mesmo tamanho.
 */
export const FACES_DO_PAINEL = ['FRENTE', 'TRAS'] as const;
export type FaceDoPainel = (typeof FACES_DO_PAINEL)[number];

export const ROTULO_FACE_DO_PAINEL: Record<FaceDoPainel, string> = {
  FRENTE: 'Frente',
  TRAS: 'Trás',
};

/**
 * Por onde a numeração corre.
 *
 * `COLUNA` é o painel da Cisco e da maioria dos switches de duas
 * fileiras: a porta 1 em cima, a 2 embaixo dela, a 3 na coluna seguinte
 * — ímpares em cima, pares embaixo. `LINHA` é o painel que numera a
 * fileira de cima inteira antes de descer, como muitos HP/Aruba.
 *
 * Errar isto não é detalhe estético: num switch de 24 portas, a porta 13
 * fica na sétima coluna de cima por um lado e na primeira coluna de
 * baixo pelo outro. O desenho mandaria o técnico ao lugar errado com a
 * mesma confiança.
 */
export const ORDENS_DO_PAINEL = ['COLUNA', 'LINHA'] as const;
export type OrdemDoPainel = (typeof ORDENS_DO_PAINEL)[number];

export const ROTULO_ORDEM_DO_PAINEL: Record<OrdemDoPainel, string> = {
  COLUNA: 'Por coluna — ímpares em cima, pares embaixo',
  LINHA: 'Por linha — a fileira de cima inteira, depois a de baixo',
};

/** O que há numa posição do painel. */
export const TIPOS_DE_ZONA = ['PORTA', 'TOMADA', 'CONSOLE', 'ENERGIA', 'VAZIO'] as const;
export type TipoDeZona = (typeof TIPOS_DE_ZONA)[number];

export const ROTULO_TIPO_DE_ZONA: Record<TipoDeZona, string> = {
  PORTA: 'Porta de rede',
  TOMADA: 'Tomada (PDU)',
  CONSOLE: 'Console / gerência',
  ENERGIA: 'Fonte',
  VAZIO: 'Nada aqui',
};

/** A grade: o painel descrito por quatro números e uma ordem. */
export type GradeDoPainel = {
  columns: number;
  rows: number;
  numbering: OrdemDoPainel;
  /**
   * O número da primeira posição.
   *
   * 1 no switch, que numera de 1 a 24. 0 no servidor, cujas placas o
   * sistema chama de `eth0`, `eth1` — e aí a primeira posição da grade é
   * a porta 0, não a 1.
   */
  startAt: number;
  /**
   * Quantas posições a grade numera. Nulo é "todas".
   *
   * É para o painel que não fecha a conta: dez portas numa fileira
   * desenhada de doze. As posições que sobram ficam vazias em vez de
   * ganharem um número que não existe no equipamento.
   */
  slots: number | null;
};

/** A exceção cadastrada à mão: o que a grade não descreve. */
export type ZonaDoPainel = {
  column: number;
  row: number;
  kind: TipoDeZona;
  label: string | null;
  /** A que porta esta zona corresponde, quando corresponde a alguma. */
  portNumber: number | null;
};

/** Uma posição desenhada, já com a grade e as zonas resolvidas. */
export type CelulaDoPainel = {
  column: number;
  row: number;
  kind: TipoDeZona;
  /** O número da porta nesta posição, se houver. */
  numero: number | null;
  label: string | null;
  /** Veio de uma zona cadastrada, e não da grade. */
  daZona: boolean;
};

/** As posições na ordem em que a numeração as visita. */
function posicoes(grade: GradeDoPainel): { column: number; row: number }[] {
  const todas: { column: number; row: number }[] = [];

  if (grade.numbering === 'COLUNA') {
    for (let column = 1; column <= grade.columns; column += 1) {
      for (let row = 1; row <= grade.rows; row += 1) todas.push({ column, row });
    }
    return todas;
  }

  for (let row = 1; row <= grade.rows; row += 1) {
    for (let column = 1; column <= grade.columns; column += 1) todas.push({ column, row });
  }
  return todas;
}

const chave = (column: number, row: number) => `${column}:${row}`;

/**
 * O painel desenhado: toda posição da grade, na ordem da numeração.
 *
 * A regra é uma frase: **a zona manda, a grade preenche o resto.** E a
 * zona não consome número — a porta de console entre a 12 e a 13 não
 * empurra a numeração para 14, porque no equipamento de verdade ela
 * também não empurrou.
 */
export function desenharPainel(grade: GradeDoPainel, zonas: ZonaDoPainel[]): CelulaDoPainel[] {
  const porCelula = new Map(zonas.map((z) => [chave(z.column, z.row), z]));

  let proximo = grade.startAt;
  let numeradas = 0;

  return posicoes(grade).map(({ column, row }) => {
    const zona = porCelula.get(chave(column, row));

    if (zona) {
      return {
        column,
        row,
        kind: zona.kind,
        numero: zona.portNumber,
        label: zona.label,
        daZona: true,
      };
    }

    // A grade acabou antes do desenho: sobra posição sem porta.
    if (grade.slots !== null && numeradas >= grade.slots) {
      return { column, row, kind: 'VAZIO' as TipoDeZona, numero: null, label: null, daZona: false };
    }

    const numero = proximo;
    proximo += 1;
    numeradas += 1;
    return { column, row, kind: 'PORTA' as TipoDeZona, numero, label: null, daZona: false };
  });
}

/**
 * O número físico da porta, a partir do nome que o equipamento dá a ela.
 *
 * O painel numera de 1 a 24; o equipamento chama a mesma porta de
 * `GigabitEthernet1/0/24`, `Gi1/0/24`, `eth3`, `Porta 7` ou `24`. Ligar
 * um ao outro é esta função, e ela existe porque a alternativa seria
 * pedir que alguém digitasse o número de cada porta à mão em cada
 * equipamento — vinte e quatro linhas por switch, para dizer o que o
 * nome já diz.
 *
 * O que a regra decide, nesta ordem:
 *
 * 1. **O que vem depois da última barra.** Em `Gi1/0/24`, o 1 é a pilha
 *    e o 0 o módulo; a porta é a 24.
 * 2. **Subinterface não é porta.** `Gi0/1.100` é a VLAN 100 passando
 *    pela porta 1 — o painel tem a 1. Só o caso puramente numérico
 *    (`1.100`) entra nesta regra, para não estragar um `2.5GbE port 3`.
 * 3. **O último número do que restou.** `eth0` é a 0, `Porta 7` é a 7, e
 *    `Te1` é a 1.
 *
 * Nome sem número nenhum (`Ethernet`, `Wi-Fi`) devolve nulo: é porta que
 * o painel não sabe onde pôr, e dizer "é a 0" seria desenhar errado com
 * ar de certeza.
 */
export function numeroDaPorta(nome: string): number | null {
  const bruto = nome.trim();
  if (!bruto) return null;

  const ultimo = bruto.slice(bruto.lastIndexOf('/') + 1);
  const fisico = /^(\d+)\.\d+$/.exec(ultimo)?.[1] ?? ultimo;

  const numeros = fisico.match(/\d+/g);
  if (!numeros) return null;

  const numero = Number(numeros[numeros.length - 1]);
  return Number.isSafeInteger(numero) ? numero : null;
}

/**
 * Quantas posições o painel numera.
 *
 * Serve à tela: "24 portas" é a conferência que quem cadastra faz de
 * cabeça antes de salvar, e ela tem de bater com o que está escrito na
 * frente do equipamento.
 */
export function portasDoPainel(grade: GradeDoPainel, zonas: ZonaDoPainel[]): number {
  return desenharPainel(grade, zonas).filter((c) => c.numero !== null).length;
}
