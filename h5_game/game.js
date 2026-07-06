const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const W = canvas.width;
const H = canvas.height;
const laneTop = 168;
const ceilingY = 148;
const keyboardY = 668;
const cols = 4;
const cellW = 80;
const cellH = 78;
const gridX = 27.5;
const designStartBricks = [
  { icon: 1, x: 66, y: 184, w: 42, h: 44, hp: 4 },
  { icon: 3, x: 218, y: 154, w: 36, h: 52, hp: 5 },
  { icon: 5, x: 255, y: 256, w: 47, h: 56, hp: 6 },
  { icon: 7, x: 72, y: 272, w: 44, h: 39, hp: 5 },
];

function loadImage(src) {
  const image = new Image();
  const asset = { image, ready: false };
  image.onload = () => {
    asset.ready = true;
  };
  image.src = src;
  return asset;
}

function makeAsset(src, w, h) {
  const asset = loadImage(src);
  asset.w = w;
  asset.h = h;
  return asset;
}

const keyboardAsset = loadImage("./assets/keyboard@2x.png");
const ballAsset = loadImage("./assets/ball-blue@2x.png");
const obstacleAssets = [
  makeAsset("./assets/office-folder@2x.png", 70, 70),
  makeAsset("./assets/office-ppt@2x.png", 58, 76),
  makeAsset("./assets/office-word@2x.png", 58, 76),
  makeAsset("./assets/office-excel@2x.png", 58, 76),
  makeAsset("./assets/office-notebook@2x.png", 64, 78),
  makeAsset("./assets/office-mail@2x.png", 76, 61),
  makeAsset("./assets/office-note@2x.png", 67, 72),
  makeAsset("./assets/office-message@2x.png", 76, 66),
];

let running = false;
let draggingKeyboard = false;
let round = 1;
let score = 0;
let ballsAvailable = 1;
let ballsWaiting = 0;
let launchTimer = 0;
let launchIndex = 0;
let aimAngle = -Math.PI / 2.25;
let pointerX = W / 2;
let speedScale = 4;
let gameOver = false;
let message = "";
let introShown = false;
let clearEffectTimer = 0;
let paused = false;
let showLeaderboard = false;

const keyboard = {
  x: (W - 221) / 2,
  y: keyboardY,
  w: 221,
  h: 81,
};

const HIGH_SCORE_KEY = "redDotCleanHighScores";

function loadHighScores() {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function saveHighScore(value) {
  const list = loadHighScores();
  list.push(value);
  list.sort((a, b) => b - a);
  const top = list.slice(0, 5);
  try {
    localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(top));
  } catch (e) {
    /* ignore storage errors */
  }
  return top;
}

let highScores = loadHighScores();

const balls = [];
let bricks = [];
let bonuses = [];
let particles = [];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function rotateBallVelocity(ball, radians) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const vx = ball.vx;
  const vy = ball.vy;
  ball.vx = vx * cos - vy * sin;
  ball.vy = vx * sin + vy * cos;
}

function addBounceDrift(ball, strength = 0.055) {
  rotateBallVelocity(ball, rand(-strength, strength));
}

function makeObstacleSize(def) {
  const scale = rand(0.56, 0.78);
  return {
    w: Math.round(def.w * scale),
    h: Math.round(def.h * scale),
  };
}

function roundCenterX(col) {
  return gridX + col * cellW + cellW / 2;
}

function paddedRect(item, pad = 6) {
  return {
    x: item.x - pad,
    y: item.y - pad,
    w: item.w + pad * 2,
    h: item.h + pad * 2,
  };
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function resetGame() {
  running = false;
  draggingKeyboard = false;
  round = 1;
  score = 0;
  ballsAvailable = 1;
  ballsWaiting = 0;
  launchTimer = 0;
  launchIndex = 0;
  aimAngle = -Math.PI / 2.25;
  gameOver = false;
  bricks = [];
  bonuses = [];
  balls.length = 0;
  particles = [];
  clearEffectTimer = 0;
  paused = false;
  showLeaderboard = false;
  keyboard.x = (W - keyboard.w) / 2;
  pointerX = keyboard.x + keyboard.w / 2;
  message = introShown ? "" : "拖动键盘瞄准，点击发射清除红点";
  seedDesignLayout();
}

function seedDesignLayout() {
  bricks = designStartBricks.map((brick) => ({
    ...brick,
    col: Math.round((brick.x + brick.w / 2 - gridX - cellW / 2) / cellW),
    maxHp: brick.hp,
    pulse: rand(0, Math.PI * 2),
    hitTick: 0,
    style: 0,
  }));
  const bx = roundCenterX(2);
  let by = keyboardY - 30;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const blocked = bricks.some((brick) => intersects(bonusHitbox(bx, by), paddedRect(brick, 6)));
    if (!blocked) break;
    by -= 22;
  }
  bonuses.push({
    col: 2,
    x: bx,
    y: by,
    r: 10,
    value: 1,
    spin: 0,
  });
}

function bonusHitbox(x, y) {
  return { x: x - 14, y: y - 14, w: 28, h: 28 };
}

function startRound() {
  if (gameOver) {
    resetGame();
    return;
  }
  if (running) return;
  running = true;
  introShown = true;
  ballsWaiting = ballsAvailable;
  launchTimer = 0;
  launchIndex = 0;
  message = "";
}

function endRound() {
  running = false;
  balls.length = 0;
  moveRowsDown();
  if (bricks.some((brick) => brick.y + brick.h >= keyboard.y + 8)) {
    gameOver = true;
    message = "红点到达键盘，游戏结束";
    highScores = saveHighScore(score);
    return;
  }
  round += 1;
  addRow();
  message = "";
}

function finishClearedRound() {
  running = false;
  ballsWaiting = 0;
  balls.length = 0;
  bonuses = [];
  score += 150 + round * 20;
  clearEffectTimer = 72;
  message = "";
  burst(W / 2, laneTop + 90, "#ffffff", 24);
  burst(W / 2, laneTop + 90, "#2f7dff", 26);
  burst(W / 2, laneTop + 90, "#f8d552", 22);
  round += 1;
  addRow();
}

function addRow() {
  const count = clamp(2 + Math.floor(round / 2), 2, cols);
  const used = new Set();
  while (used.size < count) used.add(Math.floor(Math.random() * cols));

  used.forEach((col) => {
    const icon = Math.floor(Math.random() * obstacleAssets.length);
    const def = obstacleAssets[icon];
    const size = makeObstacleSize(def);
    const hp = Math.floor(rand(3 + round * 0.55, 6 + round * 1.1));
    const candidate = {
      col,
      icon,
      w: size.w,
      h: size.h,
      x: roundCenterX(col) - size.w / 2,
      y: laneTop,
      hp,
      maxHp: hp,
      pulse: rand(0, Math.PI * 2),
      hitTick: 0,
      style: Math.floor(Math.random() * 3),
    };

    for (let attempt = 0; attempt < 8; attempt += 1) {
      candidate.x = clamp(roundCenterX(col) - size.w / 2 + rand(-8, 8), 12, W - size.w - 12);
      candidate.y = laneTop + rand(-10, 34);
      const blocked = bricks.some((brick) => intersects(paddedRect(candidate), paddedRect(brick)));
      if (!blocked) break;
    }

    if (!bricks.some((brick) => intersects(paddedRect(candidate), paddedRect(brick)))) {
      bricks.push(candidate);
    }
  });

  if (round > 1 && Math.random() < 0.52) {
    const free = Array.from({ length: cols }, (_, col) => col).filter((col) => !used.has(col));
    const col = free.length ? free[Math.floor(Math.random() * free.length)] : Math.floor(Math.random() * cols);
    const bx = roundCenterX(col);
    let by = laneTop + 26;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const blocked = bricks.some((brick) => intersects(bonusHitbox(bx, by), paddedRect(brick, 6)));
      if (!blocked) break;
      by += 22;
    }
    if (by + 10 < keyboard.y - 16) {
      bonuses.push({
        col,
        x: bx,
        y: by,
        r: 10,
        value: 1,
        spin: 0,
      });
    }
  }
}

function moveRowsDown() {
  bricks.forEach((brick) => {
    brick.y += cellH;
  });
  bonuses.forEach((bonus) => {
    bonus.y += cellH;
  });
  bonuses = bonuses.filter((bonus) => bonus.y + bonus.r < keyboard.y - 16);
}

function spawnBall() {
  const speed = clamp(4.25 + round * 0.05, 4.25, 6.1);
  const spread = (launchIndex - (ballsAvailable - 1) / 2) * 0.017;
  balls.push({
    x: keyboard.x + keyboard.w / 2,
    y: keyboard.y - 7,
    vx: Math.cos(aimAngle + spread) * speed,
    vy: Math.sin(aimAngle + spread) * speed,
    r: 5.4,
    live: true,
  });
  launchIndex += 1;
  ballsWaiting -= 1;
}

function update() {
  if (paused || showLeaderboard) return;
  const physicsSteps = speedScale;
  for (let step = 0; step < physicsSteps; step += 1) {
    if (running && ballsWaiting > 0) {
      launchTimer -= 1;
      if (launchTimer <= 0) {
        spawnBall();
        launchTimer = 5;
      }
    }

    balls.forEach(updateBall);
    balls.forEach((ball) => {
      if (!ball.live) return;
      handleBrickCollisions(ball);
      handleBonusCollisions(ball);
    });

    for (let i = balls.length - 1; i >= 0; i -= 1) {
      if (!balls[i].live) balls.splice(i, 1);
    }

    if (running && bricks.length === 0) {
      finishClearedRound();
      break;
    }
  }

  if (running && ballsWaiting <= 0 && balls.length === 0) endRound();

  bricks.forEach((brick) => {
    brick.hitTick = Math.max(0, brick.hitTick - speedScale);
  });

  particles.forEach((p) => {
    p.x += p.vx * speedScale;
    p.y += p.vy * speedScale;
    p.life -= speedScale;
  });
  particles = particles.filter((p) => p.life > 0);
  clearEffectTimer = Math.max(0, clearEffectTimer - speedScale);
}

function updateBall(ball) {
  ball.x += ball.vx;
  ball.y += ball.vy;

  if (ball.x - ball.r <= 8 || ball.x + ball.r >= W - 8) {
    ball.vx *= -1;
    addBounceDrift(ball, 0.045);
    ball.x = clamp(ball.x, 8 + ball.r, W - 8 - ball.r);
  }
  if (ball.y - ball.r <= ceilingY) {
    ball.vy = Math.abs(ball.vy);
    addBounceDrift(ball, 0.045);
    ball.y = ceilingY + ball.r;
  }

  const keyboardTop = keyboard.y + 8;
  const hitKeyboard =
    ball.vy > 0 &&
    ball.x > keyboard.x + 18 - ball.r &&
    ball.x < keyboard.x + keyboard.w - 18 + ball.r &&
    ball.y + ball.r > keyboardTop &&
    ball.y - ball.r < keyboardTop + 12;

  if (hitKeyboard) {
    const t = (ball.x - (keyboard.x + keyboard.w / 2)) / (keyboard.w / 2);
    const angle = -Math.PI / 2 + clamp(t, -0.92, 0.92) * 0.82;
    const speed = Math.hypot(ball.vx, ball.vy) * 1.006;
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    ball.y = keyboardTop - ball.r - 1;
    burst(ball.x, keyboardTop, "#ffeaa6", 5);
  }

  if (ball.y - ball.r > H + 12) {
    ball.live = false;
  }
}

function handleBrickCollisions(ball) {
  for (const brick of bricks) {
    const nearestX = clamp(ball.x, brick.x + 3, brick.x + brick.w - 3);
    const nearestY = clamp(ball.y, brick.y + 3, brick.y + brick.h - 3);
    const dx = ball.x - nearestX;
    const dy = ball.y - nearestY;
    if (dx * dx + dy * dy <= ball.r * ball.r) {
      if (Math.abs(dx) > Math.abs(dy)) ball.vx *= -1;
      else ball.vy *= -1;
      addBounceDrift(ball, 0.06);
      ball.x += ball.vx * 0.8;
      ball.y += ball.vy * 0.8;
      brick.hp -= 1;
      brick.hitTick = 14;
      score += 10;
      burst(ball.x, ball.y, "#ff4c43", 7);
      if (brick.hp <= 0) {
        score += 80 + round * 5;
        burst(brick.x + brick.w / 2, brick.y + brick.h / 2, "#f8d552", 18);
      }
      break;
    }
  }
  bricks = bricks.filter((brick) => brick.hp > 0);
}

function handleBonusCollisions(ball) {
  for (const bonus of bonuses) {
    const dx = ball.x - bonus.x;
    const dy = ball.y - bonus.y;
    if (dx * dx + dy * dy < (ball.r + bonus.r) ** 2) {
      bonus.value = 0;
      ballsAvailable += 1;
      score += 50;
      burst(bonus.x, bonus.y, "#71d8ff", 14);
      break;
    }
  }
  bonuses = bonuses.filter((bonus) => bonus.value > 0);
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x,
      y,
      vx: rand(-2.2, 2.2),
      vy: rand(-2.4, 1.4),
      life: rand(14, 32),
      color,
      size: rand(1.6, 3.8),
    });
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawScoreBar();
  drawControlBar();
  bonuses.forEach(drawBonus);
  bricks.forEach(drawBrick);
  drawAim();
  balls.forEach(drawBall);
  particles.forEach(drawParticle);
  drawClearEffect();
  drawKeyboard();
  drawBallCounter();
  drawMessage();
  drawPauseOverlay();
  drawLeaderboardOverlay();
}

function drawBackground() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const step = 24;
  ctx.strokeStyle = "rgba(47, 111, 237, 0.07)";
  ctx.lineWidth = 1;
  for (let x = step; x < W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = step; y < H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }
}

function drawScoreBar() {
  const barX = 16;
  const barY = 22;
  const barW = W - 32;
  const barH = 54;

  ctx.save();
  ctx.shadowColor = "rgba(47, 108, 197, 0.18)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  roundRect(barX, barY, barW, barH, 18, "#ffffff");
  ctx.restore();
  ctx.strokeStyle = "rgba(47, 125, 234, 0.14)";
  ctx.lineWidth = 1.5;
  strokeRoundRect(barX + 0.75, barY + 0.75, barW - 1.5, barH - 1.5, 18);

  ctx.fillStyle = "#94a9c9";
  ctx.font = "700 12px Arial";
  ctx.textAlign = "left";
  ctx.fillText("总得分", barX + 18, barY + 20);

  ctx.fillStyle = "#2f6fed";
  ctx.font = "900 26px Arial";
  ctx.fillText(String(score).padStart(6, "0"), barX + 18, barY + 44);
  ctx.textAlign = "left";
}

const controlBar = { x: 16, y: 84, w: W - 32, h: 44 };

function controlItemCenter(index) {
  const itemW = controlBar.w / 5;
  return controlBar.x + itemW * index + itemW / 2;
}

function drawControlBar() {
  const cy = controlBar.y + controlBar.h / 2;
  drawIconButton(controlItemCenter(0), cy, paused ? "\u25B6" : "\u2759\u2759", 16);
  drawIconButton(controlItemCenter(1), cy, "\u21BB", 24);
  drawIconButton(controlItemCenter(2), cy, "\u{1F3C6}", 18);
  drawRoundChip(controlItemCenter(3), cy, `回合 ${round}`);
  drawSpeedChip(controlItemCenter(4), cy);
}

function drawIconButton(cx, cy, icon, fontSize = 16) {
  const r = 20;
  ctx.save();
  ctx.shadowColor = "rgba(47, 108, 197, 0.16)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(47, 125, 234, 0.14)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 0.75, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#2f6fed";
  ctx.font = `800 ${fontSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, cx, cy + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawRoundChip(cx, cy, text) {
  ctx.font = "700 13px Arial";
  const w = ctx.measureText(text).width + 24;
  const h = 30;
  roundRect(cx - w / 2, cy - h / 2, w, h, h / 2, "#eaf2ff");
  ctx.fillStyle = "#2f6fed";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawSpeedChip(cx, cy) {
  const text = speedScale === 4 ? "2x" : "1x";
  const w = 46;
  const h = 30;
  if (speedScale === 4) {
    const grad = ctx.createLinearGradient(cx - w / 2, cy - h / 2, cx - w / 2, cy + h / 2);
    grad.addColorStop(0, "#5c9dff");
    grad.addColorStop(1, "#2f6fed");
    roundRect(cx - w / 2, cy - h / 2, w, h, h / 2, grad);
    ctx.fillStyle = "#ffffff";
  } else {
    roundRect(cx - w / 2, cy - h / 2, w, h, h / 2, "#ffffff");
    ctx.strokeStyle = "rgba(47, 111, 237, 0.28)";
    ctx.lineWidth = 1.5;
    strokeRoundRect(cx - w / 2 + 0.75, cy - h / 2 + 0.75, w - 1.5, h - 1.5, h / 2 - 0.75);
    ctx.fillStyle = "#2f6fed";
  }
  ctx.font = "800 14px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawPauseOverlay() {
  if (!paused) return;
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const boxW = 220;
  const boxH = 96;
  const x = (W - boxW) / 2;
  const y = (H - boxH) / 2;
  ctx.save();
  ctx.shadowColor = "rgba(47, 108, 197, 0.24)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  roundRect(x, y, boxW, boxH, 20, "#ffffff");
  ctx.restore();
  ctx.strokeStyle = "rgba(47, 125, 234, 0.16)";
  ctx.lineWidth = 1.5;
  strokeRoundRect(x + 0.75, y + 0.75, boxW - 1.5, boxH - 1.5, 20);
  ctx.fillStyle = "#1f4fc4";
  ctx.font = "800 20px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("已暂停", W / 2, y + 38);
  ctx.font = "700 13px Arial";
  ctx.fillStyle = "#4a6fa8";
  ctx.fillText("点击 \u25B6 继续游戏", W / 2, y + 66);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawLeaderboardOverlay() {
  if (!showLeaderboard) return;
  ctx.save();
  ctx.fillStyle = "rgba(24, 46, 92, 0.4)";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  const boxW = 280;
  const boxH = 320;
  const x = (W - boxW) / 2;
  const y = (H - boxH) / 2;

  ctx.save();
  ctx.shadowColor = "rgba(47, 108, 197, 0.3)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  roundRect(x, y, boxW, boxH, 24, "#ffffff");
  ctx.restore();

  ctx.fillStyle = "#1f4fc4";
  ctx.font = "800 20px Arial";
  ctx.textAlign = "center";
  ctx.fillText("\u{1F3C6} 排行榜", W / 2, y + 44);

  if (!highScores.length) {
    ctx.fillStyle = "#94a9c9";
    ctx.font = "700 14px Arial";
    ctx.fillText("暂无记录，快去挑战吧！", W / 2, y + 150);
  } else {
    const medalColor = ["#f4b400", "#9aa5b1", "#c17a3d"];
    highScores.forEach((value, index) => {
      const ry = y + 88 + index * 40;
      ctx.textAlign = "left";
      ctx.fillStyle = medalColor[index] || "#94a9c9";
      ctx.font = "800 15px Arial";
      ctx.fillText(`${index + 1}`, x + 30, ry);
      ctx.fillStyle = "#2f6fed";
      ctx.font = "800 18px Arial";
      ctx.fillText(String(value).padStart(6, "0"), x + 60, ry);
    });
  }

  ctx.font = "700 12px Arial";
  ctx.fillStyle = "rgba(74, 111, 168, 0.7)";
  ctx.textAlign = "center";
  ctx.fillText("点击空白处关闭", W / 2, y + boxH - 24);
  ctx.textAlign = "left";
}

function drawBrick(brick) {
  const asset = obstacleAssets[brick.icon];
  const hit = brick.hitTick / 14;
  const scale = 1 + hit * 0.08;
  const cx = brick.x + brick.w / 2;
  const cy = brick.y + brick.h / 2;
  const imageBox = fitImageInBox(asset, brick.x, brick.y, brick.w, brick.h);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  if (asset.ready) {
    ctx.drawImage(asset.image, imageBox.x, imageBox.y, imageBox.w, imageBox.h);
  } else {
    roundRect(brick.x, brick.y, brick.w, brick.h, 12, "#79bd66");
  }
  ctx.restore();

  drawRedBadge(brick, imageBox, hit);
}

function fitImageInBox(asset, x, y, w, h) {
  const naturalW = asset.image.naturalWidth || asset.w || w;
  const naturalH = asset.image.naturalHeight || asset.h || h;
  const ratio = Math.min(w / naturalW, h / naturalH);
  const drawW = naturalW * ratio;
  const drawH = naturalH * ratio;
  return {
    x: x + (w - drawW) / 2,
    y: y + (h - drawH) / 2,
    w: drawW,
    h: drawH,
  };
}

function drawRedBadge(brick, imageBox, hit) {
  const text = String(brick.hp);
  const badgeH = 20;
  const badgeW = text.length >= 3 ? 42 : 32;
  const x = imageBox.x + imageBox.w - badgeW * 0.48;
  const y = imageBox.y - badgeH * 0.34 - hit * 4;
  const r = badgeH / 2;

  ctx.save();
  ctx.shadowColor = "rgba(114, 21, 28, 0.28)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  const grad = ctx.createLinearGradient(x, y, x, y + badgeH);
  grad.addColorStop(0, hit > 0 ? "#ff776e" : "#ff6f6a");
  grad.addColorStop(0.5, "#ff393c");
  grad.addColorStop(1, "#e51d26");
  roundRect(x, y, badgeW, badgeH, r, grad);

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1;
  strokeRoundRect(x + 0.5, y + 0.5, badgeW - 1, badgeH - 1, r - 1);

  ctx.fillStyle = "#ffffff";
  ctx.font = `italic 900 ${text.length >= 3 ? 17 : 18}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + badgeW / 2, y + badgeH / 2 + 1);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.restore();
}

function drawObstaclePlate(brick) {
  const x = brick.x;
  const y = brick.y;
  const w = brick.w;
  const h = brick.h;
  if (brick.style === 0) {
    roundRect(x + 1, y + 2, w - 2, h - 4, 13, "rgba(255, 255, 255, 0.92)");
    ctx.strokeStyle = "rgba(84, 144, 116, 0.36)";
    ctx.lineWidth = 2;
    strokeRoundRect(x + 1, y + 2, w - 2, h - 4, 13);
    ctx.strokeStyle = "rgba(84, 144, 116, 0.3)";
    ctx.beginPath();
    ctx.moveTo(x + 9, y + h * 0.42);
    ctx.lineTo(x + w / 2, y + h * 0.66);
    ctx.lineTo(x + w - 9, y + h * 0.42);
    ctx.stroke();
  } else if (brick.style === 1) {
    roundRect(x, y + 4, w, h - 8, 15, "rgba(255, 255, 255, 0.9)");
    roundRect(x + 8, y + 12, w - 16, h - 22, 12, "rgba(117, 190, 96, 0.9)");
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(x + w - 13, y + 16, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    roundRect(x + 2, y + 3, w - 4, h - 6, 10, "rgba(255, 255, 255, 0.88)");
    ctx.fillStyle = "rgba(117, 190, 96, 0.88)";
    ctx.fillRect(x + 9, y + 14, w - 18, 7);
    ctx.fillRect(x + 9, y + 27, w - 24, 6);
    ctx.fillRect(x + 9, y + 39, w - 30, 6);
  }
}

function drawBonus(bonus) {
  bonus.spin += 0.06 * speedScale;
  ctx.save();
  ctx.translate(bonus.x, bonus.y);
  ctx.rotate(bonus.spin);
  roundRect(-12, -12, 24, 24, 8, "#64cfff");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-2, -8, 4, 16);
  ctx.fillRect(-8, -2, 16, 4);
  ctx.restore();
}

function drawBall(ball) {
  if (ballAsset.ready) {
    const bob = Math.sin(Date.now() / 120 + ball.x * 0.03) * 1.2;
    ctx.drawImage(ballAsset.image, ball.x - 10, ball.y - 17 + bob, 20, 31);
    return;
  }
  const grad = ctx.createRadialGradient(ball.x - 2, ball.y - 3, 1, ball.x, ball.y, ball.r);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(1, "#49bfff");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fill();
}

function drawAim() {
  if (running || gameOver) return;
  const startX = keyboard.x + keyboard.w / 2;
  const startY = keyboard.y - 7;
  const dx = Math.cos(aimAngle);
  const dy = Math.sin(aimAngle);

  for (let i = 1; i <= 9; i += 1) {
    const t = i * 12;
    const dotX = startX + dx * t;
    const dotY = startY + dy * t;
    const radius = i % 2 === 0 ? 2.3 : 3.1;
    ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
    ctx.beginPath();
    ctx.arc(dotX, dotY, radius + 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(48, 167, 255, 0.92)";
    ctx.beginPath();
    ctx.arc(dotX, dotY, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  drawBall({ x: startX, y: startY, r: 5.4 });
}

function drawKeyboard() {
  if (keyboardAsset.ready) {
    ctx.drawImage(keyboardAsset.image, keyboard.x, keyboard.y, keyboard.w, keyboard.h);
  } else {
    roundRect(keyboard.x, keyboard.y, keyboard.w, keyboard.h, 16, "#c9e9ff");
  }

  if (draggingKeyboard) {
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    strokeRoundRect(keyboard.x + 2, keyboard.y + 2, keyboard.w - 4, keyboard.h - 4, 16);
  }
}

function drawBallCounter() {
  const x = keyboard.x + keyboard.w / 2;
  const y = keyboard.y + keyboard.h + 26;
  const w = 100;
  const h = 34;

  ctx.save();
  ctx.shadowColor = "rgba(47, 108, 197, 0.18)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  roundRect(x - w / 2, y - h / 2, w, h, h / 2, "#ffffff");
  ctx.restore();
  ctx.strokeStyle = "rgba(47, 125, 234, 0.14)";
  ctx.lineWidth = 1.5;
  strokeRoundRect(x - w / 2 + 0.75, y - h / 2 + 0.75, w - 1.5, h - 1.5, h / 2 - 0.75);

  const ballCx = x - w / 2 + 26;
  const grad = ctx.createRadialGradient(ballCx - 3, y - 4, 1, ballCx, y, 11);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(1, "#2f8dff");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(ballCx, y, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2f6fed";
  ctx.font = "900 17px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`x ${ballsAvailable}`, ballCx + 18, y + 1);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
}

function drawParticle(p) {
  ctx.globalAlpha = clamp(p.life / 28, 0, 1);
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawClearEffect() {
  if (clearEffectTimer <= 0) return;
  const t = clearEffectTimer / 72;
  const pop = 1 + (1 - t) * 0.18;
  const alpha = clamp(t * 1.25, 0, 1);
  const cx = W / 2;
  const cy = laneTop + 90;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(pop, pop);
  for (let i = 0; i < 12; i += 1) {
    const angle = (Math.PI * 2 * i) / 12 + (1 - t) * 0.9;
    const len = 36 + (1 - t) * 26;
    ctx.strokeStyle = i % 2 === 0 ? "#ff4c43" : "#f8d552";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 38, Math.sin(angle) * 28);
    ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len * 0.76);
    ctx.stroke();
  }
  roundRect(-74, -22, 148, 44, 20, "rgba(255, 64, 69, 0.94)");
  ctx.fillStyle = "#ffffff";
  ctx.font = "italic 900 24px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("清屏!", 0, 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawMessage() {
  if (!message) return;
  const boxW = 288;
  const boxH = 112;
  const boxX = (W - boxW) / 2;
  const boxY = (laneTop + keyboard.y) / 2 - boxH / 2;

  ctx.save();
  ctx.shadowColor = "rgba(47, 108, 197, 0.24)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 10;
  roundRect(boxX, boxY, boxW, boxH, 24, "#ffffff");
  ctx.restore();
  ctx.strokeStyle = "rgba(47, 125, 234, 0.16)";
  ctx.lineWidth = 1.5;
  strokeRoundRect(boxX + 0.75, boxY + 0.75, boxW - 1.5, boxH - 1.5, 24);

  ctx.fillStyle = "#1f4fc4";
  ctx.font = "800 22px Arial";
  ctx.textAlign = "center";
  ctx.fillText(gameOver ? "游戏结束" : "红点清除计划", W / 2, boxY + 42);
  ctx.font = "700 15px Arial";
  ctx.fillStyle = "#4a6fa8";
  ctx.fillText(message, W / 2, boxY + 70);
  ctx.font = "700 12px Arial";
  ctx.fillStyle = "rgba(74, 111, 168, 0.75)";
  ctx.fillText(gameOver ? "点击键盘重新开始" : "按住蓝色键盘左右滑动瞄准", W / 2, boxY + 92);
  ctx.textAlign = "left";
}

function roundRect(x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRoundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.stroke();
}

function toCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * W,
    y: ((event.clientY - rect.top) / rect.height) * H,
  };
}

function moveKeyboardTo(x) {
  pointerX = clamp(x, 20, W - 20);
  keyboard.x = clamp(pointerX - keyboard.w / 2, 8, W - keyboard.w - 8);
  updateAimFromKeyboard();
}

function updateAimFromKeyboard() {
  const center = keyboard.x + keyboard.w / 2;
  const delta = clamp((pointerX - center) / 120, -1, 1);
  aimAngle = -Math.PI / 2 + delta * 0.58;
}

function isKeyboardPoint(point) {
  return point.y >= keyboard.y - 12 && point.y <= keyboard.y + keyboard.h + 18;
}

function hitControlBar(point) {
  if (point.x < controlBar.x || point.x > controlBar.x + controlBar.w) return null;
  if (point.y < controlBar.y - 8 || point.y > controlBar.y + controlBar.h + 8) return null;
  const itemW = controlBar.w / 5;
  const idx = Math.floor((point.x - controlBar.x) / itemW);
  return ["pause", "restart", "leaderboard", "round", "speed"][clamp(idx, 0, 4)];
}

function handleControlAction(action) {
  if (action === "pause") {
    paused = !paused;
  } else if (action === "restart") {
    resetGame();
  } else if (action === "leaderboard") {
    showLeaderboard = !showLeaderboard;
  } else if (action === "speed") {
    speedScale = speedScale === 4 ? 2 : 4;
  }
}

canvas.addEventListener("pointerdown", (event) => {
  const point = toCanvasPoint(event);
  pointerX = point.x;

  if (showLeaderboard) {
    showLeaderboard = false;
    return;
  }

  const control = hitControlBar(point);
  if (control) {
    handleControlAction(control);
    return;
  }

  if (paused) return;

  if (isKeyboardPoint(point)) {
    draggingKeyboard = true;
    moveKeyboardTo(point.x);
    startRound();
  } else if (!running && !gameOver) {
    updateAimFromKeyboard();
  }
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  const point = toCanvasPoint(event);
  pointerX = point.x;
  if (paused || showLeaderboard) return;
  if (draggingKeyboard) {
    moveKeyboardTo(point.x);
  } else if (!running && !gameOver) {
    updateAimFromKeyboard();
  }
});

canvas.addEventListener("pointerup", () => {
  draggingKeyboard = false;
});

canvas.addEventListener("pointercancel", () => {
  draggingKeyboard = false;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "p" || event.key === "P") {
    handleControlAction("pause");
    return;
  }
  if (paused || showLeaderboard) return;
  if (event.key === "ArrowLeft") moveKeyboardTo(keyboard.x + keyboard.w / 2 - 18);
  if (event.key === "ArrowRight") moveKeyboardTo(keyboard.x + keyboard.w / 2 + 18);
  if (event.key === " " || event.key === "Enter") startRound();
  if (event.key === "2") handleControlAction("speed");
});

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

resetGame();
loop();















