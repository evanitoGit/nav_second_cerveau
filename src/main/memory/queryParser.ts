/**
 * Analyse d'une requête en langage naturel (français) :
 * - extrait une période (« la semaine dernière », « il y a 3 jours », « lundi dernier »…) ;
 * - retourne le texte restant pour la recherche sémantique ;
 * - construit une requête FTS5 sûre (mots significatifs, préfixes, sans mots vides).
 *
 * Module pur (aucune dépendance) : testable isolément.
 */

export interface TimeRange {
  from: number
  to: number
  /** Libellé affiché à l'utilisateur, ex. « la semaine dernière ». */
  label: string
}

export interface ParsedQuery {
  /** Texte sans l'expression temporelle (pour les embeddings). */
  text: string
  /** Requête FTS5 (vide si aucun mot significatif). */
  fts: string
  range: TimeRange | null
}

const NUMBERS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30, quelques: 3
}

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre']

/** Mots ignorés par la recherche plein texte (mots vides + verbes de « commande »). */
const STOPWORDS = new Set(
  `a à au aux avec ce ces cet cette chez d dans de des du elle en et eu il ils j je l la le les leur lu lue lus lues
   m ma me mes moi mon n ne ni nos notre nous on ou où par pas pour qu que quel quelle qui quoi s sa se ses si son
   sur t ta te tes toi ton tu un une vos votre vous y était etait avait ai as est sont été ete fait
   retrouve retrouver retrouvez trouve trouver cherche chercher montre montrer affiche afficher donne
   article articles page pages site sites lien liens truc chose document vu vue vus consulte consulté consultee consultée
   parlait parle parlant parler qui quand comment lequel laquelle celui celle ça ca cela`
    .split(/\s+/)
    .filter(Boolean)
)

/** Minuscules sans accents, pour comparer « fevrier » et « février ». */
function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Lundi 00:00 de la semaine de `d` (semaine à la française). */
function startOfWeek(d: Date): Date {
  const day = startOfDay(d)
  const offset = (day.getDay() + 6) % 7
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - offset)
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

function range(from: Date, to: Date, label: string): TimeRange {
  return { from: from.getTime(), to: to.getTime(), label }
}

type Rule = { re: RegExp; build: (m: RegExpMatchArray, now: Date) => TimeRange | null }

const NUM = `(\\d+|${Object.keys(NUMBERS).join('|')})`
const toNumber = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUMBERS[s] ?? 1)

/** Règles appliquées sur le texte « plié » (minuscules, sans accents). L'ordre compte. */
const RULES: Rule[] = [
  {
    re: /\bavant[- ]hier\b/,
    build: (_m, now) => range(addDays(startOfDay(now), -2), addDays(startOfDay(now), -1), 'avant-hier')
  },
  {
    re: /\bhier(?: (?:matin|midi|soir|apres-midi))?\b/,
    build: (_m, now) => range(addDays(startOfDay(now), -1), startOfDay(now), 'hier')
  },
  {
    re: /\b(?:aujourd'?hui|ce (?:matin|midi|soir)|cet apres-midi|tout a l'heure)\b/,
    build: (_m, now) => range(startOfDay(now), addDays(startOfDay(now), 1), "aujourd'hui")
  },
  {
    re: /\b(?:la |cette )?semaine (?:derniere|passee)\b|\bl'autre semaine\b/,
    build: (_m, now) => range(addDays(startOfWeek(now), -7), startOfWeek(now), 'la semaine dernière')
  },
  {
    re: /\bcette semaine\b/,
    build: (_m, now) => range(startOfWeek(now), addDays(startOfWeek(now), 7), 'cette semaine')
  },
  {
    re: /\b(?:le )?mois (?:dernier|passe)\b/,
    build: (_m, now) =>
      range(new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1), 'le mois dernier')
  },
  {
    re: /\bce mois(?:-ci)?\b/,
    build: (_m, now) =>
      range(new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1), 'ce mois-ci')
  },
  {
    re: /\b(?:l'annee (?:derniere|passee))\b/,
    build: (_m, now) => range(new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear(), 0, 1), "l'année dernière")
  },
  {
    re: /\bcette annee\b/,
    build: (_m, now) => range(new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1), 'cette année')
  },
  {
    re: new RegExp(`\\bil y a ${NUM} (jours?|semaines?|mois)\\b`),
    build: (m, now) => {
      const n = toNumber(m[1])
      const today = startOfDay(now)
      if (m[2].startsWith('jour')) {
        // Tolérance d'un jour de chaque côté : la mémoire humaine est approximative.
        return range(addDays(today, -n - 1), addDays(today, -n + 2), `il y a ${n} jour${n > 1 ? 's' : ''}`)
      }
      if (m[2].startsWith('semaine')) {
        const start = addDays(startOfWeek(now), -7 * n)
        return range(addDays(start, -3), addDays(start, 10), `il y a ${n} semaine${n > 1 ? 's' : ''}`)
      }
      return range(
        new Date(now.getFullYear(), now.getMonth() - n, 1),
        new Date(now.getFullYear(), now.getMonth() - n + 1, 1),
        `il y a ${n} mois`
      )
    }
  },
  {
    re: new RegExp(`\\b(?:ces|les) ${NUM} derni(?:ers|eres) (jours|semaines|mois)\\b`),
    build: (m, now) => {
      const n = toNumber(m[1])
      const days = m[2] === 'jours' ? n : m[2] === 'semaines' ? 7 * n : 31 * n
      return range(addDays(startOfDay(now), -days), addDays(startOfDay(now), 1), `les ${n} derniers ${m[2]}`)
    }
  },
  {
    re: /\b(?:recemment|ces derniers jours|dernierement)\b/,
    build: (_m, now) => range(addDays(startOfDay(now), -7), addDays(startOfDay(now), 1), 'ces derniers jours')
  },
  {
    re: new RegExp(`\\b(${WEEKDAYS.join('|')})(?: (dernier|passe))?\\b`),
    build: (m, now) => {
      const target = WEEKDAYS.indexOf(m[1])
      const today = startOfDay(now)
      let diff = (today.getDay() - target + 7) % 7
      if (diff === 0) diff = 7 // « lundi » un lundi = lundi de la semaine précédente
      const day = addDays(today, -diff)
      return range(day, addDays(day, 1), `${m[1]} dernier`)
    }
  },
  {
    re: new RegExp(`\\b(?:en |au mois d'?e? ?)(${MONTHS.join('|')})\\b`),
    build: (m, now) => {
      const month = MONTHS.indexOf(m[1])
      const year = month > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear()
      return range(new Date(year, month, 1), new Date(year, month + 1, 1), `en ${m[1]}`)
    }
  }
]

/** Préposition qui précède souvent l'expression temporelle (« lu la semaine dernière »). */
const LEADING_FILLER = /\b(?:lue?s?|vue?s?|consultee?s?|ouverte?s?|visitee?s?)\s*$/

export function parseQuery(input: string, now: Date = new Date()): ParsedQuery {
  const original = input.trim().slice(0, 500)
  const folded = fold(original)
  let rangeFound: TimeRange | null = null
  let text = original

  for (const rule of RULES) {
    const m = folded.match(rule.re)
    if (!m || m.index === undefined) continue
    rangeFound = rule.build(m, now)
    if (!rangeFound) continue
    // `fold` conserve la longueur pour les caractères latins courants : on retire le même segment du texte original.
    let start = m.index
    const before = folded.slice(0, start).replace(LEADING_FILLER, '')
    start = before.length
    text = `${original.slice(0, start)} ${original.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim()
    break
  }

  return { text, fts: buildFtsQuery(text), range: rangeFound }
}

/**
 * Requête FTS5 sûre : uniquement des mots alphanumériques entre guillemets (aucune syntaxe FTS
 * injectable), en préfixe (« requete » trouve « requêtes »), combinés en OR et classés par BM25.
 */
export function buildFtsQuery(text: string): string {
  const words = fold(text).match(/[\p{L}\p{N}]+/gu) ?? []
  const terms = [...new Set(words.filter((w) => w.length >= 2 && !STOPWORDS.has(w)).map(singular))].slice(0, 12)
  return terms.map((w) => (w.length >= 4 ? `"${w}"*` : `"${w}"`)).join(' OR ')
}

/** Pluriel naïf : « requetes » → « requete », qui en préfixe couvre singulier et pluriel. */
function singular(word: string): string {
  if (word.length < 5) return word
  return word.endsWith('s') || word.endsWith('x') ? word.slice(0, -1) : word
}
