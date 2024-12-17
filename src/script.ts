import AsyncAlpine from './async-alpine.js';

document.addEventListener('alpine:init', () => {
	(window as any).Alpine.plugin(AsyncAlpine);
	document.dispatchEvent(new CustomEvent('async-alpine:init'));
});
