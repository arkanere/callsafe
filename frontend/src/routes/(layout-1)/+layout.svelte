<script lang="ts">
	import '../../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<script>
		window.addEventListener('load', function() {
			var script = document.createElement('script');
			script.src = 'https://callsafe.tech/embed.js';
			script.setAttribute('data-handle', '25831dee9a0b76f8');
			script.setAttribute('data-source-id', 'callsafe');
			document.body.appendChild(script);
		});
	</script>
</svelte:head>

{@render children()}
