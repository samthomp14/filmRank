export interface DemoFilm {
  id: string
  title: string
  year: number | null
  posterUrl: string | null
  score: number
}

export interface RankedRow {
  position: number
  id: string
  title: string
  year: number | null
  move: number
}
