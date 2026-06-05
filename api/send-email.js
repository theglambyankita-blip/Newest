const { formidable } = require('formidable');
const nodemailer = require('nodemailer');
const fs = require('fs');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return res.status(503).json({ error: 'Email not configured — GMAIL_USER and GMAIL_APP_PASSWORD are required.' });
  }

  try {
    const form = formidable({ maxFileSize: 10 * 1024 * 1024, maxFiles: 5 });
    const [fields, files] = await form.parse(req);

    const get = (key) => (Array.isArray(fields[key]) ? fields[key][0] : fields[key]) || '';

    const type = get('type');
    const isBooking = type === 'booking';
    const ownerEmail = get('owner_email');
    const clientEmail = get('client_email') || get('collab_email') || get('from_email');
    const firstName = get('first_name');
    const lastName = get('last_name');
    const clientName = firstName ? `${firstName} ${lastName}`.trim() : (get('name') || 'there');

    const subject = isBooking
      ? `New Booking Request from ${clientName}`
      : `New Collab Enquiry from ${clientName}`;

    const excludeKeys = ['type', 'owner_email', 'from_email'];
    const rows = Object.entries(fields)
      .filter(([k]) => !excludeKeys.includes(k))
      .map(([k, v]) => {
        const val = Array.isArray(v) ? v[0] : v;
        return `<tr><td style="padding:6px 12px;font-weight:600;color:#6b3d2e;white-space:nowrap;background:#fdf0ee;">${k.replace(/_/g, ' ')}</td><td style="padding:6px 12px;color:#2c1810;">${val || '—'}</td></tr>`;
      })
      .join('');

    const fileList = Object.values(files).flat();

    // Build review link by encoding booking data directly — no DB needed
    let reviewButtonHtml = '';
    if (isBooking) {
      const bookingData = { _client_name: clientName, _client_email: clientEmail };
      Object.entries(fields).forEach(([k, v]) => {
        bookingData[k] = Array.isArray(v) ? v[0] : v;
      });
      const encoded = Buffer.from(JSON.stringify(bookingData)).toString('base64url');
      const reviewLink = `https://www.theglambyankita.com/r?b=${encoded}`;
      reviewButtonHtml = `
        <div style="text-align:center;padding:24px 32px 28px;background:#fff8f0;border-top:2px solid #e8c4bc;">
          <p style="margin:0 0 14px;font-size:0.88rem;color:#6b3d2e;font-weight:600;">Ready to confirm this booking?</p>
          <a href="${reviewLink}" style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);color:#fff;text-decoration:none;padding:14px 32px;border-radius:5px;font-weight:700;font-size:0.95rem;display:inline-block;letter-spacing:0.03em;">✦ Review &amp; Send Confirmation to Client</a>
          <p style="margin:10px 0 0;font-size:0.78rem;color:#9a7060;">Click to edit details, set the price, and send the client their payment link</p>
        </div>`;
    }

    const ownerHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;">
          <h2 style="margin:0;color:#fff;font-size:1.3rem;">${subject}</h2>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">Via The Glam by Ankita website</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">${rows}</table>
        ${fileList.length > 0 ? `<p style="padding:12px 16px;color:#6b3d2e;font-size:0.85rem;">📎 ${fileList.length} attachment(s) included.</p>` : ''}
        ${reviewButtonHtml}
      </div>`;

    const confirmationHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;">
          <h2 style="margin:0;color:#fff;font-size:1.3rem;">✨ ${isBooking ? 'Booking Request Received!' : 'Enquiry Received!'}</h2>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">The Glam by Ankita</p>
        </div>
        <div style="padding:28px 32px;">
          <p style="font-size:1rem;color:#2c1810;margin:0 0 16px;">Hi ${clientName},</p>
          ${isBooking
            ? `<p style="font-size:0.95rem;color:#4a2e22;line-height:1.7;margin:0 0 16px;">Thank you so much for your booking request! 💄 I've received all your details and will be in touch within <strong>24–48 hours</strong> to confirm everything.</p>`
            : `<p style="font-size:0.95rem;color:#4a2e22;line-height:1.7;margin:0 0 16px;">Thank you for reaching out! ✨ I've received your enquiry and will review it and get back to you within <strong>48 hours</strong>.</p>`
          }
          <p style="font-size:0.95rem;color:#4a2e22;line-height:1.7;margin:0 0 24px;">In the meantime, feel free to follow along on Instagram <a href="https://instagram.com/theglambyankita" style="color:#c9a96e;text-decoration:none;">@theglambyankita</a> for the latest looks.</p>
          <p style="font-size:0.9rem;color:#6b3d2e;margin:0;">With love,<br><strong>Ankita</strong><br>The Glam by Ankita ✦</p>
        </div>
      </div>`;

    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });

    const attachments = fileList.map((f) => ({
      filename: f.originalFilename,
      content: fs.createReadStream(f.filepath),
      contentType: f.mimetype,
    }));

    await transporter.sendMail({
      from: `"The Glam by Ankita" <${user}>`,
      to: ownerEmail,
      replyTo: clientEmail,
      subject,
      html: ownerHtml,
      attachments,
    });

    if (clientEmail) {
      await transporter.sendMail({
        from: `"The Glam by Ankita" <${user}>`,
        to: clientEmail,
        subject: isBooking ? 'Your booking request has been received 💄' : 'Your enquiry has been received ✨',
        html: confirmationHtml,
      });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Email send error:', err);
    res.status(500).json({ error: 'Failed to send email.' });
  }
};
