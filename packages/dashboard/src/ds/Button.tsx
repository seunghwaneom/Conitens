import { type ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}

export function Button({ variant = 'secondary', className, children, ...rest }: ButtonProps) {
  const classNames = [
    styles.button,
    styles[variant],
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={classNames} {...rest}>
      {children}
    </button>
  );
}
