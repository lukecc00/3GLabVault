require('../dist/main');

// Keep the local server process attached to an active event loop in shell environments
// where Nest can otherwise exit immediately after bootstrap.
setInterval(() => {}, 1000);
