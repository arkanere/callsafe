<script lang="ts">
	import '../../app.css';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		// Defer analytics scripts to improve initial page performance
		setTimeout(() => {
			loadAnalytics();
		}, 3000); // Load analytics after 3 seconds
	});

	function loadAnalytics() {
		// Load Hotjar
		if (typeof window !== 'undefined' && !window.hj) {
			(function(h:any, o:any, t:any, j:any, a:any, r:any) {
				h.hj = h.hj || function() {
					(h.hj.q = h.hj.q || []).push(arguments);
				};
				h._hjSettings = { hjid: 5045118, hjsv: 6 };
				a = o.getElementsByTagName('head')[0];
				r = o.createElement('script');
				r.async = 1;
				r.src = t + h._hjSettings.hjid + j + h._hjSettings.hjsv;
				a.appendChild(r);
			})(window, document, 'https://static.hotjar.com/c/hotjar-', '.js?sv=');
		}
	}
</script>

{@render children()}
