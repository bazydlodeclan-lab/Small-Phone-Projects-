const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_API_KEY = "AIzaSyDuNPAPKvG9sWcCFYjLuUX49lc_AZ_fg1A";

const els = {
  captureBtn: document.getElementById('captureBtn'),
  fileInput: document.getElementById('fileInput'),
  thumb: document.getElementById('thumb'),
  status: document.getElementById('status'),
  addressField: document.getElementById('addressField'),
  outcomeBtns: document.querySelectorAll('.outcome-btn'),
  amountField: document.getElementById('amountField'),
  saveBtn: document.getElementById('saveBtn'),
  retakeBtn: document.getElementById('retakeBtn'),
  newVisitSection: document.getElementById('newVisitSection'),
  detailsSection: document.getElementById('detailsSection'),
};

let currentPhotoBlob = null;
let selectedOutcome = null;

els.captureBtn.addEventListener('click', () => els.fileInput.click());

els.fileInput.addEventListener('change', async () => {
  const file = els.fileInput.files[0];
  if (!file) return;

  currentPhotoBlob = file;
  els.thumb.src = URL.createObjectURL(file);
  els.newVisitSection.hidden = true;
  els.detailsSection.hidden = false;
  els.status.textContent = 'Reading address...';
  els.addressField.value = '';
  els.amountField.value = '';
  selectedOutcome = null;
  els.outcomeBtns.forEach((b) => b.classList.remove('selected'));

  const [houseNumber, street] = await Promise.all([
    detectHouseNumber(file),
    detectStreet(),
  ]);

  const parts = [houseNumber, street].filter(Boolean);
  els.addressField.value = parts.join(' ');
  els.status.textContent = parts.length ? '' : 'Could not auto-detect — enter address manually';
});

async function detectHouseNumber(file) {
  try {
    const base64 = await fileToBase64(file);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: "Look at this photo of a house. Reply with ONLY the house/street number visible (e.g. '42'), nothing else. If you can't find one, reply with nothing." },
              { inline_data: { mime_type: file.type || 'image/jpeg', data: base64 } },
            ],
          }],
        }),
      }
    );
    const data = await res.json();
    const text = data && data.candidates && data.candidates[0] &&
      data.candidates[0].content.parts[0].text;
    return (text || '').trim();
  } catch (err) {
    console.error(err);
    return '';
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function detectStreet() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
          );
          const data = await res.json();
          const addr = data.address || {};
          const road = addr.road || addr.pedestrian || addr.footway || '';
          const city = addr.city || addr.town || addr.village || '';
          resolve([road, city].filter(Boolean).join(', '));
        } catch (err) {
          console.error(err);
          resolve('');
        }
      },
      () => resolve(''),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

els.outcomeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    els.outcomeBtns.forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedOutcome = btn.dataset.outcome;
  });
});

els.retakeBtn.addEventListener('click', resetForm);

els.saveBtn.addEventListener('click', async () => {
  if (!selectedOutcome) {
    alert('Pick an outcome first: Not Home, Said No, or Did It.');
    return;
  }
  const visit = {
    photo: currentPhotoBlob,
    address: els.addressField.value.trim(),
    outcome: selectedOutcome,
    amount: parseFloat(els.amountField.value) || 0,
    timestamp: Date.now(),
  };
  await addVisit(visit);
  resetForm();
});

function resetForm() {
  currentPhotoBlob = null;
  selectedOutcome = null;
  els.fileInput.value = '';
  els.addressField.value = '';
  els.amountField.value = '';
  els.status.textContent = '';
  els.outcomeBtns.forEach((b) => b.classList.remove('selected'));
  els.newVisitSection.hidden = false;
  els.detailsSection.hidden = true;
}
