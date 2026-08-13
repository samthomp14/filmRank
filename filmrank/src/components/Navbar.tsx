import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'

const navLinkClass =
  'font-marquee text-[13px] font-medium uppercase tracking-[.08em] text-muted-foreground hover:text-accent transition-colors px-3 py-2'

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
    <header className="marquee-scrim sticky top-0 z-40 border-b border-marquee-hairline backdrop-blur">
      <div className="mx-auto flex h-[64px] max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-[11px]">
          <span className="block h-[11px] w-[11px] rounded-full bg-marquee-bulb shadow-[0_0_12px_2px_rgba(232,190,74,.7)]" />
          <span className="font-wordmark text-[19px] tracking-[.06em] text-foreground">FilmRank</span>
        </Link>

        {/* Hamburger button (mobile only) */}
        <button
          className="flex items-center rounded p-2 text-foreground focus:outline-none md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
        </button>

        {/* Nav links (desktop) */}
        <div className="hidden items-center gap-1 md:flex">
          {user ? (
            <>
              <Link to="/compare" className={navLinkClass}>Compare</Link>
              <Link to="/add" className={navLinkClass}>Add Movie</Link>
              <Link to="/ranking" className={navLinkClass}>Rankings</Link>
              <Link to="/my-movies" className={navLinkClass}>Library</Link>
              <Link to="/profile" className={navLinkClass}>Profile</Link>
              <button onClick={handleSignOut} className={navLinkClass}>Sign Out</button>
            </>
          ) : (
            <>
              <Link to="/login" className={navLinkClass}>Log In</Link>
              <Link
                to="/signup"
                className="ml-2 rounded bg-primary px-5 py-[10px] font-marquee text-[13px] font-semibold uppercase tracking-[.06em] text-primary-foreground shadow-[0_0_0_1px_rgba(232,190,74,.5),0_8px_20px_-8px_rgba(201,82,47,.7)]"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <div className="marquee-scrim absolute left-0 top-[64px] z-50 w-full border-b border-marquee-hairline shadow-lg backdrop-blur md:hidden">
          <div className="flex flex-col items-start gap-1 px-4 py-3">
            {user ? (
              <>
                <Link to="/compare" className={navLinkClass} onClick={() => setMenuOpen(false)}>Compare</Link>
                <Link to="/add" className={navLinkClass} onClick={() => setMenuOpen(false)}>Add Movie</Link>
                <Link to="/ranking" className={navLinkClass} onClick={() => setMenuOpen(false)}>Rankings</Link>
                <Link to="/my-movies" className={navLinkClass} onClick={() => setMenuOpen(false)}>Library</Link>
                <Link to="/profile" className={navLinkClass} onClick={() => setMenuOpen(false)}>Profile</Link>
                <button
                  onClick={() => { handleSignOut(); setMenuOpen(false) }}
                  className={`${navLinkClass} w-full text-left`}
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className={navLinkClass} onClick={() => setMenuOpen(false)}>Log In</Link>
                <Link
                  to="/signup"
                  className="mt-1 w-full rounded bg-primary px-5 py-[10px] text-center font-marquee text-[13px] font-semibold uppercase tracking-[.06em] text-primary-foreground"
                  onClick={() => setMenuOpen(false)}
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
