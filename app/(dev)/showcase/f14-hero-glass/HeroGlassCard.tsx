'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Card } from '../../../../components/ui/Card';
import styles from './page.module.css';
import type { GlassEffect, HeroMaterial } from './HeroStage';

const vertexShader = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = (a_position + 1.0) * 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform vec4 u_card;
  uniform vec4 u_image_bounds;
  varying vec2 v_uv;
  void main() {
    vec2 screen_uv = vec2(u_card.x + v_uv.x * u_card.z, 1.0 - (u_card.y + v_uv.y * u_card.w));
    vec2 uv = (screen_uv - u_image_bounds.xy) / u_image_bounds.zw;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    float edge = min(min(v_uv.x, 1.0 - v_uv.x), min(v_uv.y, 1.0 - v_uv.y));
    float rim = 1.0 - smoothstep(0.035, 0.19, edge);
    vec2 lens = vec2(sin(v_uv.y * 18.0) * 0.016, cos(v_uv.x * 15.0) * 0.012) * rim;
    vec3 color = texture2D(u_image, clamp(uv + lens, 0.002, 0.998)).rgb;
    gl_FragColor = vec4(color, rim * 0.7);
  }
`;

function compileShader(
  gl: WebGLRenderingContext,
  kind: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(kind);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function HeroGlassCard({
  children,
  effect,
  locale,
  material,
}: {
  children: ReactNode;
  effect: GlassEffect;
  locale: 'ar' | 'en';
  material: HeroMaterial;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const frame = cardRef.current;
    const card = frame?.querySelector<HTMLElement>(
      '[data-testid="hero-glass-card"]',
    );
    const canvas = lensRef.current;
    if (!frame || !card || !canvas) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointerMotion = window.matchMedia(
      '(hover: hover) and (pointer: fine)',
    );
    let gl: WebGLRenderingContext | null = null;
    let texture: WebGLTexture | null = null;
    let program: WebGLProgram | null = null;
    let artworkObserver: MutationObserver | null = null;
    let active = true;
    let draw = () => {};

    if (effect === 'webgl') {
      gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
      });
      if (!gl) card.dataset.effectActive = 'css-fallback';
      let image = document.querySelector<HTMLImageElement>('[data-hero-image]');
      const start = () => {
        if (!gl || !image || !image.naturalWidth || !active) return;
        const textureImage = image;
        const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
        const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
        if (!vertex || !fragment) {
          card.dataset.effectActive = 'css-fallback';
          return;
        }
        program = gl.createProgram();
        if (!program) return;
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          card.dataset.effectActive = 'css-fallback';
          return;
        }
        const vertices = gl.createBuffer();
        if (!vertices) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
          gl.STATIC_DRAW,
        );
        const position = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        texture = gl.createTexture();
        if (!texture) return;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          textureImage,
        );
        gl.useProgram(program);
        gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
        const cardLocation = gl.getUniformLocation(program, 'u_card');
        const imageBoundsLocation = gl.getUniformLocation(
          program,
          'u_image_bounds',
        );
        card.dataset.effectActive = 'webgl';
        draw = () => {
          if (!gl || !program || !texture || !canvas.isConnected) return;
          const ratio = Math.min(window.devicePixelRatio || 1, 2);
          const rect = canvas.getBoundingClientRect();
          const viewport = {
            width: window.innerWidth,
            height: window.innerHeight,
          };
          const imageRect = textureImage.getBoundingClientRect();
          const imageStyle = getComputedStyle(textureImage);
          const objectPosition = imageStyle.objectPosition.split(' ');
          const positionRatio = (
            value: string | undefined,
            fallback: number,
          ) => {
            if (value?.endsWith('%')) return Number.parseFloat(value) / 100;
            if (value === 'left' || value === 'top') return 0;
            if (value === 'right' || value === 'bottom') return 1;
            return fallback;
          };
          const scale = Math.max(
            imageRect.width / textureImage.naturalWidth,
            imageRect.height / textureImage.naturalHeight,
          );
          const renderedWidth = textureImage.naturalWidth * scale;
          const renderedHeight = textureImage.naturalHeight * scale;
          const renderedLeft =
            imageRect.left +
            (imageRect.width - renderedWidth) *
              positionRatio(objectPosition[0], 0.5);
          const renderedTop =
            imageRect.top +
            (imageRect.height - renderedHeight) *
              positionRatio(objectPosition[1], 0.5);
          canvas.width = Math.max(1, Math.round(rect.width * ratio));
          canvas.height = Math.max(1, Math.round(rect.height * ratio));
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.uniform4f(
            cardLocation,
            rect.x / viewport.width,
            rect.y / viewport.height,
            rect.width / viewport.width,
            rect.height / viewport.height,
          );
          gl.uniform4f(
            imageBoundsLocation,
            renderedLeft / viewport.width,
            1 - (renderedTop + renderedHeight) / viewport.height,
            renderedWidth / viewport.width,
            renderedHeight / viewport.height,
          );
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        draw();
      };
      if (image?.complete) start();
      else image?.addEventListener('load', start, { once: true });
      if (!image) {
        artworkObserver = new MutationObserver(() => {
          image = document.querySelector<HTMLImageElement>('[data-hero-image]');
          if (!image) return;
          artworkObserver?.disconnect();
          if (image.complete) start();
          else image.addEventListener('load', start, { once: true });
        });
        artworkObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }
    } else {
      card.dataset.effectActive =
        effect === 'svg' ? 'svg-filter-or-css-fallback' : 'css-blur';
    }

    const pointerMove = (event: PointerEvent) => {
      if (reducedMotion.matches) return;
      const bounds = card.getBoundingClientRect();
      card.style.setProperty('--pointer-x', `${event.clientX - bounds.left}px`);
      card.style.setProperty('--pointer-y', `${event.clientY - bounds.top}px`);
    };
    const clearPointer = () => {
      card.style.removeProperty('--pointer-x');
      card.style.removeProperty('--pointer-y');
    };
    if (!reducedMotion.matches && pointerMotion.matches) {
      card.addEventListener('pointermove', pointerMove);
      card.addEventListener('pointerleave', clearPointer);
    }
    window.addEventListener('resize', draw);
    return () => {
      active = false;
      artworkObserver?.disconnect();
      card.removeEventListener('pointermove', pointerMove);
      card.removeEventListener('pointerleave', clearPointer);
      window.removeEventListener('resize', draw);
      if (texture && gl) gl.deleteTexture(texture);
      if (program && gl) gl.deleteProgram(program);
    };
  }, [effect]);

  return (
    <div ref={cardRef} className={styles.glassFrame}>
      <Card
        as="article"
        className={styles.glassCard}
        data-testid="hero-glass-card"
        data-effect={effect}
        data-material={material}
        data-effect-active={
          effect === 'webgl'
            ? 'initializing'
            : effect === 'svg'
              ? 'svg-filter-or-css-fallback'
              : 'css-blur'
        }
        data-locale={locale}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        {effect === 'webgl' && (
          <canvas
            ref={lensRef}
            className={styles.webglLens}
            aria-hidden="true"
          />
        )}
        {effect === 'svg' && (
          <div
            className={styles.svgLens}
            aria-hidden="true"
            data-testid="svg-lens"
          />
        )}
        <svg
          className={styles.filterDefinitions}
          aria-hidden="true"
          focusable="false"
        >
          <filter
            id={
              material === 'B'
                ? 'hero-glass-displacement-b'
                : 'hero-glass-displacement'
            }
            x="-10%"
            y="-10%"
            width="120%"
            height="120%"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.018"
              numOctaves="1"
              seed="4"
            />
            <feDisplacementMap
              in="SourceGraphic"
              scale={material === 'B' ? '22' : '4'}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </svg>
        <div className={styles.glassContent} data-testid="hero-glass-content">
          {children}
        </div>
      </Card>
    </div>
  );
}
