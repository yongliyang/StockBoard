/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card-bg)",
        primary: "var(--primary)",
        up: "var(--up-color)",
        down: "var(--down-color)",
        alpha: "var(--alpha-color)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        "text-muted": "var(--text-muted)",
        border: "var(--border-color)",
        "border-light": "var(--border-light)",
        "bg-subtle": "var(--bg-subtle)",
        "bg-hover": "var(--bg-hover)",
        "bg-input": "var(--bg-input)",
      },
    },
  },
  plugins: [],
};
