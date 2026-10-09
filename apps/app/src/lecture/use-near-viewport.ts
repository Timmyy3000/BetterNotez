import { useEffect, useState, type RefObject } from "react";

/** Whether an element is near the visible part of its scroll area, so drawing it is worth the work. */
export function useNearViewport(target: RefObject<HTMLElement | null>, root: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = target.current;
    if (element === null) return;
    const observer = new IntersectionObserver(
      (entries) => setNear(entries.some((entry) => entry.isIntersecting)),
      { root: root.current, rootMargin: "100% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [target, root]);
  return near;
}
