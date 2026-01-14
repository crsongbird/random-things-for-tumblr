document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("starfield-canvas");
  const ctx = canvas.getContext("2d");
  let pulseActive = false;
  let pulseEndTime = 0;

  /* ---------------------------------------------------------
     HIGH-DPI CANVAS SETUP
     Ensures crisp rendering on Retina / high-DPI displays.
  --------------------------------------------------------- */
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;

    // Reset transform before scaling (important!)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();

  /* ---------------------------------------------------------
     COLOR PALETTE
     Soft neon/pastel star colors.
  --------------------------------------------------------- */
  const colors = [
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
  ];

  function randomColor() {
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /* ---------------------------------------------------------
     RESPONSIVE STAR COUNT
     Density scales with screen area.
  --------------------------------------------------------- */
  function computeStarCount() {
    const area = window.innerWidth * window.innerHeight;
    const density = 0.0005;
    return Math.floor(area * density);
  }

  /* ---------------------------------------------------------
     SIZE DISTRIBUTION (biased)
     60% tiny, 30% medium, 10% large.
  --------------------------------------------------------- */
  function biasedSize() {
    const r = Math.random();
    if (r < 0.6) return 1 + Math.random() * 3;
    if (r < 0.9) return 4 + Math.random() * 3;
    return 7 + Math.random() * 3;
  }

  /* ---------------------------------------------------------
     STAR GENERATOR
     Each star has:
     - natural vertical speed
     - attraction force accumulator (ax/ay)
     - velocity (vx/vy)
  --------------------------------------------------------- */
  function generateStar() {
    const size = biasedSize();
    const breakPoint = 6.5;

    // Map size → vertical speed
    let speed = (size - breakPoint) * 0.05;
    if (Math.abs(speed) < 0.033) {
      speed = speed < 0 ? -0.033 : 0.033;
    }

    return {
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size,
      speed,
      color: randomColor(),

      // Attraction force accumulator
      ax: 0,
      ay: 0,

      // Velocity (starts at natural vertical speed)
      vx: 0,
      vy: speed
    };
  }

  /* ---------------------------------------------------------
     STARFIELD INITIALIZATION
  --------------------------------------------------------- */
  let stars = [];

  function regenerateStars() {
    const count = computeStarCount();
    stars = Array.from({ length: count }, generateStar);
  }

  regenerateStars();

  window.addEventListener("resize", () => {
    resize();
    regenerateStars();
  });

  /* ---------------------------------------------------------
     MOUSE TRACKING + INACTIVITY LOGIC
     The attractor only activates when the mouse is moving.
     When the mouse stops, attraction decays to zero.
  --------------------------------------------------------- */
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;

  let lastMouseX = mouseX;
  let lastMouseY = mouseY;

  let lastMoveTime = Date.now();
  const inactivityMs = 250; // how long before attractor shuts off

  window.addEventListener("mousemove", (e) => {
    lastMouseX = mouseX;
    lastMouseY = mouseY;

    mouseX = e.clientX;
    mouseY = e.clientY;

    // Only count real movement
    if (mouseX !== lastMouseX || mouseY !== lastMouseY) {
      lastMoveTime = Date.now();
    }

    if (mouseX !== lastMouseX || mouseY !== lastMouseY) {
      pulseActive = false; // movement cancels pulse
    }
  });

  // When mouse leaves, kill the attractor immediately
  window.addEventListener("mouseleave", () => {
    mouseX = window.innerWidth / 2;
    mouseY = window.innerHeight / 2;
    lastMoveTime = 0;
  });

  // Detect the mouse down for the repulsor effect
  window.addEventListener("mousedown", () => {
    pulseActive = true;
    pulseEndTime = Date.now() + 250; // 250ms pulse
  });

  /* ---------------------------------------------------------
     ANIMATION LOOP
  --------------------------------------------------------- */
  function animate() {
    // Fade only the star layer, preserving the CSS background
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.globalCompositeOperation = "source-over";

    const now = Date.now();
    const attractorActive = now - lastMoveTime < inactivityMs;

    // Pulse expires naturally
    if (pulseActive && Date.now() > pulseEndTime) {
      pulseActive = false;
    }

    for (const star of stars) {
      /* -----------------------------------------------------
         1. Compute attraction force (only if mouse is moving)
         Includes distance falloff so far stars barely move.
      ----------------------------------------------------- */
      const dx = mouseX - star.x;
      const dy = mouseY - star.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 0) {
        const ux = dx / dist;
        const uy = dy / dist;

        // Distance falloff
        const falloff = 1 / (dist * dist * 0.00025 + dist * 0.05 + 1);
        const force = 0.05 * falloff;

        // Determine direction:
        // - If pulse is active → repulsion
        // - Else if attractor is active → attraction
        // - Else → no force
        let direction = 0;

        if (pulseActive) {
          direction = -1;
        } else if (attractorActive) {
          direction = 1;
        }

        // Apply force only if direction is non-zero
        if (direction !== 0) {
          star.ax += ux * force * direction;
          star.ay += uy * force * direction;
        }
      }

      /* -----------------------------------------------------
         2. Apply attraction force to velocity
      ----------------------------------------------------- */
      star.vx += star.ax;
      star.vy += star.ay;

      /* -----------------------------------------------------
         3. Decay attraction force (so it fades out)
      ----------------------------------------------------- */
      star.ax *= 0.99;
      star.ay *= 0.99;

      if (Math.abs(star.ax) < 0.00005) star.ax = 0;
      if (Math.abs(star.ay) < 0.00005) star.ay = 0;

      /* -----------------------------------------------------
         4. Decay velocity back toward natural vertical speed
         Prevents permanent drift or black-hole collapse.
      ----------------------------------------------------- */
      star.vx *= 0.9;
      star.vy = star.speed + (star.vy - star.speed) * 0.9;

      if (Math.abs(star.vx) < 0.01) star.vx = 0;
      if (Math.abs(star.vy - star.speed) < 0.01) star.vy = star.speed;

      /* -----------------------------------------------------
         5. Apply velocity to position
      ----------------------------------------------------- */
      star.x += star.vx;
      star.y += star.vy;

      const buffer = 20;

      // Vertical wrap
      if (star.y < -buffer) {
        star.y = window.innerHeight + buffer;
        star.x = Math.random() * window.innerWidth;
        star.vx = 0;
        star.vy = star.speed;
        star.ax = 0;
        star.ay = 0;
      }

      if (star.y > window.innerHeight + buffer) {
        star.y = -buffer;
        star.x = Math.random() * window.innerWidth;
        star.vx = 0;
        star.vy = star.speed;
        star.ax = 0;
        star.ay = 0;
      }

      // Horizontal wrap
      if (star.x < -buffer) {
        star.x = window.innerWidth + buffer;
        star.y = Math.random() * window.innerHeight;
        star.vx = 0;
        star.vy = star.speed;
        star.ax = 0;
        star.ay = 0;
      }

      if (star.x > window.innerWidth + buffer) {
        star.x = -buffer;
        star.y = Math.random() * window.innerHeight;
        star.vx = 0;
        star.vy = star.speed;
        star.ax = 0;
        star.ay = 0;
      }

      /* -----------------------------------------------------
         8. Draw star
      ----------------------------------------------------- */
      ctx.fillStyle = star.color;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }

    requestAnimationFrame(animate);
  }

  animate();
});
