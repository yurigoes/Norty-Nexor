import { NexorMark } from './NexorMark';
import './brand.css';

export interface NexorLogoProps {
  /** `full` = símbolo + wordmark + assinatura. `wordmark` = sem assinatura. `mark` = só símbolo. */
  variant?: 'full' | 'wordmark' | 'mark';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'light' | 'dark';
  className?: string;
}

const MARK_SIZE: Record<NonNullable<NexorLogoProps['size']>, number> = {
  sm: 26,
  md: 32,
  lg: 42,
  xl: 58,
};

/**
 * Lockup oficial NEXOR by Norty.
 * A assinatura "by Norty" é sempre secundária: menor, com peso leve,
 * tracking largo e opacidade reduzida — nunca compete com o nome.
 */
export function NexorLogo({ variant = 'full', size = 'md', tone = 'dark', className }: NexorLogoProps) {
  return (
    <span className={`nx-logo nx-logo--${size} nx-logo--${tone} ${className ?? ''}`}>
      <NexorMark size={MARK_SIZE[size]} variant={tone === 'light' ? 'light' : 'gradient'} title="NEXOR" />
      {variant !== 'mark' && (
        <span className="nx-logo__type">
          <span className="nx-logo__name">NEXOR</span>
          {variant === 'full' && <span className="nx-logo__by">by Norty</span>}
        </span>
      )}
    </span>
  );
}
