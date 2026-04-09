import styles from './NavChip.module.css';

interface NavChipProps {
  href: string;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function NavChip({ href, active = false, children, className }: NavChipProps) {
  const classNames = [
    styles.chip,
    active ? styles.active : undefined,
    className,
  ].filter(Boolean).join(' ');

  return (
    <a href={href} className={classNames}>
      {children}
    </a>
  );
}
