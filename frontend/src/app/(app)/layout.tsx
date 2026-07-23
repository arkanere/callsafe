import { AnalyticsScripts } from '../(marketing)/analytics-scripts';

// Ports (layout-2)/+layout.svelte: the deferred Hotjar loader only — unlike the
// marketing layout, this one never injects the site's own embed widget.
export default function AppLayout({ children }: { children: React.ReactNode }) {
	return (
		<>
			{children}
			<AnalyticsScripts selfEmbed={false} />
		</>
	);
}
