module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Check multiple possible env var names in case of different naming conventions
  const stripePublishableKey =
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    process.env.VITE_STRIPE_PUBLISHABLE_KEY ||
    null;
  res.json({ stripePublishableKey });
};
