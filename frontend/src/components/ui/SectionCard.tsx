import { ReactNode } from "react";

import styles from "./SectionCard.module.css";

type SectionCardProps = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export default function SectionCard({
  title,
  subtitle,
  actions,
  children,
}: SectionCardProps) {
  return (
    <section className={styles.card}>
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
