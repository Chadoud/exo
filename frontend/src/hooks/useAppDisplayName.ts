import { useEffect, useState } from "react";
import { APP_DISPLAY_NAME } from "../constants";

/** Window / shortcut name. Packaged Exo Test reports via IPC; web and prod stay "Exo". */
export function useAppDisplayName(): string {
  const [name, setName] = useState(APP_DISPLAY_NAME);

  useEffect(() => {
    const getName = window.electronAPI?.getDisplayName;
    if (!getName) return;
    void getName()
      .then((next) => {
        if (typeof next === "string" && next.trim()) setName(next.trim());
      })
      .catch(() => {
        /* keep APP_DISPLAY_NAME */
      });
  }, []);

  return name;
}
