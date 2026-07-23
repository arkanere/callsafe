import { AnalyticsScripts } from './analytics-scripts';

// Ports (layout-1)/+layout.svelte: deferred Hotjar loader plus the site's own
// embed widget injected on window load.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
	return (
		<>
			{children}
			<AnalyticsScripts selfEmbed />
		</>
	);
}
