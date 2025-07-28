<script lang="ts">
    import { goto } from '$app/navigation';
    
    let showLoginModal = false;
    let isSignUpMode = false;
    let email = '';
    let password = '';
    let confirmPassword = '';
    let fullName = '';
    let loginError = '';
    let isLoading = false;
    
    // User session storage (in real app, this would be handled by session management)
    let currentUser = null;
    
    function openLoginModal() {
      showLoginModal = true;
      resetForm();
    }
    
    function closeLoginModal() {
      showLoginModal = false;
      resetForm();
    }
    
    function resetForm() {
      isSignUpMode = false;
      loginError = '';
      email = '';
      password = '';
      confirmPassword = '';
      fullName = '';
      isLoading = false;
    }
    
    function toggleMode() {
      isSignUpMode = !isSignUpMode;
      loginError = '';
      password = '';
      confirmPassword = '';
      if (!isSignUpMode) {
        fullName = '';
      }
    }
    
    function validateEmail(email: string): boolean {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }
    
    function validatePassword(password: string): boolean {
      return password.length >= 6;
    }
    
    async function handleSignUp() {
      // Validation
      if (!fullName.trim()) {
        loginError = 'Please enter your full name';
        return;
      }
      
      if (!validateEmail(email)) {
        loginError = 'Please enter a valid email address';
        return;
      }
      
      if (!validatePassword(password)) {
        loginError = 'Password must be at least 6 characters long';
        return;
      }
      
      if (password !== confirmPassword) {
        loginError = 'Passwords do not match';
        return;
      }
      
      isLoading = true;
      loginError = '';
      
      try {
        const response = await fetch('/api/signup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email.trim(),
            password,
            name: fullName.trim()
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          // Store user session
          currentUser = result.user;
          
          // Store userId in localStorage for session management
          localStorage.setItem('callsafe_userId', result.user.id.toString());
          localStorage.setItem('callsafe_user', JSON.stringify(result.user));
          
          // Success - redirect to user page
          closeLoginModal();
          goto('/user');
        } else {
          loginError = result.error || 'Failed to create account';
        }
      } catch (error) {
        console.error('Signup error:', error);
        loginError = 'Failed to create account. Please try again.';
      } finally {
        isLoading = false;
      }
    }
    
    async function handleSignIn() {
      if (!email || !password) {
        loginError = 'Please enter both email and password';
        return;
      }
      
      isLoading = true;
      loginError = '';
      
      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email.trim(),
            password
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          // Store user session
          currentUser = result.user;
          
          // Store userId in localStorage for session management
          localStorage.setItem('callsafe_userId', result.user.id.toString());
          localStorage.setItem('callsafe_user', JSON.stringify(result.user));
          
          // Success - redirect based on embed status
          closeLoginModal();
          
          if (result.user.isEmbedded) {
            // User has already embedded the code, redirect to receive page
            // First get their handle
            const userId = result.user.id;
            try {
              const handleResponse = await fetch(`/api/links?userId=${userId}`);
              const handleData = await handleResponse.json();
              
              if (handleData.success && handleData.handles.length > 0) {
                const handle = handleData.handles[0].handle;
                goto(`/user/receive/${handle}`);
              } else {
                // Fallback to user page if no handle found
                goto('/user');
              }
            } catch (error) {
              console.error('Error fetching handle:', error);
              goto('/user'); // Fallback
            }
          } else {
            // User hasn't embedded yet, show user page with embed instructions
            goto('/user');
          }
        } else {
          loginError = result.error || 'Invalid email or password';
        }
      } catch (error) {
        console.error('Login error:', error);
        loginError = 'Login failed. Please try again.';
      } finally {
        isLoading = false;
      }
    }
    
    async function handleSubmit() {
      if (isSignUpMode) {
        await handleSignUp();
      } else {
        await handleSignIn();
      }
    }
    
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Enter') {
        handleSubmit();
      } else if (event.key === 'Escape') {
        closeLoginModal();
      }
    }
  </script>
  
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <!-- Navigation Bar -->
    <nav class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center py-4">
          <!-- Left side - Logo/Brand -->
          <div class="flex items-center">
            <h1 class="text-2xl font-bold text-gray-900">CallSafe</h1>
          </div>
          
          <!-- Right side - Login Button -->
          <div class="flex items-center">
            <button
              on:click={openLoginModal}
              class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors duration-200"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    </nav>
  
    <!-- Hero Section -->
    <section class="py-20 px-4">
      <div class="max-w-6xl mx-auto text-center">
        <h1 class="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
          Increase Your Lead Conversion by <span class="text-blue-600">47%</span>
        </h1>
        <p class="text-xl md:text-2xl text-gray-600 mb-8 max-w-3xl mx-auto">
          CallSafe eliminates phone number barriers that cost you customers. Let prospects call you anonymously through their browser.
        </p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <a 
            href="/agent" 
            class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-8 rounded-xl text-lg transition-colors duration-200"
          >
            Start Free Trial
          </a>
          <a 
            href="/customer" 
            class="border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold py-4 px-8 rounded-xl text-lg transition-colors duration-200"
          >
            Try Demo Call
          </a>
        </div>
      </div>
    </section>
  
    <!-- Problem Section -->
    <section class="py-16 px-4 bg-white">
      <div class="max-w-6xl mx-auto">
        <div class="text-center mb-12">
          <h2 class="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Are You Losing Customers to Phone Number Requirements?
          </h2>
          <p class="text-lg text-gray-600 max-w-3xl mx-auto">
            Research shows that requiring phone numbers causes massive lead drop-off and privacy concerns
          </p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div class="text-center p-6 bg-red-50 rounded-xl">
            <div class="text-4xl font-bold text-red-600 mb-2">33-47%</div>
            <p class="text-gray-700">Lead drop-off rate when phone numbers are required</p>
          </div>
          <div class="text-center p-6 bg-red-50 rounded-xl">
            <div class="text-4xl font-bold text-red-600 mb-2">$25.4B</div>
            <p class="text-gray-700">Annual losses to spam calls create phone number distrust</p>
          </div>
          <div class="text-center p-6 bg-red-50 rounded-xl">
            <div class="text-4xl font-bold text-red-600 mb-2">67%</div>
            <p class="text-gray-700">Of consumers worry about sharing phone data</p>
          </div>
        </div>
      </div>
    </section>
  
    <!-- Solution Section -->
    <section class="py-16 px-4 bg-gradient-to-r from-blue-50 to-indigo-50">
      <div class="max-w-6xl mx-auto">
        <div class="text-center mb-12">
          <h2 class="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            The CallSafe Solution
          </h2>
          <p class="text-lg text-gray-600 max-w-3xl mx-auto">
            Enable anonymous browser-to-business calling that protects customer privacy while increasing your conversions
          </p>
        </div>
  
        <div class="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h3 class="text-2xl font-bold text-gray-900 mb-6">How It Works</h3>
            <div class="space-y-4">
              <div class="flex items-start gap-4">
                <div class="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">1</div>
                <div>
                  <h4 class="font-semibold text-gray-900">Customer clicks your CallSafe link</h4>
                  <p class="text-gray-600">No phone number required, works on any device</p>
                </div>
              </div>
              <div class="flex items-start gap-4">
                <div class="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">2</div>
                <div>
                  <h4 class="font-semibold text-gray-900">Instant browser-based connection</h4>
                  <p class="text-gray-600">Real-time call routing to your sales team</p>
                </div>
              </div>
              <div class="flex items-start gap-4">
                <div class="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">3</div>
                <div>
                  <h4 class="font-semibold text-gray-900">Convert more leads</h4>
                  <p class="text-gray-600">Complete anonymity increases customer confidence</p>
                </div>
              </div>
            </div>
          </div>
          
          <div class="bg-white rounded-2xl p-8 shadow-lg">
            <h3 class="text-xl font-bold text-gray-900 mb-4">Perfect For:</h3>
            <ul class="space-y-3">
              <li class="flex items-center gap-3">
                <svg class="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
                <span class="text-gray-700">Insurance companies</span>
              </li>
              <li class="flex items-center gap-3">
                <svg class="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
                <span class="text-gray-700">Financial advisors</span>
              </li>
              <li class="flex items-center gap-3">
                <svg class="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
                <span class="text-gray-700">Mental health services</span>
              </li>
              <li class="flex items-center gap-3">
                <svg class="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
                <span class="text-gray-700">Real estate agents</span>
              </li>
              <li class="flex items-center gap-3">
                <svg class="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
                <span class="text-gray-700">Any privacy-sensitive business</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  
    <!-- Benefits Section -->
    <section class="py-16 px-4 bg-white">
      <div class="max-w-6xl mx-auto">
        <div class="text-center mb-12">
          <h2 class="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Why Businesses Choose CallSafe
          </h2>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div class="text-center p-6">
            <div class="w-16 h-16 bg-green-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-2">Increased Conversions</h3>
            <p class="text-gray-600">More customers call when they don't need to share personal numbers</p>
          </div>
          
          <div class="text-center p-6">
            <div class="w-16 h-16 bg-blue-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-2">Enhanced Privacy</h3>
            <p class="text-gray-600">Complete anonymity builds trust with privacy-conscious customers</p>
          </div>
          
          <div class="text-center p-6">
            <div class="w-16 h-16 bg-purple-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg class="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-2">Instant Setup</h3>
            <p class="text-gray-600">No apps or downloads required for customers - works in any browser</p>
          </div>
          
          <div class="text-center p-6">
            <div class="w-16 h-16 bg-orange-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg class="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-2">Compliance Ready</h3>
            <p class="text-gray-600">Meets new TCPA regulations and privacy laws automatically</p>
          </div>
        </div>
      </div>
    </section>
  
    <!-- CTA Section -->
    <section class="py-16 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
      <div class="max-w-4xl mx-auto text-center">
        <h2 class="text-3xl md:text-4xl font-bold mb-4">
          Ready to Stop Losing Customers to Phone Number Barriers?
        </h2>
        <p class="text-xl mb-8 opacity-90">
          Start your free trial today and see the difference anonymous calling makes
        </p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <a 
            href="/agent" 
            class="bg-white text-blue-600 hover:bg-gray-100 font-semibold py-4 px-8 rounded-xl text-lg transition-colors duration-200"
          >
            Start Free Trial
          </a>
          <a 
            href="/customer" 
            class="border-2 border-white text-white hover:bg-white hover:text-blue-600 font-semibold py-4 px-8 rounded-xl text-lg transition-colors duration-200"
          >
            Try Demo Call
          </a>
        </div>
      </div>
    </section>
  </div>
  
  <!-- Enhanced Login/Signup Modal -->
  {#if showLoginModal}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" on:click={closeLoginModal}>
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8" on:click|stopPropagation>
        <div class="text-center mb-6">
          <h2 class="text-2xl font-bold text-gray-900 mb-2">
            {isSignUpMode ? 'Create Your Account' : 'Login to CallSafe'}
          </h2>
          <p class="text-gray-600">
            {isSignUpMode ? 'Join thousands of businesses increasing their conversions' : 'Enter your credentials to access your account'}
          </p>
        </div>
        
        <form on:submit|preventDefault={handleSubmit}>
          {#if isSignUpMode}
            <div class="mb-4">
              <label for="fullName" class="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
              <input
                type="text"
                id="fullName"
                bind:value={fullName}
                on:keydown={handleKeydown}
                class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your full name"
                required
              />
            </div>
          {/if}
          
          <div class="mb-4">
            <label for="email" class="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
            <input
              type="email"
              id="email"
              bind:value={email}
              on:keydown={handleKeydown}
              class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your email"
              required
            />
          </div>
          
          <div class="mb-4">
            <label for="password" class="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              id="password"
              bind:value={password}
              on:keydown={handleKeydown}
              class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Confirm your password"
                required
              />
            </div>
          {:else}
            <div class="mb-6"></div>
          {/if}
          
          {#if loginError}
            <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p class="text-sm text-red-700">{loginError}</p>
            </div>
          {/if}
          
          <div class="flex gap-3 mb-4">
            <button
              type="button"
              on:click={closeLoginModal}
              class="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              class="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
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
            <p class="text-sm text-gray-600">
              {isSignUpMode ? 'Already have an account?' : "Don't have an account?"}
              <button
                type="button"
                on:click={toggleMode}
                class="text-blue-600 hover:text-blue-700 font-semibold ml-1"
              >
                {isSignUpMode ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  {/if}