import { useLayoutEffect, type RefObject } from 'react'

/**
 * Mesure l'UI (barre du haut, plus tard sidebar) et informe le Main process
 * pour qu'il positionne la WebContentsView dans l'espace restant.
 */
export function useChromeInsets(topRef: RefObject<HTMLElement | null>, rightPx = 0): void {
  useLayoutEffect(() => {
    const el = topRef.current
    if (!el) return
    const report = () =>
      window.api.layout.setChromeInsets({ top: el.getBoundingClientRect().height, right: rightPx })
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [topRef, rightPx])
}
