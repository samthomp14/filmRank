import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'

interface MovieRanking {
  id: number
  title: string
  position: number
}

export default function AnimatedLeaderboard() {
  const [rankings, setRankings] = useState<MovieRanking[]>([
    { id: 1, title: "The Shawshank Redemption", position: 1 },
    { id: 2, title: "Pulp Fiction", position: 2 },
    { id: 3, title: "The Dark Knight", position: 3 },
    { id: 4, title: "Fight Club", position: 4 },
    { id: 5, title: "Inception", position: 5 }
  ])

  const [isVisible, setIsVisible] = useState(false)
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Show component with entrance animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true)
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  // Animate rankings every 8 seconds
  useEffect(() => {
    const startAnimationCycle = () => {
      // Clear any existing timeout
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
      }
      
      // Schedule next animation
      animationTimeoutRef.current = setTimeout(() => {
        animateRankings()
        startAnimationCycle() // Schedule the next one
      }, 8000) // Fixed 8 second interval
    }

    // Start first animation after initial delay
    const initialTimer = setTimeout(() => {
      animateRankings()
      startAnimationCycle() // Start the recurring schedule
    }, 4000) // Start after 4 seconds

    return () => {
      clearTimeout(initialTimer)
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
      }
    }
  }, [])

  const animateRankings = () => {
    // Pick one random movie to move
    const movieToMove = Math.floor(Math.random() * 5)
    const currentPosition = rankings[movieToMove].position
    let newPosition
    
    // Determine new position (avoid staying in same position)
    do {
      newPosition = Math.floor(Math.random() * 5) + 1
    } while (newPosition === currentPosition)
    
    // Create new rankings array with updated positions
    const tempRankings = [...rankings]
    
    // Find the movie to move
    const movieToMoveData = tempRankings[movieToMove]
    
    // Remove it from current position
    tempRankings.splice(movieToMove, 1)
    
    // Insert it at new position
    tempRankings.splice(newPosition - 1, 0, movieToMoveData)
    
    // Update all positions
    tempRankings.forEach((movie, index) => {
      movie.position = index + 1
    })
    
    console.log('Animation:', { 
      movieToMove: movieToMoveData.title,
      from: currentPosition, 
      to: newPosition
    })
    
    // Update state
    setRankings(tempRankings)
  }

  const getPositionColor = (position: number) => {
    switch (position) {
      case 1:
        return 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-yellow-900'
      case 2:
        return 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-700'
      case 3:
        return 'bg-gradient-to-r from-amber-600 to-amber-700 text-amber-100'
      default:
        return 'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800'
    }
  }

  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1:
        return '🥇'
      case 2:
        return '🥈'
      case 3:
        return '🥉'
      default:
        return `${position}`
    }
  }

  return (
    <motion.div 
      className="w-full max-w-md mx-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 20 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
        <h4 className="text-lg font-semibold text-gray-800 mb-4 text-center">
          Your Evolving Rankings
        </h4>
        
        <div className="relative">
          <div className="space-y-3">
            <AnimatePresence mode="wait">
              {rankings.map((movie) => (
                <motion.div
                  key={movie.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ 
                    type: "spring", 
                    stiffness: 300, 
                    damping: 30,
                    layout: { duration: 0.8, ease: "easeOut" }
                  }}
                  className={`
                    flex items-center justify-between p-3 rounded-lg border
                    ${movie.position === 1 ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-gray-50'}
                  `}
                >
                  <div className="flex items-center space-x-3">
                    <motion.div 
                      className={`
                        w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                        ${getPositionColor(movie.position)}
                      `}
                      layout
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    >
                      {getPositionIcon(movie.position)}
                    </motion.div>
                    <div>
                      <div className={`font-medium ${movie.position === 1 ? 'text-yellow-800' : 'text-gray-800'}`}>
                        {movie.title}
                      </div>
                    </div>
                  </div>
                  
                  {movie.position === 1 && (
                    <motion.div 
                      className="flex items-center space-x-1"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                    >
                      <span className="text-yellow-500">⭐</span>
                      <span className="text-xs font-medium text-yellow-700">Top</span>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
        
        <div className="mt-4 text-center">
          <motion.div 
            className="text-xs text-gray-500"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            Rankings update as you compare movies...
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
} 