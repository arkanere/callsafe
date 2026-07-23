import { AuthModalProvider, AuthTrigger } from './auth-modal';

// Ported from (layout-1)/+page.svelte. Static marketing markup is server
// rendered; the login/signup modal lives in the auth-modal client island.
export default function Home() {
	return (
		<AuthModalProvider>
			<div className="min-h-screen bg-white">
				{/* Navigation */}
				<nav className="border-b border-gray-100">
					<div className="mx-auto max-w-6xl px-6 py-6">
						<div className="flex items-center justify-between">
							{/* Left side - Logo/Brand */}
							<h1 className="text-2xl font-light tracking-wide text-gray-900">CallSafe</h1>

							{/* Right side - Navigation Links */}
							<div className="flex items-center space-x-6">
								<a
									href="/pricing"
									className="font-medium tracking-wide text-gray-700 transition-colors duration-300 hover:text-gray-900"
								>
									Pricing
								</a>
								<AuthTrigger className="font-medium tracking-wide text-gray-900 transition-colors duration-300 hover:text-gray-600">
									Login
								</AuthTrigger>
							</div>
						</div>
					</div>
				</nav>

				{/* Hero Section */}
				<section className="px-6 pt-24 pb-32">
					<div className="mx-auto max-w-4xl text-center">
						<h1 className="mb-8 text-6xl leading-tight font-light tracking-tight text-gray-900 md:text-7xl">
							Let privacy conscious users visiting your website
							<br />
							<span className="font-medium">reach you instantly. No phone number needed.</span>
						</h1>
						<p className="mx-auto mb-12 max-w-2xl text-xl leading-relaxed font-light text-gray-600">
							Privacy-focused browser-based calling solution that removes phone number barriers and
							boosts user engagement.
						</p>
						<AuthTrigger className="bg-gray-900 px-12 py-4 text-lg font-medium tracking-wide text-white transition-colors duration-300 hover:bg-gray-800">
							Start Free Trial
						</AuthTrigger>
						<p className="mt-4 font-light text-gray-600">
							No credit card required for the first 2 months
						</p>
					</div>
				</section>

				{/* Value Proposition */}
				<section className="bg-gray-50 px-6 py-24">
					<div className="mx-auto max-w-5xl">
						<div className="mb-20 text-center">
							<h2 className="mb-6 text-4xl font-light text-gray-900">What CallSafe Does</h2>
							<p className="mx-auto max-w-3xl text-lg leading-relaxed font-light text-gray-600">
								CallSafe lets website visitors call you directly from their browser without sharing
								their phone number. Users click a button on your website and connect instantly via
								secure browser calling.
							</p>
						</div>

						{/* Demo GIF */}
						<div className="mb-20 flex justify-center">
							{/* Plain <img>, not next/image — parity with the Svelte source. */}
							<img
								src="/CallsafeLive.gif"
								alt="CallSafe product demonstration"
								className="w-full max-w-2xl rounded-lg shadow-lg"
							/>
						</div>

						<div className="grid grid-cols-1 gap-16 md:grid-cols-3">
							<div className="text-center">
								<div className="mb-4 text-3xl font-light text-gray-900">Anonymous Calling</div>
								<p className="leading-relaxed font-light text-gray-600">
									Users connect without revealing phone numbers or personal information
								</p>
							</div>

							<div className="text-center">
								<div className="mb-4 text-3xl font-light text-gray-900">
									Browser-Based Technology
								</div>
								<p className="leading-relaxed font-light text-gray-600">
									Works directly in web browsers using secure WebRTC connections
								</p>
							</div>

							<div className="text-center">
								<div className="mb-4 text-3xl font-light text-gray-900">
									Designed with Privacy in Mind
								</div>
								<p className="leading-relaxed font-light text-gray-600">
									No data collection, no call recordings, complete anonymity for users
								</p>
							</div>
						</div>
					</div>
				</section>

				{/* How It Works */}
				<section className="px-6 py-24">
					<div className="mx-auto max-w-4xl text-center">
						<h2 className="mb-16 text-4xl font-light text-gray-900">How It Works</h2>

						<div className="grid grid-cols-1 gap-16 md:grid-cols-2">
							<div className="text-center">
								<div className="mb-4 text-lg font-medium text-gray-900">For Users</div>
								<div className="mx-auto max-w-xs space-y-3 text-left">
									<p className="font-light text-gray-600">
										• Click &quot;Talk to us instantly&quot; on your website
									</p>
									<p className="font-light text-gray-600">
										• Browser connects them directly to you
									</p>
									<p className="font-light text-gray-600">• No phone number sharing required</p>
									<p className="font-light text-gray-600">• No apps or downloads needed</p>
								</div>
							</div>

							<div className="text-center">
								<div className="mb-4 text-lg font-medium text-gray-900">For Businesses</div>
								<div className="mx-auto max-w-xs space-y-3 text-left">
									<p className="font-light text-gray-600">• Add one line of code to your website</p>
									<p className="font-light text-gray-600">
										• Receive calls on web dashboard or mobile app
									</p>
									<p className="font-light text-gray-600">
										• Users can contact you without privacy concerns
									</p>
									<p className="font-light text-gray-600">
										• Higher engagement from privacy-conscious visitors
									</p>
								</div>
							</div>
						</div>
					</div>
				</section>

				{/* Simple Setup */}
				<section className="bg-gray-50 px-6 py-24">
					<div className="mx-auto max-w-3xl text-center">
						<h2 className="mb-12 text-4xl font-light text-gray-900">Simple Integration</h2>

						<div className="mx-auto max-w-2xl space-y-8 pl-16">
							<div className="flex items-center space-x-8">
								<div className="ml-24 flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm font-medium text-white">
									1
								</div>
								<div className="text-left">
									<div className="text-lg font-medium text-gray-900">
										Sign up and get your embed code
									</div>
									<div className="font-light text-gray-600">
										Instant setup with customizable options
									</div>
								</div>
							</div>

							<div className="flex items-center space-x-8">
								<div className="ml-24 flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm font-medium text-white">
									2
								</div>
								<div className="text-left">
									<div className="text-lg font-medium text-gray-900">Add code to your website</div>
									<div className="font-light text-gray-600">
										One line of code, works immediately
									</div>
								</div>
							</div>

							<div className="flex items-center space-x-8">
								<div className="ml-24 flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm font-medium text-white">
									3
								</div>
								<div className="text-left">
									<div className="text-lg font-medium text-gray-900">
										Receive calls on any device
									</div>
									<div className="font-light text-gray-600">
										Setup takes 3 minutes, no technical expertise required
									</div>
								</div>
							</div>
						</div>
					</div>
				</section>

				{/* CTA */}
				<section className="px-6 py-24">
					<div className="mx-auto max-w-3xl text-center">
						<h2 className="mb-8 text-4xl font-light text-gray-900">
							Start Converting More Visitors
						</h2>
						<p className="mb-8 text-lg leading-relaxed font-light text-gray-600">
							Let privacy-conscious users reach you instantly without phone number barriers.
						</p>
						<div className="inline-flex flex-col items-center">
							<AuthTrigger className="mb-4 bg-gray-900 px-12 py-4 text-lg font-medium tracking-wide text-white transition-colors duration-300 hover:bg-gray-800">
								Start Your Free Trial
							</AuthTrigger>
							<p className="font-light text-gray-600">
								No credit card required for the first 2 months
							</p>
						</div>
					</div>
				</section>

				{/* Footer */}
				<footer className="border-t border-gray-100 py-12">
					<div className="mx-auto max-w-6xl px-6">
						<div className="mb-6 space-x-8 text-center">
							<a
								href="/privacy-policy"
								className="font-light text-gray-600 transition-colors duration-300 hover:text-gray-900"
							>
								Privacy Policy
							</a>
							<a
								href="/terms-of-service"
								className="font-light text-gray-600 transition-colors duration-300 hover:text-gray-900"
							>
								Terms of Service
							</a>
						</div>
						<div className="mb-6 text-center">
							<p className="mx-auto max-w-2xl leading-relaxed font-light text-gray-700">
								We believe privacy should default in online interactions. We are building products
								to bring this vision into reality.
							</p>
						</div>
						<div className="text-center">
							<a
								href="mailto:hello@callsafe.tech"
								className="font-light text-gray-600 transition-colors duration-300 hover:text-gray-900"
							>
								hello@callsafe.tech
							</a>
						</div>
					</div>
				</footer>
			</div>
		</AuthModalProvider>
	);
}
