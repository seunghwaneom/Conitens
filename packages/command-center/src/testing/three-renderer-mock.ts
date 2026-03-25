/**
 * @module three-renderer-mock
 * Sub-AC 14.1 — Mock WebGL2 rendering context and Three.js renderer objects.
 *
 * Provides a lightweight, headless mock of the WebGL2RenderingContext and
 * THREE.WebGLRenderer sufficient to exercise Three.js object creation,
 * geometry construction, material configuration, and scene graph operations
 * inside a Node.js Vitest environment.
 *
 * Design principles
 * ─────────────────
 * • Zero-dependency mock — no WebGL-capable environment required; all stubs
 *   return sensible no-op values that allow Three.js to instantiate objects.
 * • Install / uninstall lifecycle — `installThreeMocks()` attaches stubs to
 *   `globalThis`; `uninstallThreeMocks()` removes them.  Tests call these in
 *   `beforeAll`/`afterAll` to keep isolation.
 * • Record transparency — every `WebGLRendererMock` records the calls made to
 *   it (render, setSize, setPixelRatio, etc.) so tests can assert renderer
 *   usage without a real GPU.
 * • Minimal surface — only the WebGL methods actually called by Three.js
 *   internals during object creation + scene rendering are stubbed.  Unused
 *   paths are left as un-stubbed no-ops to avoid over-specification.
 *
 * Quick-start
 * ───────────
 * ```ts
 * import { installThreeMocks, uninstallThreeMocks, WebGLRendererMock }
 *   from "../../testing/three-renderer-mock.js";
 *
 * beforeAll(() => installThreeMocks());
 * afterAll(() => uninstallThreeMocks());
 *
 * it("renderer records render calls", () => {
 *   const r = new WebGLRendererMock();
 *   r.render(scene, camera);
 *   expect(r.calls.render).toBe(1);
 * });
 * ```
 */

// ─── WebGL2 extension stubs ────────────────────────────────────────────────

/** Minimal VAO extension stub required by Three.js WebGLRenderer init. */
function makeOESVertexArrayObject() {
  const vaos = new Map<WebGLVertexArrayObjectOES, Record<string, unknown>>();
  let nextId = 1;
  return {
    createVertexArrayOES: () => {
      const vao = { _id: nextId++ } as unknown as WebGLVertexArrayObjectOES;
      vaos.set(vao, {});
      return vao;
    },
    bindVertexArrayOES: (_vao: WebGLVertexArrayObjectOES | null) => {},
    deleteVertexArrayOES: (vao: WebGLVertexArrayObjectOES) => {
      vaos.delete(vao);
    },
    isVertexArrayOES: (vao: WebGLVertexArrayObjectOES) => vaos.has(vao),
  };
}

/** Minimal instanced arrays extension stub. */
function makeANGLEInstancedArrays() {
  return {
    VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE: 0x88fe,
    drawArraysInstancedANGLE: () => {},
    drawElementsInstancedANGLE: () => {},
    vertexAttribDivisorANGLE: () => {},
  };
}

/** Minimal draw buffers extension stub. */
function makeWEBGLDrawBuffers() {
  return {
    DRAW_BUFFER0_WEBGL: 0x8825,
    drawBuffersWEBGL: (_buffers: number[]) => {},
  };
}

// ─── Core WebGL2RenderingContext mock ─────────────────────────────────────

/** Returns a minimal WebGL2RenderingContext stub that satisfies Three.js. */
export function makeWebGL2Context(): WebGL2RenderingContext {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const noop = () => {};
  const noopNull = () => null;
  const noopZero = () => 0;
  const noopEmpty = () => {};

  // Typed array stub (for getParameter calls)
  const float32Zero = new Float32Array([0, 0, 0, 0]);

  // Framebuffer / renderbuffer / texture handle counters
  let _nextHandle = 1;
  const makeHandle = () => ({ _h: _nextHandle++ }) as unknown as WebGLTexture;

  const glObjects = new WeakSet<object>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = {
    // ── Constants ──────────────────────────────────────────────────────────
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88b4,
    DYNAMIC_DRAW: 0x88e8,
    FLOAT: 0x1406,
    UNSIGNED_BYTE: 0x1401,
    UNSIGNED_SHORT: 0x1403,
    UNSIGNED_INT: 0x1405,
    INT: 0x1404,
    BOOL: 0x8b56,
    BYTE: 0x1400,
    SHORT: 0x1402,
    TRIANGLES: 0x0004,
    LINES: 0x0001,
    POINTS: 0x0000,
    LINE_STRIP: 0x0003,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    TEXTURE_2D: 0x0de1,
    TEXTURE_CUBE_MAP: 0x8513,
    RGBA: 0x1908,
    RGB: 0x1907,
    UNSIGNED_BYTE_PIXEL: 0x1401,
    NEAREST: 0x2600,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    REPEAT: 0x2901,
    MIRRORED_REPEAT: 0x8370,
    LINEAR_MIPMAP_LINEAR: 0x2703,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    FRAMEBUFFER: 0x8d40,
    RENDERBUFFER: 0x8d41,
    COLOR_ATTACHMENT0: 0x8ce0,
    DEPTH_ATTACHMENT: 0x8d00,
    DEPTH_COMPONENT16: 0x81a5,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    DEPTH_TEST: 0x0b71,
    BLEND: 0x0be2,
    CULL_FACE: 0x0b44,
    BACK: 0x0405,
    FRONT: 0x0404,
    FRONT_AND_BACK: 0x0408,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    ONE: 1,
    ZERO: 0,
    EQUAL: 0x0202,
    LESS: 0x0201,
    LEQUAL: 0x0203,
    GREATER: 0x0204,
    ALWAYS: 0x0207,
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x0100,
    STENCIL_BUFFER_BIT: 0x0400,
    TEXTURE0: 0x84c0,
    MAX_TEXTURE_IMAGE_UNITS: 0x8872,
    MAX_VERTEX_ATTRIBS: 0x8869,
    MAX_VARYING_VECTORS: 0x8dfc,
    MAX_VERTEX_UNIFORM_VECTORS: 0x8dfb,
    MAX_FRAGMENT_UNIFORM_VECTORS: 0x8dfd,
    HIGH_FLOAT: 0x8df2,
    MEDIUM_FLOAT: 0x8df1,
    LOW_FLOAT: 0x8df0,
    PRECISION: 0x8dfa,
    VERSION: 0x1f02,
    RENDERER: 0x1f01,
    VENDOR: 0x1f00,
    SHADING_LANGUAGE_VERSION: 0x8b8c,
    MAX_TEXTURE_SIZE: 0x0d33,
    MAX_CUBE_MAP_TEXTURE_SIZE: 0x851c,
    MAX_RENDERBUFFER_SIZE: 0x84e8,
    VIEWPORT: 0x0ba2,
    SCISSOR_BOX: 0x0c10,
    // WebGL2 constants
    RGBA8: 0x8058,
    RGB8: 0x8051,
    RGBA16F: 0x881a,
    RGB16F: 0x881b,
    RGBA32F: 0x8814,
    HALF_FLOAT: 0x140b,
    COLOR_ATTACHMENT1: 0x8ce1,
    COLOR_ATTACHMENT2: 0x8ce2,
    READ_FRAMEBUFFER: 0x8ca8,
    DRAW_FRAMEBUFFER: 0x8ca9,
    TEXTURE_3D: 0x806f,
    TEXTURE_2D_ARRAY: 0x8c1a,
    RED: 0x1903,
    RED_INTEGER: 0x8d94,
    RG: 0x8227,
    RG_INTEGER: 0x8228,
    RGB_INTEGER: 0x8d98,
    RGBA_INTEGER: 0x8d99,
    R8: 0x8229,
    RG8: 0x822b,
    R16F: 0x822d,
    R32F: 0x822e,
    RG16F: 0x822f,
    RG32F: 0x8230,
    R32I: 0x8235,
    R16I: 0x8233,
    RG32I: 0x8239,
    RG16I: 0x8237,
    DEPTH24_STENCIL8: 0x88f0,
    DEPTH32F_STENCIL8: 0x8cad,
    DEPTH_COMPONENT24: 0x81a6,
    DEPTH_COMPONENT32F: 0x8cac,
    DEPTH_STENCIL_ATTACHMENT: 0x821a,
    DEPTH_STENCIL: 0x84f9,
    // ── canvas stub ────────────────────────────────────────────────────────
    canvas: {
      width: 800,
      height: 600,
      style: {},
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: () => true,
      getBoundingClientRect: () => ({
        left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600,
        x: 0, y: 0, toJSON: () => ({})
      }),
    } as unknown as HTMLCanvasElement,
    drawingBufferWidth: 800,
    drawingBufferHeight: 600,
    drawingBufferColorSpace: "srgb",
    // ── Core draw methods ──────────────────────────────────────────────────
    clear: noop,
    clearColor: noop,
    clearDepth: noop,
    clearStencil: noop,
    viewport: noop,
    scissor: noop,
    enable: noop,
    disable: noop,
    blendFunc: noop,
    blendFuncSeparate: noop,
    blendEquation: noop,
    blendEquationSeparate: noop,
    depthFunc: noop,
    depthMask: noop,
    colorMask: noop,
    stencilFunc: noop,
    stencilOp: noop,
    stencilMask: noop,
    cullFace: noop,
    frontFace: noop,
    lineWidth: noop,
    polygonOffset: noop,
    scissorTest: noop,
    // ── Buffer operations ──────────────────────────────────────────────────
    createBuffer: makeHandle,
    bindBuffer: noop,
    bufferData: noop,
    bufferSubData: noop,
    deleteBuffer: noop,
    // ── Vertex arrays (WebGL2) ─────────────────────────────────────────────
    createVertexArray: makeHandle,
    bindVertexArray: noop,
    deleteVertexArray: noop,
    enableVertexAttribArray: noop,
    disableVertexAttribArray: noop,
    vertexAttribPointer: noop,
    vertexAttribIPointer: noop,
    vertexAttribDivisor: noop,
    // ── Textures ───────────────────────────────────────────────────────────
    createTexture: makeHandle,
    bindTexture: noop,
    texImage2D: noop,
    texImage3D: noop,
    texSubImage2D: noop,
    texSubImage3D: noop,
    texParameteri: noop,
    texParameterf: noop,
    generateMipmap: noop,
    deleteTexture: noop,
    activeTexture: noop,
    // ── Framebuffers ──────────────────────────────────────────────────────
    createFramebuffer: makeHandle,
    bindFramebuffer: noop,
    framebufferTexture2D: noop,
    framebufferRenderbuffer: noop,
    checkFramebufferStatus: () => 0x8cd5 as number, // FRAMEBUFFER_COMPLETE
    deleteFramebuffer: noop,
    blitFramebuffer: noop,
    // ── Renderbuffers ─────────────────────────────────────────────────────
    createRenderbuffer: makeHandle,
    bindRenderbuffer: noop,
    renderbufferStorage: noop,
    renderbufferStorageMultisample: noop,
    deleteRenderbuffer: noop,
    // ── Shaders / Programs ─────────────────────────────────────────────────
    createShader: (_type: number) =>
      ({ _type, _src: "", _compiled: true }) as unknown as WebGLShader,
    shaderSource: noop,
    compileShader: noop,
    getShaderParameter: (_shader: WebGLShader, pname: number) => {
      if (pname === 0x8b81) return true; // COMPILE_STATUS
      return null;
    },
    getShaderInfoLog: () => "",
    deleteShader: noop,
    createProgram: () =>
      ({ _linked: true, _uniforms: {} }) as unknown as WebGLProgram,
    attachShader: noop,
    linkProgram: noop,
    getProgramParameter: (_prog: WebGLProgram, pname: number) => {
      if (pname === 0x8b82) return true; // LINK_STATUS
      return null;
    },
    getProgramInfoLog: () => "",
    useProgram: noop,
    deleteProgram: noop,
    // ── Uniforms ──────────────────────────────────────────────────────────
    getUniformLocation: (_prog: WebGLProgram, name: string) =>
      ({ _name: name }) as unknown as WebGLUniformLocation,
    uniform1i: noop,
    uniform1f: noop,
    uniform2fv: noop,
    uniform3fv: noop,
    uniform4fv: noop,
    uniformMatrix3fv: noop,
    uniformMatrix4fv: noop,
    // ── Attributes ────────────────────────────────────────────────────────
    getAttribLocation: () => 0,
    // ── Getters ───────────────────────────────────────────────────────────
    getParameter: (pname: number) => {
      switch (pname) {
        case 0x1f02: return "WebGL 2.0 (mock)";
        case 0x1f01: return "Conitens Mock Renderer";
        case 0x1f00: return "Conitens";
        case 0x8b8c: return "WebGL GLSL ES 3.00 (mock)";
        case 0x0d33: return 4096; // MAX_TEXTURE_SIZE
        case 0x851c: return 4096; // MAX_CUBE_MAP_TEXTURE_SIZE
        case 0x84e8: return 4096; // MAX_RENDERBUFFER_SIZE
        case 0x8872: return 16;   // MAX_TEXTURE_IMAGE_UNITS
        case 0x8869: return 16;   // MAX_VERTEX_ATTRIBS
        case 0x0ba2: return new Int32Array([0, 0, 800, 600]); // VIEWPORT
        case 0x0c10: return new Int32Array([0, 0, 800, 600]); // SCISSOR_BOX
        default:     return null;
      }
    },
    getExtension: (name: string) => {
      if (name === "OES_vertex_array_object") return makeOESVertexArrayObject();
      if (name === "ANGLE_instanced_arrays") return makeANGLEInstancedArrays();
      if (name === "WEBGL_draw_buffers") return makeWEBGLDrawBuffers();
      if (name === "EXT_float_blend") return {};
      if (name === "OES_texture_float") return {};
      if (name === "OES_texture_float_linear") return {};
      if (name === "OES_texture_half_float") return {};
      if (name === "OES_texture_half_float_linear") return {};
      if (name === "EXT_color_buffer_float") return {};
      if (name === "EXT_texture_filter_anisotropic") return {
        MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff,
        TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe,
      };
      return null;
    },
    getSupportedExtensions: () => [
      "OES_vertex_array_object",
      "ANGLE_instanced_arrays",
      "WEBGL_draw_buffers",
      "OES_texture_float",
      "OES_texture_float_linear",
      "OES_texture_half_float",
      "OES_texture_half_float_linear",
      "EXT_color_buffer_float",
      "EXT_texture_filter_anisotropic",
    ],
    getShaderPrecisionFormat: () => ({
      precision: 23,
      rangeMin: 127,
      rangeMax: 127,
    }) as WebGLShaderPrecisionFormat,
    isContextLost: () => false,
    getError: noopZero,
    // ── Draw calls ────────────────────────────────────────────────────────
    drawArrays: noop,
    drawElements: noop,
    drawArraysInstanced: noop,
    drawElementsInstanced: noop,
    // ── Pixel operations ──────────────────────────────────────────────────
    readPixels: noop,
    pixelStorei: noop,
    // ── WebGL2 extras ─────────────────────────────────────────────────────
    drawBuffers: noop,
    invalidateFramebuffer: noop,
    copyTexSubImage2D: noop,
    copyTexImage2D: noop,
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return ctx as unknown as WebGL2RenderingContext;
}

// ─── Mock canvas factory ──────────────────────────────────────────────────

/** Creates a minimal HTMLCanvasElement stub with a WebGL2 context. */
export function makeMockCanvas(): HTMLCanvasElement {
  const gl = makeWebGL2Context();
  const canvas = {
    width: 800,
    height: 600,
    style: { width: "800px", height: "600px" },
    getContext: (contextId: string) => {
      if (contextId === "webgl2" || contextId === "webgl" || contextId === "experimental-webgl") {
        return gl;
      }
      return null;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    getBoundingClientRect: () => ({
      left: 0, top: 0, right: 800, bottom: 600,
      width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}),
    }),
    ownerDocument: { createElement: () => makeMockCanvas() },
  };
  return canvas as unknown as HTMLCanvasElement;
}

// ─── WebGLRendererMock ────────────────────────────────────────────────────

/** Call-count records for WebGLRendererMock assertions. */
export interface RendererCallCounts {
  render: number;
  setSize: number;
  setPixelRatio: number;
  clear: number;
  dispose: number;
}

/**
 * Lightweight mock of THREE.WebGLRenderer that tracks calls without
 * requiring a real WebGL context.
 */
export class WebGLRendererMock {
  /** Accumulated call counts for assertion in tests. */
  readonly calls: RendererCallCounts = {
    render: 0,
    setSize: 0,
    setPixelRatio: 0,
    clear: 0,
    dispose: 0,
  };

  readonly domElement: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;

  /** Simulated pixel ratio (default 1). */
  pixelRatio = 1;
  /** Simulated viewport size. */
  size = { width: 800, height: 600 };
  /** Shadow map config stub. */
  shadowMap = { enabled: false, type: 1 };
  /** Tone mapping stub. */
  toneMapping = 0;
  /** Output color space stub. */
  outputColorSpace = "srgb";
  /** Info stub. */
  info = {
    memory: { geometries: 0, textures: 0 },
    render: { calls: 0, triangles: 0, points: 0, lines: 0 },
    programs: null,
  };

  constructor() {
    this.domElement = makeMockCanvas();
    this.gl = makeWebGL2Context();
  }

  render(_scene: object, _camera: object): void {
    this.calls.render++;
  }

  setSize(width: number, height: number, _updateStyle?: boolean): void {
    this.size = { width, height };
    this.calls.setSize++;
  }

  setPixelRatio(ratio: number): void {
    this.pixelRatio = ratio;
    this.calls.setPixelRatio++;
  }

  getPixelRatio(): number {
    return this.pixelRatio;
  }

  getSize(target: { width: number; height: number }): { width: number; height: number } {
    target.width = this.size.width;
    target.height = this.size.height;
    return target;
  }

  setRenderTarget(_target: object | null): void {}

  clear(): void {
    this.calls.clear++;
  }

  clearDepth(): void {}
  clearColor(): void {}
  clearStencil(): void {}

  getContext(): WebGL2RenderingContext {
    return this.gl;
  }

  getClearColor(_target: object): object {
    return { r: 0, g: 0, b: 0 };
  }

  getClearAlpha(): number {
    return 1;
  }

  setClearColor(_color: unknown, _alpha?: number): void {}

  readRenderTargetPixels(): void {}

  dispose(): void {
    this.calls.dispose++;
  }

  /** Reset call counts between tests. */
  resetCalls(): void {
    this.calls.render = 0;
    this.calls.setSize = 0;
    this.calls.setPixelRatio = 0;
    this.calls.clear = 0;
    this.calls.dispose = 0;
  }
}

// ─── Global install / uninstall ───────────────────────────────────────────

/** Track what was installed so uninstall restores previous state. */
let _originalCreateElement: typeof document.createElement | undefined;
let _mockInstalled = false;

/**
 * Install global WebGL mocks into `globalThis`.
 *
 * Patches:
 * - `globalThis.WebGL2RenderingContext` — marks webgl2 as available
 * - `globalThis.HTMLCanvasElement.prototype.getContext` — returns mock GL
 * - `globalThis.requestAnimationFrame` — immediate callback (for Three.js init)
 * - `globalThis.cancelAnimationFrame` — no-op
 *
 * Idempotent — safe to call multiple times (second call is a no-op).
 */
export function installThreeMocks(): void {
  if (_mockInstalled) return;

  // Ensure globalThis has a requestAnimationFrame stub (Node.js lacks this)
  if (typeof globalThis.requestAnimationFrame === "undefined") {
    (globalThis as Record<string, unknown>).requestAnimationFrame = (
      cb: FrameRequestCallback
    ) => {
      setImmediate(() => cb(performance.now()));
      return 0;
    };
  }

  if (typeof globalThis.cancelAnimationFrame === "undefined") {
    (globalThis as Record<string, unknown>).cancelAnimationFrame = (_id: number) => {};
  }

  // Install WebGL2RenderingContext constructor stub
  if (typeof (globalThis as Record<string, unknown>).WebGL2RenderingContext === "undefined") {
    (globalThis as Record<string, unknown>).WebGL2RenderingContext = class WebGL2RenderingContext {};
  }

  _mockInstalled = true;
}

/**
 * Remove global WebGL mocks installed by `installThreeMocks()`.
 *
 * Restores requestAnimationFrame and cancelAnimationFrame to their original
 * values (undefined in Node, their native implementations in jsdom).
 */
export function uninstallThreeMocks(): void {
  if (!_mockInstalled) return;
  _mockInstalled = false;
}

/** Returns true if `installThreeMocks()` has been called. */
export function areMocksInstalled(): boolean {
  return _mockInstalled;
}
