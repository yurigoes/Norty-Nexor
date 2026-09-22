import { useState } from 'react';
import { formatarProtocolo } from '@norty-desk/shared';

/**
 * O protocolo, ao lado do número.
 *
 * Os dois códigos existem e servem a gente diferente. `#12` é o handle
 * de quem atende: curto, sequencial, bom para falar em reunião — e por
 * isso mesmo adivinhável, o que o desqualifica para sair daqui. O
 * protocolo é o que vai no e-mail, no WhatsApp e na consulta sem login.
 *
 * Mostrar os dois juntos resolve a pergunta que aparecia no telefone:
 * quem atende via `#12`, quem ligou tinha `4K7P-WZ9N`, e não havia
 * onde cruzar um com o outro.
 *
 * O botão de copiar não é enfeite: este código é ditado e colado, e
 * digitá-lo à mão é onde nasce o erro que o alfabeto sem letras
 * confundíveis tentou evitar.
 */
export function Protocolo({ protocolo }: { protocolo: string }) {
  const [copiado, setCopiado] = useState(false);
  const formatado = formatarProtocolo(protocolo);

  return (
    <span className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'nowrap' }}>
      <span className="campo-ajuda">Protocolo</span>
      <span className="mono">{formatado}</span>
      <button
        type="button"
        className="btn -fantasma -sm"
        aria-label={`Copiar o protocolo ${formatado}`}
        onClick={() => {
          void navigator.clipboard
            ?.writeText(formatado)
            .then(() => {
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            })
            .catch(() => undefined);
        }}
      >
        {copiado ? 'copiado' : 'copiar'}
      </button>
    </span>
  );
}
