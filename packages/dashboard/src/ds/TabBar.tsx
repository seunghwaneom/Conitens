import styles from './TabBar.module.css';

interface TabItem {
  key: string;
  label: string;
}

interface TabBarProps {
  items: TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  className?: string;
}

export function TabBar({ items, activeKey, onSelect, className }: TabBarProps) {
  const barClassNames = [styles.bar, className].filter(Boolean).join(' ');

  return (
    <div className={barClassNames} role="tablist">
      {items.map((item) => {
        const tabClassNames = [
          styles.tab,
          item.key === activeKey ? styles.active : undefined,
        ].filter(Boolean).join(' ');

        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={item.key === activeKey}
            className={tabClassNames}
            onClick={() => onSelect(item.key)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
