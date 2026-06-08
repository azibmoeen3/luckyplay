async function refreshBalance() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    if (data.ok) {
      const el = document.getElementById('liveBalance');
      if (el) el.textContent = `PKR ${Number(data.user.balance || 0).toFixed(0)}`;
    }
  } catch (e) {}
}
setInterval(refreshBalance, 7000);
