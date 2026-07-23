'use client';

import { createContext, useContext, useState } from 'react';
import { AuthManager } from '$lib/managers/auth-manager';

// Client island ported from the interactive half of (layout-1)/+page.svelte.
// The static marketing markup stays in the server component; the buttons that
// open the modal are rendered as <AuthTrigger> and share this state.
//
// The page's onMount authentication check is intentionally absent: proxy.ts now
// performs the same redirect server-side (see migration-implementation-plan.md
// Phase 4).

const AuthModalContext = createContext<() => void>(() => {});

export function AuthTrigger({
	className,
	children
}: {
	className?: string;
	children: React.ReactNode;
}) {
	const openLoginModal = useContext(AuthModalContext);
	return (
		<button onClick={openLoginModal} className={className}>
			{children}
		</button>
	);
}

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
	const [showLoginModal, setShowLoginModal] = useState(false);
	const [isSignUpMode, setIsSignUpMode] = useState(false);
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [fullName, setFullName] = useState('');
	const [loginError, setLoginError] = useState('');
	const [isLoading, setIsLoading] = useState(false);

	function resetForm() {
		console.log('[MAIN PAGE] Resetting form');
		setIsSignUpMode(false);
		setLoginError('');
		setEmail('');
		setPassword('');
		setConfirmPassword('');
		setFullName('');
		setIsLoading(false);
		console.log('[MAIN PAGE] Form state reset');
	}

	function openLoginModal() {
		console.log('[MAIN PAGE] Opening login modal');
		setShowLoginModal(true);
		resetForm();
		setIsSignUpMode(true);
		console.log('[MAIN PAGE] Login modal opened, form reset');
	}

	function closeLoginModal() {
		console.log('[MAIN PAGE] Closing login modal');
		setShowLoginModal(false);
		resetForm();
		console.log('[MAIN PAGE] Login modal closed, form reset');
	}

	function toggleMode() {
		console.log('[MAIN PAGE] Toggling mode from', isSignUpMode ? 'signup' : 'signin');
		setIsSignUpMode(!isSignUpMode);
		setLoginError('');
		setPassword('');
		setConfirmPassword('');
		if (isSignUpMode) {
			setFullName('');
		}
		console.log('[MAIN PAGE] Mode toggled to', !isSignUpMode ? 'signup' : 'signin');
	}

	function validateEmail(email: string): boolean {
		console.log('[MAIN PAGE] Validating email:', email);
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		const isValid = emailRegex.test(email);
		console.log('[MAIN PAGE] Email validation result:', isValid);
		return isValid;
	}

	function validatePassword(password: string): boolean {
		console.log('[MAIN PAGE] Validating password length:', password.length);
		const isValid = password.length >= 6;
		console.log('[MAIN PAGE] Password validation result:', isValid);
		return isValid;
	}

	async function handleSignUp() {
		console.log('[MAIN PAGE] Starting signup process');
		console.log('[MAIN PAGE] Signup data:', {
			fullName: fullName.trim(),
			email: email.trim(),
			passwordLength: password.length
		});

		// Validation
		if (!fullName.trim()) {
			console.log('[MAIN PAGE] Signup validation failed: missing full name');
			setLoginError('Please enter your full name');
			return;
		}

		if (!validateEmail(email)) {
			console.log('[MAIN PAGE] Signup validation failed: invalid email');
			setLoginError('Please enter a valid email address');
			return;
		}

		if (!validatePassword(password)) {
			console.log('[MAIN PAGE] Signup validation failed: password too short');
			setLoginError('Password must be at least 6 characters long');
			return;
		}

		if (password !== confirmPassword) {
			console.log('[MAIN PAGE] Signup validation failed: passwords do not match');
			setLoginError('Passwords do not match');
			return;
		}

		console.log('[MAIN PAGE] Signup validation passed, making API request');
		setIsLoading(true);
		setLoginError('');

		try {
			const requestData = {
				email: email.trim(),
				password,
				name: fullName.trim()
			};
			console.log('[MAIN PAGE] Sending signup request:', {
				...requestData,
				password: '[REDACTED]'
			});

			const response = await fetch('/api/signup', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestData)
			});

			console.log('[MAIN PAGE] Signup response status:', response.status);
			const result = await response.json();
			console.log('[MAIN PAGE] Signup response data:', {
				...result,
				user: result.user ? { ...result.user, password: '[REDACTED]' } : undefined
			});

			if (result.success) {
				console.log('[MAIN PAGE] Signup successful, user auto-logged in');

				// Success - redirect to user page (auth cookie set by server)
				console.log('[MAIN PAGE] Redirecting to /user');
				closeLoginModal();
				window.location.href = '/user';
			} else {
				console.log('[MAIN PAGE] Signup failed:', result.error);
				setLoginError(result.error || 'Failed to create account');
			}
		} catch (error) {
			console.error('[MAIN PAGE] Signup error:', error);
			setLoginError('Failed to create account. Please try again.');
		} finally {
			console.log('[MAIN PAGE] Signup process finished');
			setIsLoading(false);
		}
	}

	async function handleSignIn() {
		console.log('[MAIN PAGE] Starting signin process');
		console.log('[MAIN PAGE] Signin data:', {
			email: email.trim(),
			passwordLength: password.length
		});

		if (!email || !password) {
			console.log('[MAIN PAGE] Signin validation failed: missing email or password');
			setLoginError('Please enter both email and password');
			return;
		}

		console.log('[MAIN PAGE] Signin validation passed, calling AuthManager.login');
		setIsLoading(true);
		setLoginError('');

		try {
			const loginResponse = await AuthManager.login(email.trim(), password);
			console.log('[MAIN PAGE] Login successful:', { response: loginResponse });

			// Success - redirect to user dashboard
			console.log('[MAIN PAGE] Redirecting to /user');
			closeLoginModal();
			window.location.href = '/user';
		} catch (error) {
			console.error('[MAIN PAGE] Login error:', error);
			setLoginError('Invalid email or password');
		} finally {
			console.log('[MAIN PAGE] Signin process finished');
			setIsLoading(false);
		}
	}

	async function handleSubmit() {
		console.log('[MAIN PAGE] Form submitted, mode:', isSignUpMode ? 'signup' : 'signin');
		if (isSignUpMode) {
			await handleSignUp();
		} else {
			await handleSignIn();
		}
	}

	function handleKeydown(event: React.KeyboardEvent) {
		console.log('[MAIN PAGE] Keydown event:', event.key);
		if (event.key === 'Enter') {
			console.log('[MAIN PAGE] Enter key pressed, submitting form');
			handleSubmit();
		} else if (event.key === 'Escape') {
			console.log('[MAIN PAGE] Escape key pressed, closing modal');
			closeLoginModal();
		}
	}

	return (
		<AuthModalContext.Provider value={openLoginModal}>
			{children}

			{/* Login/Signup Modal */}
			{showLoginModal && (
				<div
					className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black p-4"
					onClick={closeLoginModal}
				>
					<div
						className="w-full max-w-md rounded-lg bg-white p-8 shadow-2xl"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="mb-8 text-center">
							<h2 className="mb-2 text-2xl font-light text-gray-900">
								{isSignUpMode ? 'Create Account' : 'Login'}
							</h2>
							<p className="font-light text-gray-600">
								{isSignUpMode
									? 'Join premium service providers using CallSafe'
									: 'Access your CallSafe account'}
							</p>
							{isSignUpMode && (
								<div className="mt-4 rounded border border-green-200 bg-green-50 p-3">
									<p className="text-sm font-medium text-green-800">
										No credit card required for the first 2 months
									</p>
								</div>
							)}
						</div>

						<form
							onSubmit={(e) => {
								e.preventDefault();
								handleSubmit();
							}}
						>
							{isSignUpMode && (
								<div className="mb-6">
									<label
										htmlFor="fullName"
										className="mb-2 block text-sm font-medium text-gray-700"
									>
										Full Name
									</label>
									<input
										type="text"
										id="fullName"
										value={fullName}
										onChange={(e) => setFullName(e.target.value)}
										onKeyDown={handleKeydown}
										className="w-full rounded border border-gray-200 px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-gray-900 focus:outline-none"
										placeholder="Enter your full name"
										required
									/>
								</div>
							)}

							<div className="mb-6">
								<label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
									Email Address
								</label>
								<input
									type="email"
									id="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									onKeyDown={handleKeydown}
									className="w-full rounded border border-gray-200 px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-gray-900 focus:outline-none"
									placeholder="Enter your email"
									required
								/>
							</div>

							<div className="mb-6">
								<label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-700">
									Password
								</label>
								<input
									type="password"
									id="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									onKeyDown={handleKeydown}
									className="w-full rounded border border-gray-200 px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-gray-900 focus:outline-none"
									placeholder={
										isSignUpMode ? 'Create a password (min 6 characters)' : 'Enter your password'
									}
									required
								/>
							</div>

							{isSignUpMode && (
								<div className="mb-6">
									<label
										htmlFor="confirmPassword"
										className="mb-2 block text-sm font-medium text-gray-700"
									>
										Confirm Password
									</label>
									<input
										type="password"
										id="confirmPassword"
										value={confirmPassword}
										onChange={(e) => setConfirmPassword(e.target.value)}
										onKeyDown={handleKeydown}
										className="w-full rounded border border-gray-200 px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-gray-900 focus:outline-none"
										placeholder="Confirm your password"
										required
									/>
								</div>
							)}

							{loginError && (
								<div className="mb-6 rounded border border-red-200 bg-red-50 p-3">
									<p className="text-sm text-red-700">{loginError}</p>
								</div>
							)}

							<div className="mb-6 flex gap-3">
								<button
									type="button"
									onClick={closeLoginModal}
									className="flex-1 rounded border border-gray-200 px-6 py-3 font-medium text-gray-700 transition-colors duration-300 hover:bg-gray-50"
								>
									Cancel
								</button>
								<button
									type="submit"
									disabled={isLoading}
									className="flex-1 rounded bg-gray-900 px-6 py-3 font-medium text-white transition-colors duration-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
								>
									{isLoading ? (
										<div className="flex items-center justify-center">
											<svg
												className="mr-3 -ml-1 h-5 w-5 animate-spin text-white"
												xmlns="http://www.w3.org/2000/svg"
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
											{isSignUpMode ? 'Creating Account...' : 'Signing In...'}
										</div>
									) : isSignUpMode ? (
										'Create Account'
									) : (
										'Sign In'
									)}
								</button>
							</div>

							<div className="text-center">
								<p className="text-sm font-light text-gray-600">
									{isSignUpMode ? 'Already have an account?' : "Don't have an account?"}
									<button
										type="button"
										onClick={toggleMode}
										className="ml-1 font-medium text-gray-900 hover:text-gray-700"
									>
										{isSignUpMode ? 'Sign In' : 'Sign Up'}
									</button>
								</p>
							</div>
						</form>
					</div>
				</div>
			)}
		</AuthModalContext.Provider>
	);
}
