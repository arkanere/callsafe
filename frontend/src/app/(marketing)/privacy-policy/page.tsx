import type { Metadata } from 'next';
import styles from '../legal-prose.module.css';

export const metadata: Metadata = {
	title: 'Privacy Policy - CallSafe',
	description:
		'CallSafe Privacy Policy - Learn how we protect your privacy with anonymous calling technology.'
};

// Ported from (layout-1)/privacy-policy/+page.svelte. Pure static markup.
export default function PrivacyPolicy() {
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
						<h1 className="mb-4 text-4xl font-bold text-gray-900">Privacy Policy</h1>
					</header>

					<div className={`prose prose-lg max-w-none ${styles.prose}`}>
						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">
								Our Privacy-First Commitment
							</h2>
							<p className="mb-4 text-gray-700">
								CallSafe is built on the principle of complete customer anonymity. Our entire
								platform is designed to enable customers to contact businesses without sharing any
								personal information, including phone numbers. This privacy policy explains how we
								achieve this goal and what minimal data we collect to operate our service.
							</p>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">
								What Makes CallSafe Different
							</h2>
							<p className="mb-4 text-gray-700">
								Unlike traditional calling services, CallSafe is specifically designed for anonymous
								communication:
							</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>No phone numbers are exchanged or stored</li>
								<li>Customers remain completely anonymous unless they choose otherwise</li>
								<li>No registration required for customers to make calls</li>
								<li>No tracking or profiling of individual customers</li>
								<li>Calls cannot be linked to specific individuals</li>
							</ul>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">Information We Collect</h2>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">
								For Business Users (Account Required)
							</h3>
							<p className="mb-2 text-gray-700">
								When businesses sign up for CallSafe, we collect:
							</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>
									<strong>Account Information:</strong> Email address, name, and password
								</li>
								<li>
									<strong>Business Details:</strong> Company name, website URL (optional)
								</li>
								<li>
									<strong>Payment Information:</strong> Billing details processed securely through
									our payment providers
								</li>
								<li>
									<strong>Usage Analytics:</strong> Call volumes, connection success rates, and
									service usage metrics
								</li>
							</ul>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">
								For Customers (No Account Required)
							</h3>
							<p className="mb-2 text-gray-700">
								We collect the absolute minimum to provide calling services:
							</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>
									<strong>Technical Data Only:</strong> Browser type, connection quality metrics
								</li>
								<li>
									<strong>Call Metadata:</strong> Call duration, connection success/failure (not
									linked to individuals)
								</li>
								<li>
									<strong>Source Tracking:</strong> Which website page the call was initiated from
									(for business analytics)
								</li>
								<li>
									<strong>No Personal Data:</strong> No phone numbers, names, email addresses, or
									identifying information
								</li>
							</ul>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">How We Use Information</h2>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">Business Information</h3>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>Account management and authentication</li>
								<li>Service delivery and technical support</li>
								<li>Billing and payment processing</li>
								<li>Service improvements and feature development</li>
								<li>Legal compliance and fraud prevention</li>
							</ul>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">Technical Data</h3>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>Maintaining call quality and connection reliability</li>
								<li>Aggregate analytics for service improvement</li>
								<li>Technical troubleshooting and system optimization</li>
								<li>Security monitoring and threat detection</li>
							</ul>
						</section>

						<section className="mb-8">
							{/* NOTE: `font-semibent` is a typo in the original markup — kept verbatim. */}
							<h2 className="font-semibent mb-4 text-2xl text-gray-900">
								Data Sharing and Disclosure
							</h2>
							<p className="mb-4 text-gray-700">
								We do not sell, trade, or otherwise transfer personal information to outside
								parties, except:
							</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>
									<strong>Service Providers:</strong> Trusted third parties who assist in operating
									our service (hosting, payment processing)
								</li>
								<li>
									<strong>Legal Requirements:</strong> When required by law or to protect our rights
									and safety
								</li>
								<li>
									<strong>Business Transfers:</strong> In the event of a merger, acquisition, or
									asset sale
								</li>
							</ul>
							<p className="mb-4 text-gray-700">
								<strong>Important:</strong> Customer call data is never shared with businesses
								beyond the call itself. Businesses cannot access customer identity, contact
								information, or personal data through our platform.
							</p>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">Data Retention</h2>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>
									<strong>Business Account Data:</strong> Retained while account is active and for
									legal/tax purposes after closure
								</li>
								<li>
									<strong>Call Metadata:</strong> Aggregated, non-identifying call statistics
									retained for service improvement
								</li>
								<li>
									<strong>Technical Logs:</strong> Retained for 90 days for troubleshooting and
									security purposes
								</li>
								<li>
									<strong>Customer Data:</strong> No persistent customer data is retained after call
									completion
								</li>
							</ul>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">Security Measures</h2>
							<p className="mb-4 text-gray-700">
								We implement industry-standard security measures:
							</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>End-to-end encryption for all voice communications</li>
								<li>Secure WebRTC protocols for call transmission</li>
								<li>Regular security audits and vulnerability assessments</li>
								<li>Access controls and authentication for business accounts</li>
								<li>Secure hosting infrastructure with data encryption at rest and in transit</li>
							</ul>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">Your Privacy Rights</h2>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">For Customers</h3>
							<p className="mb-4 text-gray-700">
								Since we don&apos;t collect personal information from customers, there&apos;s no
								personal data to access, correct, or delete. Your privacy is protected by design.
							</p>

							<h3 className="mb-3 text-xl font-semibold text-gray-800">For Business Users</h3>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>
									<strong>Access:</strong> Request access to your account information
								</li>
								<li>
									<strong>Correction:</strong> Update or correct your account details
								</li>
								<li>
									<strong>Deletion:</strong> Request deletion of your account and associated data
								</li>
								<li>
									<strong>Portability:</strong> Request export of your account data
								</li>
								<li>
									<strong>Objection:</strong> Object to certain data processing activities
								</li>
							</ul>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">Cookies and Tracking</h2>
							<p className="mb-4 text-gray-700">We use minimal cookies and tracking:</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>
									<strong>Essential Cookies:</strong> Required for basic service functionality
								</li>
								<li>
									<strong>Authentication Cookies:</strong> For business user login sessions
								</li>
								<li>
									<strong>No Tracking Cookies:</strong> We don&apos;t use advertising or tracking
									cookies for customers
								</li>
								<li>
									<strong>Analytics:</strong> Aggregate, non-identifying usage statistics only
								</li>
							</ul>
						</section>

						<section className="mb-8">
							<h2 className="mb-4 text-2xl font-semibold text-gray-900">Changes to This Policy</h2>
							<p className="mb-4 text-gray-700">
								We may update this privacy policy periodically. When we make changes, we will:
							</p>
							<ul className="mb-4 list-disc pl-6 text-gray-700">
								<li>Update the &quot;Last updated&quot; date at the top of this policy</li>
								<li>Notify business users of material changes via email</li>
								<li>Post prominent notices on our website for significant changes</li>
							</ul>
						</section>

						<section className="mb-8">
							<div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
								<h3 className="mb-3 text-xl font-semibold text-blue-900">
									Privacy by Design Promise
								</h3>
								<p className="text-blue-800">
									CallSafe was built from the ground up with privacy as our core principle. Unlike
									other services that collect data and promise to protect it, we simply don&apos;t
									collect customer data in the first place. True privacy protection means
									there&apos;s nothing to protect because there&apos;s nothing to collect.
								</p>
							</div>
						</section>
					</div>
				</div>
			</div>

			{/* Footer */}
			<footer className="border-t border-gray-200 bg-gray-50 py-8">
				<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="space-x-6 text-center">
						<a href="/privacy-policy" className="font-semibold text-blue-600">
							Privacy Policy
						</a>
						<a
							href="/terms-of-service"
							className="font-medium text-gray-600 transition-colors duration-200 hover:text-blue-600"
						>
							Terms of Service
						</a>
					</div>
				</div>
			</footer>
		</>
	);
}
