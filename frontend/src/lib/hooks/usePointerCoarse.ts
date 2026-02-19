import { useEffect, useState } from "react";

const MEDIA_QUERY = "(pointer: coarse)";

export function usePointerCoarse(): boolean {
  const [isPointerCoarse, setIsPointerCoarse] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQueryList = window.matchMedia(MEDIA_QUERY);
    const update = () => setIsPointerCoarse(mediaQueryList.matches);

    update();

    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", update);
      return () => mediaQueryList.removeEventListener("change", update);
    }

    mediaQueryList.addListener(update);
    return () => mediaQueryList.removeListener(update);
  }, []);

  return isPointerCoarse;
}
