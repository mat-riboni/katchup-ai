# Submission verification

Latest checks: 7 November 2026.

- Localhost startup was restored and checked over HTTP. All 20 entry scripts and imported modules and the current lesson JSON are served successfully. The page, slide images and original PDF were also verified during the UI work. The launcher leaves the server running after it exits and reuses it on a second launch.
- Opening the HTML file directly now redirects to localhost, preserving slide selection and the URL fragment. The Live badge and dot are removed. Initialization failures display an error instead of leaving a loading label.
- **All 77 Node tests passed** with `npm test`, covering the agent, provider adapters, real loopback HTTP endpoints, import behaviour, lesson data, formula rendering, escaping, symbol definitions, loading, progressive reveal and controller behaviour. Provider responses are controlled fixtures.
- **All seven executable submission scenarios passed** with `npm run examples`. Captured results match a fresh run exactly. They include rejection of a future transcript cutoff with zero model calls and rejection of a future citation after two adapter attempts.
- The backend prompt requests English. Documentation links, asset counts and the absence of em dashes in the new submission documents were checked.
- Desktop and mobile DOM simulations with animation enabled verify progressive text growth, replay after reopening, interruption when closing or navigating, exact completed answers, immediate symbol definitions and removal of preparation notices. Formula expressions and bold headings are revealed intact. No provider requests are made.
- **Desktop and mobile DOM integration simulations passed** on all 62 pages: glossary open at startup; 718 local symbol definitions; distinct Katchup and explanation panels; opening either closes the other; active content updates on slide changes; keyboard focus is restored when a panel closes.
- Glossary and explanation formulas are MathML elements in the correct namespace. The checks confirm there are no code-formatted equations or em dashes in the rendered interface.
- All formula rendering and symbol data are local. Desktop and mobile DOM checks were also run with the page and lesson data fetched over localhost HTTP and application modules imported locally. No external services are used.
- The Playwright tests have been updated for panel exclusivity, a glossary visible by default, mathematical rendering and mobile behaviour.

## Browser verification limitation

The previous Chromium startup was blocked by the authoring environment’s macOS sandbox before any page could load. This update was verified with DOM simulation, not a visual browser run. Actual rendering, mathematical typography and responsive geometry still need a normal browser run.

Run `npm ci`, `npx playwright install chromium`, then `npm run test:e2e` in a normal local terminal. Start the demo with `npm run demo` or double-click `Start Katchup.command` on macOS, then open http://localhost:5173.

## Earlier content verification

The initial integration passed all 69 Node tests, checked the image and PDF HTTP responses, reviewed all 62 PDF page renders and independently recomputed the MRP and random-policy MDP values. The original PDF is still unchanged.
