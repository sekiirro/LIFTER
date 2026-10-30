export type HeroArtTone = 'dark' | 'bright';
export type HeroArtOrientation = 'desktop' | 'mobile';

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pathPolygon(
  context: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  fill: string | CanvasGradient,
) {
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.fillStyle = fill;
  context.fill();
}

function drawCharacter(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  orientation: HeroArtOrientation,
  tone: HeroArtTone,
) {
  const scale = height / 1440;
  const centerX = width * (orientation === 'desktop' ? 0.32 : 0.5);
  const helmetY = height * (orientation === 'desktop' ? 0.27 : 0.19);
  const helmetRx = width * (orientation === 'desktop' ? 0.078 : 0.18);
  const helmetRy = height * (orientation === 'desktop' ? 0.12 : 0.12);
  const rim = tone === 'dark' ? '#e8ac6a' : '#9e603c';
  const silhouette = tone === 'dark' ? '#090d13' : '#18212a';

  const halo = context.createRadialGradient(
    centerX,
    helmetY + helmetRy * 0.52,
    helmetRy * 0.08,
    centerX,
    helmetY + helmetRy * 0.52,
    width * (orientation === 'desktop' ? 0.27 : 0.55),
  );
  halo.addColorStop(
    0,
    tone === 'dark' ? 'rgba(237,166,94,.22)' : 'rgba(255,244,218,.58)',
  );
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = halo;
  context.fillRect(0, 0, width, height);

  // Broad shoulders and back form one readable silhouette, with a warm edge light.
  context.save();
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.shadowColor = rim;
  context.shadowBlur = 20 * scale;
  context.strokeStyle =
    tone === 'dark' ? 'rgba(240,178,108,.62)' : 'rgba(138,77,49,.62)';
  context.lineWidth = 3.2 * scale;
  context.beginPath();
  context.moveTo(centerX - helmetRx * 0.25, helmetY + helmetRy * 1.5);
  context.bezierCurveTo(
    centerX - helmetRx * 0.5,
    height * 0.4,
    centerX - width * 0.13,
    height * 0.36,
    centerX - width * (orientation === 'desktop' ? 0.18 : 0.46),
    height * 0.48,
  );
  context.lineTo(
    centerX - width * (orientation === 'desktop' ? 0.24 : 0.5),
    height * 0.82,
  );
  context.lineTo(
    centerX + width * (orientation === 'desktop' ? 0.22 : 0.5),
    height * 0.82,
  );
  context.lineTo(
    centerX + width * (orientation === 'desktop' ? 0.17 : 0.46),
    height * 0.49,
  );
  context.bezierCurveTo(
    centerX + helmetRx * 0.5,
    height * 0.36,
    centerX + helmetRx * 0.5,
    height * 0.4,
    centerX + helmetRx * 0.25,
    helmetY + helmetRy * 1.5,
  );
  context.closePath();
  context.fillStyle = silhouette;
  context.fill();
  context.stroke();
  context.restore();

  // Helmet shell: faceted crown, recessed visor, and a narrow illuminated rim.
  context.save();
  context.shadowColor = rim;
  context.shadowBlur = 14 * scale;
  context.fillStyle = tone === 'dark' ? '#101720' : '#263541';
  context.strokeStyle = rim;
  context.lineWidth = 4 * scale;
  context.beginPath();
  context.moveTo(centerX - helmetRx * 0.94, helmetY + helmetRy * 0.36);
  context.quadraticCurveTo(
    centerX - helmetRx * 0.8,
    helmetY - helmetRy * 0.95,
    centerX,
    helmetY - helmetRy,
  );
  context.quadraticCurveTo(
    centerX + helmetRx * 0.9,
    helmetY - helmetRy * 0.9,
    centerX + helmetRx,
    helmetY + helmetRy * 0.36,
  );
  context.quadraticCurveTo(
    centerX + helmetRx * 0.88,
    helmetY + helmetRy * 1.02,
    centerX,
    helmetY + helmetRy * 1.1,
  );
  context.quadraticCurveTo(
    centerX - helmetRx * 0.9,
    helmetY + helmetRy * 0.98,
    centerX - helmetRx * 0.94,
    helmetY + helmetRy * 0.36,
  );
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();

  const visor = context.createLinearGradient(
    centerX - helmetRx,
    helmetY,
    centerX + helmetRx,
    helmetY + helmetRy * 0.5,
  );
  visor.addColorStop(0, '#101a25');
  visor.addColorStop(0.5, tone === 'dark' ? '#263746' : '#455865');
  visor.addColorStop(1, '#111923');
  context.fillStyle = visor;
  context.beginPath();
  context.moveTo(centerX - helmetRx * 0.81, helmetY + helmetRy * 0.12);
  context.quadraticCurveTo(
    centerX,
    helmetY - helmetRy * 0.06,
    centerX + helmetRx * 0.81,
    helmetY + helmetRy * 0.12,
  );
  context.lineTo(centerX + helmetRx * 0.65, helmetY + helmetRy * 0.56);
  context.quadraticCurveTo(
    centerX,
    helmetY + helmetRy * 0.73,
    centerX - helmetRx * 0.66,
    helmetY + helmetRy * 0.53,
  );
  context.closePath();
  context.fill();
  context.strokeStyle =
    tone === 'dark' ? 'rgba(246,192,129,.76)' : 'rgba(88,56,41,.64)';
  context.lineWidth = 2 * scale;
  context.stroke();

  // Back plate, shoulder seams, and pack give the figure depth without text or logos.
  const pack = context.createLinearGradient(
    centerX - width * 0.12,
    height * 0.43,
    centerX + width * 0.12,
    height * 0.75,
  );
  pack.addColorStop(0, tone === 'dark' ? '#202a35' : '#47525a');
  pack.addColorStop(0.55, silhouette);
  pack.addColorStop(1, tone === 'dark' ? '#111820' : '#202a31');
  pathPolygon(
    context,
    [
      [centerX - width * 0.095, height * 0.43],
      [centerX + width * 0.095, height * 0.43],
      [centerX + width * 0.13, height * 0.74],
      [centerX - width * 0.13, height * 0.74],
    ],
    pack,
  );
  context.strokeStyle =
    tone === 'dark' ? 'rgba(236,173,107,.48)' : 'rgba(105,74,54,.48)';
  context.lineWidth = 2.2 * scale;
  context.beginPath();
  context.moveTo(centerX - width * 0.15, height * 0.49);
  context.lineTo(centerX - width * 0.09, height * 0.73);
  context.moveTo(centerX + width * 0.15, height * 0.49);
  context.lineTo(centerX + width * 0.09, height * 0.73);
  context.stroke();
  context.fillStyle =
    tone === 'dark' ? 'rgba(241,181,116,.58)' : 'rgba(116,70,47,.52)';
  context.fillRect(centerX - 2 * scale, height * 0.5, 4 * scale, height * 0.16);
}

export function createF14HeroArtwork(
  orientation: HeroArtOrientation,
  tone: HeroArtTone,
): Promise<string> {
  const width = orientation === 'desktop' ? 2560 : 1080;
  const height = 1440;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('Canvas 2D is unavailable'));

  const base = context.createLinearGradient(0, 0, width * 0.72, height);
  if (tone === 'dark') {
    base.addColorStop(0, '#09111b');
    base.addColorStop(0.3, '#263746');
    base.addColorStop(0.62, '#6e5b50');
    base.addColorStop(1, '#121a21');
  } else {
    base.addColorStop(0, '#e2e8ec');
    base.addColorStop(0.28, '#d8d2c8');
    base.addColorStop(0.61, '#f0cfa7');
    base.addColorStop(1, '#d6d8d4');
  }
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);

  const light = context.createRadialGradient(
    width * (orientation === 'desktop' ? 0.61 : 0.52),
    height * 0.34,
    0,
    width * (orientation === 'desktop' ? 0.61 : 0.52),
    height * 0.34,
    width * 0.46,
  );
  light.addColorStop(
    0,
    tone === 'dark' ? 'rgba(234,176,117,.55)' : 'rgba(255,249,233,.88)',
  );
  light.addColorStop(
    0.32,
    tone === 'dark' ? 'rgba(222,154,99,.2)' : 'rgba(246,222,184,.38)',
  );
  light.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = light;
  context.fillRect(0, 0, width, height);

  // Layered distant ridges and an atmospheric horizon keep the right side calm.
  const distant = tone === 'dark' ? '#18232c' : '#aeb8b7';
  const near = tone === 'dark' ? '#111820' : '#657276';
  pathPolygon(
    context,
    [
      [0, height * 0.59],
      [width * 0.12, height * 0.52],
      [width * 0.24, height * 0.57],
      [width * 0.38, height * 0.48],
      [width * 0.55, height * 0.58],
      [width * 0.72, height * 0.53],
      [width * 0.88, height * 0.58],
      [width, height * 0.54],
      [width, height],
      [0, height],
    ],
    distant,
  );
  pathPolygon(
    context,
    [
      [0, height * 0.72],
      [width * 0.16, height * 0.67],
      [width * 0.31, height * 0.73],
      [width * 0.48, height * 0.65],
      [width * 0.68, height * 0.72],
      [width * 0.83, height * 0.67],
      [width, height * 0.7],
      [width, height],
      [0, height],
    ],
    near,
  );

  const random = seededRandom(orientation === 'desktop' ? 87129 : 44127);
  for (let index = 0; index < 380; index += 1) {
    const x = random() * width;
    const y = random() * height * 0.72;
    const radius = (0.5 + random() * 2.4) * (width / 2560);
    context.beginPath();
    context.arc(x, y, Math.max(0.55, radius), 0, Math.PI * 2);
    context.fillStyle =
      tone === 'dark'
        ? `rgba(255,218,172,${0.08 + random() * 0.26})`
        : `rgba(77,89,93,${0.06 + random() * 0.15})`;
    context.fill();
  }

  // A small deterministic grain tile gives the painted layers surface texture.
  const grainCanvas = document.createElement('canvas');
  grainCanvas.width = 256;
  grainCanvas.height = 256;
  const grainContext = grainCanvas.getContext('2d');
  if (!grainContext)
    return Promise.reject(new Error('Canvas grain is unavailable'));
  const grain = grainContext.createImageData(
    grainCanvas.width,
    grainCanvas.height,
  );
  for (let index = 0; index < grain.data.length; index += 4) {
    const value = Math.floor(random() * 255);
    grain.data[index] = value;
    grain.data[index + 1] = value;
    grain.data[index + 2] = value;
    grain.data[index + 3] = tone === 'dark' ? 16 : 12;
  }
  grainContext.putImageData(grain, 0, 0);
  context.globalCompositeOperation = 'soft-light';
  const grainPattern = context.createPattern(grainCanvas, 'repeat');
  if (grainPattern) {
    context.fillStyle = grainPattern;
    context.fillRect(0, 0, width, height);
  }
  context.globalCompositeOperation = 'source-over';
  drawCharacter(context, width, height, orientation, tone);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not encode procedural artwork'));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, 'image/png');
  });
}
