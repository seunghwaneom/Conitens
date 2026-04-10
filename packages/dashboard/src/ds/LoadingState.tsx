import styles from './LoadingState.module.css';

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({ message = 'Loading…', className }: LoadingStateProps) {
  const classNames = [styles.loadingState, className].filter(Boolean).join(' ');

  return <p className={classNames}>{message}</p>;
}
