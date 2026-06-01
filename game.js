const GLOBAL_TIME = 60;
const TYPE_LABEL = { pronunciation: '字音', form: '字形', wrongchar: '填空', confusable: '易混淆', handwrite: '書寫', errorchar: '找錯字' };
const PER_Q_TIME = 7;

// 題型循環：第3題易混淆，第6題書寫，每輪含一題找錯字
const TYPE_CYCLE = ['pronunciation', 'form', 'confusable', 'errorchar', 'wrongchar', 'handwrite'];

function weightedDiff() { return 3; }

function heartDisplay(hearts, max) {
  return '❤️'.repeat(hearts) + '🖤'.repeat(max - hearts);
}

let state = {};
let globalSeenIds = new Set();

// ─── helpers ──────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function el(id) { return document.getElementById(id); }

const ACTIVE_TYPES = new Set(['pronunciation', 'form', 'wrongchar', 'confusable', 'handwrite', 'errorchar']);

// ─── question picking ──────────────────────────────────

function pickQuestion(type) {
  const order = [3, 2, 1];
  for (const d of order) {
    const pool = questions.filter(q =>
      q.type === type &&
      q.difficulty === d &&
      !globalSeenIds.has(q.id)
    );
    if (pool.length > 0) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
  }
  const all = questions.filter(q => q.type === type);
  all.forEach(q => globalSeenIds.delete(q.id));
  return all[Math.floor(Math.random() * all.length)];
}

// ─── init ─────────────────────────────────────────────

function initState() {
  clearInterval(state.globalInterval);
  clearInterval(state.perQInterval);
  clearTimeout(state.nextTimeout);

  state = {
    typeIndex: 0,
    hearts: 3,
    maxHearts: 3,
    score: 0,
    globalTimeLeft: GLOBAL_TIME,
    answered: 0,
    correct: 0,
    globalInterval: null,
    perQInterval: null,
    nextTimeout: null,
    isAnswered: false,
    gameOver: false,
    currentPerQTime: PER_Q_TIME,
    perQTimeLeft: PER_Q_TIME,
  };
}

// ─── start ────────────────────────────────────────────

function startGame() {
  showScreen('screen-game');
  el('global-timer').textContent = state.globalTimeLeft;
  el('global-timer').classList.remove('urgent');
  el('score-display').textContent = '0';
  el('hearts-display').textContent = heartDisplay(state.hearts, state.maxHearts);
  sounds.start();

  state.globalInterval = setInterval(() => {
    if (state.gameOver) return;
    state.globalTimeLeft--;
    el('global-timer').textContent = state.globalTimeLeft;
    if (state.globalTimeLeft <= 10) {
      el('global-timer').classList.add('urgent');
      sounds.tick();
    }
    if (state.globalTimeLeft <= 0) endGame('timeout');
  }, 1000);

  loadQuestion();
}

// ─── question ─────────────────────────────────────────

function loadQuestion() {
  if (state.gameOver) return;

  const type = TYPE_CYCLE[state.typeIndex % TYPE_CYCLE.length];
  state.typeIndex++;
  const q = pickQuestion(type);

  globalSeenIds.add(q.id);
  state.isAnswered = false;
  state.currentQ = q;
  state.currentPerQTime = PER_Q_TIME;
  state.perQTimeLeft = PER_Q_TIME;

  el('question-text').textContent = q.question;
  el('explanation').style.display = 'none';

  const isHandwrite  = q.type === 'handwrite';
  const isErrorchar  = q.type === 'errorchar';
  const isOptionType = !isHandwrite && !isErrorchar;

  el('options-grid').style.display    = isOptionType ? '' : 'none';
  el('handwrite-area').style.display  = isHandwrite  ? 'flex' : 'none';
  el('char-tiles-area').style.display = isErrorchar  ? 'flex' : 'none';

  if (isHandwrite) {
    const inp = el('handwrite-input');
    inp.value = '';
    inp.className = 'handwrite-input';
    inp.disabled = false;
    el('handwrite-submit').disabled = false;
    setTimeout(() => inp.focus(), 80);

  } else if (isErrorchar) {
    state.selectedTiles = new Set();
    el('ec-hint').textContent = `含 ${q.errors.length} 個錯字，請點選後按確認`;
    el('char-confirm-btn').disabled = false;
    const tilesEl = el('char-tiles');
    tilesEl.innerHTML = '';
    [...q.sentence].forEach((ch, i) => {
      const tile = document.createElement('button');
      tile.className = 'char-tile';
      tile.textContent = ch;
      tile.dataset.idx = i;
      tile.addEventListener('click', () => {
        if (state.isAnswered) return;
        if (state.selectedTiles.has(i)) {
          state.selectedTiles.delete(i);
          tile.classList.remove('selected');
        } else {
          state.selectedTiles.add(i);
          tile.classList.add('selected');
        }
      });
      tilesEl.appendChild(tile);
    });

  } else {
    const grid = el('options-grid');
    grid.innerHTML = '';
    grid.className = 'options-grid';

    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      if (q.type === 'pronunciation') {
        btn.innerHTML = opt.replace(/([ˊˋˇ˙])/g, '<span class="tone">$1</span>');
      } else {
        btn.textContent = opt;
      }
      btn.addEventListener('click', () => pick(i, q));
      grid.appendChild(btn);
    });
  }

  startPerQTimer();
}

function startPerQTimer() {
  clearInterval(state.perQInterval);
  const total = PER_Q_TIME;
  state.perQTimeLeft = total;

  const bar = el('per-q-bar');
  bar.style.width = '100%';
  bar.className = 'per-q-bar';

  state.perQInterval = setInterval(() => {
    if (state.gameOver) return;
    state.perQTimeLeft -= 0.1;
    const pct = Math.max(0, (state.perQTimeLeft / total) * 100);
    bar.style.width = pct + '%';
    if (pct <= 40) bar.classList.add('low');
    if (state.perQTimeLeft <= 0) {
      clearInterval(state.perQInterval);
      if (!state.isAnswered) onTimeout(state.currentQ);
    }
  }, 100);
}

// ─── answer logic ─────────────────────────────────────

function pick(idx, q) {
  if (state.isAnswered || state.gameOver) return;
  state.isAnswered = true;
  clearInterval(state.perQInterval);
  state.answered++;

  const btns = document.querySelectorAll('.option-btn');
  btns.forEach(b => b.disabled = true);
  btns[q.answer].classList.add('reveal');

  const isCorrect = idx === q.answer;
  if (!isCorrect) btns[idx].classList.add('wrong');

  if (isCorrect) {
    state.correct++;
    const pts = Math.max(10, Math.round(100 * state.perQTimeLeft / PER_Q_TIME));
    state.score += pts;
    el('score-display').textContent = state.score;
    floatScore('+' + pts);
    sounds.correct();
  } else {
    sounds.wrong();
    loseHeart();
    if (state.hearts <= 0) {
      showExplanation(q);
      state.nextTimeout = setTimeout(() => endGame('hearts'), 2000);
      return;
    }
  }

  showExplanation(q);
  state.nextTimeout = setTimeout(() => loadQuestion(), 2000);
}

function submitErrorChar() {
  const q = state.currentQ;
  if (state.isAnswered || state.gameOver) return;

  state.isAnswered = true;
  clearInterval(state.perQInterval);
  state.answered++;
  el('char-confirm-btn').disabled = true;

  const errorSet = new Set(q.errors);
  const selected = state.selectedTiles;
  const isCorrect =
    selected.size === errorSet.size &&
    [...selected].every(i => errorSet.has(i));

  document.querySelectorAll('.char-tile').forEach(tile => {
    const i = parseInt(tile.dataset.idx);
    tile.disabled = true;
    if (errorSet.has(i) && selected.has(i))   tile.classList.add('tile-correct');
    else if (!errorSet.has(i) && selected.has(i)) { tile.classList.remove('selected'); tile.classList.add('tile-wrong'); }
    else if (errorSet.has(i) && !selected.has(i)) tile.classList.add('tile-missed');
  });

  if (isCorrect) {
    state.correct++;
    const pts = Math.max(10, Math.round(100 * state.perQTimeLeft / PER_Q_TIME));
    state.score += pts;
    el('score-display').textContent = state.score;
    floatScore('+' + pts);
    sounds.correct();
  } else {
    sounds.wrong();
    loseHeart();
    if (state.hearts <= 0) {
      showExplanation(q);
      state.nextTimeout = setTimeout(() => endGame('hearts'), 2000);
      return;
    }
  }

  showExplanation(q);
  state.nextTimeout = setTimeout(() => loadQuestion(), 2000);
}

function submitHandwrite() {
  const q = state.currentQ;
  if (state.isAnswered || state.gameOver) return;

  const inp = el('handwrite-input');
  const val = inp.value.trim();
  if (!val) return;

  state.isAnswered = true;
  clearInterval(state.perQInterval);
  state.answered++;

  inp.disabled = true;
  el('handwrite-submit').disabled = true;

  const isCorrect = val === q.answer;

  if (isCorrect) {
    inp.classList.add('reveal');
    state.correct++;
    const pts = Math.max(10, Math.round(100 * state.perQTimeLeft / PER_Q_TIME));
    state.score += pts;
    el('score-display').textContent = state.score;
    floatScore('+' + pts);
    sounds.correct();
  } else {
    inp.classList.add('wrong');
    sounds.wrong();
    loseHeart();
    if (state.hearts <= 0) {
      showExplanation(q);
      state.nextTimeout = setTimeout(() => endGame('hearts'), 2000);
      return;
    }
  }

  showExplanation(q);
  state.nextTimeout = setTimeout(() => loadQuestion(), 2000);
}

function onTimeout(q) {
  if (state.isAnswered || state.gameOver) return;
  state.isAnswered = true;
  state.answered++;

  if (q.type === 'handwrite') {
    const inp = el('handwrite-input');
    inp.disabled = true;
    el('handwrite-submit').disabled = true;
    inp.classList.add('wrong');
  } else if (q.type === 'errorchar') {
    el('char-confirm-btn').disabled = true;
    const errorSet = new Set(q.errors);
    document.querySelectorAll('.char-tile').forEach(tile => {
      tile.disabled = true;
      if (errorSet.has(parseInt(tile.dataset.idx))) tile.classList.add('tile-missed');
    });
  } else {
    const btns = document.querySelectorAll('.option-btn');
    btns.forEach(b => b.disabled = true);
    btns[q.answer].classList.add('reveal');
  }

  sounds.qTimeout();
  loseHeart();
  showExplanation(q);

  if (state.hearts <= 0) {
    state.nextTimeout = setTimeout(() => endGame('hearts'), 2000);
    return;
  }
  state.nextTimeout = setTimeout(() => loadQuestion(), 2000);
}

function loseHeart() {
  state.hearts = Math.max(0, state.hearts - 1);
  el('hearts-display').textContent = heartDisplay(state.hearts, state.maxHearts);
}

function showExplanation(q) {
  let correctAnswer;
  if (q.type === 'handwrite') {
    correctAnswer = q.answer;
  } else if (q.type === 'errorchar') {
    correctAnswer = q.errors.map((idx, j) => `「${q.sentence[idx]}」→「${q.corrections[j]}」`).join('、');
  } else {
    correctAnswer = q.options[q.answer];
  }
  el('answer-display').textContent = correctAnswer;
  el('explanation-text').textContent = q.explanation;
  el('explanation').style.display = 'block';
}

function floatScore(text) {
  const node = document.createElement('div');
  node.className = 'float-score';
  node.textContent = text;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 900);
}

// ─── leaderboard ──────────────────────────────────────

const LB_KEY = '字音字形_scores';
const RANK_MEDAL = ['🥇', '🥈', '🥉'];

function loadScores() {
  try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; }
  catch { return []; }
}

function saveScore(entry) {
  const scores = loadScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  localStorage.setItem(LB_KEY, JSON.stringify(scores.slice(0, 10)));
}

function isNewRecord(score) {
  const prev = loadScores();
  return prev.length === 0 || score > prev[0].score;
}

function renderLeaderboard() {
  const scores = loadScores();
  const list  = el('lb-list');
  const empty = el('lb-empty');

  if (scores.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  list.innerHTML = scores.map((s, i) => {
    const rank = i < 3 ? RANK_MEDAL[i] : `<span class="rank-num">${i + 1}</span>`;
    const acc  = s.accuracy != null ? s.accuracy + '%' : '-';
    const date = s.date || '';
    return `
      <div class="lb-row ${i === 0 ? 'lb-top' : ''}">
        <div class="lb-rank">${rank}</div>
        <div class="lb-score">${s.score}<span class="lb-unit">分</span></div>
        <div class="lb-meta">
          <span class="lb-correct">答對 ${s.correct ?? '-'} 題</span>
          <span class="lb-acc">正確率 ${acc}</span>
          <span class="lb-date">${date}</span>
        </div>
      </div>`;
  }).join('');
}

// ─── end ──────────────────────────────────────────────

function endGame(reason) {
  if (state.gameOver) return;
  state.gameOver = true;
  clearInterval(state.globalInterval);
  clearInterval(state.perQInterval);
  el('end-icon').textContent  = reason === 'timeout' ? '⏰' : '💔';
  el('end-title').textContent = reason === 'timeout' ? '時間到！' : '挑戰失敗';
  el('final-score').textContent = state.score;
  el('stat-correct').textContent = state.correct;
  el('stat-total').textContent   = state.answered;
  const acc = state.answered
    ? Math.round(state.correct / state.answered * 100)
    : 0;
  el('stat-acc').textContent = acc + '%';

  const isRecord = isNewRecord(state.score);
  const today = new Date().toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
  saveScore({ score: state.score, correct: state.correct, answered: state.answered, accuracy: acc, date: today });

  if (isRecord && state.score > 0) {
    el('new-record').style.display = 'block';
    sounds.newRecord();
  } else {
    el('new-record').style.display = 'none';
    reason === 'timeout' ? sounds.timesUp() : sounds.gameOver();
  }

  showScreen('screen-end');
}

// ─── event wiring ─────────────────────────────────────

el('start-btn').addEventListener('click', () => { initState(); startGame(); });
el('replay-btn').addEventListener('click', () => { initState(); startGame(); });
el('home-btn').addEventListener('click', () => { showScreen('screen-start'); });

el('lb-open-btn').addEventListener('click', () => { renderLeaderboard(); showScreen('screen-lb'); });
el('end-lb-btn').addEventListener('click',  () => { renderLeaderboard(); showScreen('screen-lb'); });
el('lb-back-btn').addEventListener('click', () => { showScreen('screen-start'); });

el('lb-clear-btn').addEventListener('click', () => {
  if (confirm('確定要清除所有排行榜紀錄嗎？')) {
    localStorage.removeItem(LB_KEY);
    renderLeaderboard();
  }
});

el('handwrite-submit').addEventListener('click', submitHandwrite);
el('handwrite-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitHandwrite();
});

el('char-confirm-btn').addEventListener('click', submitErrorChar);
