import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { parseOMDBResponse } from '../lib/movieUtils'
import type { OMDBResponse } from '../lib/movieUtils'

interface UserProfile {
  email: string
  created_at: string
  last_sign_in: string
}

export default function Profile() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [importStatus, setImportStatus] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error'
    message: string
  }>({ status: 'idle', message: '' })

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError) throw userError
      if (!user) throw new Error('No user found')

      setProfile({
        email: user.email || '',
        created_at: new Date(user.created_at).toLocaleDateString(),
        last_sign_in: new Date(user.last_sign_in_at || '').toLocaleDateString()
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
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
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password')
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportStatus({ status: 'loading', message: 'Processing your movies...' })

    try {
      const text = await file.text()
      const rows = text.split('\n')
      // Skip header row and process each movie
      const movieData = rows.slice(1).map(row => {
        const columns = row.split(',')
        // Name is in the second column (index 1), Year is in the third column (index 2)
        const title = columns[1]?.trim()
        const year = columns[2]?.trim()
        return { title, year }
      }).filter(movie => movie.title && movie.title.length > 0)

      if (movieData.length === 0) {
        throw new Error('No valid movies found in the file')
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      let added = 0
      let skipped = 0
      let failed = 0
      let failedTitles: string[] = []

      for (const { title, year } of movieData) {
        try {
          // 1. Check if movie exists in DB (by title, case-insensitive)
          let { data: movies, error: searchError } = await supabase
            .from('movies')
            .select('id, imdb_id, title')
            .ilike('title', title)
            .limit(1)

          let movieId: string | null = null

          if (searchError) throw searchError

          if (movies && movies.length > 0) {
            movieId = movies[0].id
          } else {
            // 2. Fetch from OMDb with year if available
            const params = new URLSearchParams({ title })
            if (year && year.length > 0) {
              params.append('year', year)
            }
            const response = await fetch(`/api/omdb?${params.toString()}`)
            const omdb: OMDBResponse = await response.json()
            if (omdb.Response === 'True') {
              // Parse OMDB response and prepare data for insertion
              const movieInsertData = parseOMDBResponse(omdb);

              // 3. Insert movie with all the new columns
              const { data: inserted, error: insertError } = await supabase
                .from('movies')
                .insert(movieInsertData)
                .select()
                .single()
              if (insertError) throw insertError
              movieId = inserted.id
            } else {
              failed++
              failedTitles.push(title)
              continue
            }
          }

          // 4. Check if user already has this movie
          const { data: userMovies, error: userMovieError } = await supabase
            .from('user_movies')
            .select()
            .eq('user_id', user.id)
            .eq('movie_id', movieId)
            .limit(1)
          if (userMovieError) throw userMovieError
          if (userMovies && userMovies.length > 0) {
            skipped++
            continue
          }

          // 5. Add to user_movies
          const { error: addUserMovieError } = await supabase
            .from('user_movies')
            .insert({
              movie_id: movieId,
            })
          if (addUserMovieError) throw addUserMovieError
          added++
        } catch (err) {
          failed++
          failedTitles.push(title)
        }
      }

      setImportStatus({
        status: 'success',
        message: `Added: ${added}, Skipped: ${skipped}, Failed: ${failed}${failedTitles.length ? ' (Failed: ' + failedTitles.join(', ') + ')' : ''}`
      })
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
        <div className="text-gray-600 text-lg">Loading profile...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-600 text-lg">{error}</div>
      </div>
    )
  }

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">Profile</h1>
            
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Account Information</h2>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div>
                    <span className="text-sm text-gray-500">Email</span>
                    <p className="text-gray-900">{profile?.email}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Member Since</span>
                    <p className="text-gray-900">{profile?.created_at}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Last Sign In</span>
                    <p className="text-gray-900">{profile?.last_sign_in}</p>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Import Movies</h2>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      Import your movies from Letterboxd by uploading your exported CSV file.
                      <br />
                      <a 
                        href="https://letterboxd.com/settings/data/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700"
                      >
                        Get your Letterboxd export here
                      </a>
                    </p>
                    <div className="flex items-center justify-center w-full">
                      <label className="w-full flex flex-col items-center px-4 py-6 bg-white text-blue-600 rounded-lg border-2 border-blue-600 border-dashed cursor-pointer hover:bg-blue-50">
                        <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span className="text-sm font-medium">Click to upload CSV</span>
                        <input
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={handleFileUpload}
                          disabled={importStatus.status === 'loading'}
                        />
                      </label>
                    </div>
                    {importStatus.status !== 'idle' && (
                      <div className={`text-center text-sm ${
                        importStatus.status === 'success' ? 'text-green-600' :
                        importStatus.status === 'error' ? 'text-red-600' :
                        'text-blue-600'
                      }`}>
                        {importStatus.message}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">My Movies</h2>
                <div className="bg-gray-50 rounded-lg p-4">
                  <Link
                    to="/my-movies"
                    className="w-full bg-white text-blue-600 px-4 py-2 rounded-lg font-medium border border-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center"
                  >
                    View All My Movies
                  </Link>
                </div>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Security</h2>
                {isEditing ? (
                  <form onSubmit={handlePasswordChange} className="space-y-4">
                    <div>
                      <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                        New Password
                      </label>
                      <input
                        type="password"
                        id="newPassword"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                        Confirm Password
                      </label>
                      <input
                        type="password"
                        id="confirmPassword"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <div className="flex space-x-4">
                      <button
                        type="submit"
                        className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        Update Password
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditing(false)
                          setNewPassword('')
                          setConfirmPassword('')
                        }}
                        className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="w-full bg-white text-blue-600 px-4 py-2 rounded-lg font-medium border border-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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
    </div>
  )
} 