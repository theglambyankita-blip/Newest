module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null
  });
};
