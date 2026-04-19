(function () {
  var dpr = window.devicePixelRatio || 1;
  var REFERENCE_WIDTH = 1440;
  var CARDS_PER_STACK = 13;

  var canvas = document.getElementById("trail");
  var ctx = canvas.getContext("2d");

  // `unit` scales everything with the viewport so the scene looks the same on
  // a laptop and a projector. Design constants are tuned at a 1440-px canvas.
  var unit = 1;
  var cw = 0;
  var ch = 0;
  var margin = 0;
  var stackSpacing = 0;
  var stackStep = 0;

  var image, deckImage;
  var queue = [];
  var particles = [];

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
    // Integer step so consecutive under-card strokes (whose width matches the
    // step) tile exactly on the pixel grid -- otherwise sub-pixel gaps show
    // as gray lines through the stack.
    stackStep = Math.max(1, Math.round(2 * unit));

    drawStatic();
  }

  function deckCenter() {
    return { x: margin + cw / 2, y: margin + ch / 2 };
  }

  function stackCenter(i) {
    return {
      x: canvas.width - margin - cw / 2 - (3 - i) * stackSpacing,
      y: margin + ch / 2,
    };
  }

  function cardShape(left, top, r) {
    ctx.beginPath();
    ctx.moveTo(left + r, top);
    ctx.lineTo(left + cw - r, top);
    ctx.quadraticCurveTo(left + cw, top, left + cw, top + r);
    ctx.lineTo(left + cw, top + ch - r);
    ctx.quadraticCurveTo(left + cw, top + ch, left + cw - r, top + ch);
    ctx.lineTo(left + r, top + ch);
    ctx.quadraticCurveTo(left, top + ch, left, top + ch - r);
    ctx.lineTo(left, top + r);
    ctx.quadraticCurveTo(left, top, left + r, top);
    ctx.closePath();
  }

  function drawCard(x, y, img, r, fill, stroke, strokeWidth) {
    var left = Math.floor(x - cw / 2);
    var top = Math.floor(y - ch / 2);

    cardShape(left, top, r);
    ctx.fillStyle = fill;
    ctx.fill();

    if (img) {
      ctx.save();
      cardShape(left, top, r);
      ctx.clip();
      ctx.drawImage(img, left, top, cw, ch);
      ctx.restore();
    }

    cardShape(left, top, r);
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  // A zombie-token card: PNG on a dark fill + matching dark border. The PNG's
  // baked-in rounded corners are larger than our clip, so the corner crescent
  // inside the clip is transparent -- matching the fill/stroke to the PNG's
  // own border color (#181510) makes the seam invisible.
  function zombieCard(x, y) {
    drawCard(x, y, image, 6 * unit, "#181510", "#181510", 2 * unit);
  }

  function drawStatic() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Deck. r=14 lands the clip inside the card's black border, past the
    // JPG's thin white margin transition zone.
    var d = deckCenter();
    drawCard(d.x, d.y, deckImage, 14 * unit, "#181510", "#000000", 2 * unit);

    // Four foundation stacks of zombie tokens.
    for (var i = 0; i < 4; i++) {
      var c = stackCenter(i);
      for (var k = CARDS_PER_STACK - 1; k >= 0; k--) {
        var cx = c.x - k * stackStep;
        var cy = c.y - k * stackStep;
        if (k === 0) {
          zombieCard(cx, cy);
        } else {
          drawCard(cx, cy, null, 6 * unit, "#ffffff", "#000000", stackStep);
        }
      }
    }
  }

  function launch(stackIdx) {
    var c = stackCenter(stackIdx);
    var sx = Math.floor(Math.random() * 6 - 3) * 3 * unit; // -9..9 step 3
    if (sx === 0) sx = 3 * unit;
    var sy = -Math.random() * 20 * unit;
    particles.push({ x: c.x, y: c.y, sx: sx, sy: sy });
  }

  function restart() {
    particles.length = 0;
    queue.length = 0;
    for (var n = 0; n < CARDS_PER_STACK; n++) {
      for (var i = 0; i < 4; i++) queue.push(i);
    }
    drawStatic();
  }

  function step() {
    if (particles.length === 0 && queue.length > 0) {
      launch(queue.shift());
    }

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
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
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.src = src;
    });
  }

  Promise.all([load("zombie-token.png"), load("card-back.jpg")]).then(
    function (imgs) {
      image = imgs[0];
      deckImage = imgs[1];
      resize();
      window.addEventListener("resize", resize);
      document.addEventListener("pointerdown", restart);
      requestAnimationFrame(step);
    }
  );
})();
