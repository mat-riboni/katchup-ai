// This classic script also runs when index.html is opened directly from disk.
// ES modules and fetch require the local HTTP server.
(() => {
  if (location.protocol === 'file:') {
    location.replace('http://localhost:5173/' + location.search + location.hash);
    return;
  }

  import('./main.mjs').then(app => app.ready).then(() => {
    document.body.dataset.ready = 'true';
  }).catch(error => {
    const banner = document.getElementById('banner');
    banner.hidden = false;
    banner.dataset.tone = 'bad';
    banner.setAttribute('role', 'alert');
    banner.textContent = 'The lesson could not open. Restart Katchup with Start Katchup.command, then reload this page.';
    document.body.dataset.ready = 'error';
    console.error('Katchup startup failed:', error);
  });
})();
