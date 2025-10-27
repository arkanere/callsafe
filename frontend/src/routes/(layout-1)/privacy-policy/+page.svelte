<script>
  import { onMount } from 'svelte';
</script>

<svelte:head>
  <title>Privacy Policy - CallSafe</title>
  <meta name="description" content="CallSafe Privacy Policy - Learn how we protect your privacy with anonymous calling technology.">
</svelte:head>

<!-- Navigation Bar -->
<nav class="bg-white shadow-sm border-b border-gray-200">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between items-center py-4">
      <!-- Left side - Logo/Brand -->
      <div class="flex items-center">
        <a href="/" class="text-2xl font-bold text-gray-900 hover:text-blue-600 transition-colors duration-200">CallSafe</a>
      </div>
      
      <!-- Right side - Navigation Links -->
      <div class="flex items-center">
        <a
          href="/"
          class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors duration-200"
        >
          Login
        </a>
      </div>
    </div>
  </div>
</nav>

<div class="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
  <div class="bg-white">
    <header class="text-center mb-12">
      <h1 class="text-4xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
    </header>

    <div class="prose prose-lg max-w-none">
      <section class="mb-8">
        <h2 class="text-2xl font-semibold text-gray-900 mb-4">Our Privacy-First Commitment</h2>
        <p class="text-gray-700 mb-4">
          CallSafe is built on the principle of complete customer anonymity. Our entire platform is designed to enable 
          customers to contact businesses without sharing any personal information, including phone numbers. This privacy 
          policy explains how we achieve this goal and what minimal data we collect to operate our service.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="text-2xl font-semibold text-gray-900 mb-4">What Makes CallSafe Different</h2>
        <p class="text-gray-700 mb-4">
          Unlike traditional calling services, CallSafe is specifically designed for anonymous communication:
        </p>
        <ul class="list-disc pl-6 text-gray-700 mb-4">
          <li>No phone numbers are exchanged or stored</li>
          <li>Customers remain completely anonymous unless they choose otherwise</li>
          <li>No registration required for customers to make calls</li>
          <li>No tracking or profiling of individual customers</li>
          <li>Calls cannot be linked to specific individuals</li>
        </ul>
      </section>

      <section class="mb-8">
        <h2 class="text-2xl font-semibold text-gray-900 mb-4">Information We Collect</h2>
        
        <h3 class="text-xl font-semibold text-gray-800 mb-3">For Business Users (Account Required)</h3>
        <p class="text-gray-700 mb-2">When businesses sign up for CallSafe, we collect:</p>
        <ul class="list-disc pl-6 text-gray-700 mb-4">
          <li><strong>Account Information:</strong> Email address, name, and password</li>
          <li><strong>Business Details:</strong> Company name, website URL (optional)</li>
          <li><strong>Payment Information:</strong> Billing details processed securely through our payment providers</li>
          <li><strong>Usage Analytics:</strong> Call volumes, connection success rates, and service usage metrics</li>
        </ul>

        <h3 class="text-xl font-semibold text-gray-800 mb-3">For Customers (No Account Required)</h3>
        <p class="text-gray-700 mb-2">We collect the absolute minimum to provide calling services:</p>
        <ul class="list-disc pl-6 text-gray-700 mb-4">
          <li><strong>Technical Data Only:</strong> Browser type, connection quality metrics</li>
          <li><strong>Call Metadata:</strong> Call duration, connection success/failure (not linked to individuals)</li>
          <li><strong>Source Tracking:</strong> Which website page the call was initiated from (for business analytics)</li>
          <li><strong>No Personal Data:</strong> No phone numbers, names, email addresses, or identifying information</li>
        </ul>
      </section>

      <section class="mb-8">
        <h2 class="text-2xl font-semibold text-gray-900 mb-4">How We Use Information</h2>
        
        <h3 class="text-xl font-semibold text-gray-800 mb-3">Business Information</h3>
        <ul class="list-disc pl-6 text-gray-700 mb-4">
          <li>Account management and authentication</li>
          <li>Service delivery and technical support</li>
          <li>Billing and payment processing</li>
          <li>Service improvements and feature development</li>
          <li>Legal compliance and fraud prevention</li>
        </ul>

        <h3 class="text-xl font-semibold text-gray-800 mb-3">Technical Data</h3>
        <ul class="list-disc pl-6 text-gray-700 mb-4">
          <li>Maintaining call quality and connection reliability</li>
          <li>Aggregate analytics for service improvement</li>
          <li>Technical troubleshooting and system optimization</li>
          <li>Security monitoring and threat detection</li>
        </ul>
      </section>

      <section class="mb-8">
        <h2 class="text-2xl font-semibent text-gray-900 mb-4">Data Sharing and Disclosure</h2>
        <p class="text-gray-700 mb-4">
          We do not sell, trade, or otherwise transfer personal information to outside parties, except:
        </p>
        <ul class="list-disc pl-6 text-gray-700 mb-4">
          <li><strong>Service Providers:</strong> Trusted third parties who assist in operating our service (hosting, payment processing)</li>
          <li><strong>Legal Requirements:</strong> When required by law or to protect our rights and safety</li>
          <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or asset sale</li>
        </ul>
        <p class="text-gray-700 mb-4">
          <strong>Important:</strong> Customer call data is never shared with businesses beyond the call itself. 
          Businesses cannot access customer identity, contact information, or personal data through our platform.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="text-2xl font-semibold text-gray-900 mb-4">Data Retention</h2>
        <ul class="list-disc pl-6 text-gray-700 mb-4">
          <li><strong>Business Account Data:</strong> Retained while account is active and for legal/tax purposes after closure</li>
          <li><strong>Call Metadata:</strong> Aggregated, non-identifying call statistics retained for service improvement</li>
          <li><strong>Technical Logs:</strong> Retained for 90 days for troubleshooting and security purposes</li>
          <li><strong>Customer Data:</strong> No persistent customer data is retained after call completion</li>
        </ul>
      </section>

      <section class="mb-8">
        <h2 class="text-2xl font-semibold text-gray-900 mb-4">Security Measures</h2>
        <p class="text-gray-700 mb-4">
          We implement industry-standard security measures:
        </p>
        <ul class="list-disc pl-6 text-gray-700 mb-4">
          <li>End-to-end encryption for all voice communications</li>
          <li>Secure WebRTC protocols for call transmission</li>
          <li>Regular security audits and vulnerability assessments</li>
          <li>Access controls and authentication for business accounts</li>
          <li>Secure hosting infrastructure with data encryption at rest and in transit</li>
        </ul>
      </section>

      <section class="mb-8">
        <h2 class="text-2xl font-semibold text-gray-900 mb-4">Your Privacy Rights</h2>
        
        <h3 class="text-xl font-semibold text-gray-800 mb-3">For Customers</h3>
        <p class="text-gray-700 mb-4">
          Since we don't collect personal information from customers, there's no personal data to access, correct, or delete. 
          Your privacy is protected by design.
        </p>

        <h3 class="text-xl font-semibold text-gray-800 mb-3">For Business Users</h3>
        <ul class="list-disc pl-6 text-gray-700 mb-4">
          <li><strong>Access:</strong> Request access to your account information</li>
          <li><strong>Correction:</strong> Update or correct your account details</li>
          <li><strong>Deletion:</strong> Request deletion of your account and associated data</li>
          <li><strong>Portability:</strong> Request export of your account data</li>
          <li><strong>Objection:</strong> Object to certain data processing activities</li>
        </ul>
      </section>

      <section class="mb-8">
        <h2 class="text-2xl font-semibold text-gray-900 mb-4">Cookies and Tracking</h2>
        <p class="text-gray-700 mb-4">
          We use minimal cookies and tracking:
        </p>
        <ul class="list-disc pl-6 text-gray-700 mb-4">
          <li><strong>Essential Cookies:</strong> Required for basic service functionality</li>
          <li><strong>Authentication Cookies:</strong> For business user login sessions</li>
          <li><strong>No Tracking Cookies:</strong> We don't use advertising or tracking cookies for customers</li>
          <li><strong>Analytics:</strong> Aggregate, non-identifying usage statistics only</li>
        </ul>
      </section>

      <section class="mb-8">
        <h2 class="text-2xl font-semibold text-gray-900 mb-4">Changes to This Policy</h2>
        <p class="text-gray-700 mb-4">
          We may update this privacy policy periodically. When we make changes, we will:
        </p>
        <ul class="list-disc pl-6 text-gray-700 mb-4">
          <li>Update the "Last updated" date at the top of this policy</li>
          <li>Notify business users of material changes via email</li>
          <li>Post prominent notices on our website for significant changes</li>
        </ul>
      </section>

      

      <section class="mb-8">
        <div class="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <h3 class="text-xl font-semibold text-blue-900 mb-3">Privacy by Design Promise</h3>
          <p class="text-blue-800">
            CallSafe was built from the ground up with privacy as our core principle. Unlike other services that 
            collect data and promise to protect it, we simply don't collect customer data in the first place. 
            True privacy protection means there's nothing to protect because there's nothing to collect.
          </p>
        </div>
      </section>
    </div>
  </div>
</div>

<!-- Footer -->
<footer class="bg-gray-50 border-t border-gray-200 py-8">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center space-x-6">
      <a 
        href="/privacy-policy" 
        class="text-blue-600 font-semibold"
      >
        Privacy Policy
      </a>
      <a 
        href="/terms-of-service" 
        class="text-gray-600 hover:text-blue-600 font-medium transition-colors duration-200"
      >
        Terms of Service
      </a>
    </div>
  </div>
</footer>

<style>
  .prose {
    line-height: 1.75;
  }
  
  .prose h2 {
    margin-top: 2rem;
    margin-bottom: 1rem;
  }
  
  .prose h3 {
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
  }
  
  .prose p {
    margin-bottom: 1rem;
  }
  
  .prose ul {
    margin-bottom: 1rem;
  }
  
  .prose li {
    margin-bottom: 0.5rem;
  }
</style>