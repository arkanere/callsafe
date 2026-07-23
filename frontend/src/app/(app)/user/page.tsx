'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthManager, type UserData } from '$lib/managers/auth-manager';

// Direct port of (layout-2)/user/+page.svelte.
export default function UserPage() {
	const router = useRouter();

	const [hasEmbedded, setHasEmbedded] = useState(false);
	const [callSafeHandle, setCallSafeHandle] = useState('');
	const [copied, setCopied] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [userData, setUserData] = useState<(UserData & { name?: string }) | null>(null);

	// Built from pieces so the component source never contains a literal
	// script closing tag, which terminates the Svelte script block early.
	function getEmbedSnippet(): string {
		const open = '<' + 'script>';
		const close = '<' + '/script>';
		return [
			open,
			"  window.addEventListener('load', function() {",
			"    var script = document.createElement('script');",
			"    script.src = 'https://callsafe.tech/embed.js';",
			`    script.setAttribute('data-handle', '${callSafeHandle}');`,
			"    script.setAttribute('data-source-id', 'PUT_YOUR_PAGE_ID_HERE');",
			'    document.body.appendChild(script);',
			'  });',
			close
		].join('\n');
	}

	// Check for authentication and load user data
	useEffect(() => {
		(async () => {
			console.log('[USER PAGE] Component mounted');
			console.log('[USER PAGE] Checking authentication');

			const isAuthenticated = await AuthManager.isAuthenticated();
			if (!isAuthenticated) {
				console.log('[USER PAGE] Not authenticated, redirecting to /');
				router.push('/');
				return;
			}

			console.log('[USER PAGE] Authenticated, loading user data');
			// Load user data from auth API
			const data = await AuthManager.getUserData();
			setUserData(data);
			console.log('[USER PAGE] User data loaded:', data);

			if (data) {
				setCallSafeHandle(data.handle);
				console.log('[USER PAGE] CallSafe handle set:', data.handle);
			}

			// Load additional user data from API if needed
			loadUserData(data);
		})();
		// Empty deps on purpose: parity with onMount, this runs exactly once.
	}, []);

	function logout() {
		console.log('[USER PAGE] Logout initiated');
		AuthManager.logout();
		console.log('[USER PAGE] Logout completed');
	}

	function goToAgent() {
		console.log('[USER PAGE] Going to agent page, handle:', callSafeHandle);
		if (callSafeHandle) {
			console.log('[USER PAGE] Navigating to /user/receive/' + callSafeHandle);
			router.push(`/user/receive/${callSafeHandle}`);
		} else {
			console.log('[USER PAGE] No handle available for agent access');
			// Note: errorMessage variable doesn't exist in the component
			console.error('[USER PAGE] Missing handle for agent portal access');
		}
	}

	function goToCustomer() {
		console.log('[USER PAGE] Going to customer page, handle:', callSafeHandle);
		if (callSafeHandle) {
			const sourceIdParam = userData?.sourceId ? `?sourceId=${userData.sourceId}` : '';
			const targetUrl = `/embed/${callSafeHandle}${sourceIdParam}`;
			console.log('[USER PAGE] Navigating to customer page:', targetUrl);
			router.push(targetUrl);
		} else {
			console.log('[USER PAGE] No handle, navigating to /user/customer');
			router.push('/user/customer');
		}
	}

	async function loadUserData(data: (UserData & { name?: string }) | null) {
		console.log('[USER PAGE] Loading additional user data');
		// For now, we have user data from JWT token
		// This function can be extended to load additional data from API if needed
		console.log('[USER PAGE] User data loaded from JWT:', data);
	}

	function copyToClipboard(text: string) {
		console.log('[USER PAGE] Copying to clipboard:', text);
		navigator.clipboard
			.writeText(text)
			.then(() => {
				console.log('[USER PAGE] Text copied successfully');
				setCopied(true);
				setTimeout(() => {
					setCopied(false);
					console.log('[USER PAGE] Copy status reset');
				}, 2000);
			})
			.catch((error) => {
				console.error('[USER PAGE] Failed to copy text:', error);
			});
	}

	async function markAsEmbedded() {
		console.log('[USER PAGE] Mark as embedded called');
		if (isLoading) {
			console.log('[USER PAGE] Already loading, skipping');
			return;
		}

		console.log('[USER PAGE] Starting embed marking process');
		setIsLoading(true);

		try {
			console.log('[USER PAGE] Marking as embedded (demo mode)');
			// For demo purposes, just mark as embedded locally
			setHasEmbedded(true);

			console.log('[USER PAGE] Embed status updated successfully');
		} catch (error) {
			console.error('[USER PAGE] Error updating embed status:', error);
			alert('Failed to update embed status. Please try again.');
		} finally {
			console.log('[USER PAGE] Embed marking process finished');
			setIsLoading(false);
		}
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100">
			<div className="mx-auto max-w-6xl px-4 py-8">
				{/* Header */}
				<div className="mb-8 rounded-2xl bg-white p-6 shadow-xl">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-3xl font-bold text-gray-800">
								Welcome, {userData?.name || 'User'}!
							</h1>
							<p className="text-gray-600">CallSafe User Dashboard</p>
						</div>
						<button
							onClick={logout}
							className="rounded-xl bg-red-600 px-6 py-2 font-semibold text-white transition-colors duration-200 hover:bg-red-700"
						>
							Logout
						</button>
					</div>
				</div>

				{/* User Information */}
				{userData && (
					<div className="mb-8 rounded-2xl bg-white p-6 shadow-xl">
						<h2 className="mb-4 text-xl font-bold text-gray-900">User Information</h2>

						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							{/* Email */}
							<div>
								<h3 className="mb-2 text-sm font-medium text-gray-700">Email:</h3>
								<div className="rounded-lg bg-gray-50 p-3">
									<code className="text-sm text-gray-700">{userData.email}</code>
								</div>
							</div>

							{/* Handle */}
							<div>
								<h3 className="mb-2 text-sm font-medium text-gray-700">Handle:</h3>
								<div className="rounded-lg bg-gray-50 p-3">
									{callSafeHandle ? (
										<div className="flex items-center justify-between">
											<code className="font-mono text-sm font-semibold text-blue-600">
												{callSafeHandle}
											</code>
											<button
												onClick={() => copyToClipboard(callSafeHandle)}
												className="ml-2 rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white transition-colors duration-200 hover:bg-blue-700"
											>
												{copied ? 'Copied!' : 'Copy'}
											</button>
										</div>
									) : (
										<span className="text-sm text-gray-500 italic">No handle assigned</span>
									)}
								</div>
							</div>
						</div>
					</div>
				)}

				{/* Setup Progress */}

				{/* CallSafe Handle Display */}

				<div className="mb-8 rounded-2xl bg-white p-6 shadow-xl">
					<h2 className="mb-4 text-xl font-bold text-gray-900">Your CallSafe Handle</h2>

					{/* Embed Code */}
					<div className="mb-4">
						<h3 className="mb-2 text-sm font-medium text-gray-700">
							Embed Code (Optimized for Fast Page Load):
						</h3>
						<div className="rounded-lg bg-gray-50 p-3">
							<div className="mb-2">
								<code className="block font-mono text-xs break-all whitespace-pre-wrap text-gray-700">
									{`<script>
  window.addEventListener('load', function() {
    var script = document.createElement('script');
    script.src = 'https://callsafe.tech/embed.js';
    script.setAttribute('data-handle', '${callSafeHandle}');
    script.setAttribute('data-source-id', 'PUT_YOUR_PAGE_ID_HERE');
    document.body.appendChild(script);
  });
</script>`}
								</code>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-xs text-gray-500">
									Replace &quot;PUT_YOUR_PAGE_ID_HERE&quot; with your tracking ID
								</span>
								<button
									onClick={() => copyToClipboard(getEmbedSnippet())}
									className="rounded bg-green-600 px-3 py-1 text-sm font-semibold text-white transition-colors duration-200 hover:bg-green-700"
								>
									{copied ? 'Copied!' : 'Copy Embed Code'}
								</button>
							</div>
						</div>
					</div>

					{/* Embed Confirmation Button */}
					{!hasEmbedded ? (
						<div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
							<div className="flex items-start">
								<div className="flex-shrink-0">
									<svg
										className="mt-0.5 h-5 w-5 text-blue-600"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth="2"
											d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
								</div>
								<div className="ml-3 flex-1">
									<p className="text-sm font-medium text-blue-800">
										Ready to start receiving calls?
									</p>
									<p className="mt-1 text-sm text-blue-700">
										Once you&apos;ve embedded the code on your website, click the button below to
										activate your CallSafe service.
									</p>
									<div className="mt-3">
										<button
											onClick={markAsEmbedded}
											disabled={isLoading}
											className="flex items-center rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
										>
											{isLoading ? (
												<>
													<svg
														className="mr-2 -ml-1 h-4 w-4 animate-spin text-white"
														fill="none"
														viewBox="0 0 24 24"
													>
														<circle
															className="opacity-25"
															cx="12"
															cy="12"
															r="10"
															stroke="currentColor"
															strokeWidth="4"
														></circle>
														<path
															className="opacity-75"
															fill="currentColor"
															d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
														></path>
													</svg>
													Processing...
												</>
											) : (
												<>
													<svg
														className="mr-2 h-4 w-4"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth="2"
															d="M5 13l4 4L19 7"
														/>
													</svg>
													I have embedded this code
												</>
											)}
										</button>
									</div>
								</div>
							</div>
						</div>
					) : (
						<div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
							<div className="flex items-center">
								<svg
									className="mr-3 h-5 w-5 text-green-600"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<div>
									<p className="text-sm font-medium text-green-800">CallSafe is active!</p>
									<p className="text-sm text-green-700">
										Your widget is embedded and ready to receive calls.
									</p>
								</div>
							</div>
						</div>
					)}
				</div>

				{/* Quick Actions */}
				<div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
					<div className="rounded-2xl bg-white p-8 shadow-xl">
						<div className="text-center">
							<div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-purple-100">
								<svg
									className="h-10 w-10 text-purple-600"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
									/>
								</svg>
							</div>
							<h3 className="mb-4 text-2xl font-bold text-gray-900">Receive Calls</h3>
							<p className="mb-6 text-gray-600">Accept and manage incoming calls from customers</p>
							<button
								onClick={goToAgent}
								className="w-full rounded-xl bg-purple-600 px-6 py-3 font-semibold text-white transition-colors duration-200 hover:bg-purple-700"
							>
								Receive Calls
							</button>
						</div>
					</div>

					<div className="rounded-2xl bg-white p-8 shadow-xl">
						<div className="text-center">
							<div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
								<svg
									className="h-10 w-10 text-blue-600"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
									/>
								</svg>
							</div>
							<h3 className="mb-4 text-2xl font-bold text-gray-900">Make Calls</h3>
							<p className="mb-6 text-gray-600">Test the calling experience as a customer</p>
							<button
								onClick={goToCustomer}
								className="w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition-colors duration-200 hover:bg-blue-700"
							>
								Make Calls
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
