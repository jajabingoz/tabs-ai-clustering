# 💳 Stripe Setup Guide for TabsAI

## Quick Stripe Setup (5 minutes)

### 1. Create Stripe Account
- Go to [stripe.com](https://stripe.com) and sign up
- Complete business verification
- Switch to **TEST MODE** for initial testing

### 2. Create Products & Prices

#### **Pro Plan - $4.99/month**
1. Dashboard → Products → Add Product
2. Name: "TabsAI Pro"
3. Description: "1000 tab analyses per month with priority processing"
4. Pricing: $4.99 USD, Monthly recurring
5. **Copy the Price ID** (starts with `price_`)

#### **Business Plan - $19.99/month** 
1. Dashboard → Products → Add Product
2. Name: "TabsAI Business" 
3. Description: "Unlimited tab analyses with team features"
4. Pricing: $19.99 USD, Monthly recurring
5. **Copy the Price ID** (starts with `price_`)

### 3. Get API Keys
1. Dashboard → Developers → API Keys
2. Copy **Publishable Key** (starts with `pk_test_`)
3. Copy **Secret Key** (starts with `sk_test_`)

### 4. Set up Webhook
1. Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-deployed-api.com/webhooks/stripe`
3. Select events: 
   - `customer.subscription.created`
   - `customer.subscription.updated` 
   - `customer.subscription.deleted`
4. **Copy Webhook Secret** (starts with `whsec_`)

### 5. Update Environment Variables

Add to your deployed backend:
```env
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PRICE_PRO=price_your_pro_price_id
STRIPE_PRICE_BUSINESS=price_your_business_price_id
```

### 6. Test Payment Flow
1. Use test card: `4242 4242 4242 4242`
2. Any future expiry date
3. Any 3-digit CVC

## 🎯 Revenue Optimization Tips

### **Pricing Psychology**
- **$4.99** feels much cheaper than $5.00
- **Free → $4.99 → $19.99** creates clear upgrade path
- **Annual billing**: Offer 20% discount for yearly plans

### **Conversion Boosters**
- 7-day free trial on paid plans
- Show usage progress bars
- "Upgrade to continue" prompts when limits reached
- Social proof: "Join 1,000+ productive users"

### **Stripe Best Practices**
- Use **Stripe Billing** for subscription management
- Enable **Smart Retries** for failed payments
- Set up **Dunning management** for involuntary churn
- Add **proration** for mid-cycle upgrades

## 🚀 Going Live Checklist

### Before Production:
- [ ] Test all payment flows
- [ ] Verify webhook handling
- [ ] Test subscription cancellation
- [ ] Test plan upgrades/downgrades

### Switch to Live Mode:
1. Complete Stripe account verification
2. Switch to **LIVE MODE** in dashboard
3. Update environment with live keys (`sk_live_`, `pk_live_`)
4. Test with real (small) payments

Your Stripe setup will handle:
✅ Subscription creation & billing
✅ Automatic plan upgrades
✅ Failed payment handling
✅ Customer self-service portal
✅ Tax calculation (if needed)
✅ Compliance & security