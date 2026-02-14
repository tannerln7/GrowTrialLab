import { FlaskConical } from "lucide-react";

import styles from "./AppMarkPlaceholder.module.css";

export default function AppMarkPlaceholder() {
  return (
    <div className={styles.mark}>
      <FlaskConical size={18} />
      <span>GrowTrialLab</span>
    </div>
  );
}
