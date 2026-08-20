import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeftIcon,
  EnvelopeIcon,
  LockClosedIcon,
  TagIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import type { Area } from 'react-easy-crop'
import { supabase } from '../lib/supabaseClient'
import { importMoviesFromFile, formatImportResult, type ImportStatus } from '../lib/movieImportUtils'
import { cropToWebpBlob, getAvatarPublicUrl, removeAvatar, uploadAvatar, validateAvatarFile } from '../lib/avatarUtils'
import { GENRE_OPTIONS } from '../lib/genresUtils'
import { computeEloStats, eloToStars } from '../lib/movieUtils'
import AvatarCropModal from '../components/AvatarCropModal'

const sectionLabelClass = 'mb-3 px-1 font-marquee text-[11px] font-semibold uppercase tracking-[.2em] text-muted-foreground'
const groupClass = 'divide-y divide-border border-y border-border'
// Ghost (borderless) buttons for lightweight row-level triggers — no boxed outline, just a hover tint.
const pillButtonClass = 'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50'
const destructivePillButtonClass = 'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50'
// Solid buttons reserved for the one real committing action inside an open form.
const primaryButtonClass = 'rounded-lg px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50'
const ghostButtonClass = 'rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background'
const rowIconClass = 'mt-0.5 h-5 w-5 shrink-0 text-muted-foreground'

export default function Settings() {
  const [isEditingPassword, setIsEditingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const [email, setEmail] = useState('')
  const [isEditingEmail, setIsEditingEmail] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailPending, setEmailPending] = useState(false)

  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [savedGenres, setSavedGenres] = useState<string[]>([])
  const [genresStatus, setGenresStatus] = useState<ImportStatus>({ status: 'idle', message: '' })

  const [importStatus, setImportStatus] = useState<ImportStatus>({ status: 'idle', message: '' })
  const [exportStatus, setExportStatus] = useState<ImportStatus>({ status: 'idle', message: '' })
  const [resetStatus, setResetStatus] = useState<ImportStatus>({ status: 'idle', message: '' })

  const [userId, setUserId] = useState<string | null>(null)
  const [initial, setInitial] = useState('?')
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [avatarObjectUrl, setAvatarObjectUrl] = useState<string | null>(null)
  const [cropModalOpen, setCropModalOpen] = useState(false)
  const [avatarStatus, setAvatarStatus] = useState<ImportStatus>({ status: 'idle', message: '' })
  const avatarFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const loadAccount = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      setEmail(user.email || '')

      const { data: userRow } = await supabase
        .from('users')
        .select('name, avatar_filename, preferences')
        .eq('id', user.id)
        .single()

      const displayName = userRow?.name || user.email?.split('@')[0] || 'Filmgoer'
      setInitial(displayName.trim().charAt(0).toUpperCase() || '?')
      setAvatarPath(userRow?.avatar_filename ?? null)

      const genres = (userRow?.preferences as { genres?: string[] } | null)?.genres ?? []
      setSelectedGenres(genres)
      setSavedGenres(genres)
    }
    loadAccount()
  }, [])

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError(null)

    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail })
      if (error) throw error

      setIsEditingEmail(false)
      setEmailPending(true)
      setNewEmail('')
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to update email')
    }
  }

  const handleGenreToggle = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : prev.length < 3
          ? [...prev, genre]
          : prev
    )
  }

  const handleGenresSave = async () => {
    if (!userId) return
    setGenresStatus({ status: 'loading', message: 'Saving...' })
    try {
      const { data: userRow } = await supabase
        .from('users')
        .select('preferences')
        .eq('id', userId)
        .single()
      const existingPreferences = (userRow?.preferences as Record<string, unknown> | null) ?? {}

      const { error } = await supabase
        .from('users')
        .update({ preferences: { ...existingPreferences, genres: selectedGenres } })
        .eq('id', userId)
      if (error) throw error

      setSavedGenres(selectedGenres)
      setGenresStatus({ status: 'success', message: 'Genre preferences saved' })
    } catch (err) {
      setGenresStatus({ status: 'error', message: err instanceof Error ? err.message : 'Failed to save preferences' })
    }
  }

  const handleExportRatings = async () => {
    if (!userId) return
    setExportStatus({ status: 'loading', message: 'Preparing export...' })
    try {
      const { data: movieRows, error } = await supabase
        .from('user_movies')
        .select(`elo_score, movies:movies!user_movies_movie_id_fkey (title, year)`)
        .eq('user_id', userId)
      if (error) throw error

      type MovieJoinRow = { elo_score: number; movies: { title: string; year: number | null } | { title: string; year: number | null }[] | null }
      const rows = ((movieRows ?? []) as MovieJoinRow[])
        .map((m) => {
          const movie = Array.isArray(m.movies) ? m.movies[0] : m.movies
          return movie ? { title: movie.title, year: movie.year, elo_score: m.elo_score } : null
        })
        .filter((m): m is { title: string; year: number | null; elo_score: number } => m !== null)
        .sort((a, b) => b.elo_score - a.elo_score)

      if (rows.length === 0) {
        setExportStatus({ status: 'error', message: 'No ranked movies to export yet' })
        return
      }

      const eloStats = computeEloStats(rows.map((r) => r.elo_score))
      const csvHeader = 'Title,Year,Rating (out of 5),Elo Score\n'
      const csvBody = rows
        .map((r) => {
          const stars = eloToStars(r.elo_score, eloStats).toFixed(2)
          const title = `"${r.title.replace(/"/g, '""')}"`
          return `${title},${r.year ?? ''},${stars},${Math.round(r.elo_score)}`
        })
        .join('\n')

      const blob = new Blob([csvHeader + csvBody], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'filmrank-ratings.csv'
      link.click()
      URL.revokeObjectURL(url)

      setExportStatus({ status: 'success', message: `Exported ${rows.length} movies` })
    } catch (err) {
      setExportStatus({ status: 'error', message: err instanceof Error ? err.message : 'Failed to export ratings' })
    }
  }

  const handleResetRankings = async () => {
    if (!userId) return
    const confirmed = window.confirm(
      'This permanently deletes all your movie ratings and comparison history. Your account and imported movie list stay intact, but every ranking resets to zero. This cannot be undone. Continue?'
    )
    if (!confirmed) return

    setResetStatus({ status: 'loading', message: 'Resetting your rankings...' })
    try {
      const { error: comparisonsError } = await supabase.from('comparisons').delete().eq('user_id', userId)
      if (comparisonsError) throw comparisonsError

      const { error: userMoviesError } = await supabase.from('user_movies').delete().eq('user_id', userId)
      if (userMoviesError) throw userMoviesError

      setResetStatus({ status: 'success', message: 'Your rankings have been reset' })
    } catch (err) {
      setResetStatus({ status: 'error', message: err instanceof Error ? err.message : 'Failed to reset rankings' })
    }
  }

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const validationError = validateAvatarFile(file)
    if (validationError) {
      setAvatarStatus({ status: 'error', message: validationError })
      return
    }

    setAvatarStatus({ status: 'idle', message: '' })
    setAvatarObjectUrl(URL.createObjectURL(file))
    setCropModalOpen(true)
  }

  const closeCropModal = () => {
    setCropModalOpen(false)
    if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl)
    setAvatarObjectUrl(null)
  }

  const handleCropConfirm = async (croppedAreaPixels: Area) => {
    if (!userId || !avatarObjectUrl) return
    setAvatarStatus({ status: 'loading', message: 'Uploading photo...' })

    try {
      const image = new Image()
      image.src = avatarObjectUrl
      await image.decode()

      const blob = await cropToWebpBlob(image, {
        x: croppedAreaPixels.x,
        y: croppedAreaPixels.y,
        size: croppedAreaPixels.width,
      })
      const newPath = await uploadAvatar(userId, blob, avatarPath)

      setAvatarPath(newPath)
      setAvatarStatus({ status: 'success', message: 'Profile photo updated' })
      setCropModalOpen(false)
      URL.revokeObjectURL(avatarObjectUrl)
      setAvatarObjectUrl(null)
    } catch (err) {
      setAvatarStatus({ status: 'error', message: err instanceof Error ? err.message : 'Failed to upload photo' })
    }
  }

  const handleRemoveAvatar = async () => {
    if (!userId || !avatarPath) return
    setAvatarStatus({ status: 'loading', message: 'Removing photo...' })
    try {
      await removeAvatar(userId, avatarPath)
      setAvatarPath(null)
      setAvatarStatus({ status: 'idle', message: '' })
    } catch (err) {
      setAvatarStatus({ status: 'error', message: err instanceof Error ? err.message : 'Failed to remove photo' })
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters')
      return
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      setNewPassword('')
      setConfirmPassword('')
      setIsEditingPassword(false)
      setPasswordSuccess(true)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password')
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
    } catch (err) {
      setImportStatus({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to import movies'
      })
    }
  }

  return (
    <div className="py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Link
            to="/profile"
            aria-label="Back to profile"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </Link>
          <h1 className="font-marquee text-xl font-semibold uppercase tracking-[.06em] text-foreground">Settings</h1>
        </div>

        {/* Account */}
        <div>
          <h2 className={sectionLabelClass}>Account</h2>
          <div className={groupClass}>
            {/* Profile photo row */}
            <div className="py-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {avatarPath ? (
                    <img
                      src={getAvatarPublicUrl(avatarPath)}
                      alt="Your profile photo"
                      className="h-14 w-14 flex-shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent font-marquee text-xl font-bold text-primary-foreground">
                      {initial}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">Profile Photo</p>
                    <p className="text-xs text-muted-foreground">Shown on your profile</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    disabled={avatarStatus.status === 'loading'}
                    className={pillButtonClass}
                  >
                    Change
                  </button>
                  {avatarPath && (
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      disabled={avatarStatus.status === 'loading'}
                      className={destructivePillButtonClass}
                    >
                      Remove
                    </button>
                  )}
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleAvatarSelect}
                  />
                </div>
              </div>
              {avatarStatus.status !== 'idle' && (
                <div className={`mt-3 text-sm ${
                  avatarStatus.status === 'success' ? 'text-success' :
                  avatarStatus.status === 'error' ? 'text-destructive' :
                  'text-primary'
                }`}>
                  {avatarStatus.message}
                </div>
              )}
            </div>

            {/* Email row */}
            <div className="py-5">
              {isEditingEmail ? (
                <form onSubmit={handleEmailChange} className="space-y-4">
                  <div>
                    <label htmlFor="newEmail" className="block text-sm font-medium text-foreground mb-1">
                      New Email
                    </label>
                    <input
                      type="email"
                      id="newEmail"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-border focus:ring-2 focus:ring-primary focus:border-primary"
                      required
                    />
                  </div>
                  {emailError && <p className="text-sm text-destructive">{emailError}</p>}
                  <div className="flex gap-3">
                    <button type="submit" className={primaryButtonClass}>
                      Send Confirmation
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsEditingEmail(false); setNewEmail(''); setEmailError(null) }}
                      className={ghostButtonClass}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <EnvelopeIcon className={rowIconClass} />
                    <div>
                      <p className="text-sm font-medium text-foreground">Email</p>
                      <p className="text-xs text-muted-foreground">
                        {emailPending ? `Confirmation sent — check your inbox to finish changing from ${email}` : email}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setIsEditingEmail(true); setNewEmail(email); setEmailPending(false) }}
                    className={pillButtonClass}
                  >
                    Change Email
                  </button>
                </div>
              )}
            </div>

            {/* Password row */}
            <div className="py-5">
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
                  {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
                  <div className="flex gap-3">
                    <button type="submit" className={primaryButtonClass}>
                      Update Password
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingPassword(false)
                        setNewPassword('')
                        setConfirmPassword('')
                        setPasswordError(null)
                      }}
                      className={ghostButtonClass}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <LockClosedIcon className={rowIconClass} />
                    <div>
                      <p className="text-sm font-medium text-foreground">Password</p>
                      <p className="text-xs text-muted-foreground">
                        {passwordSuccess ? 'Password updated' : 'Change your account password'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setIsEditingPassword(true); setPasswordSuccess(false) }}
                    className={pillButtonClass}
                  >
                    Change Password
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div>
          <h2 className={sectionLabelClass}>Preferences</h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <TagIcon className={rowIconClass} />
              <div>
                <p className="text-sm font-medium text-foreground">Favorite Genres</p>
                <p className="text-xs text-muted-foreground">Select up to 3 — used to personalize recommendations</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {GENRE_OPTIONS.map((genre) => {
                const selected = selectedGenres.includes(genre)
                const disabled = !selected && selectedGenres.length >= 3
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => handleGenreToggle(genre)}
                    aria-pressed={selected}
                    disabled={disabled}
                    className={`px-3 py-1 rounded-full border text-sm transition-colors focus:outline-none ${
                      selected
                        ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
                        : 'bg-background text-primary border-primary hover:bg-primary/10'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {genre}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleGenresSave}
                disabled={genresStatus.status === 'loading' || JSON.stringify(selectedGenres) === JSON.stringify(savedGenres)}
                className={primaryButtonClass}
              >
                Save Preferences
              </button>
              {genresStatus.status !== 'idle' && (
                <span className={`text-sm ${
                  genresStatus.status === 'success' ? 'text-success' :
                  genresStatus.status === 'error' ? 'text-destructive' :
                  'text-primary'
                }`}>
                  {genresStatus.message}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Data */}
        <div>
          <h2 className={sectionLabelClass}>Data</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <ArrowUpTrayIcon className={rowIconClass} />
              <div>
                <p className="text-sm font-medium text-foreground">Import from Letterboxd</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload your exported <b>ZIP file</b> or <b>watched.csv</b> file.{' '}
                  We recommend the ZIP file directly — we'll find the right file for you.{' '}
                  <a
                    href="https://letterboxd.com/settings/data/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-accent"
                  >
                    Get your Letterboxd export here
                  </a>
                </p>
              </div>
            </div>
            <label className="flex w-full flex-col items-center px-4 py-6 bg-background text-primary rounded-lg border-2 border-primary border-dashed cursor-pointer hover:bg-primary/10">
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

            <div className="pt-2 border-t border-border">
              <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
                <div className="flex items-start gap-3">
                  <ArrowDownTrayIcon className={rowIconClass} />
                  <div>
                    <p className="text-sm font-medium text-foreground">Export My Ratings</p>
                    <p className="text-xs text-muted-foreground">Download all your rankings as a CSV file</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleExportRatings}
                  disabled={exportStatus.status === 'loading'}
                  className={pillButtonClass}
                >
                  Export CSV
                </button>
              </div>
              {exportStatus.status !== 'idle' && (
                <div className={`mt-2 text-sm ${
                  exportStatus.status === 'success' ? 'text-success' :
                  exportStatus.status === 'error' ? 'text-destructive' :
                  'text-primary'
                }`}>
                  {exportStatus.message}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div>
          <h2 className={sectionLabelClass}>Danger Zone</h2>
          <div className="border-y border-border py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <TrashIcon className={`${rowIconClass} text-destructive/70`} />
                <div>
                  <p className="text-sm font-medium text-foreground">Reset My Rankings</p>
                  <p className="text-xs text-muted-foreground">Permanently deletes all ratings and comparison history</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetRankings}
                disabled={resetStatus.status === 'loading'}
                className={destructivePillButtonClass}
              >
                Reset Rankings
              </button>
            </div>
            {resetStatus.status !== 'idle' && (
              <div className={`mt-3 text-sm ${
                resetStatus.status === 'success' ? 'text-success' :
                resetStatus.status === 'error' ? 'text-destructive' :
                'text-primary'
              }`}>
                {resetStatus.message}
              </div>
            )}
          </div>
        </div>
      </div>

      <AvatarCropModal
        open={cropModalOpen}
        imageSrc={avatarObjectUrl}
        onClose={closeCropModal}
        onConfirm={handleCropConfirm}
        confirming={avatarStatus.status === 'loading'}
      />
    </div>
  )
}
