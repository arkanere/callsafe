<script lang="ts">
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { AuthManager } from '$lib/managers/auth-manager';
    
    let showLoginModal = false;
    let isSignUpMode = false;
    let email = '';
    let password = '';
    let confirmPassword = '';
    let fullName = '';
    let loginError = '';
    let isLoading = false;
    let currentUser = null;
    
    // Check if user is already authenticated
    onMount(() => {
      console.log('[MAIN PAGE] Component mounted');
      console.log('[MAIN PAGE] Checking token validity');
      const isTokenValid = AuthManager.isTokenValid();
      console.log('[MAIN PAGE] Token valid:', isTokenValid);
      if (isTokenValid) {
        console.log('[MAIN PAGE] Redirecting to /user');
        window.location.href = '/user';
      } else {
        console.log('[MAIN PAGE] User not authenticated, staying on main page');
      }
    });
    
    function openLoginModal() {
      console.log('[MAIN PAGE] Opening login modal');
      showLoginModal = true;
      resetForm();
      isSignUpMode = true;
      console.log('[MAIN PAGE] Login modal opened, form reset');
    }
    
    function closeLoginModal() {
      console.log('[MAIN PAGE] Closing login modal');
      showLoginModal = false;
      resetForm();
      console.log('[MAIN PAGE] Login modal closed, form reset');
    }
    
    function resetForm() {
      console.log('[MAIN PAGE] Resetting form');
      isSignUpMode = false;
      loginError = '';
      email = '';
      password = '';
      confirmPassword = '';
      fullName = '';
      isLoading = false;
      console.log('[MAIN PAGE] Form state reset:', { isSignUpMode, loginError, email, password, confirmPassword, fullName, isLoading });
    }
    
    function toggleMode() {
      console.log('[MAIN PAGE] Toggling mode from', isSignUpMode ? 'signup' : 'signin');
      isSignUpMode = !isSignUpMode;
      loginError = '';
      password = '';
      confirmPassword = '';
      if (!isSignUpMode) {
        fullName = '';
      }
      console.log('[MAIN PAGE] Mode toggled to', isSignUpMode ? 'signup' : 'signin');
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
      console.log('[MAIN PAGE] Signup data:', { fullName: fullName.trim(), email: email.trim(), passwordLength: password.length });
      
      // Validation
      if (!fullName.trim()) {
        console.log('[MAIN PAGE] Signup validation failed: missing full name');
        loginError = 'Please enter your full name';
        return;
      }
      
      if (!validateEmail(email)) {
        console.log('[MAIN PAGE] Signup validation failed: invalid email');
        loginError = 'Please enter a valid email address';
        return;
      }
      
      if (!validatePassword(password)) {
        console.log('[MAIN PAGE] Signup validation failed: password too short');
        loginError = 'Password must be at least 6 characters long';
        return;
      }
      
      if (password !== confirmPassword) {
        console.log('[MAIN PAGE] Signup validation failed: passwords do not match');
        loginError = 'Passwords do not match';
        return;
      }
      
      console.log('[MAIN PAGE] Signup validation passed, making API request');
      isLoading = true;
      loginError = '';
      
      try {
        const requestData = {
          email: email.trim(),
          password,
          name: fullName.trim()
        };
        console.log('[MAIN PAGE] Sending signup request:', { ...requestData, password: '[REDACTED]' });
        
        const response = await fetch('/api/signup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestData)
        });
        
        console.log('[MAIN PAGE] Signup response status:', response.status);
        const result = await response.json();
        console.log('[MAIN PAGE] Signup response data:', { ...result, user: result.user ? { ...result.user, password: '[REDACTED]' } : undefined });
        
        if (result.success) {
          console.log('[MAIN PAGE] Signup successful, storing user data');
          // Store user session
          currentUser = result.user;
          
          // Store userId in localStorage for session management
          localStorage.setItem('callsafe_userId', result.user.id.toString());
          localStorage.setItem('callsafe_user', JSON.stringify(result.user));
          console.log('[MAIN PAGE] User data stored in localStorage');
          
          // Success - redirect to user page
          console.log('[MAIN PAGE] Redirecting to /user');
          closeLoginModal();
          window.location.href = '/user';
        } else {
          console.log('[MAIN PAGE] Signup failed:', result.error);
          loginError = result.error || 'Failed to create account';
        }
      } catch (error) {
        console.error('[MAIN PAGE] Signup error:', error);
        loginError = 'Failed to create account. Please try again.';
      } finally {
        console.log('[MAIN PAGE] Signup process finished');
        isLoading = false;
      }
    }
    
    async function handleSignIn() {
      console.log('[MAIN PAGE] Starting signin process');
      console.log('[MAIN PAGE] Signin data:', { email: email.trim(), passwordLength: password.length });
      
      if (!email || !password) {
        console.log('[MAIN PAGE] Signin validation failed: missing email or password');
        loginError = 'Please enter both email and password';
        return;
      }
      
      console.log('[MAIN PAGE] Signin validation passed, calling AuthManager.login');
      isLoading = true;
      loginError = '';
      
      try {
        const loginResponse = await AuthManager.login(email.trim(), password);
        console.log('[MAIN PAGE] Login successful:', { response: loginResponse });
        
        // Success - redirect to user dashboard
        console.log('[MAIN PAGE] Redirecting to /user');
        closeLoginModal();
        window.location.href = '/user';
        
      } catch (error) {
        console.error('[MAIN PAGE] Login error:', error);
        loginError = 'Invalid email or password';
      } finally {
        console.log('[MAIN PAGE] Signin process finished');
        isLoading = false;
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
    
    function handleKeydown(event: KeyboardEvent) {
      console.log('[MAIN PAGE] Keydown event:', event.key);
      if (event.key === 'Enter') {
        console.log('[MAIN PAGE] Enter key pressed, submitting form');
        handleSubmit();
      } else if (event.key === 'Escape') {
        console.log('[MAIN PAGE] Escape key pressed, closing modal');
        closeLoginModal();
      }
    }
  </script>
  
  <div class="min-h-screen bg-white">
    <!-- Navigation -->
    <nav class="border-b border-gray-100">
      <div class="max-w-6xl mx-auto px-6 py-6">
        <div class="flex justify-between items-center">
          <!-- Left side - Logo/Brand -->
          <h1 class="text-2xl font-light text-gray-900 tracking-wide">CallSafe</h1>
          
          <!-- Right side - Navigation Links -->
          <div class="flex items-center space-x-6">
            <a 
              href="/pricing" 
              class="text-gray-700 hover:text-gray-900 font-medium tracking-wide transition-colors duration-300"
            >
              Pricing
            </a>
            <button
              on:click={openLoginModal}
              class="text-gray-900 hover:text-gray-600 font-medium tracking-wide transition-colors duration-300"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    </nav>
  
    <!-- Hero Section -->
    <section class="pt-24 pb-32 px-6">
      <div class="max-w-4xl mx-auto text-center">
        <h1 class="text-6xl md:text-7xl font-light text-gray-900 mb-8 leading-tight tracking-tight">
          Let privacy conscious users visiting your website<br/>
          <span class="font-medium">reach you instantly. No phone number needed.</span>
        </h1>
        <p class="text-xl text-gray-600 mb-12 font-light leading-relaxed max-w-2xl mx-auto">
          Privacy-focused browser-based calling solution that removes phone number barriers and boosts user engagement.
        </p>
        <button
          on:click={openLoginModal}
          class="bg-gray-900 text-white px-12 py-4 text-lg font-medium tracking-wide hover:bg-gray-800 transition-colors duration-300"
        >
          Start Free Trial
        </button>
        <p class="text-gray-600 mt-4 font-light">
          No credit card required for the first 2 months
        </p>
      </div>
    </section>
  
    <!-- Value Proposition -->
    <section class="py-24 px-6 bg-gray-50">
      <div class="max-w-5xl mx-auto">
        <div class="text-center mb-20">
          <h2 class="text-4xl font-light text-gray-900 mb-6">
            What CallSafe Does
          </h2>
          <p class="text-lg text-gray-600 font-light max-w-3xl mx-auto leading-relaxed">
            CallSafe lets website visitors call you directly from their browser without sharing their phone number. Users click a button on your website and connect instantly via secure browser calling.
          </p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-16">
          <div class="text-center">
            <div class="text-3xl font-light text-gray-900 mb-4">Anonymous Calling</div>
            <p class="text-gray-600 font-light leading-relaxed">
              Users connect without revealing phone numbers or personal information
            </p>
          </div>
          
          <div class="text-center">
            <div class="text-3xl font-light text-gray-900 mb-4">Browser-Based Technology</div>
            <p class="text-gray-600 font-light leading-relaxed">
              Works directly in web browsers using secure WebRTC connections
            </p>
          </div>
          
          <div class="text-center">
            <div class="text-3xl font-light text-gray-900 mb-4">Designed with Privacy in Mind</div>
            <p class="text-gray-600 font-light leading-relaxed">
              No data collection, no call recordings, complete anonymity for users
            </p>
          </div>
        </div>
      </div>
    </section>
  
    <!-- How It Works -->
    <section class="py-24 px-6">
      <div class="max-w-4xl mx-auto text-center">
        <h2 class="text-4xl font-light text-gray-900 mb-16">
          How It Works
        </h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-16">
          <div class="text-center">
            <div class="text-lg font-medium text-gray-900 mb-4">For Users</div>
            <div class="text-left space-y-3 max-w-xs mx-auto">
              <p class="text-gray-600 font-light">• Click "Talk to us instantly" on your website</p>
              <p class="text-gray-600 font-light">• Browser connects them directly to you</p>
              <p class="text-gray-600 font-light">• No phone number sharing required</p>
              <p class="text-gray-600 font-light">• No apps or downloads needed</p>
            </div>
          </div>
          
          <div class="text-center">
            <div class="text-lg font-medium text-gray-900 mb-4">For Businesses</div>
            <div class="text-left space-y-3 max-w-xs mx-auto">
              <p class="text-gray-600 font-light">• Add one line of code to your website</p>
              <p class="text-gray-600 font-light">• Receive calls on web dashboard or mobile app</p>
              <p class="text-gray-600 font-light">• Users can contact you without privacy concerns</p>
              <p class="text-gray-600 font-light">• Higher engagement from privacy-conscious visitors</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  
    <!-- Simple Setup -->
    <section class="py-24 px-6 bg-gray-50">
      <div class="max-w-3xl mx-auto text-center">
        <h2 class="text-4xl font-light text-gray-900 mb-12">
          Simple Integration
        </h2>
        
        <div class="space-y-8 max-w-2xl mx-auto pl-16">
          <div class="flex items-center space-x-8">
            <div class="w-8 h-8 bg-gray-900 text-white rounded-full flex items-center justify-center text-sm font-medium ml-24">1</div>
            <div class="text-left">
              <div class="text-lg font-medium text-gray-900">Sign up and get your embed code</div>
              <div class="text-gray-600 font-light">Instant setup with customizable options</div>
            </div>
          </div>
          
          <div class="flex items-center space-x-8">
            <div class="w-8 h-8 bg-gray-900 text-white rounded-full flex items-center justify-center text-sm font-medium ml-24">2</div>
            <div class="text-left">
              <div class="text-lg font-medium text-gray-900">Add code to your website</div>
              <div class="text-gray-600 font-light">One line of code, works immediately</div>
            </div>
          </div>
          
          <div class="flex items-center space-x-8">
            <div class="w-8 h-8 bg-gray-900 text-white rounded-full flex items-center justify-center text-sm font-medium ml-24">3</div>
            <div class="text-left">
              <div class="text-lg font-medium text-gray-900">Receive calls on any device</div>
              <div class="text-gray-600 font-light">Setup takes 3 minutes, no technical expertise required</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  
    <!-- CTA -->
    <section class="py-24 px-6">
      <div class="max-w-3xl mx-auto text-center">
        <h2 class="text-4xl font-light text-gray-900 mb-8">
          Start Converting More Visitors
        </h2>
        <p class="text-lg text-gray-600 font-light mb-8 leading-relaxed">
          Let privacy-conscious users reach you instantly without phone number barriers.
        </p>
        <div class="inline-flex flex-col items-center">
          <button
            on:click={openLoginModal}
            class="bg-gray-900 text-white px-12 py-4 text-lg font-medium tracking-wide hover:bg-gray-800 transition-colors duration-300 mb-4"
          >
            Start Your Free Trial
          </button>
          <p class="text-gray-600 font-light">
            No credit card required for the first 2 months
          </p>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-gray-100 py-12">
      <div class="max-w-6xl mx-auto px-6">
        <div class="text-center space-x-8 mb-6">
          <a
            href="/privacy-policy"
            class="text-gray-600 hover:text-gray-900 font-light transition-colors duration-300"
          >
            Privacy Policy
          </a>
          <a
            href="/terms-of-service"
            class="text-gray-600 hover:text-gray-900 font-light transition-colors duration-300"
          >
            Terms of Service
          </a>
        </div>
        <div class="text-center">
          <a
            href="mailto:hello@callsafe.tech"
            class="text-gray-600 hover:text-gray-900 font-light transition-colors duration-300"
          >
            hello@callsafe.tech
          </a>
        </div>
      </div>
    </footer>
  </div>
  
  <!-- Login/Signup Modal -->
  {#if showLoginModal}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" on:click={closeLoginModal}>
      <div class="bg-white rounded-lg shadow-2xl w-full max-w-md p-8" on:click|stopPropagation>
        <div class="text-center mb-8">
          <h2 class="text-2xl font-light text-gray-900 mb-2">
            {isSignUpMode ? 'Create Account' : 'Login'}
          </h2>
          <p class="text-gray-600 font-light">
            {isSignUpMode ? 'Join premium service providers using CallSafe' : 'Access your CallSafe account'}
          </p>
          {#if isSignUpMode}
            <div class="mt-4 p-3 bg-green-50 border border-green-200 rounded">
              <p class="text-sm text-green-800 font-medium">
                No credit card required for the first 2 months
              </p>
            </div>
          {/if}
        </div>
        
        <form on:submit|preventDefault={handleSubmit}>
          {#if isSignUpMode}
            <div class="mb-6">
              <label for="fullName" class="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
              <input
                type="text"
                id="fullName"
                bind:value={fullName}
                on:keydown={handleKeydown}
                class="w-full px-4 py-3 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="Enter your full name"
                required
              />
            </div>
          {/if}
          
          <div class="mb-6">
            <label for="email" class="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
            <input
              type="email"
              id="email"
              bind:value={email}
              on:keydown={handleKeydown}
              class="w-full px-4 py-3 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="Enter your email"
              required
            />
          </div>
          
          <div class="mb-6">
            <label for="password" class="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              id="password"
              bind:value={password}
              on:keydown={handleKeydown}
              class="w-full px-4 py-3 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder={isSignUpMode ? 'Create a password (min 6 characters)' : 'Enter your password'}
              required
            />
          </div>
          
          {#if isSignUpMode}
            <div class="mb-6">
              <label for="confirmPassword" class="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                bind:value={confirmPassword}
                on:keydown={handleKeydown}
                class="w-full px-4 py-3 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="Confirm your password"
                required
              />
            </div>
          {/if}
          
          {#if loginError}
            <div class="mb-6 p-3 bg-red-50 border border-red-200 rounded">
              <p class="text-sm text-red-700">{loginError}</p>
            </div>
          {/if}
          
          <div class="flex gap-3 mb-6">
            <button
              type="button"
              on:click={closeLoginModal}
              class="flex-1 px-6 py-3 border border-gray-200 text-gray-700 rounded font-medium hover:bg-gray-50 transition-colors duration-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              class="flex-1 px-6 py-3 bg-gray-900 text-white rounded font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-300"
            >
              {#if isLoading}
                <div class="flex items-center justify-center">
                  <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {isSignUpMode ? 'Creating Account...' : 'Signing In...'}
                </div>
              {:else}
                {isSignUpMode ? 'Create Account' : 'Sign In'}
              {/if}
            </button>
          </div>
          
          <div class="text-center">
            <p class="text-sm text-gray-600 font-light">
              {isSignUpMode ? 'Already have an account?' : "Don't have an account?"}
              <button
                type="button"
                on:click={toggleMode}
                class="text-gray-900 hover:text-gray-700 font-medium ml-1"
              >
                {isSignUpMode ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  {/if}