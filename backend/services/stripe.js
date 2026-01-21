const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const Database = require('../database');

class StripeService {
  constructor() {
    this.db = new Database();
    this.enabled = !!stripe;
    
    if (!this.enabled) {
      console.warn('WARNING: STRIPE_SECRET_KEY not set. Stripe features disabled.');
    }
    
    // Pricing tiers - update these with your actual Stripe price IDs
    this.priceTiers = {
      pro: {
        priceId: process.env.STRIPE_PRICE_PRO || 'price_pro_monthly', // $4.99/month
        name: 'Pro',
        usageLimit: 1000,
        features: ['1000 analyses/month', 'Priority processing', 'Email support']
      },
      business: {
        priceId: process.env.STRIPE_PRICE_BUSINESS || 'price_business_monthly', // $19.99/month
        name: 'Business', 
        usageLimit: -1, // Unlimited
        features: ['Unlimited analyses', 'Team features', 'Priority support', 'Custom integrations']
      }
    };
  }

  async createSubscription(email, priceId) {
    try {
      // Create or retrieve customer
      let customer = await this.findOrCreateCustomer(email);
      
      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customer.id,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/pricing`,
        metadata: {
          email: email
        }
      });

      return session;
    } catch (error) {
      console.error('Stripe subscription creation failed:', error);
      throw new Error('Failed to create subscription');
    }
  }

  async createPortalSession(customerId) {
    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.FRONTEND_URL}/account`,
      });

      return portalSession;
    } catch (error) {
      console.error('Stripe portal creation failed:', error);
      throw new Error('Failed to create billing portal');
    }
  }

  async findOrCreateCustomer(email) {
    // Check if customer already exists
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      return existingCustomers.data[0];
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email: email,
      metadata: {
        source: 'tabsai-extension'
      }
    });

    return customer;
  }

  constructEvent(body, signature) {
    return stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  }

  async handleSubscriptionUpdate(subscription) {
    try {
      const customer = await stripe.customers.retrieve(subscription.customer);
      const user = await this.db.getUserByEmail(customer.email);
      
      if (!user) {
        console.error('User not found for subscription update:', customer.email);
        return;
      }

      // Determine plan from price ID
      let plan = 'free';
      let usageLimit = 25;
      
      const priceId = subscription.items.data[0].price.id;
      
      if (priceId === this.priceTiers.pro.priceId) {
        plan = 'pro';
        usageLimit = this.priceTiers.pro.usageLimit;
      } else if (priceId === this.priceTiers.business.priceId) {
        plan = 'business';
        usageLimit = this.priceTiers.business.usageLimit;
      }

      // Update user in database
      await this.db.updateUser(user.id, {
        plan: plan,
        usageLimit: usageLimit,
        subscriptionStatus: subscription.status,
        subscriptionEndDate: new Date(subscription.current_period_end * 1000),
        stripeCustomerId: customer.id
      });

      console.log(`Updated subscription for ${customer.email}: ${plan}`);
    } catch (error) {
      console.error('Failed to handle subscription update:', error);
    }
  }

  async handleSubscriptionCanceled(subscription) {
    try {
      const customer = await stripe.customers.retrieve(subscription.customer);
      const user = await this.db.getUserByEmail(customer.email);
      
      if (!user) {
        console.error('User not found for subscription cancellation:', customer.email);
        return;
      }

      // Downgrade to free plan
      await this.db.updateUser(user.id, {
        plan: 'free',
        usageLimit: 25,
        subscriptionStatus: 'canceled',
        subscriptionEndDate: new Date(subscription.current_period_end * 1000)
      });

      console.log(`Canceled subscription for ${customer.email}`);
    } catch (error) {
      console.error('Failed to handle subscription cancellation:', error);
    }
  }

  // Get pricing information for frontend
  getPricingTiers() {
    return {
      free: {
        name: 'Free',
        price: 0,
        usageLimit: 25,
        features: ['25 analyses/month', 'Basic clustering', 'Standard support']
      },
      ...this.priceTiers
    };
  }

  // Validate price ID
  isValidPriceId(priceId) {
    return Object.values(this.priceTiers).some(tier => tier.priceId === priceId);
  }

  // Get usage analytics for business intelligence
  async getRevenueAnalytics(days = 30) {
    try {
      const charges = await stripe.charges.list({
        limit: 100,
        created: {
          gte: Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000)
        }
      });

      const revenue = charges.data.reduce((total, charge) => {
        return total + (charge.paid ? charge.amount : 0);
      }, 0);

      const subscriptions = await stripe.subscriptions.list({
        limit: 100,
        status: 'active'
      });

      return {
        totalRevenue: revenue / 100, // Convert from cents
        activeSubscriptions: subscriptions.data.length,
        charges: charges.data.length
      };
    } catch (error) {
      console.error('Failed to get revenue analytics:', error);
      return null;
    }
  }
}

module.exports = StripeService;