# Motion Setup

The AnimatedLeaderboard component now uses Motion for smooth animations. To install it, run:

```bash
npm install motion
```

## Features Added:

1. **Layout Animations**: Movies smoothly slide to their new positions using Motion's `layout` prop
2. **Spring Animations**: Natural, physics-based animations with configurable stiffness and damping
3. **AnimatePresence**: Handles enter/exit animations for smooth transitions
4. **Entrance Animations**: Component fades in with a subtle slide-up effect
5. **Position Badge Animations**: Position indicators animate smoothly when positions change
6. **Top Movie Highlight**: Special animation for the #1 movie's star badge

## Animation Details:

- **Layout Transitions**: 0.8s duration with easeOut easing
- **Spring Physics**: 300 stiffness, 30 damping for natural movement
- **Position Badges**: 0.6s duration for smooth color/icon changes
- **Pulsing Text**: 2s infinite loop for the "Rankings update..." message

The animations are now much more reliable and smooth compared to the previous CSS-only approach. 