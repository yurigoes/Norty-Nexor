import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline' | 'brand';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  block?: boolean;
  children?: ReactNode;
  className?: string;
}

export interface ButtonProps extends BaseProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps> {
  to?: string;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  block = false,
  children,
  className = '',
  to,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = [
    'nx-btn',
    `nx-btn--${variant}`,
    `nx-btn--${size}`,
    block ? 'nx-btn--block' : '',
    !children ? 'nx-btn--icon-only' : '',
    loading ? 'is-loading' : '',
    className,
  ].filter(Boolean).join(' ');

  const content = (
    <>
      {loading ? <Spinner size={size === 'lg' || size === 'xl' ? 18 : 14} /> : icon}
      {children && <span className="nx-btn__label">{children}</span>}
      {iconRight && !loading && <span className="nx-btn__right">{iconRight}</span>}
    </>
  );

  if (to && !disabled) {
    return <Link to={to} className={classes}>{content}</Link>;
  }

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
}
