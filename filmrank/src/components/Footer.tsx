import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="w-full border-t border-gray-200 bg-gray-50 py-4 px-4 text-gray-600 text-sm">
      <div className="container max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-2">
        <div className="flex justify-center space-x-8">
          <Link to="/login" className="hover:text-blue-600 transition">Login</Link>
          <a href="mailto:hello@filmrank.app" className="hover:text-blue-600 transition">Contact</a>
        </div>
        <div className="text-center md:text-right text-xs text-gray-400">
          © {new Date().getFullYear()} FilmRank. All rights reserved.
        </div>
      </div>
    </footer>
  )
} 