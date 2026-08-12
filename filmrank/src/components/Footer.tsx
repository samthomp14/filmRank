import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="w-full border-t border-border bg-background py-4 px-4 text-muted-foreground text-sm">
      <div className="container max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-2">
        <div className="flex justify-center space-x-8">
          <Link to="/login" className="hover:text-primary transition">Login</Link>
          <a href="mailto:hello@filmrank.app" className="hover:text-primary transition">Contact</a>
        </div>
        <div className="text-center md:text-right text-xs text-muted-foreground">
          © {new Date().getFullYear()} FilmRank. All rights reserved.
        </div>
      </div>
    </footer>
  )
} 