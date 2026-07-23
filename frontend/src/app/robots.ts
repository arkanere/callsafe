import type { MetadataRoute } from 'next';

// Replaces static/robots.txt — same allow/disallow rules and sitemap location.
export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: '*',
			allow: '/',
			disallow: ['/user/', '/embed/', '/api/']
		},
		sitemap: 'https://www.callsafe.tech/sitemap.xml'
	};
}
