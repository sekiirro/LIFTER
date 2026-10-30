'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Card } from '../../../../components/ui/Card';
import styles from './page.module.css';
import type { GlassEffect, HeroMaterial } from './HeroStage';

const vertexShader = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = vec2((a_position.x + 1.0) * 0.5, 1.0 - (a_position.y + 1.0) * 0.5);
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform vec4 u_card;
  uniform vec4 u_image_bounds;
  uniform vec2 u_card_size;
  varying vec2 v_uv;
  void main() {
    vec2 screen_uv = vec2(u_card.x + v_uv.x * u_card.z, 1.0 - (u_card.y + v_uv.y * u_card.w));
    vec2 uv = (screen_uv - u_image_bounds.xy) / u_image_bounds.zw;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    float left = v_uv.x * u_card_size.x;
    float right = (1.0 - v_uv.x) * u_card_size.x;
    float top = v_uv.y * u_card_size.y;
    float bottom = (1.0 - v_uv.y) * u_card_size.y;
    float horizontal = min(left, right);
    float vertical = min(top, bottom);
    float edgeDistance = min(horizontal, vertical);
    float lens = 1.0 - smoothstep(8.0, 20.0, edgeDistance);
    vec2 displacement = vec2(0.0);
    if (horizontal < vertical) {
      float side = left < right ? -1.0 : 1.0;
      displacement.y = side * 24.0 / u_card_size.y;
    } else {
      float side = top < bottom ? -1.0 : 1.0;
      displacement.x = side * 24.0 / u_card_size.x;
    }
    vec3 color = texture2D(u_image, clamp(uv + displacement * lens, 0.002, 0.998)).rgb;
    gl_FragColor = vec4(color, lens * 0.96);
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
    if (!frame || !card) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reducedTransparency = window.matchMedia(
      '(prefers-reduced-transparency: reduce)',
    );
    const increasedContrast = window.matchMedia('(prefers-contrast: more)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const smallScreen = window.matchMedia('(max-width: 47.999rem)');
    const lensAllowed = Boolean(
      effect === 'webgl' &&
      canvas &&
      !reducedMotion.matches &&
      !reducedTransparency.matches &&
      !increasedContrast.matches &&
      !smallScreen.matches,
    );
    let gl: WebGLRenderingContext | null = null;
    let texture: WebGLTexture | null = null;
    let program: WebGLProgram | null = null;
    let active = true;
    let draw = () => {};
    let drawFrame = 0;
    const image = frame
      .closest<HTMLElement>('[data-testid="hero-prototype"]')
      ?.querySelector<HTMLImageElement>('[data-hero-image]');
    let imageLoadListener: (() => void) | undefined;

    if (!lensAllowed || !canvas) {
      card.dataset.effectActive = effect === 'none' ? 'none' : 'css-blur';
    } else {
      gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
      });
      if (!gl) {
        card.dataset.effectActive = 'css-blur';
      } else {
        const start = () => {
          if (!gl || !image || !image.naturalWidth || !active) return;
          const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
          const fragment = compileShader(
            gl,
            gl.FRAGMENT_SHADER,
            fragmentShader,
          );
          if (!vertex || !fragment) {
            card.dataset.effectActive = 'css-blur';
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
            card.dataset.effectActive = 'css-blur';
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
            image,
          );
          gl.useProgram(program);
          gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
          const cardLocation = gl.getUniformLocation(program, 'u_card');
          const imageBoundsLocation = gl.getUniformLocation(
            program,
            'u_image_bounds',
          );
          const cardSizeLocation = gl.getUniformLocation(
            program,
            'u_card_size',
          );
          card.dataset.effectActive = 'webgl';
          draw = () => {
            if (!gl || !program || !texture || !canvas.isConnected || !image)
              return;
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            const rect = canvas.getBoundingClientRect();
            const viewport = {
              width: window.innerWidth,
              height: window.innerHeight,
            };
            const imageRect = image.getBoundingClientRect();
            const objectPosition =
              getComputedStyle(image).objectPosition.split(' ');
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
              imageRect.width / image.naturalWidth,
              imageRect.height / image.naturalHeight,
            );
            const renderedWidth = image.naturalWidth * scale;
            const renderedHeight = image.naturalHeight * scale;
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
            gl.uniform2f(cardSizeLocation, rect.width, rect.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            const submissionStart = performance.now();
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            canvas.dataset.drawCount = String(
              Number(canvas.dataset.drawCount ?? 0) + 1,
            );
            canvas.dataset.drawSubmitTotalMs = String(
              Number(canvas.dataset.drawSubmitTotalMs ?? 0) +
                performance.now() -
                submissionStart,
            );
          };
          draw();
        };
        if (image?.complete) start();
        else if (image) {
          imageLoadListener = start;
          image.addEventListener('load', imageLoadListener, { once: true });
        }
      }
    }

    const scheduleDraw = () => {
      if (!lensAllowed || drawFrame) return;
      drawFrame = requestAnimationFrame(() => {
        drawFrame = 0;
        draw();
      });
    };
    const pointerMove = (event: PointerEvent) => {
      if (reducedMotion.matches || !finePointer.matches) return;
      const bounds = card.getBoundingClientRect();
      card.style.setProperty('--pointer-x', `${event.clientX - bounds.left}px`);
      card.style.setProperty('--pointer-y', `${event.clientY - bounds.top}px`);
      scheduleDraw();
    };
    const clearPointer = () => {
      card.style.removeProperty('--pointer-x');
      card.style.removeProperty('--pointer-y');
    };
    if (!reducedMotion.matches && finePointer.matches) {
      card.addEventListener('pointermove', pointerMove);
      card.addEventListener('pointerleave', clearPointer);
    }
    const observer = new ResizeObserver(scheduleDraw);
    observer.observe(card);
    window.addEventListener('resize', scheduleDraw);
    return () => {
      active = false;
      if (drawFrame) cancelAnimationFrame(drawFrame);
      observer.disconnect();
      if (imageLoadListener)
        image?.removeEventListener('load', imageLoadListener);
      card.removeEventListener('pointermove', pointerMove);
      card.removeEventListener('pointerleave', clearPointer);
      window.removeEventListener('resize', scheduleDraw);
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
        data-effect-active={
          effect === 'webgl'
            ? 'initializing'
            : effect === 'none'
              ? 'none'
              : 'css-blur'
        }
        data-material={material}
        data-locale={locale}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        <div
          className={styles.glassShell}
          data-testid="hero-glass-shell"
          aria-hidden="true"
        />
        {effect === 'webgl' && (
          <canvas
            ref={lensRef}
            className={styles.webglLens}
            data-testid="hero-webgl-lens"
            aria-hidden="true"
          />
        )}
        <div
          className={styles.glassRim}
          data-testid="hero-glass-rim"
          aria-hidden="true"
        />
        <div className={styles.glassDepth} aria-hidden="true" />
        <div className={styles.glassContent} data-testid="hero-glass-content">
          {children}
        </div>
        <div
          className={styles.glassInteraction}
          data-testid="hero-glass-interaction"
          aria-hidden="true"
        />
      </Card>
    </div>
  );
}
