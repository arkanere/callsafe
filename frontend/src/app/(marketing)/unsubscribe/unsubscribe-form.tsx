'use client';

import { useEffect, useState } from 'react';

// Client island ported from (layout-1)/unsubscribe/+page.svelte. Posts to the
// existing /api/unsubscribe route handler, unchanged.
//
// The query param is read from window.location in an effect, mirroring the
// original's onMount. Using useSearchParams() instead would opt the whole page
// out of prerendering and leave the shell markup absent from the initial HTML.
export function UnsubscribeForm() {
	const [email, setEmail] = useState('');
	const [isConfirming, setIsConfirming] = useState(true);
	const [isLoading, setIsLoading] = useState(false);
	const [isSuccess, setIsSuccess] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		setEmail(params.get('email') || '');
	}, []);

	async function handleConfirm() {
		if (!email) {
			setErrorMessage('No email address found');
			return;
		}

		setIsLoading(true);
		setErrorMessage('');

		try {
			const response = await fetch('/api/unsubscribe', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ email })
			});

			const result = await response.json();

			if (result.success) {
				setIsConfirming(false);
				setIsSuccess(true);
			} else {
				setErrorMessage(result.error || 'Failed to unsubscribe');
			}
		} catch (error) {
			setErrorMessage('An error occurred. Please try again.');
			console.error('Unsubscribe error:', error);
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<>
			{isConfirming ? (
				<div className="text-center">
					<h1 className="mb-8 text-4xl font-light text-gray-900">Confirm Unsubscription</h1>

					<p className="mb-4 text-lg leading-relaxed font-light text-gray-600">
						Please confirm that you want to unsubscribe
					</p>
					<p className="mb-8 text-lg font-medium text-gray-900">{email}</p>
					<p className="mb-8 text-base font-light text-gray-600">from our email list.</p>

					{errorMessage && (
						<div className="mb-8 rounded border border-red-200 bg-red-50 p-4">
							<p className="text-sm text-red-700">{errorMessage}</p>
						</div>
					)}

					<button
						onClick={handleConfirm}
						disabled={isLoading || !email}
						className="w-full bg-gray-900 px-8 py-4 text-lg font-medium tracking-wide text-white transition-colors duration-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isLoading ? 'Processing...' : 'Confirm Unsubscription'}
					</button>
				</div>
			) : isSuccess ? (
				<div className="text-center">
					<div className="mx-auto mb-8 flex h-16 w-16 justify-center text-green-600">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
							<polyline points="22 4 12 14.01 9 11.01"></polyline>
						</svg>
					</div>

					<h1 className="mb-8 text-4xl font-light text-gray-900">Unsubscription Successful</h1>

					<p className="text-lg leading-relaxed font-light text-gray-600">
						You have been unsubscribed from our email list.
						<br />
						You will no longer receive emails from CallSafe.
					</p>
				</div>
			) : null}
		</>
	);
}
