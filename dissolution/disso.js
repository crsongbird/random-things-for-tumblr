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
     STAR STORAGE (SIMD)
  --------------------------------------------------------- */
  let count = 0;
  let xs, ys, vxs, vys, axs, ays, sizes, speeds, colorIndexes;
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

    const colorCount = CFG.colors.length;
    colorBuckets = new Array(colorCount);
    for (let c = 0; c < colorCount; c++) {
      colorBuckets[c] = [];
    }

    for (let i = 0; i < count; i++) {
      const size = biasedSize();
      const base = (size - 6.5) * 0.05;
      const speed = Math.abs(base) < 0.033 ? (base < 0 ? -0.033 : 0.033) : base;
      const ci = randomColorIndex();

      xs[i] = Math.random() * W;
      ys[i] = Math.random() * H;
      vxs[i] = 0;
      vys[i] = speed;
      axs[i] = 0;
      ays[i] = 0;
      sizes[i] = size;
      speeds[i] = speed;
      colorIndexes[i] = ci;
      colorBuckets[ci].push(i);
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
    mouse.pulseEnd = now + 250;
  });

  /* ---------------------------------------------------------
     FIXED TIMESTEP
  --------------------------------------------------------- */
  const STEP_MS = 1000 / 60; // fixed 60 Hz
  const MAX_FRAME_MS = 1000 / 30;

  let accumulator = 0;
  let lastTime = performance.now();

  /* ---------------------------------------------------------
     UPDATE
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
        // fall = 1 / (dist * (dist * 0.00025 + 0.05) + 1);
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
      if (y < -buf) y = H + buf;
      else if (y > H + buf) y = -buf;

      if (x < -buf) x = W + buf;
      else if (x > W + buf) x = -buf;

      xs[i] = x;
      ys[i] = y;
      vxs[i] = vx;
      vys[i] = vy;
      axs[i] = ax;
      ays[i] = ay;
    }
  }

  /* ---------------------------------------------------------
     RENDER
  --------------------------------------------------------- */
  function render() {
    ctx.clearRect(0, 0, W, H);

    const colors = CFG.colors;
    const buckets = colorBuckets;

    for (let c = 0; c < colors.length; c++) {
      const group = buckets[c];
      if (!group.length) continue;

      ctx.fillStyle = colors[c];

      // batching draw calls for speedup
      for (let j = 0; j < group.length; j++) {
        const i = group[j];
        ctx.fillRect(xs[i], ys[i], sizes[i], sizes[i]);
      }
    }
  }

  /* ---------------------------------------------------------
     MAIN LOOP (with timesteps)
  --------------------------------------------------------- */
  function loop(now) {
    let frameTime = now - lastTime;
    if (frameTime > MAX_FRAME_MS) frameTime = MAX_FRAME_MS;
    lastTime = now;

    accumulator += frameTime;

    while (accumulator >= STEP_MS) {
      updateFixed();
      accumulator -= STEP_MS;
    }

    render();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
});
