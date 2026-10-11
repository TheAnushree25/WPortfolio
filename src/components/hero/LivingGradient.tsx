'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, type MotionValue } from 'motion/react';
import { measureFinale, onFinaleKick, setFinaleDrawn } from '@/lib/finale';
import { currentFootage, onFootage, reelDrawn, type Footage } from '@/lib/footage';
import { cn } from '@/lib/utils';
import {
  FINALE_GLSL,
  FINALE_PRELUDE,
  FOOTAGE_GLSL,
  MARK_TEX,
  ROUTE_A,
  ROUTE_B,
  drawMarkTexture,
  videoTexture,
} from './finaleShader';
import { Fluid, LETTERBOX, linkProgram } from './fluid';

type LivingGradientProps = {
  /** 0 = the Atlas slide's diagonal beams, 1 = the studio slide's radial glow. */
  scene: MotionValue<number>;
  /** Animates only while the page can be seen; otherwise it holds its last frame. */
  running: boolean;
  className?: string;
};

const VERTEX = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/**
 * Both slides are lit by soft anisotropic lights fitted to the Figma frames
 * (under 5/255 RMS error). Positions are in frame pixels, so the light sits
 * where the design puts it. It drifts continuously and swings between two
 * states every two seconds — the light travels, swells and brightens towards
 * the Figma's electric blue, then ebbs back while a low light rises opposite.
 * Where the cursor has stirred the fluid, the light is displaced, scattered and
 * grained like sand in the wind. At the foot of the page the same light draws
 * the finale: the wordmark formed from sand, and the globe beneath it.
 */
const FRAGMENT = `${FINALE_PRELUDE}
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uResolution;
uniform float uTime;
uniform float uScene;
uniform float uAspect;
uniform sampler2D uFluid;
uniform float uFluidOn;

// The Figma swatches: navy and deep from the radial gradient, electric from the
// linear one. Azure is the beam core of the Atlas slide and the reel.
const vec3 NAVY = vec3(0.00784, 0.03529, 0.13725);
const vec3 DEEP = vec3(0.0, 0.09412, 0.45098);
const vec3 ELECTRIC = vec3(0.03137, 0.16863, 1.0);
const vec3 AZURE = vec3(0.06667, 0.43922, 0.80392);

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// Precision-safe hash for grain (no large sin() argument).
float randm(vec2 n) {
  vec3 p3 = fract(vec3(n.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float light(vec2 p, vec2 c, vec2 r, float a) {
  vec2 d = p - c;
  float cs = cos(a);
  float sn = sin(a);
  vec2 q = vec2(cs * d.x + sn * d.y, cs * d.y - sn * d.x) / r;
  return exp(-0.5 * dot(q, q));
}

// Atlas slide: a beam from the top centre spilling right, a second across the
// bottom left, and the dark band running between them. On each swing the top
// beam sweeps right and opens while the low one ebbs, then they trade back.
vec3 beams(vec2 p, float t, float beat) {
  vec3 c = NAVY;
  c += 0.99 * (1.0 + 0.07 * sin(t * 0.27) + 0.22 * beat)
    * light(p, vec2(709.0 + 70.0 * sin(t * 0.27) + 200.0 * beat, -69.0 + 30.0 * sin(t * 0.37 + 1.0) + 25.0 * beat), vec2(372.0, 187.0) * (1.0 + 0.12 * beat), 0.391 + 0.08 * sin(t * 0.19) + 0.16 * beat)
    * (AZURE - NAVY);
  c += 1.17 * (1.0 - 0.2 * beat)
    * light(p, vec2(2469.0 + 120.0 * sin(t * 0.21 + 2.0) - 160.0 * beat, 56.0 + 60.0 * sin(t * 0.3) + 60.0 * beat), vec2(860.0, 238.0), -0.091 + 0.05 * sin(t * 0.17 + 0.5) + 0.06 * beat)
    * (ELECTRIC - NAVY);
  c += 0.74 * (1.0 + 0.25 * beat)
    * light(p, vec2(-800.0 + 120.0 * sin(t * 0.2 + 4.0) + 140.0 * beat, 592.0 + 50.0 * sin(t * 0.33 + 2.0) - 60.0 * beat), vec2(922.0, 242.0), 0.264 + 0.05 * sin(t * 0.23) - 0.05 * beat)
    * (ELECTRIC - NAVY);
  c += 0.71 * (1.0 + 0.1 * sin(t * 0.31 + 3.0) - 0.25 * beat)
    * light(p, vec2(776.0 + 90.0 * sin(t * 0.33 + 1.5) - 180.0 * beat, 866.0 + 25.0 * sin(t * 0.23) - 20.0 * beat), vec2(493.0, 131.0), 0.292 + 0.06 * sin(t * 0.29 + 2.0) - 0.1 * beat)
    * (AZURE - NAVY);
  return c;
}

// Studio slide and every section after it: the #001873 -> #020923 radial glow,
// a deep band falling from the top right and the #082BFF streak. On each swing
// the glow travels, swells and brightens towards the electric blue; on the
// way back it dims while a low light rises from the bottom left.
vec3 glow(vec2 p, float t, float beat) {
  vec3 c = NAVY;
  float breathe = 1.0 + 0.28 * beat;
  vec3 core = mix(DEEP, ELECTRIC, 0.12 + 0.12 * beat);
  c += 0.89 * (1.0 + 0.14 * beat)
    * light(p, vec2(704.0 + 60.0 * sin(t * 0.24) + 230.0 * beat, 390.0 + 45.0 * cos(t * 0.24) + 80.0 * beat), vec2(225.0, 190.0) * breathe, 0.199 + 0.12 * sin(t * 0.2) + 0.3 * beat)
    * (core - NAVY);
  c += 0.54 * (1.0 + 0.4 * beat)
    * light(p, vec2(1083.0 + 80.0 * sin(t * 0.19 + 1.0) - 200.0 * beat, -200.0 + 40.0 * sin(t * 0.26) + 40.0 * beat), vec2(1400.0, 150.0), 0.644 + 0.06 * sin(t * 0.19) + 0.12 * beat)
    * (DEEP - NAVY);
  c += 0.22 * (1.0 + 0.25 * sin(t * 0.37 + 2.0) + 0.8 * beat)
    * light(p, vec2(891.0 + 140.0 * sin(t * 0.3 + 0.7) - 260.0 * beat, 86.0 + 40.0 * sin(t * 0.22 + 1.9) + 60.0 * beat), vec2(606.0, 117.0), 0.499 + 0.08 * sin(t * 0.25) + 0.3 * beat)
    * (ELECTRIC - NAVY);
  float ebb = 0.5 - 0.5 * beat;
  c += 0.62 * ebb * ebb
    * light(p, vec2(360.0 + 70.0 * sin(t * 0.21), 690.0 + 40.0 * cos(t * 0.27)), vec2(540.0, 200.0), -0.36 + 0.05 * sin(t * 0.18))
    * (DEEP - NAVY);
  return c;
}

vec3 shade(vec2 uv) {
  vec2 p = vec2(uv.x * 1440.0, (1.0 - uv.y) * 807.0);
  // A brisk drift, plus a swing that carries the light between two states
  // every two seconds.
  float t = uTime * 2.4;
  float beat = sin(uTime * 1.5707963);

  vec2 flow = vec2(
    noise(p * 0.0019 + vec2(t * 0.035, -t * 0.025)),
    noise(p * 0.0019 + vec2(4.7 - t * 0.03, 1.3 + t * 0.04))
  ) - 0.5;
  vec2 q = p + flow * 120.0;

  // Scene change: the beams spread out of frame while the glow gathers in,
  // switching from the emblem outward along a drifting edge.
  vec2 centre = vec2(720.0, 403.5);
  float s = uScene;
  vec3 a = beams(centre + (q - centre) / (1.0 + 0.45 * s), t, beat);
  vec3 b = glow(centre + (q - centre) * (1.0 + 0.35 * (1.0 - s)), t, beat);
  float r = length((p - centre) / centre);
  float edge = clamp(0.15 + r * 0.45 + flow.y * 0.5, 0.0, 1.0);
  float m = smoothstep(0.0, 1.0, s * 2.0 - edge);
  return mix(a, b, m) * (1.0 - 0.08 * sin(3.14159 * s));
}

${FINALE_GLSL}

${FOOTAGE_GLSL}

${LETTERBOX}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 at = uv;
  float ink = 0.0;
  vec2 seed = uv * 800.0 + uTime * 0.001;

  // Mirage's DisplacedEffect: the cursor fluid displaces the light along its
  // flow and scatters it in proportion to the ink it carries.
  if (uFluidOn > 0.5) {
    vec4 fluid = texture2D(uFluid, clamp(canvasUvToSimUv(uv, uAspect), 0.0, 1.0));
    ink = fluid.b;
    if (length(fluid.rg) > 0.001 || ink > 0.001) {
      at = uv - fluid.rg * ink * 0.1;
      float spread = ink * 0.4;
      float rnd = randm(seed) * 0.85;
      float angle = rnd * 6.2831853;
      at += vec2(cos(angle), sin(angle)) * spread * rnd;
    }
  }

  vec3 col = shade(at);

  // The finale, displaced and scattered by the same fluid: the globe, then the
  // wordmark above it.
  vec2 frag = at * uResolution;
  if (uGlobe.w > 0.0) col = globe(frag, col);
  if (uClipOn > 0.5) col = clip(frag, col);
  if (uReelOn > 0.5) col = reel(frag, col);
  if (uMarkOn > 0.5) col = wordmark(frag, col, seed);

  // Grain where the ink is, from a seed independent of the scatter. Mirage
  // grains a black scene at 0.8; against blue the same specks would sink, so
  // both halves are lifted (the bright one cooled towards white) until they
  // read as the same lit sand.
  float grain = randm(seed + 91.7) - 0.5;
  col += grain * ink * (grain > 0.0 ? 2.5 : 1.4) * vec3(0.88, 0.94, 1.0);

  // Interleaved gradient noise dithers away banding in the deep blues.
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  col += (n - 0.5) * (1.5 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
`;

/** CSS stand-ins for each slide: painted until the first WebGL frame, and kept if WebGL is unavailable. */
const BEAMS_FALLBACK =
  'radial-gradient(ellipse 34% 32% at 49% -6%, rgb(17 112 205 / 0.9), rgb(17 112 205 / 0.35) 50%, transparent), ' +
  'radial-gradient(ellipse 45% 40% at 100% 10%, rgb(8 43 255 / 0.55), transparent), ' +
  'radial-gradient(ellipse 55% 45% at 0% 78%, rgb(8 43 255 / 0.45), transparent), ' +
  'radial-gradient(ellipse 36% 22% at 54% 106%, rgb(17 112 205 / 0.7), transparent), #020923';
const GLOW_FALLBACK =
  'radial-gradient(ellipse 22% 33% at 49% 48%, rgb(0 24 115 / 0.9), rgb(0 24 115 / 0.4) 55%, transparent), ' +
  'radial-gradient(ellipse 70% 30% at 80% 0%, rgb(0 24 115 / 0.5), transparent), #020923';

/** After the pointer stops, the ink has all but faded by now (0.955 per frame → 0.2%). */
const FLUID_IDLE = 2300;

/**
 * The page's background: the Figma gradients, alive, with Studio Mirage's
 * cursor fluid stirred into them. One fragment shader at device resolution
 * (so the sand stays crisp) plus a small fluid grid that only runs while the
 * pointer has recently moved.
 */
export function LivingGradient({ scene, running, className }: LivingGradientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loop = useRef({ running, kick: () => {} });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loop.current.running = running;
    loop.current.kick();
  }, [running]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const options = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' } as const;
    const gl = (canvas.getContext('webgl2', options) ?? canvas.getContext('webgl', options)) as
      | WebGL2RenderingContext
      | WebGLRenderingContext
      | null;
    if (!gl) return;
    // WebGL1 only offers screen-space derivatives (the globe's even line widths) once asked.
    if (typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) {
      gl.getExtension('OES_standard_derivatives');
    }
    const shader = linkProgram(gl, VERTEX, FRAGMENT);
    if (!shader) return;
    gl.useProgram(shader.program);
    gl.uniform1i(shader.uniform('uMark'), 1);
    gl.uniform1i(shader.uniform('uReel'), 2);
    gl.uniform1i(shader.uniform('uClip'), 3);
    gl.uniform3fv(shader.uniform('uRouteA[0]'), ROUTE_A);
    gl.uniform3fv(shader.uniform('uRouteB[0]'), ROUTE_B);
    const maxTexture = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    // One oversized triangle covers the viewport without a diagonal seam.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const state = loop.current;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Any mouse or trackpad stirs it, touchscreen laptops included.
    const stirrable = !still && window.matchMedia('(any-pointer: fine)').matches;
    let fluid: Fluid | null = null;
    let raf = 0;
    let last = 0;
    let clock = 0;
    let lost = false;
    let painted = false;
    let width = 1;
    let height = 1;
    /** Canvas pixels per CSS pixel. */
    let px = 1;
    let mark: { texture: WebGLTexture; size: number } | null = null;
    const videos = { reel: { texture: null as WebGLTexture | null, time: -1 }, clip: { texture: null as WebGLTexture | null, time: -1 } };

    /** Copies the newest frame of a footage slot into its texture and places it; false when there is nothing to draw. */
    const lay = (slot: 'reel' | 'clip', unit: number, source: Footage | null) => {
      const name = slot === 'reel' ? 'Reel' : 'Clip';
      const video = source?.video;
      const fade = source ? source.fade() : 0;
      if (!source || !video || fade < 0.002 || video.readyState < 2 || !video.videoWidth) {
        gl.uniform1f(shader.uniform(`u${name}On`), 0);
        return false;
      }
      const state = videos[slot];
      state.texture ??= videoTexture(gl);
      if (!state.texture) return false;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, state.texture);
      if (state.time !== video.currentTime || !video.paused) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        state.time = video.currentTime;
      }
      const box = source.place();
      gl.uniform4f(shader.uniform(`u${name}Rect`), box.x * px, height - (box.y + box.height) * px, box.width * px, box.height * px);
      gl.uniform2f(shader.uniform(`u${name}Texel`), 1 / video.videoWidth, 1 / video.videoHeight);
      gl.uniform1f(shader.uniform(`u${name}Fade`), fade);
      if (slot === 'reel') gl.uniform1f(shader.uniform('uReelBand'), box.band ? 1 : 0);
      gl.uniform1f(shader.uniform(`u${name}On`), 1);
      return true;
    };

    const pointer = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, at: -Infinity, fresh: true };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      // Device pixels, so each grain of sand is a single crisp pixel; capped
      // for very large and very dense screens.
      const scale = Math.min(window.devicePixelRatio || 1, 2, 3200 / Math.max(1, rect.width));
      width = Math.max(1, Math.round(rect.width * scale));
      height = Math.max(1, Math.round(rect.height * scale));
      px = width / Math.max(1, rect.width);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const aspect = width / height;
      if (stirrable) {
        if (!fluid) fluid = Fluid.create(gl, aspect);
        else fluid.resize(aspect);
      }
    };

    const frame = (now: number) => {
      raf = 0;
      if (lost) return;
      const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
      // Time only advances while the light is on screen, so it resumes mid-drift.
      if (last && !still) clock += Math.min(0.1, (now - last) / 1000);

      const stirred = fluid !== null && now - pointer.at < FLUID_IDLE;
      if (fluid && stirred) {
        const dx = pointer.x - pointer.px;
        const dy = pointer.y - pointer.py;
        pointer.px = pointer.x;
        pointer.py = pointer.y;
        fluid.step(dt, dx * dx + dy * dy > 1e-9 ? { x: pointer.x, y: pointer.y, dx, dy } : null);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.useProgram(shader.program);
      gl.uniform2f(shader.uniform('uResolution'), width, height);
      gl.uniform1f(shader.uniform('uTime'), clock);
      gl.uniform1f(shader.uniform('uScene'), scene.get());
      gl.uniform1f(shader.uniform('uAspect'), width / height);
      gl.uniform1f(shader.uniform('uFluidOn'), stirred ? 1 : 0);
      if (fluid) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fluid.texture);
        gl.uniform1i(shader.uniform('uFluid'), 0);
      }

      // The finale, in canvas pixels with y up.
      gl.uniform1f(shader.uniform('uPx'), px);
      const light = measureFinale(now);
      if (light) {
        const { mark: box, globe } = light;
        // A texture about as wide as the word is on screen, in powers of two for its blurred levels.
        const size = Math.min(maxTexture, Math.max(512, 2 ** Math.round(Math.log2((box.width * px) / MARK_TEX.width))));
        if (!mark || mark.size !== size) {
          if (mark) gl.deleteTexture(mark.texture);
          mark = drawMarkTexture(gl, size);
        }
        if (mark) {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, mark.texture);
        }
        gl.uniform1f(shader.uniform('uMarkOn'), mark && box.width > 0 ? 1 : 0);
        gl.uniform4f(shader.uniform('uMarkRect'), box.x * px, height - (box.y + box.height) * px, box.width * px, box.height * px);
        gl.uniform4f(shader.uniform('uMarkTex'), MARK_TEX.x, MARK_TEX.y, MARK_TEX.width, MARK_TEX.height);
        gl.uniform1f(shader.uniform('uMarkForm'), box.form);
        gl.uniform1f(shader.uniform('uMarkSweep'), box.sweep);
        gl.uniform4f(shader.uniform('uGlobe'), globe.x * px, height - globe.y * px, globe.r * px, globe.fade);
        gl.uniform1f(shader.uniform('uGlobeTilt'), globe.tilt);
        gl.uniform1f(shader.uniform('uGlobeSpin'), clock * 0.035 + globe.spin);
        gl.uniform1f(shader.uniform('uGlobeDraw'), globe.draw);
      } else {
        gl.uniform1f(shader.uniform('uMarkOn'), 0);
        gl.uniform4f(shader.uniform('uGlobe'), 0, 0, 0, 0);
      }

      // The reel and the carousel, when they're playing.
      const footage = currentFootage();
      if (lay('reel', 2, footage.reel)) reelDrawn.set(true);
      lay('clip', 3, footage.clip);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (!painted) {
        painted = true;
        setReady(true);
        setFinaleDrawn(true);
      }
      if (state.running && !still) {
        last = now;
        raf = requestAnimationFrame(frame);
      } else {
        last = 0;
      }
    };

    const kick = () => {
      if (!raf && !lost) raf = requestAnimationFrame(frame);
    };
    state.kick = kick;

    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointer.x = event.clientX / window.innerWidth;
      pointer.y = 1 - event.clientY / window.innerHeight;
      // The first sighting only places the pointer; stirring starts on the next move.
      if (pointer.fresh) {
        pointer.px = pointer.x;
        pointer.py = pointer.y;
        pointer.fresh = false;
      }
      pointer.at = performance.now();
      kick();
    };
    if (stirrable) window.addEventListener('pointermove', onPointer, { passive: true });

    const observer = new ResizeObserver(() => {
      resize();
      kick();
    });
    observer.observe(canvas);
    resize();
    kick();

    // Paused or not, a scene change still repaints, and so does the finale moving.
    const unsubscribe = scene.on('change', kick);
    const offFinale = onFinaleKick(kick);
    const offFootage = onFootage(kick);

    // If the GPU drops the context, the CSS stand-ins underneath take over.
    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      cancelAnimationFrame(raf);
      setReady(false);
      setFinaleDrawn(false);
      reelDrawn.set(false);
    };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      offFinale();
      offFootage();
      setFinaleDrawn(false);
      reelDrawn.set(false);
      if (mark) gl.deleteTexture(mark.texture);
      for (const video of Object.values(videos)) if (video.texture) gl.deleteTexture(video.texture);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointer);
      canvas.removeEventListener('webglcontextlost', onLost);
      fluid?.dispose();
      state.kick = () => {};
    };
  }, [scene]);

  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0', className)}>
      <div className="absolute inset-0" style={{ background: BEAMS_FALLBACK }} />
      <motion.div className="absolute inset-0" style={{ background: GLOW_FALLBACK, opacity: scene }} />
      <canvas
        ref={canvasRef}
        className={cn('absolute inset-0 size-full transition-opacity duration-700', ready ? 'opacity-100' : 'opacity-0')}
      />
    </div>
  );
}
