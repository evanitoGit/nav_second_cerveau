const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

/** « il y a 5 minutes », « hier à 14:32 », « lundi 16 nov. », « 3 mars 2025 ». */
export function formatVisit(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp
  if (diff < 60_000) return "à l'instant"
  if (diff < 3_600_000) return rtf.format(-Math.round(diff / 60_000), 'minute')

  const date = new Date(timestamp)
  const today = new Date(now)
  const days = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86_400_000
  )
  if (days === 0) return `aujourd'hui à ${timeFmt.format(date)}`
  if (days === 1) return `hier à ${timeFmt.format(date)}`
  if (days < 7) return dayFmt.format(date)
  return dateFmt.format(date)
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
