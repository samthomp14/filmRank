import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="bg-marquee-footer px-4 py-7">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 md:flex-row">
        <span className="font-wordmark text-[16px] tracking-[.06em] text-foreground">FilmRank</span>
        <div className="flex items-center gap-6">
          <Link to="/login" className="font-marquee text-[12px] font-medium uppercase tracking-[.1em] text-marquee-tertiary hover:text-accent">
            Login
          </Link>
          <a
            href="mailto:hello@filmrank.app"
            className="font-marquee text-[12px] font-medium uppercase tracking-[.1em] text-marquee-tertiary hover:text-accent"
          >
            Contact
          </a>
        </div>
        <span className="font-marquee text-[11px] text-marquee-tertiary">
          © {new Date().getFullYear()} FilmRank
        </span>
      </div>
    </footer>
  )
}
