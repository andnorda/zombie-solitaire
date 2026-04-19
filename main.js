(function () {
  var dpr = window.devicePixelRatio || 1;

  // Two layered canvases:
  //   - `trail`: persistent. Holds the deck, foundations, and trail stamps.
  //     It is NEVER cleared (except on restart), so trails accumulate on it.
  //   - `live`: transient. Holds the currently-flying card. Cleared every frame
  //     so the moving card renders smoothly without leaving a continuous streak.
  var trailCanvas = document.getElementById("trail");
  var liveCanvas = document.getElementById("live");
  var trailCtx = trailCanvas.getContext("2d");
  var liveCtx = liveCanvas.getContext("2d");

  // Everything (sizes, strokes, corner radii, launch velocities, gravity) is
  // derived from `unit`, which is set on resize so the whole scene scales
  // proportionally with the viewport width. That way a laptop screen and a
  // projector render at the same relative layout and physics.
  //
  // `unit` = canvas-width / REFERENCE_WIDTH. Design constants below use the
  // numbers that looked right at a 1440-pixel-wide canvas (i.e., 1440 CSS-px
  // at dpr=1, or 1440 CSS-px at any dpr once CSS size is accounted for).
  var REFERENCE_WIDTH = 1440;
  var unit = 1;

  // Card size in canvas pixels. Preserves 71:96 aspect ratio.
  var cwidth = 0;
  var cheight = 0;
  var cwidthhalf = 0;
  var cheighthalf = 0;

  // Layout metrics, populated on resize.
  var margin = 0;
  var stackSpacing = 0;
  var stackStepX = 0;
  var stackStepY = 0;
  var deckX = 0,
    deckY = 0;
  var foundationsBaseY = 0;
  var foundationsRightX = 0;

  var particles = [];
  var imageReady = false;

  // Four foundations, each starts with N zombies to fire.
  var CARDS_PER_STACK = 13;
  var stacks = [
    CARDS_PER_STACK,
    CARDS_PER_STACK,
    CARDS_PER_STACK,
    CARDS_PER_STACK,
  ];
  var firing = false;
  var currentStack = 0;

  function resize() {
    var w = window.innerWidth * dpr;
    var h = window.innerHeight * dpr;

    trailCanvas.width = w;
    trailCanvas.height = h;
    trailCanvas.style.width = "100%";
    trailCanvas.style.height = "100%";

    liveCanvas.width = w;
    liveCanvas.height = h;
    liveCanvas.style.width = "100%";
    liveCanvas.style.height = "100%";

    unit = w / REFERENCE_WIDTH;

    cwidth = Math.round(220 * unit);
    cheight = Math.round((cwidth * 96) / 71);
    cwidthhalf = cwidth / 2;
    cheighthalf = cheight / 2;

    margin = 20 * unit;
    stackSpacing = (220 + 40) * unit;
    // Snap the per-card stack offset to an integer so successive under-card
    // strokes (whose width we tie to this step) tile exactly on the pixel
    // grid. Otherwise fractional stepping + pixel-aligned floors would leave
    // sub-pixel gaps between strokes that show as gray lines through the
    // stack.
    stackStepX = -Math.max(1, Math.round(2 * unit));
    stackStepY = -Math.max(1, Math.round(2 * unit));

    // Deck (top-left).
    deckX = margin + cwidthhalf;
    deckY = margin + cheighthalf;

    // Foundation stacks in top-right.
    foundationsBaseY = margin + cheighthalf;
    foundationsRightX = w - margin - cwidthhalf;
  }

  function foundationCenter(i) {
    var x = foundationsRightX - (3 - i) * stackSpacing;
    return { x: x, y: foundationsBaseY };
  }

  // Number of update ticks between consecutive trail stamps for a single
  // particle. Time-based spacing means stamps reflect the actual motion of
  // the particle over equal time intervals, so the trail shows where the
  // card truly was at each moment (fast-moving sections naturally have
  // more widely spaced stamps).
  var trailStampInterval = 2;

  function Particle(x, y, sx, sy) {
    if (sx === 0) sx = -2 * unit;

    // Force the very first position to leave a trail stamp.
    var ticksSinceStamp = trailStampInterval;

    this.x = x;
    this.y = y;

    var self = this;

    this.update = function () {
      x += sx;
      y += sy;

      self.x = x;
      self.y = y;

      if (x < -cwidthhalf || x > trailCanvas.width + cwidthhalf) {
        var index = particles.indexOf(self);
        particles.splice(index, 1);
        return false;
      }

      if (y > trailCanvas.height - cheighthalf) {
        y = trailCanvas.height - cheighthalf;
        sy = -sy * 0.85;
        self.y = y;
        // Force a stamp at the bottom of the bounce so the trail always
        // shows the card touching the floor, even if the regular stamp
        // cadence would otherwise skip this frame.
        drawCard(trailCtx, x, y);
        ticksSinceStamp = 0;
      }

      sy += 1.25 * unit;

      // Leave a card stamp behind on the trail canvas at a fixed time
      // interval. Time-based stamping gives an accurate record of the
      // particle's position over time: horizontal spacing stays even
      // (sx is constant) while vertical spacing naturally reflects
      // gravity's effect on sy.
      ticksSinceStamp++;
      if (ticksSinceStamp >= trailStampInterval) {
        ticksSinceStamp = 0;
        drawCard(trailCtx, x, y);
      }

      return true;
    };
  }

  var image = document.createElement("img");
  image.onload = function () {
    imageReady = true;
  };
  image.src = "zombie-token.png";

  var deckImage = document.createElement("img");
  var deckImageReady = false;
  deckImage.onload = function () {
    deckImageReady = true;
  };
  deckImage.src = "card-back.jpg";

  function drawCardShape(ctx, left, top, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(left + r, top);
    ctx.lineTo(left + w - r, top);
    ctx.quadraticCurveTo(left + w, top, left + w, top + r);
    ctx.lineTo(left + w, top + h - r);
    ctx.quadraticCurveTo(left + w, top + h, left + w - r, top + h);
    ctx.lineTo(left + r, top + h);
    ctx.quadraticCurveTo(left, top + h, left, top + h - r);
    ctx.lineTo(left, top + r);
    ctx.quadraticCurveTo(left, top, left + r, top);
    ctx.closePath();
  }

  // Draws a single zombie card (dark-gray body + border + token) onto the
  // given context, centered at (x, y).
  function drawCard(ctx, x, y) {
    var r = 6 * unit;
    var borderWidth = 2 * unit;
    var left = Math.floor(x - cwidthhalf);
    var top = Math.floor(y - cheighthalf);

    ctx.save();
    // The PNG has its own baked-in rounded corners with a larger radius than
    // our clip, so a thin crescent at each corner (inside the clip, outside
    // the PNG's opaque area) is transparent. Fill and stroke use the PNG's
    // own border color (#181510) so the crescent -- and the stroke where it
    // overlaps the PNG's dark border -- blend in seamlessly.
    drawCardShape(ctx, left, top, cwidth, cheight, r);
    ctx.fillStyle = "#181510";
    ctx.fill();
    ctx.save();
    drawCardShape(ctx, left, top, cwidth, cheight, r);
    ctx.clip();
    ctx.drawImage(image, left, top, cwidth, cheight);
    ctx.restore();
    drawCardShape(ctx, left, top, cwidth, cheight, r);
    ctx.lineWidth = borderWidth;
    ctx.strokeStyle = "#181510";
    ctx.stroke();
    ctx.restore();
  }

  function drawDeckOutline() {
    if (!deckImageReady) return;

    var left = Math.floor(deckX - cwidthhalf);
    var top = Math.floor(deckY - cheighthalf);
    // JPG has no transparency and bakes a thin white margin around a card whose
    // own rounded corners have a smaller radius than the jpg edge. Clipping at
    // r=14 (~matches the card's black-border radius) lands the clip inside
    // fully-black pixels instead of the white/AA transition zone.
    var r = 14 * unit;
    var borderWidth = 2 * unit;

    trailCtx.save();
    drawCardShape(trailCtx, left, top, cwidth, cheight, r);
    trailCtx.save();
    trailCtx.clip();
    trailCtx.drawImage(deckImage, left, top, cwidth, cheight);
    trailCtx.restore();
    drawCardShape(trailCtx, left, top, cwidth, cheight, r);
    trailCtx.lineWidth = borderWidth;
    trailCtx.strokeStyle = "#000000";
    trailCtx.stroke();
    trailCtx.restore();
  }

  function drawStack(centerX, centerY, count) {
    if (count <= 0) return;

    var r = 6 * unit;
    // Tie under-card stroke width to the (integer) step magnitude so
    // consecutive strokes tile exactly with no sub-pixel gap.
    var borderWidth = Math.abs(stackStepX);

    for (var k = count - 1; k >= 0; k--) {
      var cx = centerX + k * stackStepX;
      var cy = centerY + k * stackStepY;

      if (k === 0) {
        drawCard(trailCtx, cx, cy);
      } else {
        var left = Math.floor(cx - cwidthhalf);
        var top = Math.floor(cy - cheighthalf);

        trailCtx.save();
        drawCardShape(trailCtx, left, top, cwidth, cheight, r);
        trailCtx.fillStyle = "#ffffff";
        trailCtx.fill();
        trailCtx.lineWidth = borderWidth;
        trailCtx.strokeStyle = "#000000";
        trailCtx.stroke();
        trailCtx.restore();
      }
    }
  }

  function drawFoundations() {
    if (!imageReady) return;

    for (var i = 0; i < 4; i++) {
      var center = foundationCenter(i);
      drawStack(center.x, center.y, stacks[i]);
    }
  }

  function fireFromStack(i) {
    if (!imageReady) return;
    if (stacks[i] <= 0) return;

    var center = foundationCenter(i);
    var launchX = center.x;
    var launchY = center.y;

    var sx = Math.floor(Math.random() * 6 - 3) * 3 * unit; // -9..9 step 3
    if (sx === 0) sx = 3 * unit;
    var sy = -Math.random() * 20 * unit;

    particles.push(new Particle(launchX, launchY, sx, sy));

    stacks[i]--;
  }

  function totalRemaining() {
    return stacks[0] + stacks[1] + stacks[2] + stacks[3];
  }

  function advanceToNextNonEmptyStack() {
    var tries = 0;
    while (tries < 4 && stacks[currentStack] <= 0) {
      currentStack = (currentStack + 1) % 4;
      tries++;
    }
  }

  function fireNextCard() {
    if (totalRemaining() <= 0) {
      firing = false;
      return;
    }

    advanceToNextNonEmptyStack();

    if (stacks[currentStack] > 0) {
      fireFromStack(currentStack);
      currentStack = (currentStack + 1) % 4;
    }
  }

  function startShow() {
    firing = true;
    currentStack = 0;
    fireNextCard();
  }

  function tickShow() {
    if (!firing) return;
    if (particles.length === 0) {
      fireNextCard();
    }
  }

  var hasEverStarted = false;

  document.addEventListener("pointerdown", function () {
    if (!imageReady || !deckImageReady) return;

    if (!firing && !hasEverStarted) {
      hasEverStarted = true;
      startShow();
      return;
    }

    if (!firing && hasEverStarted) {
      // Restart: clear both canvases and redraw static UI.
      trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
      particles.length = 0;
      stacks = [
        CARDS_PER_STACK,
        CARDS_PER_STACK,
        CARDS_PER_STACK,
        CARDS_PER_STACK,
      ];
      drawDeckOutline();
      drawFoundations();
      startShow();
    }
  });

  window.addEventListener("resize", function () {
    resize();
    // Writing canvas.width/height resets pixel contents, so the deck and
    // foundations disappear on resize. Redraw them so moving the window to a
    // different screen (e.g., plugging in a projector) keeps the UI visible.
    if (imageReady && deckImageReady) {
      drawDeckOutline();
      drawFoundations();
    }
  });
  resize();

  var initialized = false;

  function animate() {
    if (!initialized && imageReady && deckImageReady) {
      initialized = true;
      trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      drawDeckOutline();
      drawFoundations();
    }

    tickShow();

    // Physics + trail stamping (trail stamps are written to trailCtx inside
    // Particle.update, only every trailStampDistance pixels of travel).
    var i = 0,
      l = particles.length;
    while (i < l) {
      particles[i].update() ? i++ : l--;
    }

    // Redraw all live particles on the live canvas from scratch each frame
    // so motion is perfectly smooth.
    liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    if (imageReady) {
      for (var p = 0; p < particles.length; p++) {
        drawCard(liveCtx, particles[p].x, particles[p].y);
      }
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
})();
