(function () {
  const REFERENCE_WIDTH = 1440;
  const CARDS_PER_STACK = 13;
  const TOTAL_CARDS = CARDS_PER_STACK * 4;

  const dpr = window.devicePixelRatio || 1;
  const canvas = document.getElementById("trail");
  const ctx = canvas.getContext("2d");

  // `unit` scales everything with the viewport so the scene looks the same on
  // a laptop and a projector. Design constants are tuned at a 1440-px canvas.
  let unit = 1;
  let cw = 0;
  let ch = 0;
  let margin = 0;
  let stackSpacing = 0;

  let image, deckImage;
  // Start "done" so step() idles until the first click kicks off `restart`.
  let fired = TOTAL_CARDS;
  const particles = [];

  function resize() {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    unit = canvas.width / REFERENCE_WIDTH;
    cw = Math.round(220 * unit);
    ch = Math.round((cw * 96) / 71);
    margin = 20 * unit;
    stackSpacing = 260 * unit;

    drawStatic();
  }

  function stackX(i) {
    return canvas.width - margin - cw / 2 - (3 - i) * stackSpacing;
  }

  // A zombie-token card: PNG on a dark fill + matching dark border. The PNG's
  // baked-in rounded corners are larger than our clip, so the corner crescent
  // inside the clip is transparent -- matching the fill/stroke to the PNG's
  // own border color (#181510) makes the seam invisible.
  function zombieCard(x, y) {
    const left = Math.floor(x - cw / 2);
    const top = Math.floor(y - ch / 2);

    ctx.beginPath();
    ctx.roundRect(left, top, cw, ch, 6 * unit);
    ctx.fillStyle = "#181510";
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.drawImage(image, left, top, cw, ch);
    ctx.restore();
    ctx.lineWidth = 2 * unit;
    ctx.strokeStyle = "#181510";
    ctx.stroke();
  }

  function drawStatic() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Deck. r=14 lands the clip inside the card's black border, past the
    // JPG's thin white margin transition zone.
    const dLeft = Math.floor(margin);
    const dTop = Math.floor(margin);
    ctx.beginPath();
    ctx.roundRect(dLeft, dTop, cw, ch, 14 * unit);
    ctx.fillStyle = "#181510";
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.drawImage(deckImage, dLeft, dTop, cw, ch);
    ctx.restore();
    ctx.lineWidth = 2 * unit;
    ctx.strokeStyle = "#000000";
    ctx.stroke();

    for (let i = 0; i < 4; i++) {
      zombieCard(stackX(i), margin + ch / 2);
    }
  }

  function launch(stackIdx) {
    const sx = [-9, -6, -3, 3, 6, 9][Math.floor(Math.random() * 6)] * unit;
    const sy = -Math.random() * 20 * unit;
    particles.push({ x: stackX(stackIdx), y: margin + ch / 2, sx, sy });
  }

  function restart() {
    particles.length = 0;
    fired = 0;
    drawStatic();
  }

  function step() {
    if (particles.length === 0 && fired < TOTAL_CARDS) {
      launch(fired++ % 4);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.sx;
      p.y += p.sy;
      p.sy += 1.25 * unit;

      if (p.y > canvas.height - ch / 2) {
        p.y = canvas.height - ch / 2;
        p.sy *= -0.85;
      }

      if (p.x < -cw / 2 || p.x > canvas.width + cw / 2) {
        particles.splice(i, 1);
        continue;
      }

      zombieCard(p.x, p.y);
    }

    requestAnimationFrame(step);
  }

  function load(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = src;
    });
  }

  Promise.all([load("zombie-token.png"), load("card-back.jpg")]).then(
    ([i, d]) => {
      image = i;
      deckImage = d;
      resize();
      window.addEventListener("resize", resize);
      document.addEventListener("pointerdown", restart);
      requestAnimationFrame(step);
    }
  );
})();
