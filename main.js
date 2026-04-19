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

  // Token size on screen (CSS pixels). Preserves 71:96 aspect ratio.
  var cssWidth = 220;
  var cssHeight = Math.round((cssWidth * 96) / 71);

  var cwidth = cssWidth * Math.round(dpr);
  var cheight = cssHeight * Math.round(dpr);

  var cwidthhalf = cwidth / 2;
  var cheighthalf = cheight / 2;

  // Layout metrics, populated on resize.
  var margin = 20 * Math.round(dpr);
  var stackSpacing = (cssWidth + 40) * Math.round(dpr);
  var stackStepX = -2 * Math.round(dpr);
  var stackStepY = -2 * Math.round(dpr);
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
    if (sx === 0) sx = -2;

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
      }

      sy += 1.25;

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
    var scale = Math.round(dpr);
    var r = 6 * scale;
    var borderWidth = 2 * scale;
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

    var scale = Math.round(dpr);
    var left = Math.floor(deckX - cwidthhalf);
    var top = Math.floor(deckY - cheighthalf);
    // JPG has no transparency and bakes a thin white margin around a card whose
    // own rounded corners have a smaller radius than the jpg edge. Clipping at
    // r=14 (~matches the card's black-border radius) lands the clip inside
    // fully-black pixels instead of the white/AA transition zone.
    var r = 14 * scale;
    var borderWidth = 2 * scale;

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

    var scale = Math.round(dpr);
    var r = 6 * scale;
    var borderWidth = 2 * scale;

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

    var scale = Math.round(dpr);
    var sx = Math.floor(Math.random() * 6 - 3) * 3 * scale; // -9..9 step 3
    if (sx === 0) sx = 3 * scale;
    var sy = -Math.random() * 20 * scale;

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

  window.addEventListener("resize", resize);
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
