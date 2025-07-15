import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabaseClient';

type Phase = 'comparing' | 'winner' | 'transition';
type PosterPair = [string, string];

export default function ComparisonAnimation({ className = '' }: { className?: string }) {
  const [posters, setPosters] = useState<string[]>([]);
  const [pair, setPair] = useState<PosterPair>(['', '']);
  const [winnerIdx, setWinnerIdx] = useState<0 | 1>(0);
  const [phase, setPhase] = useState<Phase>('comparing');
  const [nextPoster, setNextPoster] = useState<string>('');
  const [replaceIdx, setReplaceIdx] = useState<0 | 1>(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const prevWinner = useRef<string>('');
  // Outgoing loser state
  const [outgoing, setOutgoing] = useState<{ idx: 0 | 1; url: string } | null>(null);

  // Fetch posters on mount
  useEffect(() => {
    const fetchPosters = async () => {
      const { data, error } = await supabase.from('movies').select('id, url');
      if (!error && data) {
        const urls = data.filter(m => m.url).map(m => m.url);
        const shuffled = urls.sort(() => 0.5 - Math.random());
        setPosters(shuffled.slice(0, 10));
      }
    };
    fetchPosters();
  }, []);

  // Initialize first pair
  useEffect(() => {
    if (posters.length >= 2) {
      setPair([posters[0], posters[1]]);
      setCurrentIndex(0);
      setPhase('comparing');
    }
  }, [posters]);

  // Animation cycle
  useEffect(() => {
    if (!pair[0] || !pair[1] || phase !== 'comparing') return;
    let timeout: NodeJS.Timeout;
    timeout = setTimeout(() => {
      // Pick winner randomly
      const winner = Math.random() > 0.5 ? 0 : 1;
      setWinnerIdx(winner as 0 | 1);
      setReplaceIdx((winner === 0 ? 1 : 0) as 0 | 1);
      setOutgoing({ idx: (winner === 0 ? 1 : 0) as 0 | 1, url: pair[winner === 0 ? 1 : 0] });
      setPhase('winner');
    }, 1800);
    return () => clearTimeout(timeout);
  }, [pair, phase]);

  // Winner phase: animate, then transition
  useEffect(() => {
    if (phase !== 'winner') return;
    let timeout: NodeJS.Timeout;
    timeout = setTimeout(() => {
      // Find next poster (not the current winner)
      let nextIdx = (currentIndex + 2) % posters.length;
      let candidate = posters[nextIdx];
      if (candidate === prevWinner.current && posters.length > 2) {
        for (let i = 1; i < posters.length; i++) {
          const idx = (currentIndex + 2 + i) % posters.length;
          if (posters[idx] !== prevWinner.current && posters[idx] !== pair[winnerIdx]) {
            nextIdx = idx;
            candidate = posters[idx];
            break;
          }
        }
      }
      setNextPoster(candidate);
      setPhase('transition');
    }, 1100);
    return () => clearTimeout(timeout);
  }, [phase, winnerIdx, pair, posters, currentIndex]);

  // Transition phase: swap in new poster, reset
  useEffect(() => {
    if (phase !== 'transition') return;
    let timeout: NodeJS.Timeout;
    timeout = setTimeout(() => {
      const newPair: PosterPair = [...pair] as PosterPair;
      newPair[replaceIdx] = nextPoster;
      setPair(newPair);
      setCurrentIndex((currentIndex + 1) % posters.length);
      prevWinner.current = pair[winnerIdx];
      setOutgoing(null); // <-- clear outgoing AFTER transition
      setPhase('comparing');
    }, 500);
    return () => clearTimeout(timeout);
  }, [phase, nextPoster, replaceIdx, pair, winnerIdx, currentIndex, posters]);

  if (!pair[0] || !pair[1]) {
    return (
      <div className={`relative w-[500px] h-96 flex items-center justify-center ${className}`}>
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // Animation variants
  const winnerAnim = (isWinner: boolean) =>
    phase === 'winner' && isWinner
      ? { scale: 1.15, zIndex: 20 }
      : { scale: 1, zIndex: 10 };
  const ringAnim = (isWinner: boolean) =>
    phase === 'winner' && isWinner
      ? { opacity: 1, scale: 1.15 }
      : { opacity: 0, scale: 1 };
  const loserAnim = (left: boolean) =>
    phase === 'winner'
      ? {
          x: left ? -120 : 120,
          y: 120,
          rotate: left ? -18 : 18,
          opacity: 0,
          zIndex: 30,
        }
      : { x: 0, y: 0, rotate: 0, opacity: 1, zIndex: 10 };
  const fadeInAnim = { opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 };

  return (
    <div className={`relative w-[500px] h-96 flex items-center justify-center ${className}`}>
      {/* Left Poster */}
      <div className="relative w-48 h-72 flex-shrink-0">
        {/* Render static image for left slot only if it's the winner, or not in winner/transition phase, or in transition phase but NOT being replaced */}
        {((winnerIdx === 0) || (phase !== 'winner' && (phase !== 'transition' || replaceIdx !== 0))) && (
          <motion.img
            key={pair[0]}
            src={pair[0]}
            alt="Movie Poster"
            className="w-48 h-72 rounded-lg overflow-hidden shadow-lg object-cover absolute top-0 left-0"
            draggable={false}
            initial={false}
            animate={winnerAnim(winnerIdx === 0)}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            style={{ zIndex: 10 }}
          />
        )}
        {/* Winner ring */}
        <motion.div
          className="absolute inset-0 ring-4 ring-blue-500 rounded-lg pointer-events-none"
          initial={{ opacity: 0, scale: 1 }}
          animate={ringAnim(winnerIdx === 0)}
          transition={{ duration: 0.4 }}
        />
        {/* Outgoing loser animation */}
        {phase === 'winner' && outgoing && outgoing.idx === 0 && (
          <AnimatePresence>
            <motion.img
              key={outgoing.url + '-loser'}
              src={outgoing.url}
              alt="Movie Poster"
              className="w-48 h-72 rounded-lg overflow-hidden shadow-lg object-cover absolute top-0 left-0"
              draggable={false}
              initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
              animate={{ x: -120, y: 120, rotate: -18, opacity: 0, zIndex: 30 }}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
              style={{ zIndex: 30 }}
            />
          </AnimatePresence>
        )}
        {/* New poster fade in */}
        <AnimatePresence>
          {phase === 'transition' && replaceIdx === 0 && (
            <motion.img
              key={nextPoster + '-in'}
              src={nextPoster}
              alt="Movie Poster"
              className="w-48 h-72 rounded-lg overflow-hidden shadow-lg object-cover absolute top-0 left-0"
              draggable={false}
              initial={{ opacity: 0 }}
              animate={fadeInAnim}
              exit={{}}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
              style={{ zIndex: 15 }}
            />
          )}
        </AnimatePresence>
      </div>
      {/* VS Text */}
      <div className="mx-8 z-30">
        <div className="bg-white px-4 py-2 rounded-full shadow-md">
          <span className="text-xl font-bold text-gray-400">VS</span>
        </div>
      </div>
      {/* Right Poster */}
      <div className="relative w-48 h-72 flex-shrink-0">
        {/* Render static image for right slot only if it's the winner, or not in winner/transition phase, or in transition phase but NOT being replaced */}
        {((winnerIdx === 1) || (phase !== 'winner' && (phase !== 'transition' || replaceIdx !== 1))) && (
          <motion.img
            key={pair[1]}
            src={pair[1]}
            alt="Movie Poster"
            className="w-48 h-72 rounded-lg overflow-hidden shadow-lg object-cover absolute top-0 left-0"
            draggable={false}
            initial={false}
            animate={winnerAnim(winnerIdx === 1)}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            style={{ zIndex: 10 }}
          />
        )}
        <motion.div
          className="absolute inset-0 ring-4 ring-blue-500 rounded-lg pointer-events-none"
          initial={{ opacity: 0, scale: 1 }}
          animate={ringAnim(winnerIdx === 1)}
          transition={{ duration: 0.4 }}
        />
        <AnimatePresence>
          {phase === 'winner' && outgoing && outgoing.idx === 1 && (
            <AnimatePresence>
              <motion.img
                key={outgoing.url + '-loser'}
                src={outgoing.url}
                alt="Movie Poster"
                className="w-48 h-72 rounded-lg overflow-hidden shadow-lg object-cover absolute top-0 left-0"
                draggable={false}
                initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                animate={{ x: 120, y: 120, rotate: 18, opacity: 0, zIndex: 30 }}
                transition={{ duration: 0.6, ease: 'easeInOut' }}
                style={{ zIndex: 30 }}
              />
            </AnimatePresence>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {phase === 'transition' && replaceIdx === 1 && (
            <motion.img
              key={nextPoster + '-in'}
              src={nextPoster}
              alt="Movie Poster"
              className="w-48 h-72 rounded-lg overflow-hidden shadow-lg object-cover absolute top-0 left-0"
              draggable={false}
              initial={{ opacity: 0 }}
              animate={fadeInAnim}
              exit={{}}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
              style={{ zIndex: 15 }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
} 