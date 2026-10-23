import type { ReactNode } from 'react';
import { BrandMark, Wordmark } from '../../brand/Logo';
import { CarScene } from '../../brand/CarScene';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <section className="auth__panel" aria-hidden>
        <div className="row"><BrandMark size={40} /><Wordmark subtitle="Sistema de Controle de Carros" /></div>
        <div className="stack-lg">
          <CarScene />
          <h2>A operação da sua locadora, do pátio ao financeiro.</h2>
          <p>Frota, reservas, contratos, vistorias com fotos, manutenção, estoque e cobrança — com isolamento por empresa e trilha de auditoria.</p>
          <div className="auth__features">
            <div className="auth__feature"><strong>Agenda sem conflito</strong><span>O banco impede duas locações do mesmo carro no mesmo período.</span></div>
            <div className="auth__feature"><strong>Histórico por placa</strong><span>Contratos, vistorias, peças e multas na mesma linha do tempo.</span></div>
            <div className="auth__feature"><strong>Financeiro consistente</strong><span>Caução separado da receita, baixa sem duplicidade.</span></div>
            <div className="auth__feature"><strong>Multiempresa</strong><span>Cada locadora e filial vê apenas o que é seu.</span></div>
          </div>
        </div>
        <span className="xsmall" style={{ color: 'var(--text-nav-muted)' }}>Norty Car · ecossistema Norty</span>
      </section>
      <section className="auth__form">
        <div className="auth__card">{children}</div>
      </section>
    </div>
  );
}
