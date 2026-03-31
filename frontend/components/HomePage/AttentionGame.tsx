"use client";

/**
 * AttentionGame.tsx — "The Attention Gauntlet"
 * =============================================
 * A pixel-art infinite runner where a reader tries to read
 * while dodging distractions (notifications, phones, emails).
 *
 * When you lose: "See? That's why manga exists."
 *
 * Controls: SPACE / TAP to jump
 * Score: "Pages Read" counter
 * Obstacles: notification bells, phones, social icons
 * Collectibles: manga panels (bonus pages)
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

// ============================================================
// GAME CONSTANTS
// ============================================================

const CANVAS_W = 640;
const CANVAS_H = 260;
const GROUND_Y = 210;
const GRAVITY = 0.55;
const JUMP_FORCE = -11;
const PLAYER_W = 22;
const PLAYER_H = 32;
const BASE_SPEED = 3.5;
const SPEED_INC = 0.0008; // accelerate over time

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  type: "notification" | "phone" | "email" | "tiktok" | "meeting";
  passed: boolean;
}

interface Collectible {
  x: number;
  y: number;
  collected: boolean;
}

// ============================================================
// PIXEL ART DRAWING HELPERS
// ============================================================

function drawPixelReader(ctx: CanvasRenderingContext2D, x: number, y: number, jumping: boolean) {
  const s = 2; // pixel scale
  ctx.imageSmoothingEnabled = false;

  // Legs (walking animation based on time)
  const legFrame = jumping ? 1 : Math.floor(Date.now() / 150) % 2;
  ctx.fillStyle = "#1A1825";
  if (legFrame === 0) {
    ctx.fillRect(x + 3*s, y + 12*s, 2*s, 4*s); // left leg
    ctx.fillRect(x + 7*s, y + 12*s, 2*s, 4*s); // right leg
  } else {
    ctx.fillRect(x + 2*s, y + 12*s, 2*s, 4*s);
    ctx.fillRect(x + 8*s, y + 12*s, 2*s, 4*s);
  }

  // Body
  ctx.fillStyle = "#F2E8D5";
  ctx.fillRect(x + 2*s, y + 5*s, 8*s, 7*s);
  ctx.fillStyle = "#E8191A";
  ctx.fillRect(x + 3*s, y + 6*s, 6*s, 2*s); // shirt stripe

  // Head
  ctx.fillStyle = "#F5D6A8";
  ctx.fillRect(x + 3*s, y + 0*s, 6*s, 5*s);
  // Hair
  ctx.fillStyle = "#1A1825";
  ctx.fillRect(x + 2*s, y + 0*s, 7*s, 2*s);
  // Eyes
  ctx.fillStyle = "#1A1825";
  ctx.fillRect(x + 5*s, y + 2*s, 1*s, 1*s);
  ctx.fillRect(x + 8*s, y + 2*s, 1*s, 1*s);

  // Book in hands
  ctx.fillStyle = "#F5A623";
  ctx.fillRect(x + 9*s, y + 6*s, 3*s, 4*s);
  ctx.fillStyle = "#C47D10";
  ctx.fillRect(x + 9*s, y + 6*s, 1*s, 4*s); // spine
}

function drawObstacle(ctx: CanvasRenderingContext2D, obs: Obstacle) {
  const { x, y, w, h, type } = obs;
  ctx.imageSmoothingEnabled = false;

  switch (type) {
    case "notification":
      // Red bell shape
      ctx.fillStyle = "#E8191A";
      ctx.beginPath();
      ctx.arc(x + w/2, y + h*0.4, w*0.4, Math.PI, 0);
      ctx.rect(x + w*0.1, y + h*0.4, w*0.8, h*0.35);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("!", x + w/2, y + h*0.55);
      // Clapper
      ctx.fillStyle = "#E8191A";
      ctx.fillRect(x + w*0.35, y + h*0.75, w*0.3, 3);
      break;

    case "phone":
      // Phone rectangle with glow
      ctx.fillStyle = "#3D7BFF";
      ctx.fillRect(x + 2, y, w - 4, h);
      ctx.fillStyle = "#1A1825";
      ctx.fillRect(x + 4, y + 3, w - 8, h - 8);
      ctx.fillStyle = "#3D7BFF";
      ctx.fillRect(x + 6, y + 5, w - 12, h - 14);
      // Screen text lines
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + 7, y + 8, 6, 1);
      ctx.fillRect(x + 7, y + 11, 8, 1);
      break;

    case "email":
      // Envelope
      ctx.fillStyle = "#F5A623";
      ctx.fillRect(x, y + 4, w, h - 4);
      ctx.fillStyle = "#C47D10";
      ctx.beginPath();
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x + w/2, y + h*0.55);
      ctx.lineTo(x + w, y + 4);
      ctx.closePath();
      ctx.fill();
      // Badge
      ctx.fillStyle = "#E8191A";
      ctx.beginPath();
      ctx.arc(x + w - 3, y + 4, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 6px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("99", x + w - 3, y + 6);
      break;

    case "tiktok":
      // Music note / social icon
      ctx.fillStyle = "#1A1825";
      ctx.beginPath();
      ctx.arc(x + w/2, y + h/2, w*0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#E8191A";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("♪", x + w/2, y + h*0.65);
      break;

    case "meeting":
      // Calendar icon
      ctx.fillStyle = "#00BFA5";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + 2, y + 6, w - 4, h - 8);
      ctx.fillStyle = "#E8191A";
      ctx.fillRect(x + 2, y, w - 4, 6);
      ctx.fillStyle = "#1A1825";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("!!", x + w/2, y + h - 4);
      break;
  }
}

function drawMangaCollectible(ctx: CanvasRenderingContext2D, c: Collectible) {
  if (c.collected) return;
  const s = 2;
  // Small manga page icon
  ctx.fillStyle = "#F2E8D5";
  ctx.fillRect(c.x, c.y, 6*s, 8*s);
  ctx.strokeStyle = "#1A1825";
  ctx.lineWidth = 1;
  ctx.strokeRect(c.x, c.y, 6*s, 8*s);
  // Panel lines inside
  ctx.fillStyle = "#1A1825";
  ctx.fillRect(c.x + 1*s, c.y + 1*s, 4*s, 3*s);
  ctx.fillRect(c.x + 1*s, c.y + 5*s, 2*s, 2*s);
  ctx.fillRect(c.x + 3.5*s, c.y + 5*s, 1.5*s, 2*s);
  // Sparkle
  const t = Date.now() / 300;
  ctx.globalAlpha = 0.4 + Math.sin(t) * 0.3;
  ctx.fillStyle = "#F5A623";
  ctx.fillRect(c.x - 2, c.y - 2, 3, 3);
  ctx.fillRect(c.x + 6*s + 1, c.y + 2, 2, 2);
  ctx.globalAlpha = 1;
}

// ============================================================
// OBSTACLE TYPES & SPAWNING
// ============================================================

const OBS_TYPES: Obstacle["type"][] = ["notification", "phone", "email", "tiktok", "meeting"];

const OBS_DIMS: Record<Obstacle["type"], { w: number; h: number }> = {
  notification: { w: 20, h: 26 },
  phone: { w: 18, h: 30 },
  email: { w: 24, h: 20 },
  tiktok: { w: 20, h: 22 },
  meeting: { w: 22, h: 24 },
};

function spawnObstacle(canvasW: number): Obstacle {
  const type = OBS_TYPES[Math.floor(Math.random() * OBS_TYPES.length)];
  const dims = OBS_DIMS[type];
  return {
    x: canvasW + 20,
    y: GROUND_Y - dims.h,
    w: dims.w,
    h: dims.h,
    type,
    passed: false,
  };
}

function spawnCollectible(canvasW: number): Collectible {
  return {
    x: canvasW + 40 + Math.random() * 60,
    y: GROUND_Y - 50 - Math.random() * 40,
    collected: false,
  };
}

// ============================================================
// THE GAME COMPONENT
// ============================================================

export function AttentionGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef({
    running: false,
    started: false,
    playerY: GROUND_Y - PLAYER_H,
    velY: 0,
    jumping: false,
    score: 0,
    obstacles: [] as Obstacle[],
    collectibles: [] as Collectible[],
    spawnTimer: 0,
    collectTimer: 0,
    speed: BASE_SPEED,
    frameCount: 0,
    groundOffset: 0,
    bgOffset: 0,
  });
  const rafRef = useRef<number>(0);

  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [highScore, setHighScore] = useState(0);

  const startGame = useCallback(() => {
    const g = gameRef.current;
    g.running = true;
    g.started = true;
    g.playerY = GROUND_Y - PLAYER_H;
    g.velY = 0;
    g.jumping = false;
    g.score = 0;
    g.obstacles = [];
    g.collectibles = [];
    g.spawnTimer = 0;
    g.collectTimer = 0;
    g.speed = BASE_SPEED;
    g.frameCount = 0;
    setScore(0);
    setGameOver(false);
    setGameStarted(true);
  }, []);

  const jump = useCallback(() => {
    const g = gameRef.current;
    if (!g.started) {
      startGame();
      return;
    }
    if (gameOver) {
      startGame();
      return;
    }
    if (!g.jumping) {
      g.velY = JUMP_FORCE;
      g.jumping = true;
    }
  }, [gameOver, startGame]);

  // Input handlers
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    function gameLoop() {
      const g = gameRef.current;
      g.frameCount++;

      // Clear
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // ── Background ──
      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      skyGrad.addColorStop(0, "#0F0E17");
      skyGrad.addColorStop(1, "#1F1E28");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, CANVAS_W, GROUND_Y);

      // Stars
      ctx.fillStyle = "#F0EEE880";
      for (let i = 0; i < 20; i++) {
        const sx = ((i * 37 + g.bgOffset * 0.2) % CANVAS_W + CANVAS_W) % CANVAS_W;
        const sy = (i * 13) % (GROUND_Y - 30) + 10;
        ctx.fillRect(sx, sy, 1, 1);
      }

      // City skyline (parallax)
      ctx.fillStyle = "#17161F";
      for (let i = 0; i < 12; i++) {
        const bx = ((i * 58 - g.bgOffset * 0.3) % (CANVAS_W + 60) + CANVAS_W + 60) % (CANVAS_W + 60) - 30;
        const bh = 30 + (i * 17) % 50;
        ctx.fillRect(bx, GROUND_Y - bh, 28, bh);
        // Windows
        ctx.fillStyle = "#F5A62320";
        for (let wy = GROUND_Y - bh + 4; wy < GROUND_Y - 4; wy += 8) {
          for (let wx = bx + 4; wx < bx + 24; wx += 7) {
            ctx.fillRect(wx, wy, 3, 3);
          }
        }
        ctx.fillStyle = "#17161F";
      }

      // Ground
      ctx.fillStyle = "#2E2C3F";
      ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);
      // Ground texture (scrolling dashes)
      ctx.fillStyle = "#3D3B54";
      for (let i = 0; i < 40; i++) {
        const gx = ((i * 18 - g.groundOffset) % CANVAS_W + CANVAS_W) % CANVAS_W;
        ctx.fillRect(gx, GROUND_Y + 3, 8, 1);
        ctx.fillRect(gx + 4, GROUND_Y + 8, 6, 1);
      }

      if (!g.running) {
        // ── Idle state: draw player ──
        drawPixelReader(ctx, 60, g.playerY, false);

        // Prompt
        ctx.fillStyle = "#F5A623";
        ctx.font = '16px "DotGothic16", monospace';
        ctx.textAlign = "center";
        if (gameOver) {
          ctx.fillText("PRESS SPACE TO TRY AGAIN", CANVAS_W / 2, CANVAS_H / 2 - 10);
        } else {
          ctx.fillText("PRESS SPACE TO START READING", CANVAS_W / 2, CANVAS_H / 2 - 10);
          ctx.fillStyle = "#5E5C78";
          ctx.font = '10px "DotGothic16", monospace';
          ctx.fillText("(or tap the canvas)", CANVAS_W / 2, CANVAS_H / 2 + 8);
        }

        rafRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // ── UPDATE ──
      g.speed += SPEED_INC;
      g.groundOffset += g.speed;
      g.bgOffset += g.speed;

      // Player physics
      g.velY += GRAVITY;
      g.playerY += g.velY;
      if (g.playerY >= GROUND_Y - PLAYER_H) {
        g.playerY = GROUND_Y - PLAYER_H;
        g.velY = 0;
        g.jumping = false;
      }

      // Spawn obstacles
      g.spawnTimer--;
      if (g.spawnTimer <= 0) {
        g.obstacles.push(spawnObstacle(CANVAS_W));
        g.spawnTimer = 70 + Math.random() * 60 - Math.min(g.frameCount * 0.02, 30);
      }

      // Spawn collectibles
      g.collectTimer--;
      if (g.collectTimer <= 0) {
        g.collectibles.push(spawnCollectible(CANVAS_W));
        g.collectTimer = 120 + Math.random() * 80;
      }

      // Move & check obstacles
      const px = 60, py = g.playerY;
      const pw = PLAYER_W, ph = PLAYER_H;

      for (const obs of g.obstacles) {
        obs.x -= g.speed;

        // Collision (with some forgiveness)
        if (
          px + pw - 4 > obs.x + 3 &&
          px + 4 < obs.x + obs.w - 3 &&
          py + ph - 2 > obs.y + 3 &&
          py + 4 < obs.y + obs.h
        ) {
          g.running = false;
          setGameOver(true);
          setHighScore(prev => Math.max(prev, g.score));
        }

        if (!obs.passed && obs.x + obs.w < px) {
          obs.passed = true;
          g.score++;
          setScore(g.score);
        }
      }

      // Move & check collectibles
      for (const c of g.collectibles) {
        c.x -= g.speed;
        if (!c.collected && px + pw > c.x && px < c.x + 12 && py + ph > c.y && py < c.y + 16) {
          c.collected = true;
          g.score += 5;
          setScore(g.score);
        }
      }

      // Cleanup off-screen
      g.obstacles = g.obstacles.filter(o => o.x > -40);
      g.collectibles = g.collectibles.filter(c => c.x > -20);

      // ── DRAW ──
      // Obstacles
      for (const obs of g.obstacles) drawObstacle(ctx, obs);
      // Collectibles
      for (const c of g.collectibles) drawMangaCollectible(ctx, c);
      // Player
      drawPixelReader(ctx, px, g.playerY, g.jumping);

      // Score
      ctx.fillStyle = "#F5A623";
      ctx.font = '12px "DotGothic16", monospace';
      ctx.textAlign = "right";
      ctx.fillText(`PAGES: ${g.score}`, CANVAS_W - 12, 20);

      // Speed indicator
      ctx.fillStyle = "#5E5C78";
      ctx.font = '8px "DotGothic16", monospace';
      ctx.fillText(`SPD: ${g.speed.toFixed(1)}`, CANVAS_W - 12, 32);

      rafRef.current = requestAnimationFrame(gameLoop);
    }

    rafRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [gameOver]);

  // Distraction name for game over
  const lastHit = gameRef.current.obstacles.find(o => !o.passed)?.type;
  const distractionNames: Record<string, string> = {
    notification: "a push notification",
    phone: "your phone screen",
    email: "99 unread emails",
    tiktok: "a viral reel",
    meeting: "an urgent meeting",
  };

  return (
    <div className="relative">
      {/* Game frame */}
      <div
        className="relative mx-auto overflow-hidden"
        style={{
          width: CANVAS_W,
          maxWidth: "100%",
          border: "2px solid #2E2C3F",
          background: "#0F0E17",
          boxShadow: "4px 4px 0 #1A1825",
          imageRendering: "pixelated",
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onClick={jump}
          style={{
            width: "100%",
            height: "auto",
            cursor: "pointer",
            imageRendering: "pixelated",
          }}
        />

        {/* Game over overlay */}
        <AnimatePresence>
          {gameOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center"
              style={{ background: "rgba(15,14,23,0.85)" }}
            >
              <p style={{
                fontFamily: "var(--font-display)",
                color: "#E8191A",
                fontSize: "clamp(1rem, 3vw, 1.4rem)",
                marginBottom: 4,
              }}>
                DISTRACTED!
              </p>
              <p style={{
                fontFamily: "var(--font-body)",
                color: "#A8A6C0",
                fontSize: "0.75rem",
                marginBottom: 8,
              }}>
                You got hit by {distractionNames[lastHit || "notification"]}
              </p>
              <p style={{
                fontFamily: "var(--font-display)",
                color: "#F5A623",
                fontSize: "clamp(0.8rem, 2.5vw, 1.1rem)",
                marginBottom: 12,
              }}>
                {score} pages read
              </p>
              <p style={{
                fontFamily: "var(--font-bubble)",
                color: "#F2E8D5",
                fontSize: "clamp(0.7rem, 2vw, 0.85rem)",
              }}>
                That&apos;s why we invented manga summaries.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Score bar below canvas */}
      <div
        className="mx-auto flex items-center justify-between px-3 py-1.5"
        style={{
          width: CANVAS_W,
          maxWidth: "100%",
          background: "#17161F",
          border: "2px solid #2E2C3F",
          borderTop: "none",
        }}
      >
        <span style={{ fontFamily: "var(--font-label)", fontSize: 10, color: "#5E5C78", letterSpacing: "0.15em" }}>
          {gameStarted ? "SPACE / TAP = JUMP" : "PRESS SPACE TO PLAY"}
        </span>
        <span style={{ fontFamily: "var(--font-label)", fontSize: 10, color: "#F5A623" }}>
          BEST: {highScore}
        </span>
      </div>
    </div>
  );
}

export default AttentionGame;
