import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <div className="bulb-strip h-4" />
      <main className="flex-grow flex flex-col">
        <Outlet />
      </main>
      <div className="bulb-strip-static h-4" />
      <Footer />
    </div>
  )
} 