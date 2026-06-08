module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const stripePublishableKey =
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    process.env.VITE_STRIPE_PUBLISHABLE_KEY ||
    null;

  // Diagnostic endpoint — shows env var names that exist without leaking values
  if (req.query.debug === '1') {
    const stripeVars = Object.keys(process.env)
      .filter(k => k.toUpperCase().includes('STRIPE'))
      .map(k => {
        const v = process.env[k] || '';
        return `${k}=${v ? v.substring(0, 10) + '...' : '(empty)'}`;
      });
    return res.json({
      stripePublishableKey,
      found: stripeVars,
      tip: stripeVars.length === 0
        ? 'No STRIPE_* vars found at all — add STRIPE_PUBLISHABLE_KEY (pk_live_...) in Vercel project settings'
        : 'Vars found — check the exact name matches STRIPE_PUBLISHABLE_KEY'
    });
  }

  res.json({ stripePublishableKey });
};
