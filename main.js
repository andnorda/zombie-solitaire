( function () {

	var dpr = window.devicePixelRatio || 1;

	var canvas = document.getElementById( 'canvas' );
	var context = canvas.getContext( '2d' );

	// Token size on screen (CSS pixels). Preserves 71:96 aspect ratio.
	var cssWidth = 220;
	var cssHeight = Math.round( cssWidth * 96 / 71 );

	var cwidth = cssWidth * Math.round( dpr );
	var cheight = cssHeight * Math.round( dpr );

	var cwidthhalf = cwidth / 2;
	var cheighthalf = cheight / 2;

	// Layout metrics, populated on resize.
	var margin = 20 * Math.round( dpr );
	var stackSpacing = ( cssWidth + 40 ) * Math.round( dpr ); // horizontal gap between foundation stacks
	var stackStepX = -2 * Math.round( dpr ); // horizontal shift per card down the deck (negative = deeper cards peek out to the LEFT)
	var stackStepY = -2 * Math.round( dpr ); // vertical shift per card down the deck (negative = deeper cards peek out to the TOP)
	var deckX = 0, deckY = 0; // top-left deck outline (center)
	var foundationsBaseY = 0; // center-y of foundation stacks
	var foundationsRightX = 0; // center-x of the right-most foundation

	var particles = [];
	var imageReady = false;

	// Four foundations, each starts with N zombies to fire.
	var CARDS_PER_STACK = 13;
	var stacks = [ CARDS_PER_STACK, CARDS_PER_STACK, CARDS_PER_STACK, CARDS_PER_STACK ];
	var firing = false;

	// Round-robin firing across stacks: 0 (left) -> 1 -> 2 -> 3 (right) -> 0 ...
	// The next card fires as soon as the previous one has left the screen.
	var currentStack = 0;

	function resize() {

		canvas.width = window.innerWidth * dpr;
		canvas.height = window.innerHeight * dpr;
		canvas.style.width = '100%';
		canvas.style.height = '100%';

		// Deck outline in top-left.
		deckX = margin + cwidthhalf;
		deckY = margin + cheighthalf;

		// Four foundation stacks in top-right, tightly spaced.
		foundationsBaseY = margin + cheighthalf;
		foundationsRightX = canvas.width - margin - cwidthhalf;

	}

	function foundationCenter( i ) {
		// i = 0..3, 0 is left-most of the four, 3 is right-most (closest to edge).
		var x = foundationsRightX - ( 3 - i ) * stackSpacing;
		return { x: x, y: foundationsBaseY };
	}

	// Minimum distance (in canvas pixels) between consecutive trail stamps for a
	// single particle. Tuning this gives a visually consistent trail density
	// regardless of how fast any individual particle is moving.
	var trailStampDistance = 14 * Math.round( dpr );

	function Particle( x, y, sx, sy ) {

		if ( sx === 0 ) sx = -2;

		// Force the very first position to be stamped.
		var lastStampX = x - trailStampDistance * 2;
		var lastStampY = y;

		this.update = function () {

			x += sx;
			y += sy;

			if ( x < ( - cwidthhalf ) || x > ( canvas.width + cwidthhalf ) ) {

				var index = particles.indexOf( this );
				particles.splice( index, 1 );
				return false;

			}

			if ( y > canvas.height - cheighthalf ) {

				y = canvas.height - cheighthalf;
				sy = - sy * 0.85;

			}

			sy += 1.25;

			// Stamp the card only when the particle has travelled at least
			// trailStampDistance since the last stamp -- this gives a uniform
			// spatial density regardless of the particle's current speed.
			var dx = x - lastStampX;
			var dy = y - lastStampY;
			if ( dx * dx + dy * dy < trailStampDistance * trailStampDistance ) {
				return true;
			}
			lastStampX = x;
			lastStampY = y;

			var scale = Math.round( dpr );
			var r = 6 * scale;
			var borderWidth = 2 * scale;
			var left = Math.floor( x - cwidthhalf );
			var top = Math.floor( y - cheighthalf );

			context.save();
			drawCardShape( left, top, cwidth, cheight, r );
			context.fillStyle = '#ffffff';
			context.fill();
			context.lineWidth = borderWidth;
			context.strokeStyle = '#000000';
			context.stroke();
			drawCardShape( left, top, cwidth, cheight, r );
			context.clip();
			context.drawImage( image, left, top, cwidth, cheight );
			context.restore();

			return true;

		};

	}

	var image = document.createElement( 'img' );
	image.onload = function () { imageReady = true; };
	image.src = 'zombie-token.png?v=2';

	var deckImage = document.createElement( 'img' );
	var deckImageReady = false;
	deckImage.onload = function () { deckImageReady = true; };
	deckImage.src = 'card-back.jpg';

	function drawDeckOutline() {

		// Deck (top-left): rendered as the Magic card back, clipped to a rounded
		// card shape with a black border matching the face cards.
		if ( ! deckImageReady ) return;

		var scale = Math.round( dpr );
		var left = Math.floor( deckX - cwidthhalf );
		var top = Math.floor( deckY - cheighthalf );
		var r = 10 * scale;
		var borderWidth = 2 * scale;

		context.save();

		// Clip to the rounded-rect card shape and draw the card-back image.
		drawCardShape( left, top, cwidth, cheight, r );
		context.save();
		context.clip();
		context.drawImage( deckImage, left, top, cwidth, cheight );
		context.restore();

		// Black rounded border on top.
		drawCardShape( left, top, cwidth, cheight, r );
		context.lineWidth = borderWidth;
		context.strokeStyle = '#000000';
		context.stroke();

		context.restore();

	}

	function drawCardShape( left, top, w, h, r ) {
		// A rounded rectangle path, positioned at (left, top) with size (w, h) and
		// corner radius r.
		context.beginPath();
		context.moveTo( left + r, top );
		context.lineTo( left + w - r, top );
		context.quadraticCurveTo( left + w, top, left + w, top + r );
		context.lineTo( left + w, top + h - r );
		context.quadraticCurveTo( left + w, top + h, left + w - r, top + h );
		context.lineTo( left + r, top + h );
		context.quadraticCurveTo( left, top + h, left, top + h - r );
		context.lineTo( left, top + r );
		context.quadraticCurveTo( left, top, left + r, top );
		context.closePath();
	}

	function drawStack( centerX, centerY, count ) {
		// Renders a deck-thickness pile of `count` cards with the top card being
		// the zombie token. The deeper cards peek out at the bottom-right, with
		// thin dark hatch lines suggesting individual card edges.

		if ( count <= 0 ) return;

		var scale = Math.round( dpr );
		var r = 6 * scale; // card corner radius
		var borderWidth = 2 * scale;

		// The top (face) card is at (centerX, centerY). Cards below are offset
		// down-right by (stackStepX, stackStepY) per card.
		// Draw deepest card first, then progressively to the top.
		for ( var k = count - 1; k >= 0; k -- ) {

			var cx = centerX + k * stackStepX;
			var cy = centerY + k * stackStepY;
			var left = Math.floor( cx - cwidthhalf );
			var top = Math.floor( cy - cheighthalf );

			// White card body with black border.
			context.save();
			drawCardShape( left, top, cwidth, cheight, r );
			context.fillStyle = '#ffffff';
			context.fill();
			context.lineWidth = borderWidth;
			context.strokeStyle = '#000000';
			context.stroke();

			if ( k === 0 ) {
				// Top card: draw the zombie token inside the card body.
				// Clip to the rounded rect so the token stays within the card border.
				drawCardShape( left, top, cwidth, cheight, r );
				context.clip();
				context.drawImage( image, left, top, cwidth, cheight );
			}

			context.restore();

		}
	}

	function drawFoundations() {

		if ( ! imageReady ) return;

		for ( var i = 0; i < 4; i ++ ) {

			var center = foundationCenter( i );
			drawStack( center.x, center.y, stacks[ i ] );

		}

	}

	function fireFromStack( i ) {

		if ( ! imageReady ) return;
		if ( stacks[ i ] <= 0 ) return;

		var center = foundationCenter( i );
		// Launch from the top (face) card position of the stack.
		var launchX = center.x;
		var launchY = center.y;

		// Symmetric horizontal speed range: zombies can fly left OR right.
		var scale = Math.round( dpr );
		var sx = Math.floor( Math.random() * 6 - 3 ) * 3 * scale; // -9..9 step 3
		if ( sx === 0 ) sx = 3 * scale;
		var sy = - Math.random() * 20 * scale;

		particles.push( new Particle( launchX, launchY, sx, sy ) );

		stacks[ i ] -- ;

	}

	function totalRemaining() {
		return stacks[0] + stacks[1] + stacks[2] + stacks[3];
	}

	function advanceToNextNonEmptyStack() {
		var tries = 0;
		while ( tries < 4 && stacks[ currentStack ] <= 0 ) {
			currentStack = ( currentStack + 1 ) % 4;
			tries ++ ;
		}
	}

	function fireNextCard() {

		if ( totalRemaining() <= 0 ) {
			firing = false;
			return;
		}

		advanceToNextNonEmptyStack();

		if ( stacks[ currentStack ] > 0 ) {
			fireFromStack( currentStack );
			currentStack = ( currentStack + 1 ) % 4;
		}

	}

	function startShow() {
		firing = true;
		currentStack = 0;
		fireNextCard();
	}

	function tickShow() {

		if ( ! firing ) return;

		// Fire the next card as soon as no zombies remain on screen.
		if ( particles.length === 0 ) {
			fireNextCard();
		}

	}

	var hasEverStarted = false;

	// Input: first click starts the show; later clicks restart after it finishes.
	document.addEventListener( 'pointerdown', function () {

		if ( ! imageReady || ! deckImageReady ) return;

		if ( ! firing && ! hasEverStarted ) {
			// First click: begin firing from the stacks already rendered.
			hasEverStarted = true;
			startShow();
			return;
		}

		if ( ! firing && hasEverStarted ) {
			// Show finished: reset everything and start again.
			context.clearRect( 0, 0, canvas.width, canvas.height );
			particles.length = 0;
			stacks = [ CARDS_PER_STACK, CARDS_PER_STACK, CARDS_PER_STACK, CARDS_PER_STACK ];
			drawDeckOutline();
			drawFoundations();
			startShow();
		}

	} );

	window.addEventListener( 'resize', resize );
	resize();

	// Animation loop.
	var lastTime = performance.now();
	var initialized = false;

	function animate( now ) {

		var dt = now - lastTime;
		lastTime = now;

		// First-time paint once both images have loaded: render the four stacks
		// and the deck. The show does NOT start until the user clicks.
		if ( ! initialized && imageReady && deckImageReady ) {
			initialized = true;
			context.clearRect( 0, 0, canvas.width, canvas.height );
			drawDeckOutline();
			drawFoundations();
		}

		tickShow();

		// Do NOT clear the canvas -- that preserves the bouncing-card trail effect.
		// The deck outline and foundation stacks were drawn once at init, so they
		// sit BEHIND the accumulating trails (which paint on top over time).
		var i = 0, l = particles.length;
		while ( i < l ) {
			particles[ i ].update() ? i ++ : l --;
		}

		requestAnimationFrame( animate );

	}

	requestAnimationFrame( animate );

} )();
