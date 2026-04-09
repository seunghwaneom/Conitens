import styles from './ErrorDisplay.module.css';

interface ErrorDisplayProps {
  message: string;
  className?: string;
}

export function ErrorDisplay({ message, className }: ErrorDisplayProps) {
  const classNames = [styles.errorDisplay, className].filter(Boolean).join(' ');

  return <p className={classNames}>{message}</p>;
}
