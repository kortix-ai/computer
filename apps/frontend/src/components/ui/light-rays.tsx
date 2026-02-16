'use client';

import { useRef, useEffect, useState } from 'react';
import { Renderer, Program, Triangle, Mesh } from 'ogl';

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
    : [1, 1, 1];
};

type Origin =
  | 'top-left' | 'top-center' | 'top-right'
  | 'left' | 'right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

const getAnchorAndDir = (origin: Origin, w: number, h: number) => {
  const outside = 0.2;
  switch (origin) {
    case 'top-left':      return { anchor: [0, -outside * h],          dir: [0, 1]  };
    case 'top-right':     return { anchor: [w, -outside * h],          dir: [0, 1]  };
    case 'left':          return { anchor: [-outside * w, 0.5 * h],    dir: [1, 0]  };
    case 'right':         return { anchor: [(1 + outside) * w, 0.5 * h], dir: [-1, 0] };
    case 'bottom-left':   return { anchor: [0, (1 + outside) * h],     dir: [0, -1] };
    case 'bottom-center': return { anchor: [0.5 * w, (1 + outside) * h], dir: [0, -1] };
    case 'bottom-right':  return { anchor: [w, (1 + outside) * h],     dir: [0, -1] };
    default:              return { anchor: [0.5 * w, -outside * h],    dir: [0, 1]  };
  }
};

const vert = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const frag = `precision highp float;
uniform float iTime;
uniform vec2  iResolution;
uniform vec2  rayPos;
uniform vec2  rayDir;
uniform vec3  raysColor;
uniform float raysSpeed;
uniform float lightSpread;
uniform float rayLength;
uniform float pulsating;
uniform float fadeDistance;
uniform float saturation;
uniform float noiseAmount;
uniform float distortion;
varying vec2 vUv;

float noise(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord,
                  float seedA, float seedB, float speed) {
  vec2 sourceToCoord = coord - raySource;
  vec2 dirNorm = normalize(sourceToCoord);
  float cosAngle = dot(dirNorm, rayRefDirection);
  float distortedAngle = cosAngle + distortion * sin(iTime * 2.0 + length(sourceToCoord) * 0.01) * 0.2;
  float spreadFactor = pow(max(distortedAngle, 0.0), 1.0 / max(lightSpread, 0.001));
  float distance = length(sourceToCoord);
  float maxDistance = iResolution.x * rayLength;
  float lengthFalloff = clamp((maxDistance - distance) / maxDistance, 0.0, 1.0);
  float fadeFalloff = clamp((iResolution.x * fadeDistance - distance) / (iResolution.x * fadeDistance), 0.5, 1.0);
  float pulse = pulsating > 0.5 ? (0.8 + 0.2 * sin(iTime * speed * 3.0)) : 1.0;
  float baseStrength = clamp(
    (0.45 + 0.15 * sin(distortedAngle * seedA + iTime * speed)) +
    (0.3 + 0.2 * cos(-distortedAngle * seedB + iTime * speed)),
    0.0, 1.0
  );
  return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y);
  vec4 rays1 = vec4(1.0) * rayStrength(rayPos, rayDir, coord, 36.2214, 21.11349, 1.5 * raysSpeed);
  vec4 rays2 = vec4(1.0) * rayStrength(rayPos, rayDir, coord, 22.3991, 18.0234, 1.1 * raysSpeed);
  fragColor = rays1 * 0.5 + rays2 * 0.4;
  if (noiseAmount > 0.0) {
    float n = noise(coord * 0.01 + iTime * 0.1);
    fragColor.rgb *= (1.0 - noiseAmount + noiseAmount * n);
  }
  float brightness = 1.0 - (coord.y / iResolution.y);
  fragColor.x *= 0.1 + brightness * 0.8;
  fragColor.y *= 0.3 + brightness * 0.6;
  fragColor.z *= 0.5 + brightness * 0.5;
  if (saturation != 1.0) {
    float gray = dot(fragColor.rgb, vec3(0.299, 0.587, 0.114));
    fragColor.rgb = mix(vec3(gray), fragColor.rgb, saturation);
  }
  fragColor.rgb *= raysColor;
}

void main() {
  vec4 color;
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor = color;
}`;

interface LightRaysProps {
  raysOrigin?: Origin;
  raysColor?: string;
  raysSpeed?: number;
  lightSpread?: number;
  rayLength?: number;
  pulsating?: boolean;
  fadeDistance?: number;
  saturation?: number;
  noiseAmount?: number;
  distortion?: number;
  className?: string;
}

export function LightRays({
  raysOrigin = 'top-center',
  raysColor = '#ffffff',
  raysSpeed = 1,
  lightSpread = 1,
  rayLength = 2,
  pulsating = false,
  fadeDistance = 1.0,
  saturation = 1.0,
  noiseAmount = 0.0,
  distortion = 0.0,
  className = '',
}: LightRaysProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Intersection observer — only render when visible
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setIsVisible(e.isIntersecting), { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // WebGL setup
  useEffect(() => {
    if (!isVisible || !containerRef.current) return;

    const container = containerRef.current;
    const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 2), alpha: true });
    const gl = renderer.gl;
    gl.canvas.style.width = '100%';
    gl.canvas.style.height = '100%';

    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(gl.canvas);

    const uniforms: Record<string, { value: unknown }> = {
      iTime:        { value: 0 },
      iResolution:  { value: [1, 1] },
      rayPos:       { value: [0, 0] },
      rayDir:       { value: [0, 1] },
      raysColor:    { value: hexToRgb(raysColor) },
      raysSpeed:    { value: raysSpeed },
      lightSpread:  { value: lightSpread },
      rayLength:    { value: rayLength },
      pulsating:    { value: pulsating ? 1.0 : 0.0 },
      fadeDistance:  { value: fadeDistance },
      saturation:   { value: saturation },
      noiseAmount:  { value: noiseAmount },
      distortion:   { value: distortion },
    };

    const geometry = new Triangle(gl);
    const program = new Program(gl, { vertex: vert, fragment: frag, uniforms });
    const mesh = new Mesh(gl, { geometry, program });

    const updateSize = () => {
      const { clientWidth: w, clientHeight: h } = container;
      const dpr = Math.min(window.devicePixelRatio, 2);
      renderer.setSize(w, h);
      uniforms.iResolution.value = [w * dpr, h * dpr];
      const { anchor, dir } = getAnchorAndDir(raysOrigin, w * dpr, h * dpr);
      uniforms.rayPos.value = anchor;
      uniforms.rayDir.value = dir;
    };

    let raf: number;
    const loop = (t: number) => {
      uniforms.iTime.value = t * 0.001;
      renderer.render({ scene: mesh });
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('resize', updateSize);
    updateSize();
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateSize);
      try {
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
        if (gl.canvas.parentNode) gl.canvas.parentNode.removeChild(gl.canvas);
      } catch { /* noop */ }
    };
  }, [isVisible, raysOrigin, raysColor, raysSpeed, lightSpread, rayLength, pulsating, fadeDistance, saturation, noiseAmount, distortion]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`.trim()}
    />
  );
}
