(async function () {
  const visits = await getAllVisits();
  visits.sort((a, b) => b.timestamp - a.timestamp);

  const total = visits.reduce((sum, v) => sum + (v.amount || 0), 0);
  document.getElementById('total').textContent = `$${total.toFixed(2)}`;

  const outcomeLabels = { not_home: 'Not Home', said_no: 'Said No', did_it: 'Did It' };
  const list = document.getElementById('list');

  visits.forEach((v) => {
    const li = document.createElement('li');
    li.className = 'visit-row';

    const img = document.createElement('img');
    img.className = 'visit-thumb';
    if (v.photo) img.src = URL.createObjectURL(v.photo);

    const info = document.createElement('div');
    info.className = 'visit-info';

    const addr = document.createElement('div');
    addr.className = 'visit-address';
    addr.textContent = v.address || '(no address)';

    const meta = document.createElement('div');
    meta.className = `visit-meta outcome-${v.outcome}`;
    meta.textContent = outcomeLabels[v.outcome] || v.outcome;

    const date = document.createElement('div');
    date.className = 'visit-date';
    date.textContent = new Date(v.timestamp).toLocaleString();

    info.append(addr, meta, date);

    const amount = document.createElement('div');
    amount.className = 'visit-amount';
    amount.textContent = v.amount ? `$${v.amount.toFixed(2)}` : '';

    li.append(img, info, amount);
    list.appendChild(li);
  });
})();
