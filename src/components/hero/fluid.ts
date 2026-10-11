/**
 * Cursor fluid, ported line for line from Studio Mirage's about page: a 256²
 * grid the pointer stirs, carrying "ink" that the background shader turns into
 * blown sand. Same passes, constants and grid as theirs — splat, divergence,
 * one pressure pass, gradient subtraction, advection — on a square texture
 * letterboxed onto the screen, so the drift and spread match theirs exactly.
 */

/** Cells along each side of the square grid. */
const GRID = 256;
/** Velocity added per splat, as a multiple of the pointer's travel this frame. */
const FORCE = 8;
/** Gaussian radii of the velocity and ink splats, in screen heights squared. */
const RADIUS = 0.0025;
const INK_RADIUS = 0.0025;
/** Ink deposited per splat, and how much of each survives a 60fps frame. */
const INK = 0.03;
const VELOCITY_KEEP = 0.96;
const INK_KEEP = 0.955;

const VERTEX = `
attribute vec2 aPosition;
uniform vec2 uTexel;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(uTexel.x, 0.0);
  vR = vUv + vec2(uTexel.x, 0.0);
  vT = vUv + vec2(0.0, uTexel.y);
  vB = vUv - vec2(0.0, uTexel.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
`;

/**
 * The screen maps onto the middle of the square grid along its long side.
 * Distances are compared in screen heights, so a splat is round on screen.
 */
export const LETTERBOX = `
vec2 canvasUvToSimUv(vec2 uv, float aspect) {
  vec2 p = uv;
  if (aspect >= 1.0) p.x = (uv.x - 0.5) / aspect + 0.5;
  else p.y = (uv.y - 0.5) * aspect + 0.5;
  return p;
}
`;

// .rg = velocity, .b = ink.
const SPLAT = `${HEAD}
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec2 uPoint;
uniform vec2 uForce;
uniform float uRadius;
uniform float uInk;
uniform float uInkRadius;

vec2 canvasUvToIso(vec2 uv, float aspect) {
  vec2 q = uv - 0.5;
  if (aspect >= 1.0) q.x *= aspect;
  else q.y /= aspect;
  return q;
}

// One aspect factor undoes the letterbox, the other makes the distance isotropic.
vec2 simUvToIso(vec2 simUv, float aspect) {
  vec2 q = simUv - 0.5;
  float aspect2 = aspect * aspect;
  if (aspect >= 1.0) q.x *= aspect2;
  else q.y /= aspect2;
  return q;
}

void main() {
  vec2 d = simUvToIso(vUv, uAspect) - canvasUvToIso(uPoint, uAspect);
  float d2 = dot(d, d);
  vec3 base = texture2D(uTarget, vUv).xyz;
  vec2 velocity = base.xy + exp2(-d2 / uRadius) * uForce;
  float ink = clamp(base.z + exp2(-d2 / uInkRadius) * uInk, 0.0, 1.0);
  gl_FragColor = vec4(velocity, ink, 1.0);
}
`;

const DIVERGENCE = `${HEAD}
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  gl_FragColor = vec4(0.6 * (R - L + T - B), 0.0, 0.0, 1.0);
}
`;

const PRESSURE = `${HEAD}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float divergence = texture2D(uDivergence, vUv).x;
  gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
}
`;

const GRADIENT = `${HEAD}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec3 base = texture2D(uVelocity, vUv).xyz;
  gl_FragColor = vec4(base.xy - vec2(R - L, T - B), base.z, 1.0);
}
`;

const ADVECT = `${HEAD}
uniform sampler2D uVelocity;
uniform float uDt;
uniform float uVelocityKeep;
uniform float uInkKeep;
void main() {
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  vec3 advected = texture2D(uVelocity, vUv - uDt * velocity).xyz;
  gl_FragColor = vec4(advected.xy * uVelocityKeep, advected.z * uInkKeep, 1.0);
}
`;

type Target = { texture: WebGLTexture; fbo: WebGLFramebuffer };
type Format = { internal: number; format: number; type: number; filter: number };
type Program = { program: WebGLProgram; uniform: (name: string) => WebGLUniformLocation | null };
type Gl = WebGLRenderingContext | WebGL2RenderingContext;

/** Half-float render targets, the way each WebGL version offers them. */
function pickFormat(gl: Gl): Format | null {
  if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return null;
    return { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR };
  }
  const half = gl.getExtension('OES_texture_half_float');
  if (!half) return null;
  const linear = gl.getExtension('OES_texture_half_float_linear');
  gl.getExtension('EXT_color_buffer_half_float');
  return { internal: gl.RGBA, format: gl.RGBA, type: half.HALF_FLOAT_OES, filter: linear ? gl.LINEAR : gl.NEAREST };
}

export function linkProgram(gl: Gl, vertex: string, fragment: string): Program | null {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, vertex);
  const fs = compile(gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  // Every program reads the shared full-screen triangle from attribute 0.
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return null;
  }
  const cache = new Map<string, WebGLUniformLocation | null>();
  return {
    program,
    uniform: (name) => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
      return cache.get(name) ?? null;
    },
  };
}

export class Fluid {
  private aspect = 1;
  private velocity: [Target, Target] = [] as unknown as [Target, Target];
  private pressure: [Target, Target] = [] as unknown as [Target, Target];
  private divergence!: Target;

  private constructor(
    private gl: Gl,
    private format: Format,
    private programs: Record<'splat' | 'divergence' | 'pressure' | 'gradient' | 'advect', Program>,
  ) {}

  /** Null when the device can't render to float textures — the background simply goes without. */
  static create(gl: Gl, aspect: number): Fluid | null {
    const format = pickFormat(gl);
    if (!format) return null;
    const splat = linkProgram(gl, VERTEX, SPLAT);
    const divergence = linkProgram(gl, VERTEX, DIVERGENCE);
    const pressure = linkProgram(gl, VERTEX, PRESSURE);
    const gradient = linkProgram(gl, VERTEX, GRADIENT);
    const advect = linkProgram(gl, VERTEX, ADVECT);
    if (!splat || !divergence || !pressure || !gradient || !advect) return null;
    const fluid = new Fluid(gl, format, { splat, divergence, pressure, gradient, advect });
    fluid.aspect = aspect;
    const targets = Array.from({ length: 5 }, () => fluid.target());
    if (targets.some((t) => !t)) {
      for (const t of targets) {
        if (!t) continue;
        gl.deleteTexture(t.texture);
        gl.deleteFramebuffer(t.fbo);
      }
      return null;
    }
    const [a, b, c, d, e] = targets as Target[];
    fluid.velocity = [a, b];
    fluid.pressure = [c, d];
    fluid.divergence = e;
    return fluid;
  }

  /** The grid stays square; only the letterbox changes with the screen's shape. */
  resize(aspect: number) {
    this.aspect = aspect;
  }

  /** Velocity in .rg, ink in .b, for the background to read through the letterbox. */
  get texture() {
    return this.velocity[0].texture;
  }

  /**
   * Advances the fluid by dt seconds. `splat` is the pointer's position and
   * travel this frame in canvas UV (y up), or null when it hasn't moved.
   */
  step(dt: number, splat: { x: number; y: number; dx: number; dy: number } | null) {
    const { gl, programs: p } = this;
    gl.viewport(0, 0, GRID, GRID);

    if (splat) {
      this.pass(p.splat, this.velocity[1], (u) => {
        this.bind(0, this.velocity[0], u('uTarget'));
        gl.uniform1f(u('uAspect'), this.aspect);
        gl.uniform2f(u('uPoint'), splat.x, splat.y);
        gl.uniform2f(u('uForce'), splat.dx * FORCE, splat.dy * FORCE);
        gl.uniform1f(u('uRadius'), RADIUS);
        gl.uniform1f(u('uInk'), INK);
        gl.uniform1f(u('uInkRadius'), INK_RADIUS);
      });
      this.velocity.reverse();
    }

    this.pass(p.divergence, this.divergence, (u) => this.bind(0, this.velocity[0], u('uVelocity')));

    this.pass(p.pressure, this.pressure[1], (u) => {
      this.bind(0, this.pressure[0], u('uPressure'));
      this.bind(1, this.divergence, u('uDivergence'));
    });
    this.pressure.reverse();

    this.pass(p.gradient, this.velocity[1], (u) => {
      this.bind(0, this.pressure[0], u('uPressure'));
      this.bind(1, this.velocity[0], u('uVelocity'));
    });
    this.velocity.reverse();

    // Their dissipation is per 60fps frame; scale it to the real frame time.
    const frames = dt * 60;
    this.pass(p.advect, this.velocity[1], (u) => {
      this.bind(0, this.velocity[0], u('uVelocity'));
      gl.uniform1f(u('uDt'), dt);
      gl.uniform1f(u('uVelocityKeep'), VELOCITY_KEEP ** frames);
      gl.uniform1f(u('uInkKeep'), INK_KEEP ** frames);
    });
    this.velocity.reverse();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose() {
    const { gl } = this;
    for (const t of [...this.velocity, ...this.pressure, this.divergence]) {
      if (!t) continue;
      gl.deleteTexture(t.texture);
      gl.deleteFramebuffer(t.fbo);
    }
  }

  private pass(program: Program, into: Target, setup: (u: Program['uniform']) => void) {
    const { gl } = this;
    gl.useProgram(program.program);
    gl.uniform2f(program.uniform('uTexel'), 1 / GRID, 1 / GRID);
    setup(program.uniform);
    gl.bindFramebuffer(gl.FRAMEBUFFER, into.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private bind(unit: number, target: Target, location: WebGLUniformLocation | null) {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.uniform1i(location, unit);
  }

  private target(): Target | null {
    const { gl, format } = this;
    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!texture || !fbo) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, format.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, format.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, format.internal, GRID, GRID, 0, format.format, format.type, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (ok) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return ok ? { texture, fbo } : null;
  }
}
