<script>
  import { onMount } from 'svelte';
  
  let selectedPlan = 'premium';
  
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
</script>

<svelte:head>
  <title>Pricing - CallSafe</title>
  <meta name="description" content="Privacy-focused browser-based calling solutions for businesses. Professional plans starting at $19/month.">
</svelte:head>

<!-- Navigation Bar -->
<nav class="border-b border-gray-100">
  <div class="max-w-6xl mx-auto px-6 py-6">
    <div class="flex justify-between items-center">
      <a href="/" class="text-2xl font-light text-gray-900 tracking-wide hover:text-gray-600 transition-colors duration-300">CallSafe</a>
      <a
        href="/"
        class="text-gray-900 hover:text-gray-600 font-medium tracking-wide transition-colors duration-300"
      >
        Login
      </a>
    </div>
  </div>
</nav>

<div class="min-h-screen bg-white">
  <div class="pricing-container">
    <div class="pricing-header">
      <h1>Privacy-Focused Calling Solutions</h1>
      <p>Browser-based anonymous calling that removes phone number barriers and boosts user engagement.</p>
      <div class="no-card-notice">
        <svg class="info-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
        </svg>
        No credit card required for the first 2 months
      </div>
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
              {#if plan.originalPrice}
                <div class="original-price">
                  <span class="struck-through">{plan.originalPrice}</span>
                </div>
              {/if}
              <span class="amount">{plan.price}</span>
              <span class="period">{plan.period}</span>
            </div>
          </div>

          <div class="plan-limits">
            <div class="limit-item">
              <strong>{plan.calls}</strong>
            </div>
            <div class="limit-note">Browser-based calling</div>
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
          <h4>How do anonymous calls work?</h4>
          <p>Clients click a button on your website and connect instantly through their browser. No phone numbers are exchanged, no personal information is collected. Calls are received through your web dashboard.</p>
        </div>
        <div class="faq-item">
          <h4>What if I exceed my call limit?</h4>
          <p>You can upgrade to a higher tier immediately to continue receiving calls, or contact us for custom Enterprise pricing if you need unlimited calls.</p>
        </div>
        <div class="faq-item">
          <h4>Is there a mobile app?</h4>
          <p>Currently all calls are received through your web dashboard, accessible from any device. This ensures maximum compatibility and reliability.</p>
        </div>
        <div class="faq-item">
          <h4>Can I cancel anytime?</h4>
          <p>Yes, you can cancel or change plans at any time.</p>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Footer -->
<footer class="border-t border-gray-100 py-12">
  <div class="max-w-6xl mx-auto px-6">
    <div class="text-center space-x-8">
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
  </div>
</footer>

<style>
  .pricing-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 4rem 2rem;
  }

  .pricing-header {
    text-align: center;
    margin-bottom: 4rem;
  }

  .pricing-header h1 {
    font-size: 3rem;
    font-weight: 300;
    color: #1a1a1a;
    margin-bottom: 1.5rem;
    letter-spacing: -0.025em;
  }

  .pricing-header p {
    font-size: 1.25rem;
    color: #6b7280;
    font-weight: 300;
    max-width: 700px;
    margin: 0 auto;
    line-height: 1.6;
  }

  .no-card-notice {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1.5rem;
    padding: 0.75rem 1.5rem;
    background: #f0fdf4;
    border: 1px solid #86efac;
    border-radius: 0.5rem;
    color: #166534;
    font-size: 1rem;
    font-weight: 500;
  }

  .info-icon {
    width: 1.25rem;
    height: 1.25rem;
    flex-shrink: 0;
  }

  .pricing-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 2rem;
    margin-bottom: 5rem;
  }

  .pricing-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 3rem 2rem;
    position: relative;
    transition: all 0.3s ease;
  }

  .pricing-card:hover {
    border-color: #9ca3af;
    box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.1);
  }

  .pricing-card.popular {
    border-color: #374151;
    transform: scale(1.05);
  }

  .popular-badge {
    position: absolute;
    top: -12px;
    left: 50%;
    transform: translateX(-50%);
    background: #374151;
    color: white;
    padding: 0.5rem 1.5rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    letter-spacing: 0.025em;
  }

  .plan-header {
    text-align: center;
    margin-bottom: 2.5rem;
  }

  .plan-header h3 {
    font-size: 1.5rem;
    font-weight: 500;
    color: #1a1a1a;
    margin-bottom: 1.5rem;
    letter-spacing: 0.025em;
  }

  .price {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.5rem;
  }

  .amount {
    font-size: 3.5rem;
    font-weight: 300;
    color: #1a1a1a;
    letter-spacing: -0.025em;
  }

  .period {
    font-size: 1rem;
    color: #6b7280;
    font-weight: 300;
  }

  .original-price {
    text-align: center;
    margin-bottom: 0.5rem;
  }

  .struck-through {
    font-size: 1.5rem;
    color: #9ca3af;
    text-decoration: line-through;
    font-weight: 300;
  }

  .plan-limits {
    background: #f9fafb;
    padding: 1.5rem;
    border-radius: 0.375rem;
    text-align: center;
    margin-bottom: 2.5rem;
  }

  .limit-item {
    font-size: 1.125rem;
    color: #1a1a1a;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }

  .limit-note {
    font-size: 0.875rem;
    color: #6b7280;
    font-weight: 300;
  }

  .features {
    list-style: none;
    padding: 0;
    margin: 0 0 3rem 0;
  }

  .features li {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 0.75rem 0;
    color: #4b5563;
    font-weight: 300;
    line-height: 1.5;
  }

  .check-icon {
    width: 1.25rem;
    height: 1.25rem;
    color: #374151;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .cta-button {
    width: 100%;
    padding: 1rem 2rem;
    border: 1px solid #374151;
    border-radius: 0.25rem;
    background: white;
    color: #374151;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
    letter-spacing: 0.025em;
  }

  .cta-button:hover {
    background: #374151;
    color: white;
  }

  .cta-button.primary {
    background: #374151;
    color: white;
  }

  .cta-button.primary:hover {
    background: #111827;
  }


  .faq-section {
    margin-top: 5rem;
  }

  .faq-section h2 {
    text-align: center;
    font-size: 2.5rem;
    font-weight: 300;
    color: #1a1a1a;
    margin-bottom: 3rem;
    letter-spacing: -0.025em;
  }

  .faq-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 2rem;
  }

  .faq-item {
    background: #f9fafb;
    padding: 2rem;
    border-radius: 0.375rem;
  }

  .faq-item h4 {
    font-size: 1.125rem;
    font-weight: 500;
    color: #1a1a1a;
    margin-bottom: 1rem;
  }

  .faq-item p {
    color: #4b5563;
    line-height: 1.6;
    font-weight: 300;
  }

  @media (max-width: 768px) {
    .pricing-container {
      padding: 2rem 1rem;
    }
    
    .pricing-header h1 {
      font-size: 2rem;
    }
    
    .pricing-grid {
      grid-template-columns: 1fr;
    }
    
    .pricing-card.popular {
      transform: none;
    }
    
    .faq-grid {
      grid-template-columns: 1fr;
    }
  }
</style>