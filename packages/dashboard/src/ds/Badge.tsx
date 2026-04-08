import styles from './Badge.module.css';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export function Badge({ children, className, variant = 'neutral' }: BadgeProps) {
  const classNames = [
    styles.badge,
    styles[variant],
    className,
  ].filter(Boolean).join(' ');

  return <span className={classNames}>{children}</span>;
}
