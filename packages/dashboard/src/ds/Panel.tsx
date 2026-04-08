import { type ReactNode } from 'react';
import styles from './Panel.module.css';

interface PanelProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'raised' | 'muted';
  header?: ReactNode;
}

export function Panel({ children, className, variant = 'default', header }: PanelProps) {
  const classNames = [
    styles.panel,
    styles[variant],
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classNames}>
      {header && <div className={styles.header}>{header}</div>}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
