import type { FormField, FormSchema } from '@norty-desk/shared';

/**
 * Os campos do formulário da categoria.
 *
 * Aparece na abertura do chamado, abaixo da categoria — que é o que os
 * traz. Um campo `internal` nunca chega ao portal: quem não escreve
 * nota interna também não responde campo interno, e a API recusa do
 * mesmo jeito (esconder o botão é conveniência; o guard é a proteção).
 */
export function CamposDinamicos({
  schema,
  respostas,
  aoMudar,
  noPortal = false,
  erros = {},
  previa = false,
}: {
  schema: FormSchema;
  respostas: Record<string, unknown>;
  aoMudar: (chave: string, valor: unknown) => void;
  noPortal?: boolean;
  /** Mensagem por chave, quando a API recusou. */
  erros?: Record<string, string>;
  /**
   * Prévia do montador: os campos não entram na validação do navegador.
   *
   * Sem isto, a prévia dentro do formulário de configuração travava o
   * "Salvar" — o obrigatório em branco da prévia é justamente o que se
   * quer ver, e o navegador o cobrava como se fosse do formulário de
   * fora. O asterisco continua aparecendo: ele é o que informa.
   */
  previa?: boolean;
}) {
  const campos = noPortal ? schema.fields.filter((c) => !c.internal) : schema.fields;
  if (campos.length === 0) return null;

  return (
    <>
      <div className="divisor-texto">
        <span>Sobre este tipo de chamado</span>
      </div>

      {campos.map((campo) => (
        <CampoDinamico
          key={campo.key}
          campo={campo}
          valor={respostas[campo.key]}
          erro={erros[campo.key]}
          previa={previa}
          aoMudar={(valor) => aoMudar(campo.key, valor)}
        />
      ))}
    </>
  );
}

/**
 * Um campo, desenhado a partir da sua declaração.
 *
 * Exportado porque a ficha do componente do ativo é feita da mesma
 * matéria — um `FormField` — e desenhar de novo o mesmo `select` seria
 * ganhar duas telas que divergem no primeiro ajuste.
 */
export function CampoDinamico({
  campo,
  valor,
  erro,
  previa = false,
  aoMudar,
}: {
  campo: FormField;
  valor: unknown;
  erro?: string;
  previa?: boolean;
  aoMudar: (valor: unknown) => void;
}) {
  const id = `campo-${campo.key}`;

  return (
    <div className="campo">
      <label className="campo-rotulo" htmlFor={id}>
        {campo.label}
        {campo.required ? <span aria-hidden="true"> *</span> : null}
        {campo.internal ? <span className="selo -neutro" style={{ marginLeft: 'var(--e-2)' }}>interno</span> : null}
      </label>

      <Entrada id={id} campo={campo} valor={valor} previa={previa} aoMudar={aoMudar} />

      {campo.help ? <span className="campo-ajuda">{campo.help}</span> : null}
      {erro ? (
        <span className="campo-ajuda" style={{ color: 'var(--erro)' }}>
          {erro}
        </span>
      ) : null}
    </div>
  );
}

function Entrada({
  id,
  campo,
  valor,
  previa,
  aoMudar,
}: {
  id: string;
  campo: FormField;
  valor: unknown;
  previa: boolean;
  aoMudar: (valor: unknown) => void;
}) {
  const obrigatorio = campo.required && !previa;

  switch (campo.type) {
    case 'TEXTO_LONGO':
      return (
        <textarea
          id={id}
          className="textarea"
          rows={3}
          required={obrigatorio}
          value={(valor as string) ?? ''}
          onChange={(e) => aoMudar(e.target.value)}
        />
      );

    case 'NUMERO':
      return (
        <input
          id={id}
          className="input"
          type="number"
          required={obrigatorio}
          value={valor === undefined || valor === null ? '' : String(valor)}
          // Em branco vira `undefined`, não `0`: número zero é resposta,
          // campo vazio não é.
          onChange={(e) => aoMudar(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      );

    case 'DATA':
      return (
        <input
          id={id}
          className="input"
          type="date"
          required={obrigatorio}
          value={typeof valor === 'string' ? valor.slice(0, 10) : ''}
          onChange={(e) => aoMudar(e.target.value || undefined)}
        />
      );

    case 'BOOLEANO':
      return (
        <label className="switch">
          <input
            id={id}
            type="checkbox"
            checked={valor === true}
            onChange={(e) => aoMudar(e.target.checked)}
          />
          <span className="switch-trilho" aria-hidden="true">
            <span className="switch-bolinha" />
          </span>
          <span>{valor === true ? 'Sim' : 'Não'}</span>
        </label>
      );

    case 'SELECAO':
      return (
        <select
          id={id}
          className="select"
          required={obrigatorio}
          value={(valor as string) ?? ''}
          onChange={(e) => aoMudar(e.target.value || undefined)}
        >
          <option value="">Escolha…</option>
          {(campo.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );

    case 'MULTISELECAO': {
      const escolhidos = Array.isArray(valor) ? (valor as string[]) : [];
      return (
        <div className="pilha-sm">
          {(campo.options ?? []).map((o) => (
            <label key={o.value} className="check">
              <input
                type="checkbox"
                checked={escolhidos.includes(o.value)}
                onChange={(e) =>
                  aoMudar(
                    e.target.checked
                      ? [...escolhidos, o.value]
                      : escolhidos.filter((v) => v !== o.value),
                  )
                }
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      );
    }

    default:
      return (
        <input
          id={id}
          className="input"
          required={obrigatorio}
          value={(valor as string) ?? ''}
          onChange={(e) => aoMudar(e.target.value)}
        />
      );
  }
}

/**
 * As respostas de um chamado, para leitura.
 *
 * Sem o schema, `customFields` é um punhado de chaves: "patrimonio" em
 * vez de "Patrimônio", e `["mouse"]` em vez de "Mouse".
 */
export function RespostasDoFormulario({
  schema,
  respostas,
}: {
  schema: FormSchema;
  respostas: Record<string, unknown>;
}) {
  const preenchidos = schema.fields.filter(
    (c) => respostas[c.key] !== undefined && respostas[c.key] !== null && respostas[c.key] !== '',
  );

  if (preenchidos.length === 0) return null;

  return (
    <>
      {preenchidos.map((campo) => (
        <div
          key={campo.key}
          className="linha-entre"
          style={{ flexWrap: 'nowrap', gap: 'var(--e-3)' }}
        >
          <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>
            {campo.label}
          </span>
          <span style={{ textAlign: 'right', minWidth: 0 }}>
            {textoDaResposta(campo, respostas[campo.key])}
          </span>
        </div>
      ))}
    </>
  );
}

function textoDaResposta(campo: FormField, valor: unknown): string {
  const rotulo = (v: string) =>
    campo.options?.find((o) => o.value === v)?.label ?? v;

  if (campo.type === 'BOOLEANO') return valor === true ? 'Sim' : 'Não';
  if (campo.type === 'SELECAO') return rotulo(String(valor));
  if (campo.type === 'MULTISELECAO' && Array.isArray(valor)) {
    return valor.map((v) => rotulo(String(v))).join(', ');
  }
  if (campo.type === 'DATA' && typeof valor === 'string') {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(valor));
  }
  return String(valor);
}
