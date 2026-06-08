const { readDb, mutate } = require('./db');
const { makeAviatorCrash, validateBet } = require('./gameEngine');
const { v4: uuid } = require('uuid');

const TICK_MS = 90;
const WAIT_MS = 4500;

function createAviatorSocket(io) {
  let state = {
    phase: 'waiting',
    roundId: uuid(),
    startsAt: Date.now() + WAIT_MS,
    multiplier: 1,
    crashMultiplier: 2,
    seed: null,
    placed: new Map(),
    startedAt: null
  };

  const resetRound = () => {
    const db = readDb();
    const seed = makeAviatorCrash(db.settings.aviator);
    state = {
      phase: 'waiting',
      roundId: uuid(),
      startsAt: Date.now() + WAIT_MS,
      multiplier: 1,
      crashMultiplier: seed.crashMultiplier,
      seed,
      placed: new Map(),
      startedAt: null
    };
    io.of('/aviator').emit('round', publicState(state));
  };

  const publicState = (s) => ({
    phase: s.phase,
    roundId: s.roundId,
    startsAt: s.startsAt,
    multiplier: Number(s.multiplier.toFixed(2)),
    crashMultiplier: s.phase === 'crashed' ? s.crashMultiplier : null,
    bets: Array.from(s.placed.values()).map(b => ({ name: b.name, amount: b.amount, status: b.status, cashoutAt: b.cashoutAt }))
  });

  resetRound();

  io.of('/aviator').on('connection', (socket) => {
    socket.emit('round', publicState(state));

    socket.on('place-bet', ({ userId, amount }, ack) => {
      try {
        if (state.phase !== 'waiting') return ack?.({ ok: false, message: 'Round already started. Wait for next round.' });
        if (!userId) return ack?.({ ok: false, message: 'Login required.' });
        if (state.placed.has(userId)) return ack?.({ ok: false, message: 'Bet already placed for this round.' });
        const db = readDb();
        const user = db.users.find(u => u.id === userId && !u.isBlocked);
        if (!user) return ack?.({ ok: false, message: 'User not found.' });
        const settings = db.settings.aviator;
        const error = validateBet(amount, settings.minBet, settings.maxBet, user.balance);
        if (error) return ack?.({ ok: false, message: error });
        const betAmount = Number(amount);
        mutate(nextDb => {
          const freshUser = nextDb.users.find(u => u.id === userId);
          freshUser.balance = Number((freshUser.balance - betAmount).toFixed(2));
          nextDb.transactions.unshift({ id: uuid(), userId, type: 'bet', amount: -betAmount, game: 'aviator', createdAt: new Date().toISOString() });
        });
        state.placed.set(userId, { userId, name: user.name, amount: betAmount, status: 'active', cashoutAt: null });
        io.of('/aviator').emit('round', publicState(state));
        ack?.({ ok: true, message: 'Bet placed.' });
      } catch (err) {
        ack?.({ ok: false, message: err.message });
      }
    });

    socket.on('cashout', ({ userId }, ack) => {
      try {
        if (state.phase !== 'running') return ack?.({ ok: false, message: 'Cashout available only while flying.' });
        const bet = state.placed.get(userId);
        if (!bet || bet.status !== 'active') return ack?.({ ok: false, message: 'No active bet.' });
        bet.status = 'cashed';
        bet.cashoutAt = Number(state.multiplier.toFixed(2));
        const payout = Number((bet.amount * bet.cashoutAt).toFixed(2));
        mutate(db => {
          const user = db.users.find(u => u.id === userId);
          user.balance = Number((user.balance + payout).toFixed(2));
          db.bets.unshift({
            id: uuid(), userId, game: 'aviator', roundId: state.roundId, amount: bet.amount,
            multiplier: bet.cashoutAt, payout, status: 'won', createdAt: new Date().toISOString(),
            fair: { serverSeedHash: state.seed.serverSeed.slice(0, 12), clientSeed: state.seed.clientSeed, nonce: state.seed.nonce }
          });
          db.transactions.unshift({ id: uuid(), userId, type: 'payout', amount: payout, game: 'aviator', createdAt: new Date().toISOString() });
        });
        io.of('/aviator').emit('round', publicState(state));
        ack?.({ ok: true, payout, multiplier: bet.cashoutAt });
      } catch (err) {
        ack?.({ ok: false, message: err.message });
      }
    });
  });

  setInterval(() => {
    const now = Date.now();
    if (state.phase === 'waiting' && now >= state.startsAt) {
      state.phase = 'running';
      state.startedAt = now;
      state.multiplier = 1;
      io.of('/aviator').emit('round', publicState(state));
      return;
    }

    if (state.phase === 'running') {
      const elapsed = (now - state.startedAt) / 1000;
      state.multiplier = Number((1 + elapsed * 0.28 + Math.pow(elapsed, 1.6) * 0.07).toFixed(2));
      if (state.multiplier >= state.crashMultiplier) {
        state.phase = 'crashed';
        state.multiplier = state.crashMultiplier;
        mutate(db => {
          for (const bet of state.placed.values()) {
            if (bet.status === 'active') {
              bet.status = 'lost';
              db.bets.unshift({
                id: uuid(), userId: bet.userId, game: 'aviator', roundId: state.roundId, amount: bet.amount,
                multiplier: state.crashMultiplier, payout: 0, status: 'lost', createdAt: new Date().toISOString(),
                fair: { serverSeedHash: state.seed.serverSeed.slice(0, 12), clientSeed: state.seed.clientSeed, nonce: state.seed.nonce }
              });
            }
          }
        });
        io.of('/aviator').emit('round', publicState(state));
        setTimeout(resetRound, 3000);
        return;
      }
      io.of('/aviator').emit('tick', publicState(state));
    }
  }, TICK_MS);
}

module.exports = { createAviatorSocket };
