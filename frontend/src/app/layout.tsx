import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
	icons: { icon: '/favicon.svg' }
};

export const viewport: Viewport = {
	width: 'device-width',
	initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				<div style={{ display: 'contents' }}>{children}</div>
				<Script
					defer
					src="https://cloud.umami.is/script.js"
					data-website-id="09dc7b8b-ba5b-4228-ae79-577f2b9504df"
					strategy="afterInteractive"
				/>
			</body>
		</html>
	);
}
