import type { Metadata } from 'next';
import styles from './pricing.module.css';

export const metadata: Metadata = {
	title: 'Pricing - CallSafe',
	description:
		'Privacy-focused browser-based calling solutions for businesses. Professional plans starting at $19/month.'
};

// Ported from (layout-1)/pricing/+page.svelte. The source's `selectedPlan`
// state was written by the CTA buttons but never read, so the page has no
// interactive behaviour and stays fully server rendered.
const plans = [
	{
		id: 'professional',
		name: 'Professional',
		price: '$19',
		originalPrice: '',
		period: 'per month',
		calls: 'Up to 100 calls',
		features: [
			'No credit card required for first 2 months',
			'Up to 100 anonymous calls per month',
			'Web dashboard access',
			'Call analytics included',
			'Standard support',
			'Perfect for professional service businesses'
		],
		buttonText: 'Start Professional',
		popular: false
	},
	{
		id: 'premium',
		name: 'Premium',
		price: '$29',
		originalPrice: '',
		period: 'per month',
		calls: 'Up to 500 calls',
		features: [
			'No credit card required for first 2 months',
			'Up to 500 anonymous calls per month',
			'Web dashboard access',
			'Call analytics included',
			'Priority support',
			'Perfect for businesses with privacy-conscious users'
		],
		buttonText: 'Start Premium',
		popular: true
	},
	{
		id: 'enterprise',
		name: 'Enterprise',
		price: 'Custom',
		originalPrice: '',
		period: 'pricing',
		calls: 'Unlimited calls',
		features: [
			'Unlimited anonymous calls',
			'Custom integrations available',
			'Dedicated account management',
			'SLA guarantees',
			'Perfect for large organizations and enterprises'
		],
		buttonText: 'Contact Sales',
		popular: false
	}
];

export default function Pricing() {
	return (
		<>
			{/* Navigation Bar */}
			<nav className="border-b border-gray-100">
				<div className="mx-auto max-w-6xl px-6 py-6">
					<div className="flex items-center justify-between">
						<a
							href="/"
							className="text-2xl font-light tracking-wide text-gray-900 transition-colors duration-300 hover:text-gray-600"
						>
							CallSafe
						</a>
						<a
							href="/"
							className="font-medium tracking-wide text-gray-900 transition-colors duration-300 hover:text-gray-600"
						>
							Login
						</a>
					</div>
				</div>
			</nav>

			<div className="min-h-screen bg-white">
				<div className={styles['pricing-container']}>
					<div className={styles['pricing-header']}>
						<h1>Privacy-Focused Calling Solutions</h1>
						<p>
							Browser-based anonymous calling that removes phone number barriers and boosts user
							engagement.
						</p>
						<div className={styles['no-card-notice']}>
							<svg className={styles['info-icon']} viewBox="0 0 20 20" fill="currentColor">
								<path
									fillRule="evenodd"
									d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
									clipRule="evenodd"
								/>
							</svg>
							No credit card required for the first 2 months
						</div>
					</div>

					<div className={styles['pricing-grid']}>
						{plans.map((plan) => (
							<div
								key={plan.id}
								className={`${styles['pricing-card']}${plan.popular ? ` ${styles.popular}` : ''}`}
							>
								{plan.popular && <div className={styles['popular-badge']}>Most Popular</div>}

								<div className={styles['plan-header']}>
									<h3>{plan.name}</h3>
									<div className={styles.price}>
										{plan.originalPrice && (
											<div className={styles['original-price']}>
												<span className={styles['struck-through']}>{plan.originalPrice}</span>
											</div>
										)}
										<span className={styles.amount}>{plan.price}</span>
										<span className={styles.period}>{plan.period}</span>
									</div>
								</div>

								<div className={styles['plan-limits']}>
									<div className={styles['limit-item']}>
										<strong>{plan.calls}</strong>
									</div>
									<div className={styles['limit-note']}>Browser-based calling</div>
								</div>

								<ul className={styles.features}>
									{plan.features.map((feature) => (
										<li key={feature}>
											<svg className={styles['check-icon']} viewBox="0 0 20 20" fill="currentColor">
												<path
													fillRule="evenodd"
													d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
													clipRule="evenodd"
												/>
											</svg>
											{feature}
										</li>
									))}
								</ul>

								<button
									className={`${styles['cta-button']}${plan.popular ? ` ${styles.primary}` : ''}`}
								>
									{plan.buttonText}
								</button>
							</div>
						))}
					</div>

					<div className={styles['faq-section']}>
						<h2>Frequently Asked Questions</h2>
						<div className={styles['faq-grid']}>
							<div className={styles['faq-item']}>
								<h4>How do anonymous calls work?</h4>
								<p>
									Clients click a button on your website and connect instantly through their
									browser. No phone numbers are exchanged, no personal information is collected.
									Calls are received through your web dashboard.
								</p>
							</div>
							<div className={styles['faq-item']}>
								<h4>What if I exceed my call limit?</h4>
								<p>
									You can upgrade to a higher tier immediately to continue receiving calls, or
									contact us for custom Enterprise pricing if you need unlimited calls.
								</p>
							</div>
							<div className={styles['faq-item']}>
								<h4>Is there a mobile app?</h4>
								<p>
									Currently all calls are received through your web dashboard, accessible from any
									device. This ensures maximum compatibility and reliability.
								</p>
							</div>
							<div className={styles['faq-item']}>
								<h4>Can I cancel anytime?</h4>
								<p>Yes, you can cancel or change plans at any time.</p>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Footer */}
			<footer className="border-t border-gray-100 py-12">
				<div className="mx-auto max-w-6xl px-6">
					<div className="space-x-8 text-center">
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
				</div>
			</footer>
		</>
	);
}
