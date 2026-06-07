module.exports = async function handler(req, res) {
  const { b } = req.query;

  if (!b) {
    return res.status(400).send(errorPage('No booking token found in the link. Please use the exact link from your email.'));
  }

  let d;
  try {
    d = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
  } catch (e) {
    return res.status(400).send(errorPage('This booking link is invalid or corrupted. Please use the exact link from your email.'));
  }

  const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const labels = {
    first_name:'First Name', last_name:'Last Name', client_email:'Email',
    phone:'Phone', contact_method:'Preferred Contact', preferred_date:'Requested Date',
    num_people:'Number of People', services:'Services Requested', location:'Location / Suburb',
    postcode:'Postcode', referral:'How They Found You', vision:'Look / Vision / Inspo'
  };
  const skip = new Set(['owner_email','from_email','_client_email','_client_name','type']);

  const rawRows = Object.entries(d)
    .filter(([k, v]) => !skip.has(k) && v)
    .map(([k, v]) => `<div class="raw-row"><span class="raw-key">${esc(labels[k] || k.replace(/_/g,' '))}</span><span class="raw-val">${esc(v)}</span></div>`)
    .join('');

  const val = (key, ...keys) => {
    for (const k of [key, ...keys]) { if (d[k]) return esc(d[k]); }
    return '';
  };

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Review Booking — The Glam by Ankita</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Nunito:wght@300;400;500;600;700&family=Dancing+Script:wght@600&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --gold: #c9a96e; --gold-light: #e8d5a3; --gold-dark: #9e7c4a;
    --cream: #fdf8f4; --blush: #f7e9d0; --champagne: #fdf0ee;
    --text-dark: #2c1810; --text-mid: #6b3d2e; --text-light: #9a7060; --white: #fff;
  }
  body { font-family: 'Nunito',sans-serif; background: var(--cream); color: var(--text-dark); min-height: 100vh; }
  .logo-bar { display:flex; align-items:center; gap:10px; padding:16px 32px; background:#fdf8f4; border-bottom:1px solid #e8c4bc; }
  .logo-bar img { width:36px; height:36px; border-radius:50%; object-fit:cover; }
  .logo-bar span { font-family:'Dancing Script',cursive; font-size:1.2rem; color:var(--text-dark); }
  .header { background:linear-gradient(135deg,#c9a96e,#9e7c4a); padding:28px 32px; }
  .header h1 { color:#fff; font-family:'Playfair Display',serif; font-size:1.5rem; font-weight:700; margin:0; }
  .header p { margin:4px 0 0; color:rgba(255,255,255,0.85); font-size:0.85rem; }
  .body { max-width:680px; margin:0 auto; padding:32px 24px 60px; }
  .card { background:#fff; border:1px solid #e8c4bc; border-radius:8px; padding:20px 24px; margin-bottom:16px; }
  .card h3 { font-family:'Playfair Display',serif; font-size:1rem; color:var(--text-dark); margin:0 0 16px; padding-bottom:10px; border-bottom:1px solid #f5ddd8; }
  .raw-row { display:flex; gap:12px; padding:6px 0; border-bottom:1px solid #f5ddd8; }
  .raw-row:last-child { border-bottom:none; }
  .raw-key { min-width:165px; font-weight:700; color:var(--gold-dark); flex-shrink:0; font-size:0.88rem; }
  .raw-val { color:var(--text-dark); font-size:0.88rem; line-height:1.6; }
  .field { margin-bottom:14px; }
  .field label { display:block; font-size:0.78rem; font-weight:700; color:var(--gold-dark); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:5px; }
  .field input, .field textarea, .field select { width:100%; padding:9px 12px; border:1.5px solid #e8c4bc; border-radius:4px; font-family:'Nunito',sans-serif; font-size:0.9rem; color:var(--text-dark); background:#fdf8f4; transition:border-color 0.2s; }
  .field input:focus, .field textarea:focus { outline:none; border-color:var(--gold); }
  .field textarea { resize:vertical; min-height:80px; }
  .row2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  @media (max-width:480px) { .row2 { grid-template-columns:1fr; } }
  .deposit-card { border:2px solid var(--gold); background:linear-gradient(135deg,#fdf8f4,#fdf0ee); }
  .btn { width:100%; padding:14px; background:linear-gradient(135deg,#c9a96e,#9e7c4a); color:#fff; border:none; border-radius:4px; font-family:'Nunito',sans-serif; font-weight:700; font-size:0.95rem; cursor:pointer; transition:opacity 0.2s,transform 0.2s; margin-top:8px; }
  .btn:hover { opacity:0.9; transform:translateY(-1px); }
  .btn:disabled { opacity:0.6; cursor:not-allowed; transform:none; }
  .error-msg { background:#fff0f0; border:1px solid #f5c0c0; color:#c62828; padding:10px 14px; border-radius:4px; font-size:0.85rem; margin-bottom:12px; display:none; }
  .success-box { display:none; text-align:center; padding:32px 0; }
  .success-icon { font-size:3rem; margin-bottom:12px; }
  .success-box h3 { font-family:'Playfair Display',serif; color:var(--text-dark); margin:0 0 8px; }
  .success-box p { color:var(--text-mid); font-size:0.9rem; }
  .spinner { display:none; width:18px; height:18px; border:2px solid rgba(255,255,255,0.4); border-top-color:#fff; border-radius:50%; animation:spin 0.7s linear infinite; vertical-align:middle; margin-right:8px; }
  @keyframes spin { to { transform:rotate(360deg); } }
</style>
</head>
<body>
<div class="logo-bar">
  <img src="https://www.theglambyankita.com/logo-original.png" alt="The Glam by Ankita">
  <span>The Glam by Ankita</span>
</div>
<div class="header">
  <h1>Review Booking Request</h1>
  <p>Edit details, set deposit, then send to client</p>
</div>
<div class="body">

  <div class="card" style="background:#fff9f0;border:1.5px solid #e8d5a3;">
    <h3 style="color:var(--gold-dark);">📋 Client's Full Submission</h3>
    <div>${rawRows || '<em style="color:var(--text-light);">No details found.</em>'}</div>
  </div>

  <div id="main-content">
    <div class="card">
      <h3>Confirm Client Details <span style="font-family:'Nunito',sans-serif;font-weight:400;font-size:0.75rem;color:var(--text-light);">edit if needed</span></h3>
      <div class="row2">
        <div class="field"><label>First Name</label><input type="text" id="rv-first-name" value="${val('first_name')}"></div>
        <div class="field"><label>Last Name</label><input type="text" id="rv-last-name" value="${val('last_name')}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Email</label><input type="email" id="rv-email" value="${val('_client_email','client_email')}"></div>
        <div class="field"><label>Phone</label><input type="tel" id="rv-phone" value="${val('phone')}"></div>
      </div>
    </div>

    <div class="card">
      <h3>Confirm Booking Details <span style="font-family:'Nunito',sans-serif;font-weight:400;font-size:0.75rem;color:var(--text-light);">edit if needed</span></h3>
      <div class="row2">
        <div class="field"><label>Confirmed Date</label><input type="date" id="rv-date" value="${val('preferred_date')}"></div>
        <div class="field"><label>Time</label><input type="time" id="rv-time"></div>
      </div>
      <div class="field"><label>Service</label><input type="text" id="rv-service" value="${val('services','service')}"></div>
      <div class="row2">
        <div class="field"><label>Number of People</label><input type="number" id="rv-num-people" min="1" value="${val('num_people')}"></div>
        <div class="field"><label>Location / Address</label><input type="text" id="rv-location" value="${val('location')}"></div>
      </div>
    </div>

    <div class="card deposit-card">
      <h3>💰 Set Deposit Amount</h3>
      <div class="field">
        <label>Amount to Charge (AUD $)</label>
        <input type="number" id="rv-total" min="0" step="0.01" placeholder="e.g. 150" style="font-size:1.1rem;font-weight:700;">
      </div>
    </div>

    <div class="card">
      <h3>Personal Note to Client <span style="font-family:'Nunito',sans-serif;font-weight:400;font-size:0.8rem;color:var(--text-light);">(optional)</span></h3>
      <div class="field"><textarea id="rv-notes" placeholder="e.g. So excited to see you! Please arrive with a clean face and no eye makeup on…"></textarea></div>
    </div>

    <div class="error-msg" id="rv-error"></div>

    <button class="btn" id="rv-send-btn" onclick="sendConfirmation()">
      <span class="spinner" id="rv-spinner"></span>
      Send Confirmation to Client ✦
    </button>

    <div class="success-box" id="rv-success">
      <div class="success-icon">✅</div>
      <h3>Confirmation Sent!</h3>
      <p>The client has been emailed their confirmation and payment link.</p>
    </div>
  </div>

</div>
<script>
  const BOOKING_DATA = ${JSON.stringify(d)};

  async function sendConfirmation() {
    const btn = document.getElementById('rv-send-btn');
    const spinner = document.getElementById('rv-spinner');
    const errEl = document.getElementById('rv-error');

    const firstName = document.getElementById('rv-first-name').value.trim();
    const email = document.getElementById('rv-email').value.trim();
    const total = parseFloat(document.getElementById('rv-total').value);

    errEl.style.display = 'none';
    if (!email) { errEl.textContent = 'Please enter the client email.'; errEl.style.display = 'block'; return; }
    if (!total || total <= 0) { errEl.textContent = 'Please set a deposit amount greater than $0.'; errEl.style.display = 'block'; return; }

    btn.disabled = true;
    spinner.style.display = 'inline-block';

    const confirmed_data = {
      'First Name': firstName,
      'Last Name': document.getElementById('rv-last-name').value.trim(),
      'Email': email,
      'Phone': document.getElementById('rv-phone').value.trim(),
      'Date': document.getElementById('rv-date').value,
      'Time': document.getElementById('rv-time').value,
      'Service': document.getElementById('rv-service').value.trim(),
      'Number of People': document.getElementById('rv-num-people').value,
      'Location': document.getElementById('rv-location').value.trim(),
    };

    try {
      const res = await fetch('/api/send-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_data: BOOKING_DATA,
          client_name: firstName,
          client_email: email,
          confirmed_data,
          notes: document.getElementById('rv-notes').value,
          total_aud: total
        })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Server error (' + res.status + ')');
      }
      document.getElementById('main-content').style.display = 'none';
      document.getElementById('rv-success').style.display = 'block';
    } catch (e) {
      errEl.textContent = e.message || 'Something went wrong. Please try again.';
      errEl.style.display = 'block';
      btn.disabled = false;
      spinner.style.display = 'none';
    }
  }
</script>
</body>
</html>`);
};

function errorPage(msg) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error — The Glam by Ankita</title><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600&display=swap" rel="stylesheet"><style>body{font-family:'Nunito',sans-serif;background:#fdf8f4;color:#2c1810;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center;}h2{font-size:1.2rem;margin-bottom:12px;}p{font-size:0.9rem;color:#9a7060;line-height:1.7;}</style></head><body><div><h2>⚠️ Booking Link Error</h2><p>${msg}</p></div></body></html>`;
}
