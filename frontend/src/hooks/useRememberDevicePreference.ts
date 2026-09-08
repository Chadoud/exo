import { useCallback, useEffect, useState } from "react";

/** Loads and persists “stay signed in on this device” (Electron cloud auth prefs). */
export function useRememberDevicePreference() {
  const [rememberDevice, setRememberState] = useState(false);

  useEffect(() => {
    void (async () => {
      const g = window.electronAPI?.getRememberDevice;
      if (!g) return;
      try {
        setRememberState(await g());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const setRememberDevice = useCallback(async (value: boolean) => {
    setRememberState(value);
    const s = window.electronAPI?.setRememberDevice;
    if (s) await s(value);
  }, []);

  return { rememberDevice, setRememberDevice };
}
