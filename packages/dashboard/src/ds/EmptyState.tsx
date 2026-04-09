import styles from './EmptyState.module.css';

interface EmptyStateProps {
  message: string;
  className?: string;
}

export function EmptyState({ message, className }: EmptyStateProps) {
  const classNames = [styles.emptyState, className].filter(Boolean).join(' ');

  return <p className={classNames}>{message}</p>;
}
