import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { importMoviesFromFile, formatImportResult, type ImportStatus } from '../lib/movieImportUtils'
import { computeEloStats, eloToStars } from '../lib/movieUtils'
import AnimatedLeaderboard from '../components/AnimatedLeaderboard'
import RatingDistribution from '../components/RatingDistribution'
import type { RankedRow } from '../lib/demoTypes'

interface UserProfile {
  email: string
  name: string | null
  created_at: string
}

interface RankedMovie {
  id: string
  title: string
  year: number | null
  elo_score: number
}

export default function Profile() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [rankedMovies, setRankedMovies] = useState<RankedMovie[]>([])
  const [totalComparisons, setTotalComparisons] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)

  const [isEditingPassword, setIsEditingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [importStatus, setImportStatus] = useState<ImportStatus>({ status: 'idle', message: '' })

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('No user found')

      const { data: userRow } = await supabase
        .from('users')
        .select('name')
        .eq('id', user.id)
        .single()

      setProfile({
        email: user.email || '',
        name: userRow?.name ?? null,
        created_at: new Date(user.created_at).toLocaleDateString(),
      })
      setNameInput(userRow?.name ?? '')

      const { data: movieRows, error: moviesError } = await supabase
        .from('user_movies')
        .select(`elo_score, movies:movies!user_movies_movie_id_fkey (id, title, year)`)
        .eq('user_id', user.id)
      if (moviesError) throw moviesError

      const ranked: RankedMovie[] = (movieRows || [])
        .map((m: any) => {
          const movie = Array.isArray(m.movies) ? m.movies[0] : m.movies
          return movie
            ? { id: movie.id as string, title: movie.title as string, year: (movie.year as number | null) ?? null, elo_score: m.elo_score as number }
            : null
        })
        .filter((m): m is RankedMovie => m !== null)
      setRankedMovies(ranked)

      const { count: comparisonsCount } = await supabase
        .from('comparisons')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
      setTotalComparisons(comparisonsCount || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const eloStats = useMemo(() => computeEloStats(rankedMovies.map((m) => m.elo_score)), [rankedMovies])
  const starValues = useMemo(() => rankedMovies.map((m) => eloToStars(m.elo_score, eloStats)), [rankedMovies, eloStats])

  const topRows: RankedRow[] = useMemo(
    () =>
      [...rankedMovies]
        .sort((a, b) => b.elo_score - a.elo_score)
        .slice(0, 10)
        .map((m, idx) => ({ position: idx + 1, id: m.id, title: m.title, year: m.year, move: 0 })),
    [rankedMovies]
  )

  const handleNameSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSavingName(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      const trimmed = nameInput.trim()
      const { error } = await supabase.from('users').update({ name: trimmed || null }).eq('id', user.id)
      if (error) throw error

      setProfile((prev) => (prev ? { ...prev, name: trimmed || null } : prev))
      setIsEditingName(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update name')
    } finally {
      setSavingName(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) throw error

      setNewPassword('')
      setConfirmPassword('')
      setIsEditingPassword(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password')
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      const result = await importMoviesFromFile(file, user.id, {
        onProgress: setImportStatus
      })

      setImportStatus({
        status: 'success',
        message: formatImportResult(result)
      })
      fetchProfile()
    } catch (err) {
      setImportStatus({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to import movies'
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground text-lg">Loading profile...</div>
      </div>
    )
  }

  if (error && !profile) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-destructive text-lg">{error}</div>
      </div>
    )
  }

  const displayName = profile?.name || profile?.email?.split('@')[0] || 'Filmgoer'
  const initial = displayName.trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Identity header */}
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent font-marquee text-3xl font-bold text-primary-foreground shadow-md">
            {initial}
          </div>
          <div className="flex-1">
            {isEditingName ? (
              <form onSubmit={handleNameSave} className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Your name"
                  autoFocus
                  className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={savingName}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setIsEditingName(false); setNameInput(profile?.name ?? '') }}
                  className="px-3 py-1.5 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                <h1 className="font-marquee text-2xl font-semibold uppercase tracking-[.02em] text-foreground">
                  {displayName}
                </h1>
                <button
                  onClick={() => setIsEditingName(true)}
                  title="Edit name"
                  aria-label="Edit name"
                  className="text-muted-foreground hover:text-primary focus:outline-none"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
            )}
            <p className="mt-1 text-sm text-muted-foreground">{profile?.email}</p>
            <p className="text-xs text-muted-foreground">Member since {profile?.created_at}</p>
          </div>
        </div>

        {/* Stat strip */}
        <div className="overflow-hidden rounded-xl border border-marquee-hairline bg-marquee-band">
          <div className="grid grid-cols-2 divide-x divide-marquee-hairline">
            <div className="p-6 text-center">
              <div className="font-marquee text-4xl font-bold text-primary">{rankedMovies.length}</div>
              <div className="mt-1 font-marquee text-[11px] uppercase tracking-[.2em] text-muted-foreground">Movies Ranked</div>
            </div>
            <div className="p-6 text-center">
              <div className="font-marquee text-4xl font-bold text-accent">{totalComparisons}</div>
              <div className="mt-1 font-marquee text-[11px] uppercase tracking-[.2em] text-muted-foreground">Comparisons Made</div>
            </div>
          </div>
        </div>

        {/* Rating distribution */}
        <div>
          <h2 className="mb-4 font-marquee text-lg font-semibold uppercase tracking-[.06em] text-foreground">Rating Distribution</h2>
          <div className="bg-card border border-border rounded-xl p-6">
            <RatingDistribution stars={starValues} />
          </div>
        </div>

        {/* Top 10 marquee */}
        {topRows.length > 0 && (
          <div>
            <h2 className="mb-4 font-marquee text-lg font-semibold uppercase tracking-[.06em] text-foreground">My Top {topRows.length}</h2>
            <AnimatedLeaderboard
              rows={topRows}
              listLabel="My Rankings"
              onRowClick={(row) => navigate(`/movie/${row.id}`)}
            />
          </div>
        )}

        {/* Settings */}
        <div className="bg-card border border-border rounded-xl shadow-md overflow-hidden">
          <div className="p-8 space-y-6">
            <h2 className="font-marquee text-xl font-semibold uppercase tracking-[.02em] text-foreground text-center">Settings</h2>

            {error && (
              <div className="text-destructive text-sm text-center">{error}</div>
            )}

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Import Movies</h3>
              <div className="bg-secondary rounded-lg p-4">
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Import your movies from Letterboxd by uploading your exported <b>ZIP file</b> or the <b>watched.csv</b> file.<br />
                    <span className="text-muted-foreground">We recommend uploading the ZIP file directly – we'll find the right file for you!</span><br />
                    <a
                      href="https://letterboxd.com/settings/data/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-accent"
                    >
                      Get your Letterboxd export here
                    </a>
                  </p>
                  <div className="flex items-center justify-center w-full">
                    <label className="w-full flex flex-col items-center px-4 py-6 bg-background text-primary rounded-lg border-2 border-primary border-dashed cursor-pointer hover:bg-primary/10">
                      <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-sm font-medium">Click to upload ZIP or CSV</span>
                      <input
                        type="file"
                        accept=".csv,.zip"
                        className="hidden"
                        onChange={handleFileUpload}
                        disabled={importStatus.status === 'loading'}
                      />
                    </label>
                  </div>
                  {importStatus.status !== 'idle' && (
                    <div className="space-y-2">
                      <div className={`text-center text-sm ${
                        importStatus.status === 'success' ? 'text-success' :
                        importStatus.status === 'error' ? 'text-destructive' :
                        'text-primary'
                      }`}>
                        {importStatus.message}
                      </div>
                      {importStatus.status === 'loading' && importStatus.progress !== undefined && (
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all duration-300"
                            style={{ width: `${importStatus.progress}%` }}
                          ></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">My Library</h3>
              <div className="bg-secondary rounded-lg p-4">
                <Link
                  to="/my-movies"
                  className="w-full bg-background text-primary px-4 py-2 rounded-lg font-medium border border-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background flex items-center justify-center"
                >
                  View Library
                </Link>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Security</h3>
              {isEditingPassword ? (
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-foreground mb-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      id="newPassword"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-border focus:ring-2 focus:ring-primary focus:border-primary"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-1">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-border focus:ring-2 focus:ring-primary focus:border-primary"
                      required
                    />
                  </div>
                  <div className="flex space-x-4">
                    <button
                      type="submit"
                      className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                    >
                      Update Password
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingPassword(false)
                        setNewPassword('')
                        setConfirmPassword('')
                      }}
                      className="flex-1 bg-secondary text-foreground px-4 py-2 rounded-lg font-medium hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="bg-secondary rounded-lg p-4">
                  <button
                    onClick={() => setIsEditingPassword(true)}
                    className="w-full bg-background text-primary px-4 py-2 rounded-lg font-medium border border-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                  >
                    Change Password
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
