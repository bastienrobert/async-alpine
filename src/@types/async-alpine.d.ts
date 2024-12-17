import type { Alpine } from 'alpinejs'

declare global {
	interface HTMLElement {
		_x_async?: string;
		_x_ignore?: boolean;
	}

	interface WindowEventMap {
    'async-alpine:load': CustomEvent;
  }
}

export interface AlpineAsyncOptions {
	defaultStrategy: string
	keepRelativeURLs: boolean
}

export interface AlpineAsyncData {
	loaded: boolean
	download: AlpineAsyncDataDownload
}

declare module 'alpinejs' {
	export interface Alpine {
		asyncOptions(opts: AlpineAsyncOptions): void
		asyncData(name: string, download?: AlpineAsyncDataDownload): void
		asyncUrl(name: string, url: string): void
		asyncAlias(path: string): void
	}
}