<script>
  import { onMount } from 'svelte';
  
  let selectedPlan = 'basic';
  
  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      period: 'forever',
      calls: '3 calls',
      minutes: '30 minutes',
      limit: 'whichever is reached first',
      features: [
        '3 calls per month',
        '30 minutes total',
        'Basic support',
        'HD call quality'
      ],
      buttonText: 'Get Started',
      popular: false
    },
    {
      id: 'basic',
      name: 'Basic',
      price: '$4',
      period: 'per month',
      calls: '30 calls',
      minutes: '300 minutes',
      limit: 'whichever is reached first',
      features: [
        '30 calls per month',
        '300 minutes total',
        'Priority support',
        'HD call quality'
      ],
      buttonText: 'Choose Basic',
      popular: true
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$8',
      period: 'per month',
      calls: '80 calls',
      minutes: '800 minutes',
      limit: 'whichever is reached first',
      features: [
        '80 calls per month',
        '800 minutes total',
        'Priority support',
        'HD call quality'
      ],
      buttonText: 'Choose Pro',
      popular: false
    }
  ];
</script>

<svelte:head>
  <title>Pricing - CallSafe</title>
  <meta name="description" content="Choose the perfect plan for your calling needs. Free tier available with paid plans starting at $4/month.">
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

<div class="pricing-container">
  <div class="pricing-header">
    <h1>Simple, Transparent Pricing</h1>
    <p>Choose the plan that fits your calling needs. No hidden fees, cancel anytime.</p>
  </div>

  <div class="pricing-grid">
    {#each plans as plan}
      <div class="pricing-card" class:popular={plan.popular}>
        {#if plan.popular}
          <div class="popular-badge">Most Popular</div>
        {/if}
        
        <div class="plan-header">
          <h3>{plan.name}</h3>
          <div class="price">
            <span class="amount">{plan.price}</span>
            <span class="period">{plan.period}</span>
          </div>
        </div>

        <div class="plan-limits">
          <div class="limit-item">
            <strong>{plan.calls}</strong> or <strong>{plan.minutes}</strong>
          </div>
          <div class="limit-note">{plan.limit}</div>
        </div>

        <ul class="features">
          {#each plan.features as feature}
            <li>
              <svg class="check-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              {feature}
            </li>
          {/each}
        </ul>

        <button 
          class="cta-button" 
          class:primary={plan.popular}
          on:click={() => selectedPlan = plan.id}
        >
          {plan.buttonText}
        </button>
      </div>
    {/each}
  </div>

  <div class="faq-section">
    <h2>Frequently Asked Questions</h2>
    <div class="faq-grid">
      <div class="faq-item">
        <h4>How are calls and minutes calculated?</h4>
        <p>Your plan limit is reached when you hit either the call count or total minutes - whichever comes first. For example, on the Basic plan, you get 30 calls OR 300 minutes total.</p>
      </div>
      <div class="faq-item">
        <h4>Can I upgrade or downgrade anytime?</h4>
        <p>Yes! You can change your plan at any time. Upgrades take effect immediately, while downgrades take effect at the next billing cycle.</p>
      </div>
      <div class="faq-item">
        <h4>What happens if I exceed my plan limits?</h4>
        <p>Once you reach your plan's limit, you'll need to upgrade to continue making calls or wait until your next billing cycle.</p>
      </div>
    </div>
  </div>
</div>

<!-- Footer -->
<footer class="bg-gray-50 border-t border-gray-200 py-8">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center space-x-6">
      <a 
        href="/privacy-policy" 
        class="text-gray-600 hover:text-blue-600 font-medium transition-colors duration-200"
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
  .pricing-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  .pricing-header {
    text-align: center;
    margin-bottom: 3rem;
  }

  .pricing-header h1 {
    font-size: 2.5rem;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 1rem;
  }

  .pricing-header p {
    font-size: 1.125rem;
    color: #6b7280;
    max-width: 600px;
    margin: 0 auto;
  }

  .pricing-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
    margin-bottom: 4rem;
  }

  .pricing-card {
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 1rem;
    padding: 2rem;
    position: relative;
    transition: all 0.3s ease;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  .pricing-card:hover {
    border-color: #3b82f6;
    transform: translateY(-4px);
    box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.1);
  }

  .pricing-card.popular {
    border-color: #3b82f6;
    background: linear-gradient(135deg, #f8faff 0%, #ffffff 100%);
  }

  .popular-badge {
    position: absolute;
    top: -12px;
    left: 50%;
    transform: translateX(-50%);
    background: #3b82f6;
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 2rem;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .plan-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .plan-header h3 {
    font-size: 1.5rem;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 1rem;
  }

  .price {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.5rem;
  }

  .amount {
    font-size: 3rem;
    font-weight: 700;
    color: #1a1a1a;
  }

  .period {
    font-size: 1rem;
    color: #6b7280;
  }

  .plan-limits {
    background: #f3f4f6;
    padding: 1rem;
    border-radius: 0.5rem;
    text-align: center;
    margin-bottom: 2rem;
  }

  .limit-item {
    font-size: 1.125rem;
    color: #1a1a1a;
    margin-bottom: 0.25rem;
  }

  .limit-note {
    font-size: 0.875rem;
    color: #6b7280;
  }

  .features {
    list-style: none;
    padding: 0;
    margin: 0 0 2rem 0;
  }

  .features li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    color: #4b5563;
  }

  .check-icon {
    width: 1.25rem;
    height: 1.25rem;
    color: #10b981;
    flex-shrink: 0;
  }

  .cta-button {
    width: 100%;
    padding: 0.875rem 1.5rem;
    border: 2px solid #3b82f6;
    border-radius: 0.5rem;
    background: white;
    color: #3b82f6;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .cta-button:hover {
    background: #3b82f6;
    color: white;
  }

  .cta-button.primary {
    background: #3b82f6;
    color: white;
  }

  .cta-button.primary:hover {
    background: #2563eb;
  }

  .faq-section {
    margin-top: 4rem;
  }

  .faq-section h2 {
    text-align: center;
    font-size: 2rem;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 2rem;
  }

  .faq-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 2rem;
  }

  .faq-item {
    background: #f9fafb;
    padding: 1.5rem;
    border-radius: 0.75rem;
  }

  .faq-item h4 {
    font-size: 1.125rem;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 0.75rem;
  }

  .faq-item p {
    color: #4b5563;
    line-height: 1.6;
  }

  @media (max-width: 768px) {
    .pricing-header h1 {
      font-size: 2rem;
    }
    
    .pricing-grid {
      grid-template-columns: 1fr;
    }
    
    .faq-grid {
      grid-template-columns: 1fr;
    }
  }
</style>