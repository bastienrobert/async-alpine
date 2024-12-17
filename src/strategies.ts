import type { ElementWithXAttributes } from 'alpinejs';

export type StrategyName = 'eager' | 'event' | 'idle' | 'media' | 'visible';

export interface StrategyComponent {
	el: ElementWithXAttributes;
	id: string;
}

export interface StrategyOptions {
	component: StrategyComponent;
	argument?: string;
}

// not really necessary but keeps the logic consistent
export function eager(_: StrategyOptions): Promise<boolean> {
	return Promise.resolve(true);
}

// waiting for a dom event on the window
export function event({ component, argument }: StrategyOptions): Promise<void> {
	return new Promise((resolve) => {
		if (argument) {
			// if there's an argument use that as a custom event name
			window.addEventListener(argument, () => resolve(), { once: true });
		} else {
			// otherwise listen for async-alpine:load event with id as detail
			const cb = (e: CustomEvent) => {
				if (e.detail.id !== component.id) return;
				window.removeEventListener('async-alpine:load', cb);
				resolve();
			};
			window.addEventListener('async-alpine:load', cb);
		}
	});
}

export function idle(_: StrategyOptions): Promise<IdleRequestCallback | IdleDeadline> {
	return new Promise((resolve) => {
		if ('requestIdleCallback' in window) {
			window.requestIdleCallback(resolve);
		} else {
			setTimeout(resolve, 200);
		}
	});
}

// anything that can be detected with window.matchMedia, triggers once and doesn't 'undo' itself
export function media({ argument }: StrategyOptions): Promise<Event | IdleRequestCallback | IdleDeadline | void> {
	return new Promise((resolve) => {
		if (!argument) {
			// eslint-disable-next-line no-console
			console.log("Async Alpine: media strategy requires a media query. Treating as 'eager'");
			return resolve();
		}

		const mediaQuery = window.matchMedia(`(${argument})`);
		if (mediaQuery.matches) {
			resolve();
		} else {
			mediaQuery.addEventListener('change', resolve, { once: true });
		}
	});
}

// using intersection observer to load based on the viewport
export function visible({
	component,
	argument,
}: StrategyOptions): Promise<void> {
	return new Promise((resolve) => {
		// work out if a rootMargin has been specified, and if so take it from the requirement
		const rootMargin = argument || '0px 0px 0px 0px';
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					observer.disconnect();
					resolve();
				}
			},
			{ rootMargin }
		);
		observer.observe(component.el);
	});
}

const strategies: Record<StrategyName, (_: StrategyOptions) => Promise<unknown>> = {
	eager,
	event,
	idle,
	media,
	visible,
};

export default strategies;
