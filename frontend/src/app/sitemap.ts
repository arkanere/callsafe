import type { MetadataRoute } from 'next';

// Replaces static/sitemap.xml — same URLs, lastmod dates, changefreq and priorities.
export default function sitemap(): MetadataRoute.Sitemap {
	return [
		{
			url: 'https://www.callsafe.online/',
			lastModified: '2025-10-27',
			changeFrequency: 'weekly',
			priority: 1.0
		},
		{
			url: 'https://www.callsafe.online/pricing',
			lastModified: '2025-10-27',
			changeFrequency: 'monthly',
			priority: 0.9
		},
		{
			url: 'https://www.callsafe.online/privacy-policy',
			lastModified: '2025-10-27',
			changeFrequency: 'yearly',
			priority: 0.5
		},
		{
			url: 'https://www.callsafe.online/terms-of-service',
			lastModified: '2025-10-27',
			changeFrequency: 'yearly',
			priority: 0.5
		}
	];
}
