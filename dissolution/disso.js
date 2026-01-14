document.addEventListener("DOMContentLoaded", () => {
  /* ---------------------------------------------------------
     CONFIG
  --------------------------------------------------------- */
  const CFG = {
    density: 0.0005,
    inactivityMs: 250,
    buffer: 20,
    colors: [
      "#ffb3f3",
      "#ff69b4",
      "#c71585",
      "#8a2be2",
      "#7b68ee",
      "#00bfff",
      "#add8e6",
      "#ffffff",
      "#ff80c0",
      "#ff4da6",
      "#ff3399",
      "#ff99ff",
      "#ffccff",
      "#ff66ff",
      "#ff99cc",
      "#ffcce5",
      "#ffb6e6",
      "#ffd6f0"
    ]
  };

  /* ---------------------------------------------------------
     CANVAS SETUP
  --------------------------------------------------------- */
  const canvas = document.getElementById("starfield-canvas");
  const ctx = canvas.getContext("2d");

  let W = innerWidth;
  let H = innerHeight;

  function resizeCanvas() {
    W = innerWidth;
    H = innerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resizeCanvas();

  /* ---------------------------------------------------------
     STAR STORAGE (SoA with typed arrays + prev state)
  --------------------------------------------------------- */
  let count = 0;
  let xs, ys, vxs, vys, axs, ays, sizes, speeds, colorIndexes;
  let xsPrev, ysPrev;
  let colorBuckets = [];

  function randomColorIndex() {
    const len = CFG.colors.length;
    return (Math.random() * len) | 0;
  }

  function biasedSize() {
    const r = Math.random();
    return r < 0.6
      ? 1 + Math.random() * 3
      : r < 0.9
      ? 4 + Math.random() * 3
      : 7 + Math.random() * 3;
  }

  function regenerateStars() {
    count = (W * H * CFG.density) | 0;

    xs = new Float32Array(count);
    ys = new Float32Array(count);
    vxs = new Float32Array(count);
    vys = new Float32Array(count);
    axs = new Float32Array(count);
    ays = new Float32Array(count);
    sizes = new Float32Array(count);
    speeds = new Float32Array(count);
    colorIndexes = new Uint8Array(count);

    xsPrev = new Float32Array(count);
    ysPrev = new Float32Array(count);

    const colorCount = CFG.colors.length;
    if (!colorBuckets.length) {
      colorBuckets = new Array(colorCount);
      for (let c = 0; c < colorCount; c++) {
        colorBuckets[c] = [];
      }
    } else {
      for (let c = 0; c < colorCount; c++) {
        colorBuckets[c].length = 0;
      }
    }

    for (let i = 0; i < count; i++) {
      const size = biasedSize();
      const base = (size - 6.5) * 0.05;
      const speed = Math.abs(base) < 0.033 ? (base < 0 ? -0.033 : 0.033) : base;
      const ci = randomColorIndex();

      const x = Math.random() * W;
      const y = Math.random() * H;

      xs[i] = x;
      ys[i] = y;
      vxs[i] = 0;
      vys[i] = speed;
      axs[i] = 0;
      ays[i] = 0;
      sizes[i] = size;
      speeds[i] = speed;
      colorIndexes[i] = ci;
      colorBuckets[ci].push(i);

      // initialize previous positions to current so we don't interpolate from zero
      xsPrev[i] = x;
      ysPrev[i] = y;
    }
  }

  regenerateStars();

  window.addEventListener("resize", () => {
    resizeCanvas();
    regenerateStars();
  });

  /* ---------------------------------------------------------
     MOUSE CONTROLLER
  --------------------------------------------------------- */
  const mouse = {
    x: W / 2,
    y: H / 2,
    lastMove: performance.now(),
    pulse: false,
    pulseEnd: 0
  };

  window.addEventListener("mousemove", (e) => {
    const x = e.clientX;
    const y = e.clientY;
    if (x !== mouse.x || y !== mouse.y) {
      mouse.x = x;
      mouse.y = y;
      mouse.lastMove = performance.now();
      mouse.pulse = false;
    }
  });

  window.addEventListener("mouseleave", () => {
    mouse.x = W / 2;
    mouse.y = H / 2;
    mouse.lastMove = 0;
  });

  window.addEventListener("mousedown", () => {
    const now = performance.now();
    mouse.pulse = true;
    mouse.pulseEnd = now + 350;
  });

  /* ---------------------------------------------------------
     FIXED TIMESTEP
  --------------------------------------------------------- */
  const STEP_MS = 1000 / 60; // fixed 60 Hz
  const MAX_FRAME_MS = 1000 / 20;

  let accumulator = 0;
  let lastTime = performance.now();

  /* ---------------------------------------------------------
     UPDATE (fixed timestep, tuned for 60 FPS)
  --------------------------------------------------------- */
  function updateFixed() {
    const nowMs = performance.now();
    const attract = nowMs - mouse.lastMove < CFG.inactivityMs;
    if (mouse.pulse && nowMs > mouse.pulseEnd) mouse.pulse = false;

    const mx = mouse.x;
    const my = mouse.y;
    const buf = CFG.buffer;

    for (let i = 0; i < count; i++) {
      let x = xs[i];
      let y = ys[i];
      let vx = vxs[i];
      let vy = vys[i];
      let ax = axs[i];
      let ay = ays[i];
      const speed = speeds[i];

      // Attraction / repulsion
      const dx = mx - x;
      const dy = my - y;
      const distSq = dx * dx + dy * dy;

      if (distSq > 0) {
        const invDist = 1 / Math.sqrt(distSq);
        const dist = distSq * invDist; // = sqrt(distSq)
        const ux = dx * invDist;
        const uy = dy * invDist;

        // Corrected falloff:
        const fall = 1 / (dist * (dist * 0.00025 + 0.05) + 1);
        const force = 0.05 * fall;
        const dir = mouse.pulse ? -1 : attract ? 1 : 0;

        if (dir !== 0) {
          ax += ux * force * dir;
          ay += uy * force * dir;
        }
      }

      // Velocity update
      vx += ax;
      vy += ay;

      // Decay forces-friction
      ax *= 0.995;
      ay *= 0.995;

      // Kill tiny forces
      if (ax < 0.00005 && ax > -0.00005) ax = 0;
      if (ay < 0.00005 && ay > -0.00005) ay = 0;

      // Decay velocity toward natural speed
      vx *= 0.9;
      vy = speed + (vy - speed) * 0.9;

      if (vx < 0.01 && vx > -0.01) vx = 0;
      if (vy - speed < 0.01 && vy - speed > -0.01) vy = speed;

      // Position update
      x += vx;
      y += vy;

      // Wrap
      let wrapped = false;

      if (y < -buf) {
        y = H + buf;
        wrapped = true;
      } else if (y > H + buf) {
        y = -buf;
        wrapped = true;
      }

      if (x < -buf) {
        x = W + buf;
        wrapped = true;
      } else if (x > W + buf) {
        x = -buf;
        wrapped = true;
      }

      // If the star teleported, sync prev state to avoid interpolation streaks
      if (wrapped) {
        xsPrev[i] = x;
        ysPrev[i] = y;
      }

      xs[i] = x;
      ys[i] = y;
      vxs[i] = vx;
      vys[i] = vy;
      axs[i] = ax;
      ays[i] = ay;
    }
  }

  /* ---------------------------------------------------------
     RENDER (interpolated positions, batched by color)
  --------------------------------------------------------- */
  function render(alpha) {
    ctx.clearRect(0, 0, W, H);

    const colors = CFG.colors;
    const buckets = colorBuckets;

    for (let c = 0; c < colors.length; c++) {
      const group = buckets[c];
      if (!group.length) continue;

      ctx.fillStyle = colors[c];

      for (let j = 0; j < group.length; j++) {
        const i = group[j];

        const xPrev = xsPrev[i];
        const yPrev = ysPrev[i];
        const xCurr = xs[i];
        const yCurr = ys[i];

        const x = xPrev + alpha * (xCurr - xPrev);
        const y = yPrev + alpha * (yCurr - yPrev);

        ctx.fillRect(x, y, sizes[i], sizes[i]);
      }
    }
  }

  /* ---------------------------------------------------------
     MAIN LOOP (variable render, fixed update, interpolated)
  --------------------------------------------------------- */
  function loop(now) {
    let frameTime = now - lastTime;
    if (frameTime > MAX_FRAME_MS) frameTime = MAX_FRAME_MS;
    lastTime = now;

    accumulator += frameTime;

    while (accumulator >= STEP_MS) {
      // Store previous positions BEFORE advancing physics
      xsPrev.set(xs);
      ysPrev.set(ys);

      updateFixed();
      accumulator -= STEP_MS;
    }

    const alpha = accumulator / STEP_MS;
    render(alpha);

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
});
