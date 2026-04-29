const ASN = (() => {
  // ---- ELEMENTS ----
  const menuEl   = document.getElementById('asn-menu');
  const overEl   = document.getElementById('asn-over');
  const hudEl    = document.getElementById('asn-hud');
  const canvas   = document.getElementById('asn-canvas');
  const ctx      = canvas.getContext('2d');
  const starCanvas = document.getElementById('star-canvas');
  const starCtx  = starCanvas.getContext('2d');
  const toastEl  = document.getElementById('asn-toast');
  const bannerEl = document.getElementById('event-banner');

  const W = 420, H = 640;
  canvas.width = W;
  canvas.height = H;

  // ---- BEST SCORE ----
  let bestInf = +(localStorage.getItem('asnBest2') || 0);
  document.getElementById('best-display').textContent = 'BEST ∞ — ' + bestInf;

  // ---- STATE ----
  let mode, running, score, timeScore, startTime;
  let player, obstacles, particles, apples, shields;
  let shieldActive, shieldTimer, lives, livesMax;
  let gameStarted, startDelay;
  let raf, lastTs = 0;
  let mx = W / 2, my = H / 2;
  let trail = [];
  let invincible = 0, screenShake = 0;
  let appleCount = 0, avoided = 0, eventsSurvived = 0;
  let spawnIntervals = [];

  // ---- EVENT STATE ----
  let currentEvent = null;
  let eventTimer   = 0;
  let nextEventScore = 0;

  let gravityDir    = { x: 0, y: 1 };
  let invertControls = false;
  let darkMode      = false;
  let slowMode      = false;
  let magnetActive  = false;
  let ghostMode     = false;
  let ghostTimer    = 0;
  let rainMode      = false;
  let spiralMode    = false;
  let spiralAngle   = 0;

  let blackholes  = [];
  let laserLines  = [];
  let laserTimer  = 0;
  let freezeZones = [];
  let clonePlayer = null;
  let cloneTimer  = 0;

  // ---- MODE CONFIG ----
  const MODES = {
    easy:     { speed: 1.0, lives: 3, sRate: 420, enemies: 2 },
    medium:   { speed: 1.3, lives: 2, sRate: 360, enemies: 3 },
    hard:     { speed: 1.7, lives: 1, sRate: 300, enemies: 3 },
    infinite: { speed: 1.0, lives: 2, sRate: 380, enemies: 2 },
  };

  // ---- EVENTS DEFINITION ----
  const EVENTS = [
    {
      id: 'gravity',
      name: '⬇ GRAVITÉ INVERSÉE',
      sub: 'Les ennemis remontent !',
      color: '#cc44ff',
      duration: 300,
      onStart() { gravityDir = { x: 0, y: -1 }; obstacles.forEach(o => o.vy *= -1); },
      onEnd()   { gravityDir = { x: 0, y: 1 }; }
    },
    {
      id: 'mirror',
      name: '↔ MIROIR',
      sub: 'Vos contrôles sont inversés !',
      color: '#ff4488',
      duration: 280,
      onStart() { invertControls = true; },
      onEnd()   { invertControls = false; }
    },
    {
      id: 'dark',
      name: '🌑 OBSCURITÉ',
      sub: 'Survivez dans le noir...',
      color: '#333366',
      duration: 320,
      onStart() { darkMode = true; },
      onEnd()   { darkMode = false; }
    },
    {
      id: 'blackhole',
      name: '🌀 TROU NOIR',
      sub: "Attention à l'attraction !",
      color: '#9900ff',
      duration: 350,
      onStart() {
        blackholes = [];
        for (let i = 0; i < 2; i++) {
          blackholes.push({
            x: 80 + Math.random() * (W - 160),
            y: 80 + Math.random() * (H - 280),
            r: 22, pulse: 0
          });
        }
      },
      onEnd() { blackholes = []; }
    },
    {
      id: 'laser',
      name: '⚡ PLUIE DE LASERS',
      sub: 'Esquivez les rayons !',
      color: '#ff2200',
      duration: 300,
      onStart() { laserLines = []; laserTimer = 0; },
      onEnd()   { laserLines = []; }
    },
    {
      id: 'slow',
      name: '🕐 SLOW MOTION',
      sub: 'Tout ralentit... sauf les nouveaux !',
      color: '#00ccff',
      duration: 340,
      onStart() { slowMode = true;  obstacles.forEach(o => { o.vx *= 0.35; o.vy *= 0.35; }); },
      onEnd()   { slowMode = false; obstacles.forEach(o => { o.vx *= 2.5;  o.vy *= 2.5;  }); }
    },
    {
      id: 'magnet',
      name: '🧲 ATTRACTION',
      sub: 'Les ennemis vous cherchent !',
      color: '#ffaa00',
      duration: 260,
      onStart() { magnetActive = true; },
      onEnd()   { magnetActive = false; }
    },
    {
      id: 'ghost',
      name: '👻 MODE FANTÔME',
      sub: 'Vous êtes invincible... brièvement !',
      color: '#aaffee',
      duration: 180,
      onStart() { ghostMode = true; invincible = 180; },
      onEnd()   { ghostMode = false; }
    },
    {
      id: 'rain',
      name: '☄ PLUIE METEORE',
      sub: "Vague massive d'ennemis !",
      color: '#ff6600',
      duration: 240,
      onStart() { rainMode = true; },
      onEnd()   { rainMode = false; }
    },
    {
      id: 'clone',
      name: '👥 CLONE ENNEMI',
      sub: 'Un fantôme vous traque !',
      color: '#ff00aa',
      duration: 320,
      onStart() {
        clonePlayer = { x: Math.random() * W, y: Math.random() * H, r: 12 };
        cloneTimer = 320;
      },
      onEnd() { clonePlayer = null; }
    },
    {
      id: 'freeze',
      name: '❄ ZONES GELÉES',
      sub: 'Évitez les zones de glace !',
      color: '#88eeff',
      duration: 300,
      onStart() {
        freezeZones = [];
        for (let i = 0; i < 3; i++) {
          freezeZones.push({ x: 40 + Math.random() * (W - 80), y: 40 + Math.random() * (H - 80), r: 45, pulse: 0 });
        }
      },
      onEnd() { freezeZones = []; }
    },
    {
      id: 'spiral',
      name: '🌀 SPIRAL STORM',
      sub: 'Les ennemis orbitent !',
      color: '#ff44ff',
      duration: 360,
      onStart() { spiralMode = true; spiralAngle = 0; },
      onEnd()   { spiralMode = false; }
    },
  ];

  // ---- STARS ----
  let stars = [];

  function initStars() {
    stars = [];
    const sw = window.innerWidth, sh = window.innerHeight;
    starCanvas.width  = sw;
    starCanvas.height = sh;
    for (let i = 0; i < 130; i++) {
      stars.push({ x: Math.random() * sw, y: Math.random() * sh, r: Math.random() * 1.3 + 0.2, a: Math.random() });
    }
    drawStars();
  }

  function drawStars() {
    starCtx.clearRect(0, 0, starCanvas.width, starCanvas.height);
    for (const s of stars) {
      starCtx.globalAlpha = s.a * 0.7;
      starCtx.fillStyle = '#ffffff';
      starCtx.beginPath();
      starCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      starCtx.fill();
    }
    starCtx.globalAlpha = 1;
  }

  // ---- UTILS ----
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function toast(msg, color = '#00f5ff') {
    toastEl.textContent = msg;
    toastEl.style.background = color + '22';
    toastEl.style.border = '1px solid ' + color + '66';
    toastEl.style.color = color;
    toastEl.style.opacity = '1';
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.style.opacity = '0', 2000);
  }

  function showBanner(ev) {
    bannerEl.style.display = 'flex';
    const title = document.getElementById('ev-title');
    title.textContent = ev.name;
    title.style.color = ev.color;
    title.style.textShadow = '0 0 30px ' + ev.color;
    title.style.animation = 'none';
    title.offsetHeight; // reflow
    title.style.animation = 'bannerIn 0.4s ease';
    document.getElementById('ev-sub').textContent = ev.sub;
    setTimeout(() => bannerEl.style.display = 'none', 2200);
  }

  function spawnParticle(x, y, color, count = 6, spd = 3) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const s   = Math.random() * spd + 1;
      particles.push({ x, y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, r: Math.random() * 3 + 1, color, life: 1, decay: Math.random() * 0.04 + 0.02 });
    }
  }

  function updateLivesUI() {
    const el = document.getElementById('hud-lives');
    el.innerHTML = '';
    for (let i = 0; i < livesMax; i++) {
      const d = document.createElement('div');
      d.className = 'life-dot' + (i >= lives ? ' lost' : '');
      el.appendChild(d);
    }
  }

  // ---- DAMAGE ----
  function takeDamage() {
    if (ghostMode || invincible > 0) return;
    if (shieldActive) {
      shieldActive = false;
      document.getElementById('hud-shield').style.display = 'none';
      spawnParticle(player.x, player.y, '#ff8800', 12, 5);
      screenShake = 15;
      invincible = 40;
      toast('SHIELD BRISÉ !', '#ff8800');
      return;
    }
    lives--;
    screenShake = 22;
    invincible = 70;
    spawnParticle(player.x, player.y, '#ff4444', 14, 6);
    updateLivesUI();
    if (lives <= 0) endGame();
    else toast('VIE PERDUE ! ' + lives + ' restante(s)', '#ff4444');
  }

  // ---- SPEED ----
  function getSpeed() {
    if (mode === 'infinite') return 1 + Math.min(score, 10000) / 10000 * 1.6;
    return MODES[mode].speed;
  }

  // ---- EVENTS ----
  function triggerEvent() {
    if (currentEvent) return;
    const pool = EVENTS.filter(e => !currentEvent || e.id !== currentEvent.id);
    const ev = pool[Math.floor(Math.random() * pool.length)];
    currentEvent = ev;
    eventTimer   = ev.duration;
    ev.onStart();
    showBanner(ev);
    const hudEv = document.getElementById('hud-event');
    hudEv.style.display = 'block';
    hudEv.textContent   = ev.name;
    hudEv.style.color   = ev.color;
    eventsSurvived++;
    const gap = mode === 'easy' ? 900 : mode === 'medium' ? 600 : mode === 'hard' ? 400 : 500;
    nextEventScore = score + gap + Math.floor(Math.random() * 300);
  }

  function endEvent() {
    if (!currentEvent) return;
    currentEvent.onEnd();
    currentEvent = null;
    eventTimer   = 0;
    document.getElementById('hud-event').style.display = 'none';
    toast('EVENT TERMINÉ !', '#44ff88');
  }

  // ---- SPAWNERS ----
  function clearSpawners() {
    spawnIntervals.forEach(clearInterval);
    spawnIntervals = [];
  }

  function initSpawners() {
    clearSpawners();
    const cfg = MODES[mode];

    // Red enemies (all 4 edges)
    spawnIntervals.push(setInterval(() => {
      if (!gameStarted || !running) return;
      const sm = getSpeed();
      let count = cfg.enemies + (mode === 'infinite' ? Math.floor(score / 2500) : 0);
      if (rainMode) count += 4;
      count = Math.max(1, count);
      for (let i = 0; i < count; i++) {
        const edge = Math.floor(Math.random() * 4);
        let x, y, vx, vy;
        const spd = (2.5 + Math.random() * 3) * (slowMode ? 0.4 : 1) * sm;
        if (edge === 0)      { x = Math.random() * W; y = -20;    vx = (Math.random() - 0.5); vy = spd; }
        else if (edge === 1) { x = Math.random() * W; y = H + 20; vx = (Math.random() - 0.5); vy = -spd; }
        else if (edge === 2) { x = -20;    y = Math.random() * H; vx = spd;  vy = (Math.random() - 0.5); }
        else                 { x = W + 20; y = Math.random() * H; vx = -spd; vy = (Math.random() - 0.5); }
        obstacles.push({ x, y, vx, vy, r: 12, type: 'red', alpha: 1 });
      }
    }, cfg.sRate));

    // Yellow sidescrollers
    spawnIntervals.push(setInterval(() => {
      if (!gameStarted || !running) return;
      const sm = getSpeed();
      const left = Math.random() < 0.5;
      const spd  = 4 * sm * (slowMode ? 0.4 : 1);
      obstacles.push({ x: left ? -30 : W + 30, y: Math.random() * H, vx: left ? spd : -spd, vy: (Math.random() - 0.5) * 2, r: 10, type: 'yellow', alpha: 1 });
    }, 2800));

    // Apple bonus
    spawnIntervals.push(setInterval(() => {
      if (!gameStarted || !running) return;
      if (apples.length < 1 && Math.random() < 0.7) {
        apples.push({ x: 30 + Math.random() * (W - 60), y: 30 + Math.random() * (H - 80), r: 12, pulse: 0 });
      }
    }, 4500));

    // Shield bonus
    spawnIntervals.push(setInterval(() => {
      if (!gameStarted || !running || shieldActive) return;
      if (shields.length < 1 && score > 150 && Math.random() < 0.4) {
        shields.push({ x: 30 + Math.random() * (W - 60), y: 30 + Math.random() * (H - 60), r: 13, pulse: 0 });
      }
    }, 7000));
  }

  // ---- INPUT ----
  canvas.addEventListener('mousemove', e => {
    const r  = canvas.getBoundingClientRect();
    const sc = W / r.width;
    let nx = (e.clientX - r.left) * sc;
    let ny = (e.clientY - r.top)  * sc;
    mx = invertControls ? W - nx : nx;
    my = invertControls ? H - ny : ny;
  });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const r  = canvas.getBoundingClientRect();
    const sc = W / r.width;
    let nx = (e.touches[0].clientX - r.left) * sc;
    let ny = (e.touches[0].clientY - r.top)  * sc;
    mx = invertControls ? W - nx : nx;
    my = invertControls ? H - ny : ny;
  }, { passive: false });

  // ---- RESIZE ----
  function resize() {
    const maxW = Math.min(window.innerWidth - 20, 480);
    const sc   = maxW / W;
    canvas.style.width  = (W * sc) + 'px';
    canvas.style.height = (H * sc) + 'px';
    initStars();
  }

  // ---- GAME LOOP ----
  function loop(ts) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min((ts - lastTs) / 16.67, 3);
    lastTs = ts;

    // countdown
    if (startDelay > 0) { startDelay--; if (startDelay === 0) gameStarted = true; }

    // event trigger
    if (gameStarted && !currentEvent && score >= nextEventScore) triggerEvent();
    if (currentEvent) {
      eventTimer -= dt;
      if (eventTimer <= 0) endEvent();
    }

    // laser tick
    if (currentEvent && currentEvent.id === 'laser') {
      laserTimer -= dt;
      if (laserTimer <= 0) {
        laserTimer = 55 + Math.random() * 30;
        const horiz = Math.random() < 0.5;
        laserLines.push({ horiz, pos: horiz ? Math.random() * H : Math.random() * W, warn: 30, life: 80 });
      }
    }

    // spiral tick
    if (spiralMode) spiralAngle += 0.04 * dt;

    // clone tick
    if (clonePlayer) {
      cloneTimer -= dt;
      const dx = player.x - clonePlayer.x, dy = player.y - clonePlayer.y;
      const d  = Math.hypot(dx, dy) || 1;
      clonePlayer.x += dx / d * 1.4 * dt;
      clonePlayer.y += dy / d * 1.4 * dt;
      if (cloneTimer <= 0 || dist(player, clonePlayer) < player.r + clonePlayer.r) {
        if (cloneTimer > 0) takeDamage();
        clonePlayer = null;
      }
    }

    // ---- DRAW ----
    ctx.save();
    if (screenShake > 0) {
      ctx.translate((Math.random() - 0.5) * screenShake * 0.4, (Math.random() - 0.5) * screenShake * 0.4);
      screenShake = Math.max(0, screenShake - 1.5);
    }
    ctx.clearRect(-20, -20, W + 40, H + 40);

    // Background
    if (darkMode) {
      ctx.fillStyle = '#000005';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#ffffff05';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      // dark vignette around player
      const grd = ctx.createRadialGradient(player.x, player.y, 20, player.x, player.y, 115);
      grd.addColorStop(0, 'rgba(0,5,20,0)');
      grd.addColorStop(1, 'rgba(0,5,20,0.97)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.strokeStyle = '#ffffff08';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    }

    // Freeze zones
    for (const fz of freezeZones) {
      fz.pulse = (fz.pulse || 0) + 0.05;
      ctx.beginPath();
      ctx.arc(fz.x, fz.y, fz.r + Math.sin(fz.pulse) * 4, 0, Math.PI * 2);
      ctx.fillStyle   = 'rgba(100,220,255,0.12)';
      ctx.strokeStyle = '#88eeff55';
      ctx.lineWidth   = 2;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#88eeffaa';
      ctx.font = '18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('❄', fz.x, fz.y + 7);
    }

    // Blackholes
    for (const bh of blackholes) {
      bh.pulse = (bh.pulse || 0) + 0.07;
      const pr = bh.r + Math.sin(bh.pulse) * 3;
      const grd = ctx.createRadialGradient(bh.x, bh.y, 2, bh.x, bh.y, pr + 20);
      grd.addColorStop(0,   'rgba(80,0,180,0.8)');
      grd.addColorStop(0.6, 'rgba(50,0,120,0.4)');
      grd.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(bh.x, bh.y, pr + 20, 0, Math.PI * 2);
      ctx.fillStyle = grd; ctx.fill();
      ctx.beginPath(); ctx.arc(bh.x, bh.y, pr, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0020'; ctx.fill();
      ctx.strokeStyle = '#9900ff'; ctx.lineWidth = 2; ctx.stroke();
      // attract obstacles
      for (const o of obstacles) {
        const dx = bh.x - o.x, dy = bh.y - o.y, d = Math.hypot(dx, dy) || 1;
        if (d < 150) { o.vx += dx / d * 0.2; o.vy += dy / d * 0.2; }
      }
      // attract player slightly
      const pdx = bh.x - player.x, pdy = bh.y - player.y, pd = Math.hypot(pdx, pdy) || 1;
      if (pd < 120) { mx += pdx / pd * 0.5; my += pdy / pd * 0.5; }
      if (pd < pr + player.r + 2) takeDamage();
    }

    // Laser lines
    for (let i = laserLines.length - 1; i >= 0; i--) {
      const l = laserLines[i];
      l.life -= dt;
      if (l.life <= 0) { laserLines.splice(i, 1); continue; }
      if (l.warn > 0) {
        l.warn -= dt;
        ctx.strokeStyle = 'rgba(255,80,0,0.3)';
        ctx.lineWidth   = 2;
        ctx.setLineDash([8, 8]);
        ctx.lineDashOffset = Date.now() * 0.05;
        ctx.beginPath();
        if (l.horiz) { ctx.moveTo(0, l.pos); ctx.lineTo(W, l.pos); }
        else          { ctx.moveTo(l.pos, 0); ctx.lineTo(l.pos, H); }
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle  = '#ff3300';
        ctx.lineWidth    = 6;
        ctx.shadowColor  = '#ff3300';
        ctx.shadowBlur   = 15;
        ctx.beginPath();
        if (l.horiz) { ctx.moveTo(0, l.pos); ctx.lineTo(W, l.pos); }
        else          { ctx.moveTo(l.pos, 0); ctx.lineTo(l.pos, H); }
        ctx.stroke();
        ctx.shadowBlur = 0;
        if (invincible <= 0) {
          if (l.horiz  && Math.abs(player.y - l.pos) < player.r + 4) takeDamage();
          if (!l.horiz && Math.abs(player.x - l.pos) < player.r + 4) takeDamage();
        }
      }
    }

    // Move player (smooth lerp)
    player.x += (mx - player.x) * 0.18;
    player.y += (my - player.y) * 0.18;
    player.x = Math.max(player.r, Math.min(W - player.r, player.x));
    player.y = Math.max(player.r, Math.min(H - player.r, player.y));

    // Freeze zone: slow player extra
    for (const fz of freezeZones) {
      if (dist(player, fz) < fz.r) {
        player.x += (mx - player.x) * 0.04;
        player.y += (my - player.y) * 0.04;
      }
    }

    // Trail
    trail.unshift({ x: player.x, y: player.y });
    if (trail.length > 20) trail.pop();
    for (let i = 1; i < trail.length; i++) {
      const a = 1 - i / trail.length;
      ctx.globalAlpha = a * 0.55;
      ctx.beginPath();
      ctx.arc(trail[i].x, trail[i].y, player.r * (1 - i / trail.length * 0.65), 0, Math.PI * 2);
      ctx.fillStyle = ghostMode ? '#aaffee' : shieldActive ? '#ff8800' : '#00f5ff';
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Player
    const pc = ghostMode ? 'rgba(170,255,238,0.5)' : shieldActive ? '#ff8800' : '#00f5ff';
    if (!(invincible > 0 && Math.floor(invincible / 5) % 2 === 0)) {
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      ctx.fillStyle   = pc;
      ctx.shadowColor = pc;
      ctx.shadowBlur  = 18;
      ctx.fill();
      ctx.shadowBlur  = 0;
    }
    if (shieldActive) {
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r + 8 + Math.sin(Date.now() * 0.004) * 3, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff880088';
      ctx.lineWidth   = 2;
      ctx.stroke();
    }

    // Score
    if (gameStarted) { timeScore += dt * 0.8; score = Math.floor(timeScore); }
    document.getElementById('hud-score').textContent = score;
    if (invincible > 0) invincible -= dt;

    // Obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];

      // Magnet
      if (magnetActive) {
        const dx = player.x - o.x, dy = player.y - o.y, d = Math.hypot(dx, dy) || 1;
        if (d < 200) { o.vx += dx / d * 0.15; o.vy += dy / d * 0.15; }
      }

      // Spiral
      if (spiralMode) {
        const cx = W / 2, cy = H / 2;
        const dx = o.x - cx, dy = o.y - cy;
        const ang = Math.atan2(dy, dx) + 0.03;
        const rd  = Math.hypot(dx, dy);
        o.x = cx + Math.cos(ang) * rd;
        o.y = cy + Math.sin(ang) * rd;
        o.vx = Math.cos(ang) * 2;
        o.vy = Math.sin(ang) * 2;
      }

      o.x += o.vx * dt;
      o.y += o.vy * dt;

      if (o.x < -80 || o.x > W + 80 || o.y < -80 || o.y > H + 80) {
        obstacles.splice(i, 1);
        avoided++;
        continue;
      }

      const c = o.type === 'red' ? '#ff3366' : '#ffcc00';
      ctx.beginPath();
      if (o.type === 'red') {
        // star shape
        const s = o.r;
        ctx.moveTo(o.x, o.y - s);
        for (let j = 0; j < 5; j++) {
          const a1 = (j * 4 * Math.PI / 5) - Math.PI / 2;
          const a2 = ((j * 4 + 2) * Math.PI / 5) - Math.PI / 2;
          ctx.lineTo(o.x + Math.cos(a1) * s, o.y + Math.sin(a1) * s);
          ctx.lineTo(o.x + Math.cos(a2) * s * 0.4, o.y + Math.sin(a2) * s * 0.4);
        }
        ctx.closePath();
      } else {
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      }
      ctx.fillStyle   = c;
      ctx.shadowColor = c;
      ctx.shadowBlur  = 10;
      ctx.fill();
      ctx.shadowBlur  = 0;

      if (invincible <= 0 && gameStarted && dist(player, o) < player.r + o.r - 4) {
        obstacles.splice(i, 1);
        takeDamage();
      }
    }

    // Clone
    if (clonePlayer) {
      ctx.beginPath();
      ctx.arc(clonePlayer.x, clonePlayer.y, 12, 0, Math.PI * 2);
      ctx.fillStyle   = 'rgba(255,0,170,0.4)';
      ctx.strokeStyle = '#ff00aa';
      ctx.lineWidth   = 2;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff00aa';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CLONE', clonePlayer.x, clonePlayer.y - 16);
    }

    // Apples
    for (let i = apples.length - 1; i >= 0; i--) {
      const a = apples[i];
      a.pulse = (a.pulse || 0) + 0.08;
      const pr = a.r + Math.sin(a.pulse) * 2.5;
      ctx.beginPath();
      ctx.arc(a.x, a.y, pr, 0, Math.PI * 2);
      ctx.fillStyle   = '#44ff88';
      ctx.shadowColor = '#44ff88';
      ctx.shadowBlur  = 12;
      ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('+150', a.x, a.y - pr - 4);
      if (dist(player, a) < player.r + a.r) {
        apples.splice(i, 1);
        appleCount++;
        score     += 150;
        timeScore += 150;
        spawnParticle(a.x, a.y, '#44ff88', 10, 4);
        toast('+150 PTS !', '#44ff88');
      }
    }

    // Shields
    for (let i = shields.length - 1; i >= 0; i--) {
      const s = shields[i];
      s.pulse = (s.pulse || 0) + 0.06;
      const pr = s.r + Math.sin(s.pulse) * 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, pr, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth   = 2;
      ctx.shadowColor = '#ff8800';
      ctx.shadowBlur  = 10;
      ctx.stroke();
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = '#ff880033';
      ctx.fill();
      ctx.fillStyle   = '#ff8800';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('🛡', s.x, s.y + 5);
      if (dist(player, s) < player.r + s.r + 5) {
        shields.splice(i, 1);
        shieldActive = true;
        shieldTimer  = 300;
        document.getElementById('hud-shield').style.display = 'block';
        spawnParticle(s.x, s.y, '#ff8800', 10, 3);
        toast('SHIELD ACTIF !', '#ff8800');
      }
    }

    if (shieldActive) {
      shieldTimer -= dt;
      if (shieldTimer <= 0) {
        shieldActive = false;
        document.getElementById('hud-shield').style.display = 'none';
      }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.06 * dt; p.life -= p.decay * dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Countdown
    if (!gameStarted) {
      const c = Math.ceil(startDelay / 22);
      ctx.fillStyle = '#ffffff88';
      ctx.font = 'bold 80px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(c > 0 ? c : 'GO!', W / 2, H / 2 + 30);
    }

    // Event timer bar (bottom)
    if (currentEvent) {
      const pct = eventTimer / currentEvent.duration;
      ctx.fillStyle = '#ffffff15';
      ctx.fillRect(0, H - 5, W, 5);
      ctx.fillStyle = currentEvent.color;
      ctx.fillRect(0, H - 5, W * pct, 5);
    }

    ctx.restore();
  }

  // ---- RESET STATE ----
  function resetEventState() {
    if (currentEvent) { currentEvent.onEnd(); currentEvent = null; }
    eventTimer      = 0;
    gravityDir      = { x: 0, y: 1 };
    invertControls  = false;
    darkMode        = false;
    slowMode        = false;
    magnetActive    = false;
    ghostMode       = false;
    rainMode        = false;
    spiralMode      = false;
    blackholes      = [];
    laserLines      = [];
    freezeZones     = [];
    clonePlayer     = null;
    cloneTimer      = 0;
  }

  // ---- START ----
  function start(m) {
    mode = m;
    const cfg = MODES[m];
    score = 0; timeScore = 0; appleCount = 0; avoided = 0; eventsSurvived = 0;
    running = true; gameStarted = false; startDelay = 70;
    player = { x: W / 2, y: H / 2, r: 12 };
    obstacles = []; particles = []; apples = []; shields = [];
    shieldActive = false; shieldTimer = 0;
    lives = cfg.lives; livesMax = cfg.lives;
    invincible = 0; screenShake = 0; trail = [];
    nextEventScore = mode === 'easy' ? 900 : 500;
    startTime = Date.now(); mx = W / 2; my = H / 2;

    resetEventState();

    menuEl.style.display = 'none';
    overEl.style.display = 'none';
    canvas.style.display = 'block';
    hudEl.style.display  = 'flex';
    document.getElementById('hud-shield').style.display = 'none';
    document.getElementById('hud-event').style.display  = 'none';
    bannerEl.style.display = 'none';

    updateLivesUI();
    initSpawners();
    cancelAnimationFrame(raf);
    lastTs = 0;
    raf = requestAnimationFrame(loop);
    toast('SURVIVEZ !', '#00f5ff');
  }

  // ---- GAME OVER ----
  function endGame() {
    running = false;
    clearSpawners();
    resetEventState();

    canvas.style.display = 'none';
    hudEl.style.display  = 'none';
    bannerEl.style.display = 'none';
    overEl.style.display = 'flex';

    document.getElementById('over-score').textContent   = score;
    document.getElementById('stat-time').textContent    = Math.floor((Date.now() - startTime) / 1000) + 's';
    document.getElementById('stat-apples').textContent  = appleCount;
    document.getElementById('stat-events').textContent  = eventsSurvived;
    document.getElementById('stat-avoided').textContent = avoided;

    if (mode === 'infinite' && score > bestInf) {
      bestInf = score;
      localStorage.setItem('asnBest2', bestInf);
      document.getElementById('over-new-best').style.display = 'block';
      document.getElementById('best-display').textContent = 'BEST ∞ — ' + bestInf;
    } else {
      document.getElementById('over-new-best').style.display = 'none';
    }
    document.getElementById('over-best-label').textContent = 'BEST ∞: ' + bestInf;
    document.getElementById('retry-btn').onclick = () => start(mode);
  }

  // ---- SHOW MENU ----
  function showMenu() {
    running = false;
    clearSpawners();
    cancelAnimationFrame(raf);
    resetEventState();

    canvas.style.display   = 'none';
    hudEl.style.display    = 'none';
    overEl.style.display   = 'none';
    bannerEl.style.display = 'none';
    menuEl.style.display   = 'flex';
    document.getElementById('best-display').textContent = 'BEST ∞ — ' + bestInf;
    initStars();
  }

  // ---- INIT ----
  resize();
  window.addEventListener('resize', resize);
  initStars();

  return { start, showMenu };
})();
