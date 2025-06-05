// src/pages/AddMovie.tsx
import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function AddMovie() {
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<null | 'success' | 'error'>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setStatus('error')
      return
    }

    const { error } = await supabase.from('movies').insert({
      title,
      user_id: user.id,
    })

    if (error) {
      console.error(error)
      setStatus('error')
    } else {
      setStatus('success')
      setTitle('')
    }
  }

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden">
        <div className="p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">Add a Movie</h1>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter movie title"
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-150 ease-in-out"
            >
              Add Movie
            </button>
          </form>
          {status === 'success' && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg">
              <p className="text-green-700 text-center">✅ Movie added successfully!</p>
            </div>
          )}
          {status === 'error' && (
            <div className="mt-4 p-4 bg-red-50 rounded-lg">
              <p className="text-red-700 text-center">❌ Error adding movie. Please make sure you're logged in.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
