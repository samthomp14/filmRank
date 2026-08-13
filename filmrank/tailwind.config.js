/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			display: ['"Fraunces"', 'ui-serif', 'serif'],
  			marquee: ['"Oswald"', 'sans-serif'],
  			wordmark: ['"Limelight"', 'serif']
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			marquee: {
  				hairline: 'var(--marquee-hairline)',
  				dot: 'var(--marquee-dot)',
  				tertiary: 'var(--marquee-tertiary)',
  				'link-hover': 'var(--marquee-link-hover)',
  				bulb: 'var(--marquee-bulb)',
  				band: 'var(--marquee-band)',
  				footer: 'var(--marquee-footer)',
  				paper: 'var(--marquee-paper)',
  				'paper-foreground': 'var(--marquee-paper-foreground)',
  				'paper-muted': 'var(--marquee-paper-muted)',
  				'paper-divider': 'var(--marquee-paper-divider)',
  				movement: 'var(--marquee-movement)',
  				'poster-label': 'var(--marquee-poster-label)'
  			}
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}

