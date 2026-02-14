import { ReactNode } from "react";

import styles from "./SectionCard.module.css";

type SectionCardProps = {
  className?: string;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export default function SectionCard({
  className,
  title,
  subtitle,
  actions,
  children,
}: SectionCardProps) {
  const cardClassName = className ? `${styles.card} ${className}` : styles.card;
  return (
    <section className={cardClassName}>
      {title || subtitle || actions ? (
        <header className={styles.header}>
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
      ) : null}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
