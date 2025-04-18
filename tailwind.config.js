/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        sm: "var(--agent-shadow-sm)",
        DEFAULT: "var(--shadow-md)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      blur: {
        sm: "var(--blur-sm)",
        DEFAULT: "var(--blur-md)",
        md: "var(--blur-md)",
        lg: "var(--blur-lg)",
      },
      zIndex: {
        base: "0",
        raised: "1",
        default: "10",
        "message-base": "10",
        "message-actions": "20",
        "message-overlay": "30",
        "backdrop": "40",
        "drawer": "50",
        "sidebar": "60",
        "modal": "70",
        "popover": "80",
        "tooltip": "90",
        "toast": "100",
        "menu": "110",
        "dropdown": "120",
        "max": "9999",
      },
      colors: {
        white: "hsl(var(--color-white))",
        black: "hsl(var(--color-black))",
        gray: {
          50: "hsl(var(--color-gray-50))",
          100: "hsl(var(--color-gray-100))",
          200: "hsl(var(--color-gray-200))",
          300: "hsl(var(--color-gray-300))",
          400: "hsl(var(--color-gray-400))",
          500: "hsl(var(--color-gray-500))",
          600: "hsl(var(--color-gray-600))",
          700: "hsl(var(--color-gray-700))",
          800: "hsl(var(--color-gray-800))",
          900: "hsl(var(--color-gray-900))",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: {
          DEFAULT: "hsl(var(--border) / var(--border-opacity, 1))",
          opaque: "hsl(var(--border))",
        },
        input: "hsl(var(--input))",
        ring: {
          DEFAULT: "hsl(var(--ring) / var(--ring-opacity, 1))",
          opaque: "hsl(var(--ring))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          background: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))"
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))"
        },
        agent: {
          primary: "hsl(var(--agent-primary))",
          secondary: "hsl(var(--agent-secondary))",
          accent: "hsl(var(--agent-accent))",
          foreground: "hsl(var(--agent-foreground))",
          "message-border": "var(--agent-message-border)",
          "message-bg": "var(--agent-message-bg)",
          "avatar-bg": "var(--agent-avatar-bg)",
          "avatar-text": "var(--agent-avatar-text)",
          "button-hover": "var(--agent-button-hover)",
          "button-active": "var(--agent-button-active)",
          "button-text": "var(--agent-button-text)",
          link: "var(--agent-link)",
          "link-hover": "var(--agent-link-hover)",
          chloe: "hsl(var(--chloe-color))",
          "phil-connors": "hsl(var(--phil-connors-color))"
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      transitionDuration: {
        theme: 'var(--theme-transition-duration)',
      },
      transitionTimingFunction: {
        theme: 'var(--theme-transition-timing)',
      },
      backdropBlur: {
        sm: "var(--blur-sm)",
        DEFAULT: "var(--blur-md)",
        md: "var(--blur-md)",
        lg: "var(--blur-lg)",
      },
    },
  },
  plugins: [
    require('tailwind-scrollbar')({
      nocompatible: true,
      preferredStrategy: 'pseudoelements',
    }),
  ],
}
