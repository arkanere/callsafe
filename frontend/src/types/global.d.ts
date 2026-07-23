// Moved from src/app.d.ts during the SvelteKit → Next.js migration.
declare global {
	interface Window {
		hj?: { (...args: unknown[]): void; q?: unknown[] };
		_hjSettings?: { hjid: number; hjsv: number };
	}
}

export {};
