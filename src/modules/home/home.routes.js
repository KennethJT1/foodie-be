import { respond } from '../../core/http/index.js';

const WELCOME = 'Welcome to KJT Foodie';
const SUMMARY =
  'KJT Foodie is a food marketplace where customers discover and order meals from local vendors, ' +
  'riders deliver them fresh to the door, and everyone can follow every order live from kitchen to doorstep.';

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KJT Foodie</title>
<style>
  :root { --bg: #fdf8f3; --text: #2b1d14; --muted: #7a6656; --accent: #e8590c; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #17110d; --text: #f8efe7; --muted: #b29d8c; --accent: #ff8a3d; }
  }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box;
    background: var(--bg); color: var(--text); font: 18px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  main { max-width: 620px; text-align: center; }
  .logo { font-size: 56px; }
  h1 { margin: 8px 0 12px; font-size: clamp(28px, 6vw, 44px); letter-spacing: -0.02em; }
  h1 span { color: var(--accent); }
  p { margin: 0; color: var(--muted); }
</style>
</head>
<body>
<main>
  <div class="logo" aria-hidden="true">🍽️</div>
  <h1>Welcome to <span>KJT Foodie</span></h1>
  <p>${SUMMARY}</p>
</main>
</body>
</html>`;

// GET / — a welcome page for browsers, the same message as JSON for API clients
export const home = (req, res) => {
  if (req.get('accept')?.includes('text/html')) return res.type('html').send(page);
  return respond.ok(res, { message: WELCOME, about: SUMMARY });
};
