import { WORDMARK_BOX, WORDMARK_LETTERS } from './geometry';

/**
 * The closing scene, drawn inside the page background so the cursor's sand
 * reaches it too: the “Atlas” wordmark gathering out of blown sand, and a
 * planet of light rising beneath it — latitude and longitude drawn out from
 * the pole, city lights, and travellers' arcs crossing it.
 */

/** Where the word sits in its texture: margins around it let the bloom fade out. */
const MARGIN = 0.03;
const SPAN = 1 - MARGIN * 2;
const HEIGHT = (SPAN * WORDMARK_BOX.height) / WORDMARK_BOX.width;
/** The texture is four times wider than tall; the word is centred in it. */
export const MARK_TEX = { x: MARGIN, y: (1 - HEIGHT * 4) / 2, width: SPAN, height: HEIGHT * 4 } as const;

/** Endpoints of the arcs, as latitude/longitude pairs on the globe. */
const ROUTES: [number, number, number, number][] = [
  [52, -30, 36, 46],
  [68, 96, 31, 168],
  [42, -118, 71, -176],
  [22, 12, 58, 128],
];

const onSphere = (lat: number, lon: number) => {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
};

export const ROUTE_A = new Float32Array(ROUTES.flatMap(([lat, lon]) => onSphere(lat, lon)));
export const ROUTE_B = new Float32Array(ROUTES.flatMap(([, , lat, lon]) => onSphere(lat, lon)));

/**
 * Where this shader dialect offers derivatives (WebGL1, once the extension is
 * on) they keep the globe's lines a constant width on screen; elsewhere —
 * WebGL2 included — the widths are worked out by hand from the globe itself.
 */
export const FINALE_PRELUDE = `
#ifdef GL_OES_standard_derivatives
#extension GL_OES_standard_derivatives : enable
#endif
`;

export const FINALE_GLSL = `
uniform sampler2D uMark;
uniform vec4 uMarkRect;   // the word's box in canvas pixels: left, bottom, width, height
uniform vec4 uMarkTex;    // the box inside the texture: left, top, width, height
uniform float uMarkForm;  // 0 = blown sand, 1 = formed
uniform float uMarkSweep; // the light sweep's place across the word
uniform float uMarkOn;
uniform vec4 uGlobe;      // centre (canvas pixels, y up), radius, visibility
uniform float uGlobeTilt; // the pole tipped toward the viewer
uniform float uGlobeSpin;
uniform float uGlobeDraw; // 0-1, the lines drawn out from the pole
uniform vec3 uRouteA[4];
uniform vec3 uRouteB[4];
uniform float uPx;        // canvas pixels per CSS pixel

const vec3 LINE = vec3(0.42, 0.58, 1.0);
const vec3 NIGHT = vec3(0.004, 0.012, 0.05);

vec2 markTexel(vec2 uv) {
  return vec2(uMarkTex.x + uv.x * uMarkTex.z, uMarkTex.y + (1.0 - uv.y) * uMarkTex.w);
}

// Loose, every pixel looks for the word somewhere else — nearby at random, and
// further back along the wind that carried it in from the lower left — so the
// letters read as drifting grains that gather into the solid word.
vec3 wordmark(vec2 frag, vec3 col, vec2 seed) {
  vec2 uv = (frag - uMarkRect.xy) / uMarkRect.zw;
  float reach = (1.0 - uMarkForm) * (1.0 - uMarkForm);
  vec2 pad = vec2(460.0 * reach + 60.0) * uPx / uMarkRect.zw;
  if (uv.x < -pad.x || uv.x > 1.0 + pad.x || uv.y < -pad.y || uv.y > 1.0 + pad.y) return col;

  float rnd = randm(seed + 17.3);
  float ang = randm(seed + 41.9) * 6.2831853;
  vec2 offset = (vec2(90.0, 210.0) * (0.25 + rnd) + vec2(cos(ang), sin(ang)) * 120.0 * rnd) * reach * uPx;
  vec2 s = uv + offset / uMarkRect.zw;
  float a = 0.0;
  // A large negative bias pins the sharpest level: grains stay single pixels.
  if (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0) a = texture2D(uMark, markTexel(s), -16.0).a;
  a *= mix(0.45 + 0.55 * randm(seed + 88.1), 1.0, uMarkForm * uMarkForm) * smoothstep(0.0, 0.3, uMarkForm);

  // A soft bloom from the texture's blurred levels, rising as the word forms.
  vec2 g = markTexel(uv);
  float bloom = texture2D(uMark, g, 4.5).a * 0.6 + texture2D(uMark, g, 6.0).a * 0.4;
  col += vec3(0.35, 0.5, 1.0) * bloom * 0.24 * uMarkForm;

  // Lit from below by the planet; the sweep crosses as a brighter band.
  float sweep = exp(-pow((uv.x - uMarkSweep) * 4.5 + (uv.y - 0.5) * 0.9, 2.0));
  vec3 lit = mix(vec3(0.8, 0.85, 0.96), vec3(1.0), 1.0 - uv.y * 0.9);
  return mix(col, min(lit + sweep * 0.2, vec3(1.0)), a);
}

vec3 rotX(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

vec3 rotY(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, c * p.z - s * p.x);
}

float gridDist(float x) {
  return abs(fract(x - 0.5) - 0.5);
}

// Parallels every 10°, meridians every 15°, the equator and prime meridian
// stronger, the tropics and polar circles dashed — each about a pixel wide.
float graticule(vec3 p, float facing, float rpx, out float latD, out float lonD) {
  latD = degrees(asin(clamp(p.y, -1.0, 1.0)));
  lonD = degrees(atan(p.x, p.z));
  float pv = latD / 10.0;
  float mv = lonD / 15.0;
#ifdef GL_OES_standard_derivatives
  float wp = fwidth(pv);
  // Longitude jumps by 360° along one meridian; the copy turned half way round doesn't.
  float wm = min(fwidth(mv), fwidth(degrees(atan(-p.x, -p.z)) / 15.0));
#else
  float k = 57.29578 / (rpx * max(facing, 0.12));
  float wp = k / 10.0;
  float wm = k / (15.0 * max(cos(radians(latD)), 0.05));
#endif
  float hw = 0.8 * uPx;
  float polar = smoothstep(86.0, 72.0, abs(latD));
  float g = max(1.0 - smoothstep(0.0, wp * hw, gridDist(pv)), (1.0 - smoothstep(0.0, wm * hw, gridDist(mv))) * polar) * 0.5;
  float major = max(
    1.0 - smoothstep(0.0, wp * hw * 1.5, abs(latD) / 10.0),
    (1.0 - smoothstep(0.0, wm * hw * 1.5, abs(lonD) / 15.0)) * polar
  );
  float circles = max(
    1.0 - smoothstep(0.0, wp * hw * 1.2, abs(abs(latD) - 23.44) / 10.0),
    1.0 - smoothstep(0.0, wp * hw * 1.2, abs(abs(latD) - 66.56) / 10.0)
  );
  float dash = step(fract(lonD / 2.5), 0.5);
  return max(g, max(major * 0.9, circles * dash * 0.75));
}

// A traveller's arc along the great circle from a to b: a fading trail with a
// bright head that crosses once per cycle.
float route(vec3 p, vec3 a, vec3 b, float t, float rpx) {
  vec3 nrm = normalize(cross(a, b));
  float off = abs(dot(p, nrm)) * rpx;
  if (off > 9.0 * uPx) return 0.0;
  float theta = acos(clamp(dot(a, b), -1.0, 1.0));
  vec3 q = normalize(p - dot(p, nrm) * nrm);
  float phi = atan(dot(cross(a, q), nrm), dot(a, q));
  if (phi < -0.02 || phi > theta + 0.02) return 0.0;
  float trail = 0.75;
  float head = t * (theta + trail);
  float behind = head - phi;
  float glow = 0.0;
  if (behind > 0.0 && behind < trail) {
    float k = 1.0 - behind / trail;
    glow += exp(-off * off / (1.2 * uPx * uPx)) * k * k;
  }
  if (head < theta) {
    vec2 tip = vec2(behind * rpx, off);
    glow += 1.6 * exp(-dot(tip, tip) / (12.0 * uPx * uPx));
  }
  return glow;
}

vec3 globe(vec2 frag, vec3 col) {
  float rpx = uGlobe.z;
  vec2 d = (frag - uGlobe.xy) / rpx;
  float dist = length(d);
  float edge = (dist - 1.0) * rpx;
  float vis = uGlobe.w;
  float rise = smoothstep(0.0, 0.3, uGlobeDraw);
  // The atmosphere breathes with the page light's two-second swing.
  float breath = 0.88 + 0.16 * sin(uTime * 1.5707963);
  vec3 air = mix(ELECTRIC, AZURE, 0.35) * breath;

  // The atmosphere: a tight bright rim and a wide soft glow beyond the limb.
  if (edge > 0.0) {
    float halo = 0.55 * exp(-edge / (26.0 * uPx)) + 0.24 * exp(-edge / (200.0 * uPx));
    col += air * halo * rise * vis;
    if (edge > 1.5 * uPx) return col;
  }
  float cover = 1.0 - smoothstep(-uPx, uPx, edge);
  vec2 dd = d / max(dist, 1.0);
  vec3 n = vec3(dd, sqrt(max(0.0, 1.0 - dot(dd, dd))));
  float facing = n.z;

  // The body: deep night, lit softly from above where the word hangs — the
  // light drifting slowly across it like a sun — its limb glowing.
  float lit = clamp(dot(n, normalize(vec3(0.45 * sin(uTime * 0.21), 0.8, 0.6))), 0.0, 1.0);
  vec3 c = mix(col, NIGHT + DEEP * 0.32 * lit * lit, 0.9);
  c += air * 0.55 * pow(1.0 - facing, 2.6) * rise;
  float fade = smoothstep(0.0, 0.2, facing);

  // The lines draw out from the pole; a ring of light rides the drawing edge.
  float frontier = 90.0 - uGlobeDraw * 195.0;
  vec3 p = rotY(rotX(n, -uGlobeTilt), -uGlobeSpin);
  float latD;
  float lonD;
  float g = graticule(p, facing, rpx, latD, lonD);
  float drawn = smoothstep(frontier - 1.5, frontier + 1.5, latD);
  float wave = exp(-pow((latD - frontier) / 3.0, 2.0)) * (1.0 - smoothstep(0.92, 1.0, uGlobeDraw));
  c += LINE * g * drawn * fade * (0.8 + 1.8 * wave);
  c += air * wave * 0.06 * fade;

  // The far side's lines, faint through the glass.
  vec3 pb = rotY(rotX(vec3(dd, -facing), -uGlobeTilt), -uGlobeSpin);
  float latB;
  float lonB;
  float gb = graticule(pb, facing, rpx, latB, lonB);
  c += LINE * gb * smoothstep(frontier - 1.5, frontier + 1.5, latB) * 0.15 * fade;

  // City lights, one possible per 3° cell, twinkling.
  vec2 ll = vec2(lonD, latD);
  vec2 cell = floor(ll / 3.0);
  float h = hash(cell + 7.31);
  if (h > 0.84) {
    vec2 spot = (cell + 0.2 + 0.6 * vec2(hash(cell + 1.7), hash(cell + 9.2))) * 3.0;
    vec2 dl = radians(ll - spot) * vec2(cos(radians(latD)), 1.0) * rpx;
    float tw = 0.5 + 0.5 * sin(uTime * (0.7 + 1.6 * h) + h * 50.0);
    c += vec3(0.78, 0.87, 1.0) * exp(-dot(dl, dl) / (1.5 * uPx * uPx)) * (0.3 + 0.7 * tw) * drawn * fade;
  }

  // Travellers' arcs, once the map is drawn.
  float trips = 0.0;
  for (int i = 0; i < 4; i++) {
    float period = 6.0 + float(i) * 0.7;
    trips += route(p, uRouteA[i], uRouteB[i], fract(uTime / period + float(i) * 0.31), rpx);
  }
  c += vec3(0.7, 0.85, 1.0) * trips * smoothstep(0.85, 1.0, uGlobeDraw) * fade;

  // The pole: a point of light in a fine ring.
  float pole = acos(clamp(p.y, -1.0, 1.0)) * rpx;
  c += vec3(0.85, 0.9, 1.0) * (exp(-pole * pole / (5.0 * uPx * uPx)) + 0.45 * exp(-pow(pole - 13.0 * uPx, 2.0) / (1.3 * uPx * uPx))) * fade * rise;

  return mix(col, c, cover * vis);
}
`;

/**
 * Footage drawn by the light — the landing reel and the carousel above the
 * next-page sheet. Each is sharpened a touch, and its own blue backdrop is
 * keyed out (deep blue with no red in it), so the living gradient moves
 * behind the type and the cards, and the cursor's sand scatters them too.
 */
export const FOOTAGE_GLSL = `
uniform sampler2D uReel;
uniform vec4 uReelRect;   // canvas pixels: left, bottom, width, height
uniform vec2 uReelTexel;
uniform float uReelFade;
uniform float uReelBand;  // 1 = a band with feathered top and bottom (portrait screens)
uniform float uReelOn;
uniform sampler2D uClip;
uniform vec4 uClipRect;
uniform vec2 uClipTexel;
uniform float uClipFade;
uniform float uClipOn;

vec4 footage(sampler2D tex, vec2 uv, vec2 texel) {
  vec2 st = vec2(uv.x, 1.0 - uv.y);
  vec3 c = texture2D(tex, st).rgb;
  vec3 near = texture2D(tex, st + vec2(texel.x, 0.0)).rgb + texture2D(tex, st - vec2(texel.x, 0.0)).rgb
    + texture2D(tex, st + vec2(0.0, texel.y)).rgb + texture2D(tex, st - vec2(0.0, texel.y)).rgb;
  c = clamp(c + (c - near * 0.25) * 0.7, 0.0, 1.0);
  float backdrop = (1.0 - smoothstep(0.1, 0.2, c.r)) * smoothstep(0.03, 0.09, c.b - max(c.r, c.g));
  return vec4(c, 1.0 - backdrop);
}

vec3 reel(vec2 frag, vec3 col) {
  vec2 uv = (frag - uReelRect.xy) / uReelRect.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return col;
  vec4 f = footage(uReel, uv, uReelTexel);
  float a = f.a * uReelFade;
  if (uReelBand > 0.5) a *= smoothstep(0.0, 0.16, uv.y) * smoothstep(1.0, 0.84, uv.y);
  return mix(col, f.rgb, a);
}

vec3 clip(vec2 frag, vec3 col) {
  vec2 uv = (frag - uClipRect.xy) / uClipRect.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return col;
  vec4 f = footage(uClip, uv, uClipTexel);
  float edge = smoothstep(0.0, 0.08, uv.x) * smoothstep(1.0, 0.92, uv.x) * smoothstep(0.0, 0.12, uv.y) * smoothstep(1.0, 0.88, uv.y);
  return mix(col, f.rgb, f.a * edge * uClipFade);
}
`;

/** A texture a video frame can be copied into each frame. */
export function videoTexture(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

/**
 * The wordmark, white on transparent, for the background to sample: drawn
 * from the same vector paths as the landing slide into a power-of-two canvas
 * so the GPU can build the blurred levels the bloom reads from.
 */
export function drawMarkTexture(gl: WebGLRenderingContext | WebGL2RenderingContext, size: number) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 4;
  const ctx = canvas.getContext('2d');
  const texture = gl.createTexture();
  if (!ctx || !texture) return null;
  const scale = (size * SPAN) / WORDMARK_BOX.width;
  ctx.setTransform(scale, 0, 0, scale, size * MARK_TEX.x - WORDMARK_BOX.x * scale, (size / 4) * MARK_TEX.y - WORDMARK_BOX.y * scale);
  ctx.fillStyle = '#fff';
  for (const letter of WORDMARK_LETTERS) ctx.fill(new Path2D(letter.d));

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { texture, size };
}
