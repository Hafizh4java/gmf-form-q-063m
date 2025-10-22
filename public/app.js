const form = document.getElementById('gmfForm');
const status = document.getElementById('status');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  status.textContent = 'Sending...';

  const formData = new FormData(form);

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      body: formData
    });
    const json = await res.json();
    if (res.ok) {
      status.textContent = 'Berhasil! Cek email anda.';
      form.reset();
    } else {
      status.textContent = 'Error: ' + (json.error || json.message || res.statusText);
    }
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
  }
});

const guidanceFile = document.getElementById('guidanceFile');
const guidancePreview = document.getElementById('guidancePreview');

guidanceFile?.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  guidancePreview.innerHTML = `<img src="${url}" class="max-w-full" />`;
});
