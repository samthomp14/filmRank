import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'

export default function Navbar() {
  const [user, setUser] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <nav className="bg-background border-b border-border relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <img
                src="/filmRankLogo.png"
                alt="FilmRank Logo"
                className="h-10 w-auto object-contain"
              />
              <span className="text-2xl font-bold text-foreground">FilmRank</span>
            </Link>
          </div>

          {/* Hamburger button (mobile only) */}
          <button
            className="md:hidden flex items-center p-2 rounded focus:outline-none"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <XMarkIcon className="h-6 w-6 text-foreground" />
            ) : (
              <Bars3Icon className="h-6 w-6 text-foreground" />
            )}
          </button>

          {/* Nav links (desktop) */}
          <div className="hidden md:flex items-center space-x-4">
            {user ? (
              <>
                <Link
                  to="/compare"
                  className="text-muted-foreground hover:text-primary px-3 py-2 rounded-md text-sm font-medium transition duration-150 ease-in-out"
                >
                  Compare
                </Link>
                <Link
                  to="/add"
                  className="text-muted-foreground hover:text-primary px-3 py-2 rounded-md text-sm font-medium transition duration-150 ease-in-out"
                >
                  Add Movie
                </Link>
                <Link
                  to="/ranking"
                  className="text-muted-foreground hover:text-primary px-3 py-2 rounded-md text-sm font-medium transition duration-150 ease-in-out"
                >
                  Rankings
                </Link>
                <Link
                  to="/my-movies"
                  className="text-muted-foreground hover:text-primary px-3 py-2 rounded-md text-sm font-medium transition duration-150 ease-in-out"
                >
                  Library
                </Link>
                <Link
                  to="/profile"
                  className="text-muted-foreground hover:text-primary px-3 py-2 rounded-md text-sm font-medium transition duration-150 ease-in-out"
                >
                  Profile
                </Link>
                <button
                  onClick={handleSignOut}
                  className="text-muted-foreground hover:text-primary px-3 py-2 rounded-md text-sm font-medium transition duration-150 ease-in-out"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-muted-foreground hover:text-primary px-3 py-2 rounded-md text-sm font-medium transition duration-150 ease-in-out"
                >
                  Log In
                </Link>
                <Link
                  to="/signup"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-sm font-medium transition duration-150 ease-in-out"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <div className="md:hidden absolute top-16 left-0 w-full bg-background border-b border-border shadow-lg z-50">
          <div className="flex flex-col items-start px-4 py-2 space-y-2">
            {user ? (
              <>
                <Link to="/compare" className="w-full py-2 text-muted-foreground hover:text-primary" onClick={() => setMenuOpen(false)}>Compare</Link>
                <Link to="/add" className="w-full py-2 text-muted-foreground hover:text-primary" onClick={() => setMenuOpen(false)}>Add Movie</Link>
                <Link to="/ranking" className="w-full py-2 text-muted-foreground hover:text-primary" onClick={() => setMenuOpen(false)}>Rankings</Link>
                <Link to="/my-movies" className="w-full py-2 text-muted-foreground hover:text-primary" onClick={() => setMenuOpen(false)}>Library</Link>
                <Link to="/profile" className="w-full py-2 text-muted-foreground hover:text-primary" onClick={() => setMenuOpen(false)}>Profile</Link>
                <button onClick={() => { handleSignOut(); setMenuOpen(false); }} className="w-full py-2 text-muted-foreground hover:text-primary text-left">Sign Out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="w-full py-2 text-muted-foreground hover:text-primary" onClick={() => setMenuOpen(false)}>Log In</Link>
                <Link to="/signup" className="w-full py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 text-center" onClick={() => setMenuOpen(false)}>Sign Up</Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
} 