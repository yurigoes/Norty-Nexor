import { useEffect, useState } from 'react';
import type { ContextoDoModelo, ModeloView, TemplateKind, TicketDetail } from '@norty-desk/shared';
import { preencherModelo } from '@norty-desk/shared';

import { listarModelos, registrarUsoDoModelo } from '../../api/modelos';

/**
 * O seletor de modelo.
 *
 * Fica ao lado da caixa de escrita, e o texto entra **preenchido** — o
 * agente edita antes de enviar. Preencher no servidor devolveria o
 * mesmo texto com uma ida a mais e uma chance a mais de chegar diferente
 * do que ele viu.
 *
 * A lista já vem ordenada pelo mais usado e filtrada pela categoria do
 * chamado: sem isso, escolher entre sessenta modelos custa mais do que
 * escrever a frase.
 */
export function EscolherModelo({
  chamado,
  kind,
  aoEscolher,
  rotulo = 'Modelo',
}: {
  chamado: TicketDetail;
  kind: TemplateKind;
  aoEscolher: (texto: string, modelo: ModeloView) => void;
  rotulo?: string;
}) {
  const [modelos, setModelos] = useState<ModeloView[] | null>(null);

  useEffect(() => {
    void listarModelos({ kind, categoryId: chamado.category?.id })
      .then(setModelos)
      .catch(() => setModelos([]));
  }, [kind, chamado.category?.id]);

  if (!modelos || modelos.length === 0) return null;

  return (
    <>
      <label className="so-leitor" htmlFor={`modelo-${kind}`}>
        {rotulo}
      </label>
      <select
        id={`modelo-${kind}`}
        className="select -auto"
        value=""
        onChange={(e) => {
          const modelo = modelos.find((m) => m.id === e.target.value);
          if (!modelo) return;
          aoEscolher(preencherModelo(modelo.body, contextoDoChamado(chamado)), modelo);
          void registrarUsoDoModelo(modelo.id).catch(() => undefined);
        }}
      >
        <option value="">{rotulo}…</option>
        {modelos.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </>
  );
}

/**
 * O que o modelo pode interpolar, tirado do chamado aberto.
 *
 * Campo que o chamado não tem fica de fora do contexto — e o marcador
 * permanece visível no texto, que é melhor que uma frase com um buraco.
 */
export function contextoDoChamado(chamado: TicketDetail): ContextoDoModelo {
  return {
    'chamado.numero': String(chamado.number),
    'chamado.assunto': chamado.subject,
    ...(chamado.category ? { 'chamado.categoria': chamado.category.name } : {}),
    ...(chamado.requester?.name ? { 'requerente.nome': chamado.requester.name } : {}),
    ...(chamado.requester?.email ? { 'requerente.email': chamado.requester.email } : {}),
  };
}
