import { ReactNode } from "react";

import styles from "./StickyActionBar.module.css";

type StickyActionBarProps = {
  children: ReactNode;
};

export default function StickyActionBar({ children }: StickyActionBarProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.inner}>{children}</div>
    </div>
  );
}
