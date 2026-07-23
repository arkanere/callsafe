import type { Metadata } from 'next';
import styles from '../legal-prose.module.css';

export const metadata: Metadata = {
	title: 'Terms of Service - CallSafe',
	description:
		'CallSafe Terms of Service - Legal terms and conditions for using our anonymous calling service.'
};

// Ported from (layout-1)/terms-of-service/+page.svelte. Pure static markup.
export default function TermsOfService() {
	return (
		<>
			{/* Navigation Bar */}
			<nav className="border-b border-gray-200 bg-white shadow-sm">
				<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="flex items-center justify-between py-4">
						{/* Left side - Logo/Brand */}
						<div className="flex items-center">
							<a
								href="/"
								className="text-2xl font-bold text-gray-900 transition-colors duration-200 hover:text-blue-600"
							>
								CallSafe
							</a>
						</div>

						{/* Right side - Navigation Links */}
						<div className="flex items-center">
							<a
								href="/"
								className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors duration-200 hover:bg-blue-700"
							>
								Login
							</a>
						</div>
					</div>
				</div>
			</nav>

			<div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
				<div className="bg-white">
					<header className="mb-12 text-center">
						<h1 className="mb-4 text-4xl font-bold text-gray-900">Terms of Service</h1>
					</header>

					<div className={`prose prose-lg max-w-none ${styles.prose}`}>
						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">Welcome to CallSafe</h2>
							<p className="mb-4 text-gray-700">
								These Terms of Service (&quot;Terms&quot;) govern your use of CallSafe&apos;s
								anonymous calling platform (&quot;Service&quot;) operated by CallSafe
								(&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By accessing or using our
								Service, you agree to be bound by these Terms.
							</p>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">Service Description</h2>
							<p className="mb-4 text-gray-700">
								CallSafe provides an anonymous calling platform that enables:
							</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>
									<strong>For Customers:</strong> Anonymous browser-based calling to businesses
									without sharing personal information
								</li>
								<li>
									<strong>For Businesses:</strong> Receiving anonymous customer calls through web
									dashboard and mobile applications
								</li>
								<li>
									<strong>For Both:</strong> High-quality voice communication using WebRTC
									technology
								</li>
							</ul>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">
								User Types and Requirements
							</h2>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">Business Users</h3>
							<p className="mb-2 text-gray-700">To use CallSafe as a business, you must:</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>Create an account with accurate information</li>
								<li>Be at least 18 years old or have legal capacity to enter contracts</li>
								<li>Provide valid payment information for paid plans</li>
								<li>Use the service for legitimate business purposes only</li>
								<li>Comply with all applicable laws and regulations</li>
							</ul>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">Customers (End Users)</h3>
							<p className="mb-2 text-gray-700">To use CallSafe as a customer, you must:</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>Have a compatible web browser with microphone access</li>
								<li>Use the service for legitimate communication purposes</li>
								<li>Respect business operating hours and policies</li>
								<li>Not engage in abusive, harassing, or illegal behavior</li>
							</ul>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">Acceptable Use Policy</h2>
							<p className="mb-4 text-gray-700">You agree not to use CallSafe for:</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>Illegal activities or violations of local, state, or federal laws</li>
								<li>Harassment, abuse, threats, or discrimination</li>
								<li>Spam, solicitation, or unsolicited marketing</li>
								<li>Fraud, deception, or misrepresentation</li>
								<li>Transmitting malware, viruses, or harmful code</li>
								<li>Attempting to hack, breach, or compromise system security</li>
								<li>Recording calls without proper consent where legally required</li>
								<li>Impersonating others or providing false information</li>
								<li>Interfering with or disrupting the service</li>
							</ul>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">
								Business Responsibilities
							</h2>
							<p className="mb-4 text-gray-700">As a business user, you are responsible for:</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>
									<strong>Embed Code Security:</strong> Properly implementing and securing your
									CallSafe embed code
								</li>
								<li>
									<strong>Call Handling:</strong> Responding professionally to customer calls
								</li>
								<li>
									<strong>Availability:</strong> Maintaining reasonable availability during your
									stated business hours
								</li>
								<li>
									<strong>Legal Compliance:</strong> Ensuring your use complies with telemarketing,
									privacy, and recording laws
								</li>
								<li>
									<strong>Account Security:</strong> Maintaining the security of your account
									credentials
								</li>
								<li>
									<strong>Payment:</strong> Timely payment of all fees associated with your plan
								</li>
							</ul>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">
								Service Availability and Limitations
							</h2>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">Service Level</h3>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>We strive for 99.9% uptime but do not guarantee uninterrupted service</li>
								<li>Maintenance windows may be scheduled with advance notice</li>
								<li>Service quality depends on internet connection and browser compatibility</li>
							</ul>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">Usage Limits</h3>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>Plans include specific call and minute limits as outlined in pricing</li>
								<li>Excessive usage may result in service throttling or suspension</li>
								<li>Fair usage policies apply to prevent abuse</li>
							</ul>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">Pricing and Billing</h2>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">Plan Structure</h3>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>
									<strong>Free Plan:</strong> 3 calls or 30 minutes per month (whichever reached
									first)
								</li>
								<li>
									<strong>Basic Plan:</strong> $4/month - 30 calls or 300 minutes (whichever reached
									first)
								</li>
								<li>
									<strong>Pro Plan:</strong> $8/month - 80 calls or 800 minutes (whichever reached
									first)
								</li>
							</ul>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">Billing Terms</h3>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>Paid plans are billed monthly in advance</li>
								<li>All fees are non-refundable unless required by law</li>
								<li>Price changes require 30 days advance notice</li>
								<li>Failed payments may result in service suspension</li>
								<li>Taxes are additional where applicable</li>
							</ul>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">Intellectual Property</h2>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">Our Rights</h3>
							<p className="mb-4 text-gray-700">
								CallSafe owns all rights, title, and interest in the Service, including:
							</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>Software, technology, and infrastructure</li>
								<li>Trademarks, logos, and branding</li>
								<li>Documentation and user interfaces</li>
								<li>Aggregate usage data and analytics</li>
							</ul>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">Your Rights</h3>
							<p className="mb-4 text-gray-700">
								You retain ownership of your business content and customer conversations, subject to
								our Privacy Policy.
							</p>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">
								Privacy and Data Protection
							</h2>
							<p className="mb-4 text-gray-700">
								Your privacy is protected by our comprehensive Privacy Policy, which is incorporated
								into these Terms. Key points:
							</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>Customer calls remain completely anonymous by design</li>
								<li>No customer personal information is collected or stored</li>
								<li>Business account data is protected with industry-standard security</li>
								<li>We comply with applicable privacy laws and regulations</li>
							</ul>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">Termination</h2>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">By You</h3>
							<p className="mb-4 text-gray-700">
								You may terminate your account at any time by contacting support or through your
								account settings. Termination is effective immediately, and you remain responsible
								for all charges incurred.
							</p>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">By Us</h3>
							<p className="mb-4 text-gray-700">
								We may suspend or terminate your access immediately for:
							</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>Violation of these Terms or Acceptable Use Policy</li>
								<li>Non-payment of fees</li>
								<li>Legal or regulatory requirements</li>
								<li>Risk to service security or other users</li>
							</ul>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">
								Disclaimers and Limitations
							</h2>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">Service Disclaimers</h3>
							<p className="mb-4 text-gray-700">
								CallSafe is provided &quot;as is&quot; without warranties of any kind. We disclaim
								all warranties, express or implied, including merchantability, fitness for a
								particular purpose, and non-infringement.
							</p>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">Limitation of Liability</h3>
							<p className="mb-4 text-gray-700">
								To the maximum extent permitted by law, CallSafe shall not be liable for:
							</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>Indirect, incidental, special, or consequential damages</li>
								<li>Lost profits, data, or business opportunities</li>
								<li>Service interruptions or technical failures</li>
								<li>Third-party actions or content</li>
							</ul>
							<p className="mb-4 text-gray-700">
								Our total liability shall not exceed the amount paid by you in the 12 months
								preceding the claim.
							</p>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">Indemnification</h2>
							<p className="mb-4 text-gray-700">
								You agree to indemnify and hold CallSafe harmless from claims arising from:
							</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>Your use of the Service</li>
								<li>Violation of these Terms</li>
								<li>Infringement of third-party rights</li>
								<li>Your business operations and customer interactions</li>
							</ul>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">Changes to Terms</h2>
							<p className="mb-4 text-gray-700">
								We may modify these Terms at any time. Changes will be effective:
							</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>Immediately upon posting for non-material changes</li>
								<li>
									30 days after notice for material changes affecting pricing or core functionality
								</li>
								<li>Your continued use constitutes acceptance of modified Terms</li>
							</ul>
						</section>

						<section className="mb-8">
							<div className="rounded-lg border border-green-200 bg-green-50 p-6">
								<h3 className="mb-3 text-xl font-semibold text-green-900">
									Fair and Transparent Service
								</h3>
								<p className="text-green-800">
									CallSafe is committed to providing fair, transparent service terms that protect
									both businesses and customers. Our anonymous calling platform is designed to
									foster trust and communication while respecting everyone&apos;s rights and
									privacy.
								</p>
							</div>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">Severability</h2>
							<p className="mb-4 text-gray-700">
								If any provision of these Terms is found to be unenforceable, the remaining
								provisions will remain in full force and effect.
							</p>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">Entire Agreement</h2>
							<p className="mb-4 text-gray-700">
								These Terms, together with our Privacy Policy, constitute the entire agreement
								between you and CallSafe regarding the Service and supersede all prior agreements
								and understandings.
							</p>
						</section>
					</div>
				</div>
			</div>

			{/* Footer */}
			<footer className="border-t border-gray-200 bg-gray-50 py-8">
				<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="space-x-6 text-center">
						<a
							href="/privacy-policy"
							className="font-medium text-gray-600 transition-colors duration-200 hover:text-blue-600"
						>
							Privacy Policy
						</a>
						<a href="/terms-of-service" className="font-semibold text-blue-600">
							Terms of Service
						</a>
					</div>
				</div>
			</footer>
		</>
	);
}
