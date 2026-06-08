const socket = io('/aviator');
const canvas = document.getElementById('aviatorCanvas');
const ctx = canvas.getContext('2d');
const multEl = document.getElementById('aviatorMultiplier');
const statusEl = document.getElementById('roundStatus');
const countdownEl = document.getElementById('aviatorCountdown');
const liveBets = document.getElementById('liveBets');
const betInput = document.getElementById('aviatorBet');
const placeBtn = document.getElementById('placeAviator');
const cashBtn = document.getElementById('cashoutAviator');
let roundState = null;
let placed = false;
document.querySelectorAll('[data-aviator-bet]').forEach(btn => btn.addEventListener('click', () => { betInput.value = btn.dataset.aviatorBet; }));

function draw(multiplier, phase) {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.lineWidth = 1;
  for (let i=0;i<8;i++){ ctx.beginPath(); ctx.moveTo(0,h-i*55); ctx.lineTo(w,h-i*55); ctx.stroke(); }
  ctx.strokeStyle = phase === 'crashed' ? '#ff5c75' : '#ff405d';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(30, h-42);
  const t = Math.min(1, (multiplier - 1) / 6);
  const x = 70 + t * (w - 150);
  const y = h - 70 - Math.pow(t, .72) * (h - 150);
  ctx.quadraticCurveTo(w * .35, h - 120, x, y);
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.2 - t * .45);
  ctx.font = '48px serif';
  ctx.fillText('✈', -25, 16);
  ctx.restore();
}

function render(s) {
  roundState = s;
  const m = Number(s.multiplier || 1);
  multEl.textContent = `${m.toFixed(2)}x`;
  statusEl.textContent = s.phase;
  draw(m, s.phase);
  cashBtn.disabled = !(placed && s.phase === 'running');
  placeBtn.disabled = s.phase !== 'waiting' || placed;
  if (s.phase === 'waiting') {
    const left = Math.max(0, Math.ceil((s.startsAt - Date.now()) / 1000));
    countdownEl.textContent = `Next round starts in ${left}s`;
  } else if (s.phase === 'running') {
    countdownEl.textContent = 'Plane is flying. Cash out before crash.';
  } else {
    countdownEl.textContent = `Crashed at ${Number(s.crashMultiplier || m).toFixed(2)}x`;
    placed = false;
  }
  liveBets.innerHTML = (s.bets || []).map(b => `<span>${b.name}: ${Number(b.amount).toFixed(0)} • ${b.status}${b.cashoutAt ? ' x'+Number(b.cashoutAt).toFixed(2) : ''}</span>`).join('');
}

socket.on('round', render);
socket.on('tick', render);
setInterval(() => { if (roundState && roundState.phase === 'waiting') render(roundState); }, 500);

placeBtn.addEventListener('click', () => {
  socket.emit('place-bet', { userId: window.CURRENT_USER_ID, amount: Number(betInput.value || 0) }, (res) => {
    if (!res || !res.ok) return alert(res ? res.message : 'Could not place bet');
    placed = true;
    placeBtn.disabled = true;
  });
});

cashBtn.addEventListener('click', () => {
  socket.emit('cashout', { userId: window.CURRENT_USER_ID }, (res) => {
    if (!res || !res.ok) return alert(res ? res.message : 'Could not cashout');
    placed = false;
    cashBtn.disabled = true;
    alert(`Payout ${Number(res.payout).toFixed(2)} at x${Number(res.multiplier).toFixed(2)}`);
  });
});

draw(1, 'waiting');
