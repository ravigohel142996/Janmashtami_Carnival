/* Registration Portal Controller Logic */

let selectedPlan = '100';

function openRegisterModal() {
  document.getElementById('registerModal').classList.add('active');
}

function openLookupModal() {
  document.getElementById('lookupModal').classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function selectPlan(amount) {
  selectedPlan = amount;
  const p100 = document.getElementById('plan100');
  const p500 = document.getElementById('plan500');
  if (p100) p100.classList.toggle('selected', amount === '100');
  if (p500) p500.classList.toggle('selected', amount === '500');
  const payTxt = document.getElementById('payAmountTxt');
  if (payTxt) payTxt.innerText = `₹${amount}`;
}

function selectPlanAndOpen(amount) {
  selectPlan(amount);
  openRegisterModal();
}

function copyUpiId() {
  const upiText = document.getElementById('upiIdText')?.innerText || '7600046176@ibl';
  navigator.clipboard.writeText(upiText).then(() => {
    alert('✅ UPI ID copied to clipboard: ' + upiText);
  }).catch(() => {
    alert('UPI ID: ' + upiText);
  });
}

async function handleRegistrationSubmit(event) {
  event.preventDefault();

  const payload = {
    plan: selectedPlan === '100' ? '₹100 One Day' : '₹500 Two Day Resident',
    primary_name: document.getElementById('regName').value,
    mobile: document.getElementById('regMobile').value,
    age: document.getElementById('regAge').value,
    gender: document.getElementById('regGender').value,
    city: document.getElementById('regCity').value,
    amount: parseInt(selectedPlan),
    payment_mobile: document.getElementById('payMobile').value,
    utr_number: document.getElementById('payUtr').value
  };

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      closeModal('registerModal');
      alert(`🎉 Registration Submitted Successfully!\n\nYour Registration Code: ${data.reg_code}\nStatus: Payment Verification Pending (Within 24 Hours)\n\nYou can check status anytime under "Check Registration".`);
      
      document.getElementById('lookupQueryInput').value = data.reg_code;
      openLookupModal();
      performRegistrationLookup();
    } else {
      alert('Error: ' + (data.error || 'Failed to submit registration'));
    }
  } catch (err) {
    alert('Server error. Please try again.');
  }
}

async function performRegistrationLookup() {
  const query = document.getElementById('lookupQueryInput').value;
  const container = document.getElementById('lookupResultContainer');

  if (!query) {
    container.innerHTML = '<p style="color: var(--accent-amber);">Please enter Registration Code or Mobile Number.</p>';
    return;
  }

  container.innerHTML = '<p style="color: var(--text-muted);">Searching database...</p>';

  try {
    const res = await fetch(`/api/registration/lookup?query=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!data.success || !data.registrations || data.registrations.length === 0) {
      container.innerHTML = `<p style="color: var(--accent-amber);">No registration found for "${query}".</p>`;
      return;
    }

    let html = '';
    data.registrations.forEach(reg => {
      const isConfirmed = reg.status === 'confirmed';
      const statusPill = isConfirmed
        ? '<span class="status-pill confirmed">✓ CONFIRMED</span>'
        : (reg.status === 'rejected' ? '<span class="status-pill rejected" style="background:rgba(255,77,109,0.2); color:#ff4d6d; border:1px solid #ff4d6d;">❌ REJECTED</span>' : '<span class="status-pill pending">⏳ PAYMENT PENDING</span>');

      html += `
        <div style="background: rgba(4,29,32,0.85); border: 1px solid var(--accent-gold); border-radius: var(--radius-md); padding: 1.2rem; margin-bottom: 1rem; text-align: left;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem;">
            <h4 style="color: var(--accent-gold-light); font-size: 1.1rem;">Pass Code: ${reg.reg_code}</h4>
            ${statusPill}
          </div>

          ${isConfirmed ? `
            <!-- Printable E-Receipt Pass Card -->
            <div class="receipt-pass-card" id="receiptCard_${reg.reg_code}">
              <div class="receipt-header">
                <div class="receipt-brand">
                  <span>🦚</span> Shri Krishna Janmashtami 2026
                </div>
                <div class="receipt-code-badge">${reg.reg_code}</div>
              </div>

              <div class="receipt-body-grid">
                <div class="receipt-info">
                  <p><strong>Attendee Name:</strong> ${reg.primary_name}</p>
                  <p><strong>Pass Tier:</strong> ${reg.plan}</p>
                  <p><strong>Mobile:</strong> ${reg.mobile} | <strong>City:</strong> ${reg.city}</p>
                  <p><strong>Payment Ref (UTR):</strong> ${reg.utr_number}</p>
                  <p><strong>Status:</strong> <span style="color:#14b8a6; font-weight:700;">APPROVED / CONFIRMED</span></p>
                  ${reg.checked_in ? `<p style="color:#059669; font-weight:700;">✓ Checked-In: ${reg.checked_in_at}</p>` : ''}
                </div>

                <div class="receipt-qr-box">
                  <img src="/api/qr/${reg.reg_code}" alt="Pass QR Code">
                  <p style="font-size:0.75rem; font-weight:700; margin-top:4px; color:#062c30;">SCAN AT GATE</p>
                </div>
              </div>

              <div class="receipt-footer-notes">
                <p>📍 Venue: Dhyansthali, Morbi • Dates: 4–5 September 2026</p>
                <p style="margin-top:2px;">Present this receipt with QR code at entry gate for verification.</p>
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
            <div style="padding: 1rem; background: rgba(0,0,0,0.2); border-radius: 8px;">
              <p><strong>Primary Name:</strong> ${reg.primary_name}</p>
              <p><strong>Pass Tier:</strong> ${reg.plan}</p>
              <p><strong>Mobile:</strong> ${reg.mobile} | <strong>City:</strong> ${reg.city}</p>
              <p><strong>12-Digit UTR Ref:</strong> ${reg.utr_number}</p>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px; font-style: italic;">
                Note: Your payment proof is under verification by admin. Unique Entry QR Receipt will activate as soon as status is marked CONFIRMED.
              </p>
            </div>
          `}
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<p style="color: red;">Error retrieving pass status.</p>';
  }
}

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


