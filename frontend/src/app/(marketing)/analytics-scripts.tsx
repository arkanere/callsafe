'use client';

import { useEffect } from 'react';

// Ported from (layout-1)/+layout.svelte: the deferred Hotjar loader (onMount +
// 3s timeout) and the inline <svelte:head> script that injected the site's own
// embed widget on window load. Isolated here so the layout itself stays a
// server component.
export function AnalyticsScripts({ selfEmbed }: { selfEmbed: boolean }) {
	useEffect(() => {
		// Defer analytics scripts to improve initial page performance
		const timer = setTimeout(() => {
			loadAnalytics();
		}, 3000); // Load analytics after 3 seconds

		return () => clearTimeout(timer);
	}, []);

	useEffect(() => {
		if (!selfEmbed) return;

		const injectWidget = () => {
			const script = document.createElement('script');
			script.src = '/embed.js';
			script.setAttribute('data-handle', 'eb37507909fa43ff');
			script.setAttribute('data-source-id', 'callsafe');
			document.body.appendChild(script);
		};

		// The Svelte version ran in <head> and could always rely on the 'load'
		// event still being ahead of it. An effect can run after load has already
		// fired, so check readyState first.
		if (document.readyState === 'complete') {
			injectWidget();
			return;
		}

		window.addEventListener('load', injectWidget);
		return () => window.removeEventListener('load', injectWidget);
	}, [selfEmbed]);

	return null;
}

function loadAnalytics() {
	// Load Hotjar
	if (typeof window !== 'undefined' && !window.hj) {
		/* eslint-disable @typescript-eslint/no-explicit-any, prefer-rest-params -- verbatim Hotjar snippet */
		(function (h: any, o: any, t: any, j: any, a?: any, r?: any) {
			h.hj =
				h.hj ||
				function () {
					(h.hj.q = h.hj.q || []).push(arguments);
				};
			h._hjSettings = { hjid: 5045118, hjsv: 6 };
			a = o.getElementsByTagName('head')[0];
			r = o.createElement('script');
			r.async = 1;
			r.src = t + h._hjSettings.hjid + j + h._hjSettings.hjsv;
			a.appendChild(r);
		})(window, document, 'https://static.hotjar.com/c/hotjar-', '.js?sv=');
		/* eslint-enable @typescript-eslint/no-explicit-any, prefer-rest-params */
	}
}
