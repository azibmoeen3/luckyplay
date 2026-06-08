const road = document.getElementById('chickenRoad');
const player = document.getElementById('chickenPlayer');
const betInput = document.getElementById('chickenBet');
const goBtn = document.getElementById('chickenGo');
const cashBtn = document.getElementById('chickenCashout');
const msg = document.getElementById('chickenMsg');
const cashoutValue = document.getElementById('cashoutValue');
document.querySelectorAll('[data-bet]').forEach(btn => btn.addEventListener('click', () => { betInput.value = btn.dataset.bet; }));
let active = false;
let step = 0;
let currentMultiplier = 0;

function setMsg(text, type='') {
  msg.textContent = text;
  msg.className = `game-message ${type}`;
}

function moveChicken(nextStep) {
  const lanes = [...document.querySelectorAll('.chicken-lane')];
  const lane = lanes[Math.max(0, nextStep - 1)];
  if (!lane) return;
  const x = lane.offsetLeft + lane.offsetWidth / 2 - 45;
  player.style.transform = `translateX(${x}px)`;
}

async function post(url, body={}) {
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.message || 'Request failed');
  return data;
}

goBtn.addEventListener('click', async () => {
  try {
    if (!active) {
      document.querySelectorAll('.chicken-lane').forEach(l => l.classList.remove('passed','crashed'));
      step = 0; currentMultiplier = 0; cashoutValue.textContent = 'PKR 0'; moveChicken(0);
      const amount = Number(betInput.value || 0);
      await post('/app/game/chicken/start', { amount });
      active = true; cashBtn.disabled = true; betInput.disabled = true;
      setMsg('Round started. Press GO for next step.');
      return;
    }
    const data = await post('/app/game/chicken/step');
    step = data.step;
    if (data.status === 'lost') {
      const lane = document.querySelector(`.chicken-lane[data-step="${step}"]`);
      if (lane) lane.classList.add('crashed');
      moveChicken(step);
      active = false; cashBtn.disabled = true; betInput.disabled = false;
      setMsg('Caught! Round lost. Start again.', 'bad');
      return;
    }
    currentMultiplier = data.multiplier;
    const lane = document.querySelector(`.chicken-lane[data-step="${step}"]`);
    if (lane) lane.classList.add('passed');
    moveChicken(step);
    cashBtn.disabled = false;
    cashoutValue.textContent = 'PKR ' + (Number(betInput.value || 0) * currentMultiplier).toFixed(0);
    setMsg(`Safe step ${step}. Current multiplier x${currentMultiplier.toFixed(2)}.`);
  } catch (err) { setMsg(err.message, 'bad'); }
});

cashBtn.addEventListener('click', async () => {
  try {
    const data = await post('/app/game/chicken/cashout');
    active = false; cashBtn.disabled = true; betInput.disabled = false;
    setMsg(`Cashed out at x${data.multiplier.toFixed(2)}. Payout ${data.payout.toFixed(2)}.`, 'good');
  } catch (err) { setMsg(err.message, 'bad'); }
});
