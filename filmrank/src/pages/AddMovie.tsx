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
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Add a Movie</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter movie title"
          required
          className="w-full border rounded p-2"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
          Add Movie
        </button>
      </form>
      {status === 'success' && (
        <p className="mt-4 text-green-600">✅ Movie added!</p>
      )}
      {status === 'error' && (
        <p className="mt-4 text-red-600">❌ Error adding movie. Are you logged in?</p>
      )}
    </div>
  )
}
