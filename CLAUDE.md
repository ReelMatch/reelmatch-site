# ReelMatch Site & Admin — Claude Code Rules

## Git
- After making any changes, ALWAYS push using this exact sequence:
  git add . && git commit -m "message" && git pull --rebase origin main && git push origin main
- If the push fails, print the error clearly — never silently skip it
- Only push if actual changes were made
- Note: this repo has a git hook that auto-commits on file edit — expect auto-generated commits

## Stack
- Vanilla JS, HTML, CSS — no frameworks
- Chart.js for charts
- jsPDF for PDF export
- Served via GitHub Pages at reelmatch.live

## Admin panel (Editing Room)
- URL: reelmatch.live/editingroom
- File: editingroom/index.html — single file SPA
- Auth: email + password + 2FA email OTP
- API_BASE = 'https://web-production-d11a6.up.railway.app'
- Always use the existing api() helper function for all API calls — it handles auth headers and error logging
- Always use existing theme CSS variables — never hardcode colors
- 15 color themes stored in localStorage as admin_theme
- Sidebar sections: Dashboard, Users, Reports, Movies, Problem Users, Analytics, App Dev, Settings

## Never do
- Never add external JS dependencies without checking they're on cdnjs.cloudflare.com
- Never break the existing theme system — always use CSS variables
- Never hardcode the API base URL — always use the API_BASE constant

## Repo location
~/ReelMatch/reelmatch-site
