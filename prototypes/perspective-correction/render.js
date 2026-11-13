// WebGL2 projective warp: each output pixel is mapped back through the
// inverse homography, then through the lens distortion model (see
// geometry.js distort()), and sampled from the mipmapped source texture.

const VS = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform mat3 uM;        // canvas pixel → source pixel (homogeneous)
uniform vec2 uSrc;      // source size in pixels
uniform float uCanvasH;
uniform vec3 uBg;
uniform bool uLens;
uniform vec3 uLensFrame;  // center x, center y, R (px)
uniform vec4 uLensABCD;   // ptlens a, b, c, d
uniform float uLensK;     // manual k·r² term
out vec4 outColor;
void main() {
  vec2 frag = vec2(gl_FragCoord.x, uCanvasH - gl_FragCoord.y);
  vec3 p = uM * vec3(frag, 1.0);
  vec2 q = p.xy / p.z;
  if (uLens) {
    vec2 u = (q - uLensFrame.xy) / uLensFrame.z;
    float r = length(u), ru = r / uLensABCD.w;
    float f = (((uLensABCD.x * ru + uLensABCD.y) * ru + uLensABCD.z) * ru + uLensABCD.w) / uLensABCD.w
      * (1.0 + uLensK * r * r);
    q = uLensFrame.xy + u * f * uLensFrame.z;
  }
  vec2 uv = q / uSrc;
  if (p.z <= 0.0 || uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    float c = mod(floor(frag.x / 12.0) + floor(frag.y / 12.0), 2.0);
    outColor = vec4(uBg + c * 0.035, 1.0);
    return;
  }
  outColor = texture(uTex, uv);
}`;

export class WarpRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = (this.gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false }));
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = (this.prog = gl.createProgram());
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = Object.fromEntries(['uTex', 'uM', 'uSrc', 'uCanvasH', 'uBg', 'uLens', 'uLensFrame', 'uLensABCD', 'uLensK'].map((n) => [n, gl.getUniformLocation(prog, n)]));
    this.textures = new Map();
  }

  texture(key, source) {
    let t = this.textures.get(key);
    if (t) return t;
    const gl = this.gl;
    t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.textures.set(key, t);
    return t;
  }

  /**
   * @param M row-major 3×3, canvas pixel → pixel of the *original* source size
   * @param srcW/srcH original source size (the texture may be smaller)
   * @param lens geometry.lensModel() result, or null
   */
  draw(key, source, M, srcW, srcH, bg = [0.09, 0.09, 0.1], lens = null) {
    const gl = this.gl;
    const { width, height } = this.canvas;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture(key, source));
    gl.uniform1i(this.u.uTex, 0);
    gl.uniformMatrix3fv(this.u.uM, true, new Float32Array(M));
    gl.uniform2f(this.u.uSrc, srcW, srcH);
    gl.uniform1f(this.u.uCanvasH, height);
    gl.uniform3f(this.u.uBg, ...bg);
    gl.uniform1i(this.u.uLens, lens ? 1 : 0);
    if (lens) {
      gl.uniform3f(this.u.uLensFrame, lens.cx, lens.cy, lens.R);
      gl.uniform4f(this.u.uLensABCD, lens.a, lens.b, lens.c, lens.d);
      gl.uniform1f(this.u.uLensK, lens.k);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
