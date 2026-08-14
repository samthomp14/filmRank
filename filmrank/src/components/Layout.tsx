import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <div className="bulb-strip h-4" />
      <main className="flex-grow flex flex-col">
        <Outlet />
      </main>
      <div className="bulb-strip-static h-4" />
      <footer className="py-4 px-4 text-center text-xs text-muted-foreground">
        This product uses the{' '}
        <a
          href="https://www.themoviedb.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          TMDB
        </a>{' '}
        API but is not endorsed or certified by TMDB.
      </footer>
    </div>
  )
} 