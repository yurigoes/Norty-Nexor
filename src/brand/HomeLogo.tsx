import { HomeMark } from './HomeMark';
import './brand.css';

export interface HomeLogoProps {
  /** `full` = símbolo + wordmark + assinatura. `wordmark` = sem assinatura. `mark` = só símbolo. */
  variant?: 'full' | 'wordmark' | 'mark';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'light' | 'dark';
  className?: string;
}

const MARK_SIZE: Record<NonNullable<HomeLogoProps['size']>, number> = {
  sm: 26,
  md: 32,
  lg: 42,
  xl: 58,
};

/**
 * Lockup oficial my Home by norty.
 *
 * O wordmark tem dois pesos: "my" leve e "Home" em negrito — o nome se lê
 * como uma frase pessoal, não como sigla. A assinatura "by norty" é sempre
 * secundária: menor, em caixa baixa, tracking largo e cor recuada.
 */
export function HomeLogo({ variant = 'full', size = 'md', tone = 'dark', className }: HomeLogoProps) {
  return (
    <span className={`nx-logo nx-logo--${size} nx-logo--${tone} ${className ?? ''}`}>
      <HomeMark size={MARK_SIZE[size]} variant="gradient" title="my Home" />
      {variant !== 'mark' && (
        <span className="nx-logo__type">
          <span className="nx-logo__name">
            <span className="nx-logo__my">my</span>
            <span className="nx-logo__home">Home</span>
          </span>
          {variant === 'full' && <span className="nx-logo__by">by norty</span>}
        </span>
      )}
    </span>
  );
}
