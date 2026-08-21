/* Registration Portal Controller Logic */

let selectedPlan = '100_4';

// UPI Configuration
const UPI_ID = '7600046176@ibl';
const UPI_PAYEE_NAME = 'Janmashtami Carnival 2026';

// ─── Modal Controls ──────────────────────────────────────────

function openRegisterModal() {
  document.getElementById('registerModal').classList.add('active');
}

function openLookupModal() {
  document.getElementById('lookupModal').classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// ─── Plan Selection ──────────────────────────────────────────

function selectPlan(amount) {
  selectedPlan = amount;
  const p100_4 = document.getElementById('plan100_4');
  const p100_5 = document.getElementById('plan100_5');
  const p500 = document.getElementById('plan500');
  if (p100_4) p100_4.classList.toggle('selected', amount === '100_4');
  if (p100_5) p100_5.classList.toggle('selected', amount === '100_5');
  if (p500) p500.classList.toggle('selected', amount === '500');
  const numericAmount = amount.startsWith('100') ? 100 : 500;
  const payTxt = document.getElementById('payAmountTxt');
  if (payTxt) {
    payTxt.innerText = `₹${numericAmount}`;
  }
  // Update dynamic payment QR image to reflect correct amount
  const qrImg = document.getElementById('paymentQrImg');
  if (qrImg) {
    qrImg.src = `/api/paymentqr?amount=${numericAmount}`;
  }
}

function selectPlanAndOpen(amount) {
  selectPlan(amount);
  openRegisterModal();
}

// ─── UPI / Payment ───────────────────────────────────────────

function copyUpiId() {
  const upiText = document.getElementById('upiIdText')?.innerText || UPI_ID;
  navigator.clipboard.writeText(upiText).then(() => {
    showToast('✅ UPI ID copied: ' + upiText);
  }).catch(() => {
    // Fallback for older browsers
    const tempInput = document.createElement('input');
    tempInput.value = upiText;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    showToast('✅ UPI ID copied: ' + upiText);
  });
}

// ─── Simplified Payment Flow (legacy compat) ────────────────

function startPayment() { copyUpiId(); }
function openPhonePe() { copyUpiId(); }
function openGPay() { copyUpiId(); }
function openPaytm() { copyUpiId(); }
function openUpiApp() { copyUpiId(); }

// ─── Registration Submission ─────────────────────────────────

async function handleRegistrationSubmit(event) {
  event.preventDefault();

  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = '⏳ Submitting...';
  }

  const genderEl = document.getElementById('regGender');
  if (!genderEl.value) {
    genderEl.focus();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '🚀 Complete Pass Registration'; }
    return;
  }

  const payload = {
    plan: selectedPlan === '100_4' ? '₹100 One Day (4 Sept)' :
          selectedPlan === '100_5' ? '₹100 One Day (5 Sept)' : '₹500 Two Day Resident',
    primary_name: document.getElementById('regName').value.trim(),
    mobile: document.getElementById('regMobile').value.trim(),
    age: document.getElementById('regAge').value,
    gender: genderEl.value,
    city: document.getElementById('regCity').value.trim(),
    payment_mobile: document.getElementById('payMobile').value.trim(),
    utr_number: (document.getElementById('payUtr')?.value || '').trim()
    // NOTE: amount is intentionally NOT sent — server computes it from plan
  };

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '🚀 Complete Pass Registration'; }

    if (data.success) {
      closeModal('registerModal');
      showRegistrationSuccess(data.reg_code, data.amount, data.plan);
    } else {
      showToast('❌ ' + (data.error || 'Registration failed. Please try again.'), 'error');
    }
  } catch (err) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '🚀 Complete Pass Registration'; }
    showToast('❌ Network error. Please check connection and try again.', 'error');
  }
}

/**
 * Shows a styled success card after registration (replaces native alert).
 */
function showRegistrationSuccess(regCode, amount, plan) {
  // Show the lookup modal with the success message first
  const lookupInput = document.getElementById('lookupQueryInput');
  if (lookupInput) lookupInput.value = regCode;

  // Pre-populate result container with success card
  const container = document.getElementById('lookupResultContainer');
  if (container) {
    container.innerHTML = `
      <div style="background: rgba(20,184,166,0.15); border: 2px solid var(--accent-teal); border-radius: var(--radius-md); padding: 1.4rem; text-align: center;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎉</div>
        <h3 style="color: var(--accent-teal); margin-bottom: 0.5rem;">Registration Submitted!</h3>
        <p style="font-size: 1.1rem; margin-bottom: 0.4rem;">Your Registration Code:</p>
        <div style="font-size: 1.8rem; font-weight: 900; color: var(--accent-gold-light); letter-spacing: 2px; background: rgba(0,0,0,0.3); padding: 0.5rem 1rem; border-radius: 8px; display: inline-block; margin: 0.4rem 0;">
          ${regCode}
        </div>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.8rem;">📋 Save this code! Use it to check your status and download your pass.</p>
        <p style="color: var(--accent-amber); font-size: 0.85rem; margin-top: 0.4rem;">⏳ Status: <strong>Payment Pending Verification</strong> — Admin will confirm within 24 hours.</p>
        <button class="submit-btn-gold" style="margin-top: 1rem; padding: 0.65rem 1.2rem; font-size: 0.9rem;" onclick="performRegistrationLookup()">
          🔍 Check My Pass Status
        </button>
      </div>
    `;
  }

  openLookupModal();
}

// ─── Pass Status Lookup ──────────────────────────────────────

async function performRegistrationLookup() {
  const query = document.getElementById('lookupQueryInput').value.trim();
  const container = document.getElementById('lookupResultContainer');

  if (!query) {
    container.innerHTML = '<p style="color: var(--accent-amber);">Please enter your Registration Code or Mobile Number.</p>';
    return;
  }

  container.innerHTML = '<p style="color: var(--text-muted);">🔍 Searching database...</p>';

  try {
    const res = await fetch(`/api/registration/lookup?query=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!data.success || !data.registrations || data.registrations.length === 0) {
      container.innerHTML = `<p style="color: var(--accent-amber);">No registration found for "<strong>${escapeHtml(query)}</strong>".</p>`;
      return;
    }

    let html = '';
    data.registrations.forEach(reg => {
      const isConfirmed = reg.status === 'confirmed';
      const isRejected = reg.status === 'rejected';
      const statusPill = isConfirmed
        ? '<span class="status-pill confirmed">✓ CONFIRMED</span>'
        : (isRejected
          ? '<span class="status-pill rejected">❌ REJECTED</span>'
          : '<span class="status-pill pending">⏳ PAYMENT PENDING</span>');

      html += `
        <div style="background: rgba(4,29,32,0.85); border: 1px solid var(--accent-gold); border-radius: var(--radius-md); padding: 1.2rem; margin-bottom: 1rem; text-align: left;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem; flex-wrap: wrap; gap: 8px;">
            <h4 style="color: var(--accent-gold-light); font-size: 1.1rem;">Pass: ${escapeHtml(reg.reg_code)}</h4>
            ${statusPill}
          </div>

          ${isConfirmed ? `
            <!-- Confirmed: Show full E-Receipt Pass Card -->
            <div class="receipt-pass-card" id="receiptCard_${reg.reg_code}">
              <div class="receipt-header">
                <div class="receipt-brand">
                  <span>🦚</span> Shri Krishna Janmashtami 2026
                </div>
                <div class="receipt-code-badge">${escapeHtml(reg.reg_code)}</div>
              </div>

              <div class="receipt-body-grid">
                <div class="receipt-info">
                  <p><strong>Name:</strong> ${escapeHtml(reg.primary_name)}</p>
                  <p><strong>Pass Tier:</strong> ${escapeHtml(reg.plan)} (₹${reg.amount})</p>
                  <p><strong>Mobile:</strong> ${escapeHtml(reg.mobile)} | <strong>City:</strong> ${escapeHtml(reg.city)}</p>
                  ${reg.utr_number ? `<p><strong>UTR Ref:</strong> ${escapeHtml(reg.utr_number)}</p>` : ''}
                  <p><strong>Status:</strong> <span style="color:#14b8a6; font-weight:700;">APPROVED / CONFIRMED</span></p>
                  ${reg.checked_in ? `<p style="color:#059669; font-weight:700;">✓ Checked-In: ${escapeHtml(reg.checked_in_at)}</p>` : ''}
                </div>

                <div class="receipt-qr-box">
                  <img src="/api/qr/${reg.reg_code}" alt="Pass QR Code" loading="lazy">
                  <p style="font-size:0.75rem; font-weight:700; margin-top:4px; color:#062c30;">SCAN AT GATE</p>
                </div>
              </div>

              <div class="receipt-footer-notes">
                <p>📍 Venue: Dhyansthali, Morbi • Dates: 4–5 September 2026</p>
                <p style="margin-top:2px;">Present this pass with QR code at gate for entry verification.</p>
              </div>
            </div>

            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 1rem;">
              <button class="btn-print-receipt" onclick="downloadPassAsPNG('${reg.reg_code}')">
                💾 Download Pass Image (PNG)
              </button>
              <a href="receipt.html?code=${reg.reg_code}" target="_blank" class="btn-print-receipt" style="background: rgba(255,255,255,0.15); color: #fff; border: 1px solid var(--card-border); text-decoration: none;">
                🖨️ Full Page / PDF Print
              </a>
            </div>
          ` : `
            <!-- Pending / Rejected: show summary without QR -->
            <div style="padding: 1rem; background: rgba(0,0,0,0.2); border-radius: 8px;">
              <p><strong>Name:</strong> ${escapeHtml(reg.primary_name)}</p>
              <p><strong>Pass Tier:</strong> ${escapeHtml(reg.plan)}</p>
              <p><strong>Mobile:</strong> ${escapeHtml(reg.mobile)} | <strong>City:</strong> ${escapeHtml(reg.city)}</p>
              ${reg.utr_number ? `<p><strong>UTR Ref:</strong> ${escapeHtml(reg.utr_number)}</p>` : ''}
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px; font-style: italic;">
                ${isRejected
                  ? '❌ Your registration was rejected. Please contact the event organisers.'
                  : '⏳ Your payment is under verification. Entry QR pass will appear here once confirmed by admin (usually within 24 hours).'}
              </p>
            </div>
          `}
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<p style="color: red;">Error retrieving pass status. Please try again.</p>';
  }
}

// ─── Pass Download ───────────────────────────────────────────

function downloadPassAsPNG(regCode) {
  const card = document.getElementById(`receiptCard_${regCode}`);
  if (!card) return;

  if (typeof html2canvas === 'undefined') {
    window.open(`receipt.html?code=${regCode}`, '_blank');
    return;
  }

  html2canvas(card, { scale: 2, useCORS: true }).then(canvas => {
    const link = document.createElement('a');
    link.download = `Janmashtami_Pass_${regCode}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

// ─── Utilities ───────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer = null;
function showToast(message, type = 'info') {
  let toast = document.getElementById('globalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.style.cssText = `
      position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
      background: rgba(4,26,28,0.97); border: 1px solid var(--accent-gold);
      color: #fff; padding: 12px 20px; border-radius: 10px; z-index: 9999;
      font-size: 0.9rem; font-weight: 600; max-width: 90vw; text-align: center;
      box-shadow: 0 8px 30px rgba(0,0,0,0.5); transition: opacity 0.3s;
    `;
    document.body.appendChild(toast);
  }
  if (type === 'error') toast.style.borderColor = '#ff4d6d';
  else toast.style.borderColor = 'var(--accent-gold)';
  toast.innerText = message;
  toast.style.opacity = '1';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 3500);
}
