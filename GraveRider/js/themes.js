// =====================================================
// GRAVE RIDER — LEVEL LOOKS (themes)
// Each level can have a `theme` (see js/levels.js). A theme is drawn in two
// layers: the background (sky, moon, far hills, far silhouettes; it moves
// slower than the ground = depth) and the props (tombstones, pumpkins, ...
// standing along the track, drawn behind the ground edge).
// Everything is drawn with simple canvas shapes (original art).
//
// theme = {
//   kind:  "skull" | "pumpkin" | "moon" | "bat"    (which scenery to draw)
//   sky:   [top, middle, bottom] colours
//   stars: 0..1  how many stars
//   body:  { kind: "moon"|"blood"|"earth"|"sun", x, y, r, color }   (x, y = share of the screen)
//   hills: [[parallax, colour, baseline share, height], ...]
//   propColor, propColor2, density (0..1)
// }
// =====================================================
var Themes = (function () {
  function rnd(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  // ---------------- background ----------------
  function drawBackground(ctx, theme, camera, w, h, time) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, theme.sky[0]); g.addColorStop(0.62, theme.sky[1]); g.addColorStop(1, theme.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Stars (fixed in the sky, twinkling a little)
    var n = Math.round(110 * (theme.stars || 0));
    for (var i = 0; i < n; i++) {
      var a = 0.35 + 0.65 * Math.abs(Math.sin(time * 0.6 + i * 1.7));
      ctx.fillStyle = "rgba(255,255,255," + (a * 0.9).toFixed(2) + ")";
      var sz = rnd(i + 9) < 0.15 ? 2.2 : 1.2;
      ctx.fillRect(rnd(i) * w, rnd(i + 50) * h * 0.62, sz, sz);
    }

    // Moon / earth / sun
    var b = theme.body;
    if (b) {
      var bx = w * b.x, by = h * b.y, r = b.r;
      var glow = ctx.createRadialGradient(bx, by, r * 0.8, bx, by, r * 2.4);
      glow.addColorStop(0, b.glow || "rgba(255,255,255,0.25)"); glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(bx, by, r * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
      if (b.kind === "moon" || b.kind === "blood") {
        ctx.fillStyle = "rgba(0,0,0,0.10)";
        [[-0.35, -0.2, 0.22], [0.3, 0.1, 0.17], [-0.1, 0.45, 0.14], [0.35, -0.4, 0.1], [-0.5, 0.2, 0.1]].forEach(function (c) {
          ctx.beginPath(); ctx.arc(bx + c[0] * r, by + c[1] * r, c[2] * r, 0, Math.PI * 2); ctx.fill();
        });
      } else if (b.kind === "earth") {
        ctx.fillStyle = "rgba(60,150,80,0.85)";
        [[-0.3, -0.2, 0.35], [0.35, 0.25, 0.28], [0.05, 0.5, 0.18]].forEach(function (c) {
          ctx.beginPath(); ctx.ellipse(bx + c[0] * r, by + c[1] * r, c[2] * r, c[2] * r * 0.7, 0.5, 0, Math.PI * 2); ctx.fill();
        });
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath(); ctx.ellipse(bx + r * 0.1, by - r * 0.45, r * 0.5, r * 0.1, 0.2, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Far silhouettes: a giant skull on the horizon, a bat cave...
    if (theme.kind === "skull") skullFar(ctx, camera, w, h);

    // Hill layers
    (theme.hills || []).forEach(function (layer) {
      ctx.fillStyle = layer[1];
      ctx.beginPath(); ctx.moveTo(0, h);
      for (var x = 0; x <= w + 20; x += 20) {
        var wx = x + camera.x * layer[0];
        ctx.lineTo(x, h * layer[2] - layer[3] * Math.sin(wx * 0.004) - layer[3] * 0.6 * Math.sin(wx * 0.011));
      }
      ctx.lineTo(w, h); ctx.fill();
    });

    if (theme.kind === "bat") batsFar(ctx, w, h, time, theme);
  }

  // A giant skull sitting on the far horizon (moves very slowly)
  function skullFar(ctx, camera, w, h) {
    var cx = ((w * 0.72 - camera.x * 0.04) % (w * 2.2) + w * 2.2) % (w * 2.2) - w * 0.3;
    var cy = h * 0.5, r = Math.min(w, h) * 0.17;
    ctx.fillStyle = "rgba(40,24,60,0.85)";
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.lineTo(cx + r * 0.72, cy + r * 0.85); ctx.lineTo(cx - r * 0.72, cy + r * 0.85); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,170,110,0.55)"; // glowing eyes + nose
    ctx.beginPath(); ctx.ellipse(cx - r * 0.36, cy + r * 0.05, r * 0.2, r * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + r * 0.36, cy + r * 0.05, r * 0.2, r * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, cy + r * 0.28); ctx.lineTo(cx - r * 0.1, cy + r * 0.5); ctx.lineTo(cx + r * 0.1, cy + r * 0.5); ctx.fill();
    ctx.fillStyle = "rgba(40,24,60,0.85)";
    for (var t = -2; t <= 2; t++) ctx.fillRect(cx + t * r * 0.28 - r * 0.07, cy + r * 0.62, r * 0.14, r * 0.3);
  }

  // Bats flapping across the night sky
  function batsFar(ctx, w, h, time, theme) {
    ctx.fillStyle = "rgba(10,4,16,0.9)";
    for (var i = 0; i < 7; i++) {
      var x = ((time * (30 + rnd(i) * 40) + rnd(i + 3) * w * 1.5) % (w + 160)) - 80;
      var y = h * (0.1 + rnd(i + 7) * 0.4) + Math.sin(time * 2 + i) * 12;
      var f = Math.sin(time * 12 + i * 2) * 0.6, s = 10 + rnd(i + 11) * 10;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - s * 0.7, y - s * (0.7 + f), x - s * 1.6, y + s * 0.1);
      ctx.quadraticCurveTo(x - s * 0.8, y + s * 0.2, x, y + s * 0.5);
      ctx.quadraticCurveTo(x + s * 0.8, y + s * 0.2, x + s * 1.6, y + s * 0.1);
      ctx.quadraticCurveTo(x + s * 0.7, y - s * (0.7 + f), x, y);
      ctx.fill();
    }
  }

  // ---------------- props along the track (world pixels) ----------------
  // floorY(x) = height of the riding surface, ceilY(x) = height of a ceiling above (or null)
  function drawProps(ctx, theme, level, minX, maxX, floorY, ceilY) {
    var step = 240, d = theme.density === undefined ? 0.55 : theme.density;
    for (var slot = Math.floor(minX / step); slot <= Math.floor(maxX / step); slot++) {
      if (rnd(slot * 7 + 1) > d) continue;
      var x = slot * step + rnd(slot * 3 + 2) * 170, fy = floorY(x);
      if (fy === null) continue;
      var size = 0.7 + rnd(slot * 5 + 3) * 0.8, kind = rnd(slot * 11 + 4);
      var back = rnd(slot + 77) < 0.5; // behind (darker) or in front
      ctx.save();
      ctx.globalAlpha = back ? 0.75 : 1;
      if (theme.kind === "skull") skullProp(ctx, x, fy, size, kind, theme);
      else if (theme.kind === "pumpkin") pumpkinProp(ctx, x, fy, size, kind, theme);
      else if (theme.kind === "moon") moonProp(ctx, x, fy, size, kind, theme);
      else if (theme.kind === "bat") batProp(ctx, x, fy, size, kind, theme, ceilY);
      ctx.restore();
    }
  }

  function skullProp(ctx, x, y, s, k, th) {
    ctx.fillStyle = th.propColor;
    if (k < 0.45) { // tombstone
      var w = 34 * s, hh = 52 * s;
      ctx.beginPath(); ctx.moveTo(x - w / 2, y + 10); ctx.lineTo(x - w / 2, y - hh + w / 2); ctx.arc(x, y - hh + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w / 2, y + 10); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - w * 0.2, y - hh * 0.6); ctx.lineTo(x + w * 0.2, y - hh * 0.6); ctx.moveTo(x, y - hh * 0.75); ctx.lineTo(x, y - hh * 0.35); ctx.stroke();
    } else if (k < 0.75) { // dead tree
      ctx.strokeStyle = th.propColor2; ctx.lineCap = "round";
      ctx.lineWidth = 9 * s; ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x + 3 * s, y - 70 * s); ctx.stroke();
      ctx.lineWidth = 5 * s;
      [[-1, -45, 34], [1, -58, 40], [-1, -72, 26]].forEach(function (b) {
        ctx.beginPath(); ctx.moveTo(x + 3 * s, y + b[1] * s); ctx.lineTo(x + b[0] * b[2] * s, y + (b[1] - 22) * s); ctx.stroke();
      });
    } else { // skull on a stick
      ctx.strokeStyle = th.propColor2; ctx.lineWidth = 4 * s;
      ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x, y - 52 * s); ctx.stroke();
      ctx.fillStyle = "#e9e1cf"; ctx.beginPath(); ctx.arc(x, y - 62 * s, 13 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(x - 8 * s, y - 56 * s, 16 * s, 11 * s);
      ctx.fillStyle = "#1b1030"; ctx.beginPath(); ctx.arc(x - 5 * s, y - 63 * s, 3.4 * s, 0, 7); ctx.arc(x + 5 * s, y - 63 * s, 3.4 * s, 0, 7); ctx.fill();
    }
  }

  function pumpkinProp(ctx, x, y, s, k, th) {
    if (k < 0.5) { // pumpkin
      pumpkin(ctx, x, y - 14 * s, 22 * s, 18 * s, k < 0.2);
    } else if (k < 0.8) { // corn stalks
      ctx.strokeStyle = th.propColor2; ctx.lineWidth = 3 * s; ctx.lineCap = "round";
      for (var i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(x + i * 10 * s, y + 6); ctx.quadraticCurveTo(x + i * 14 * s, y - 40 * s, x + i * 22 * s, y - 78 * s); ctx.stroke();
        ctx.fillStyle = "#d9a441"; ctx.beginPath(); ctx.ellipse(x + i * 14 * s, y - 40 * s, 4 * s, 11 * s, 0.2 * i, 0, 7); ctx.fill();
      }
    } else { // hay bale
      ctx.fillStyle = "#c9953a"; ctx.fillRect(x - 24 * s, y - 28 * s, 48 * s, 34 * s);
      ctx.strokeStyle = "rgba(90,50,10,0.5)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 8 * s, y - 28 * s); ctx.lineTo(x - 8 * s, y + 6); ctx.moveTo(x + 8 * s, y - 28 * s); ctx.lineTo(x + 8 * s, y + 6); ctx.stroke();
    }
  }

  function moonProp(ctx, x, y, s, k, th) {
    ctx.fillStyle = th.propColor;
    if (k < 0.5) { // boulder
      ctx.beginPath(); ctx.moveTo(x - 30 * s, y + 8); ctx.lineTo(x - 20 * s, y - 20 * s); ctx.lineTo(x + 2 * s, y - 30 * s); ctx.lineTo(x + 26 * s, y - 14 * s); ctx.lineTo(x + 34 * s, y + 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.moveTo(x - 20 * s, y - 20 * s); ctx.lineTo(x + 2 * s, y - 30 * s); ctx.lineTo(x - 4 * s, y - 8 * s); ctx.closePath(); ctx.fill();
    } else if (k < 0.8) { // small crater rim
      ctx.strokeStyle = th.propColor2; ctx.lineWidth = 4 * s;
      ctx.beginPath(); ctx.ellipse(x, y - 2, 46 * s, 9 * s, 0, Math.PI, 0); ctx.stroke();
    } else { // flag on a pole (original: a little moon-bike checker flag)
      ctx.strokeStyle = "#cfd3da"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x, y - 80 * s); ctx.stroke();
      ctx.fillStyle = "#ff6a2b"; ctx.fillRect(x, y - 80 * s, 30 * s, 20 * s);
    }
  }

  function batProp(ctx, x, y, s, k, th, ceilY) {
    ctx.fillStyle = th.propColor;
    if (k < 0.4) { // bone pile
      ctx.strokeStyle = "#d9d2bd"; ctx.lineWidth = 5 * s; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x - 26 * s, y - 6); ctx.lineTo(x + 24 * s, y - 14 * s); ctx.moveTo(x - 20 * s, y - 16 * s); ctx.lineTo(x + 28 * s, y - 4); ctx.stroke();
      ctx.fillStyle = "#d9d2bd"; ctx.beginPath(); ctx.arc(x, y - 18 * s, 9 * s, 0, 7); ctx.fill();
    } else if (k < 0.75) { // stalagmite
      ctx.beginPath(); ctx.moveTo(x - 18 * s, y + 8); ctx.lineTo(x - 2 * s, y - 70 * s); ctx.lineTo(x + 20 * s, y + 8); ctx.closePath(); ctx.fill();
    } else { // glowing eyes in the dark
      ctx.fillStyle = "rgba(255,70,70,0.9)"; ctx.beginPath(); ctx.arc(x - 7, y - 40 * s, 3, 0, 7); ctx.arc(x + 7, y - 40 * s, 3, 0, 7); ctx.fill();
    }
    // stalactites hanging from a ceiling above, if there is one
    var cy = ceilY && ceilY(x + 70);
    if (cy !== null && cy !== undefined && k > 0.3) {
      ctx.fillStyle = "#1a0d26";
      ctx.beginPath(); ctx.moveTo(x + 50, cy - 8); ctx.lineTo(x + 66, cy + 52 * s); ctx.lineTo(x + 82, cy - 8); ctx.closePath(); ctx.fill();
    }
  }

  // A pumpkin (also used for the bounce pads): body, ribs, stem and optional face
  function pumpkin(ctx, x, y, rx, ry, face) {
    ctx.fillStyle = "#e8721c"; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(120,45,0,0.45)"; ctx.lineWidth = 2;
    [-0.55, 0, 0.55].forEach(function (f) { ctx.beginPath(); ctx.ellipse(x, y, rx * (1 - Math.abs(f) * 0.55), ry, 0, 0, Math.PI * 2); if (f) ctx.stroke(); });
    ctx.fillStyle = "#3d7a2a"; ctx.fillRect(x - rx * 0.1, y - ry - 7, rx * 0.2, 9);
    if (face) {
      ctx.fillStyle = "#2b1203";
      ctx.beginPath(); ctx.moveTo(x - rx * 0.5, y - ry * 0.2); ctx.lineTo(x - rx * 0.25, y - ry * 0.55); ctx.lineTo(x - rx * 0.05, y - ry * 0.2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + rx * 0.5, y - ry * 0.2); ctx.lineTo(x + rx * 0.25, y - ry * 0.55); ctx.lineTo(x + rx * 0.05, y - ry * 0.2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - rx * 0.5, y + ry * 0.25); ctx.lineTo(x - rx * 0.25, y + ry * 0.55); ctx.lineTo(x, y + ry * 0.35); ctx.lineTo(x + rx * 0.25, y + ry * 0.55); ctx.lineTo(x + rx * 0.5, y + ry * 0.25); ctx.fill();
    }
  }

  return { drawBackground: drawBackground, drawProps: drawProps, pumpkin: pumpkin };
})();
