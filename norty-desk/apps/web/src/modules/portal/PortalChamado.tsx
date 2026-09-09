import { useNavigate, useParams } from 'react-router-dom';
import type { TicketStatus } from '@norty-desk/shared';

import * as api from '../../api/endpoints';
import { useAutenticacao, useRecurso } from '../../auth/Autenticacao';
import { ROTULO_STATUS, dataCurta, seloStatus } from '../../lib/formato';
import { Conversa } from '../chamado/Conversa';

export function PortalChamado() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { revalidar, can } = useAutenticacao();
  const { dado: chamado, erro, carregando } = useRecurso(() => api.obterChamado(id), [id]);

  if (carregando) return <div className="sk sk-bloco" />;

  if (erro || !chamado) {
    return (
      <div className="alerta-bloco -erro">
        <span aria-hidden="true">!</span>
        <span>{erro?.message ?? 'Chamado não encontrado.'}</span>
      </div>
    );
  }

  return (
    <div className="pilha">
      <button type="button" className="btn -fantasma -sm" onClick={() => navegar('/')}>
        ← Voltar
      </button>

      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">
            <span className="mono">#{chamado.number}</span> {chamado.subject}
          </h2>
          <p>Aberto em {dataCurta(chamado.createdAt)}</p>
        </div>
        <span className={`selo ${seloStatus(chamado.status as TicketStatus)}`}>
          {ROTULO_STATUS[chamado.status]}
        </span>
      </div>

      {chamado.status === 'SOLUCIONADO' && can('chamado:fechar') ? (
        <div className="alerta-bloco -sucesso">
          <span aria-hidden="true">✓</span>
          <span>
            A equipe marcou este chamado como resolvido.{' '}
            <button
              type="button"
              className="btn-link"
              onClick={() => void api.fechar(chamado.id).then(revalidar)}
            >
              Confirmar e encerrar
            </button>{' '}
            ou responda abaixo se ainda houver algo.
          </span>
        </div>
      ) : null}

      {/* A conversa é a mesma da tela do agente. O que muda é o que a
          API devolve: a nota interna nunca chega aqui, e o filtro é de
          consulta, não de renderização (`docs/04-rbac.md`, seção 6). */}
      <Conversa chamado={chamado} aoMudar={revalidar} />
    </div>
  );
}
