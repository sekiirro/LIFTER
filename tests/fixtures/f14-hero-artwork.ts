export type HeroArtTone = 'dark' | 'bright';
export type HeroArtOrientation = 'desktop' | 'mobile';

/** Procedural SVG photo-study fixture; never fetched from an external source. */
export function createF14HeroArtwork(
  orientation: HeroArtOrientation,
  tone: HeroArtTone,
): string {
  const width = orientation === 'desktop' ? 2560 : 1080;
  const height = 1440;
  const centerX = orientation === 'desktop' ? 820 : 540;
  const helmetY = orientation === 'desktop' ? 375 : 282;
  const helmetRx = orientation === 'desktop' ? 198 : 194;
  const helmetRy = orientation === 'desktop' ? 176 : 173;
  const dark = tone === 'dark';
  const stops = dark
    ? ['#171918', '#37342f', '#645546', '#292a27']
    : ['#d8d8d2', '#b9b2a6', '#eee1c8', '#c7c7c0'];
  const horizon = dark ? '#f1c28b' : '#786c5b';
  const silhouette = dark ? '#101211' : '#33342f';
  const helmet = dark ? '#272722' : '#5b574f';
  const visor = dark ? '#33332d' : '#787165';
  const skyGlow = dark ? '#efb878' : '#fff5df';
  const ridge = dark ? '#2e302c' : '#a8a69e';
  const foreground = dark ? '#20221f' : '#85857d';
  const texture = Array.from({ length: 14 }, (_, index) => {
    const x = (index * 37 + 5) % 64;
    const y = (index * 53 + 11) % 64;
    const radius = index % 4 === 0 ? 1.4 : 0.7;
    return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${index % 2 ? '#fff' : '#000'}" fill-opacity="${index % 2 ? '.12' : '.08'}"/>`;
  }).join('');
  const characterPath = `M ${centerX - helmetRx * 0.34} ${helmetY + helmetRy * 1.3}
    C ${centerX - helmetRx * 0.5} 590 ${centerX - width * 0.2} 520 ${centerX - width * 0.3} 700
    L ${centerX - width * 0.38} 1180 L ${centerX + width * 0.38} 1180
    L ${centerX + width * 0.3} 700 C ${centerX + helmetRx * 0.5} 520 ${centerX + helmetRx * 0.4} 590 ${centerX + helmetRx * 0.34} ${helmetY + helmetRy * 1.3} Z`;
  const helmetPath = `M ${centerX - helmetRx} ${helmetY + 24}
    Q ${centerX - helmetRx * 0.83} ${helmetY - helmetRy * 0.9} ${centerX} ${helmetY - helmetRy}
    Q ${centerX + helmetRx * 0.86} ${helmetY - helmetRy * 0.91} ${centerX + helmetRx} ${helmetY + 24}
    Q ${centerX + helmetRx * 0.78} ${helmetY + helmetRy * 0.97} ${centerX} ${helmetY + helmetRy}
    Q ${centerX - helmetRx * 0.82} ${helmetY + helmetRy * 0.92} ${centerX - helmetRx} ${helmetY + 24} Z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="landscape" x1="0" y1="0" x2="0.72" y2="1">
        <stop offset="0" stop-color="${stops[0]}"/><stop offset=".31" stop-color="${stops[1]}"/>
        <stop offset=".63" stop-color="${stops[2]}"/><stop offset="1" stop-color="${stops[3]}"/>
      </linearGradient>
      <radialGradient id="glow" cx="${orientation === 'desktop' ? '31%' : '50%'}" cy="${orientation === 'desktop' ? '30%' : '23%'}" r="${orientation === 'desktop' ? '44%' : '62%'}">
        <stop offset="0" stop-color="${skyGlow}" stop-opacity="${dark ? '.38' : '.72'}"/>
        <stop offset=".35" stop-color="${skyGlow}" stop-opacity="${dark ? '.16' : '.27'}"/><stop offset="1" stop-color="${skyGlow}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="visor" x1="0" y1="0" x2="1" y2=".8">
        <stop stop-color="${visor}"/><stop offset=".5" stop-color="${dark ? '#5a5144' : '#938875'}"/><stop offset="1" stop-color="${silhouette}"/>
      </linearGradient>
      <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="${dark ? '#f6d29c' : '#6f5841'}" stop-opacity=".92"/>
        <stop offset=".48" stop-color="${horizon}" stop-opacity=".5"/><stop offset="1" stop-color="${horizon}" stop-opacity=".16"/>
      </linearGradient>
      <pattern id="grain" width="64" height="64" patternUnits="userSpaceOnUse">${texture}</pattern>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#landscape)"/>
    <rect width="${width}" height="${height}" fill="url(#glow)"/>
    <path d="M0 790 L310 720 L610 770 L930 665 L1260 770 L1600 700 L1940 766 L2240 690 L2560 754 L2560 1440 L0 1440Z" fill="${ridge}" opacity=".78"/>
    <path d="M0 975 L360 900 L700 970 L1050 858 L1410 970 L1780 900 L2140 965 L2560 875 L2560 1440 L0 1440Z" fill="${foreground}" opacity=".84"/>
    <path d="M${width * 0.57} ${height * 0.61} C ${width * 0.69} ${height * 0.585}, ${width * 0.82} ${height * 0.625}, ${width} ${height * 0.592}" fill="none" stroke="${horizon}" stroke-width="${dark ? 7 : 5}" stroke-opacity="${dark ? '.78' : '.58'}"/>
    <path d="M${width * 0.61} ${height * 0.617} C ${width * 0.73} ${height * 0.601}, ${width * 0.86} ${height * 0.633}, ${width} ${height * 0.608}" fill="none" stroke="${skyGlow}" stroke-width="12" stroke-opacity="${dark ? '.18' : '.16'}"/>
    <g>
      <path d="${characterPath}" fill="${silhouette}" stroke="url(#rim)" stroke-width="${dark ? 16 : 12}"/>
      <path d="M${centerX - width * 0.105} 720 L${centerX - width * 0.16} 1120 M${centerX + width * 0.105} 720 L${centerX + width * 0.16} 1120" fill="none" stroke="${horizon}" stroke-opacity=".46" stroke-width="${orientation === 'desktop' ? 10 : 6}"/>
      <path d="${helmetPath}" fill="${helmet}" stroke="url(#rim)" stroke-width="${dark ? 12 : 9}"/>
      <path d="M${centerX - helmetRx * 0.79} ${helmetY + helmetRy * 0.12} Q${centerX} ${helmetY - helmetRy * 0.02} ${centerX + helmetRx * 0.79} ${helmetY + helmetRy * 0.12} L${centerX + helmetRx * 0.62} ${helmetY + helmetRy * 0.55} Q${centerX} ${helmetY + helmetRy * 0.77} ${centerX - helmetRx * 0.62} ${helmetY + helmetRy * 0.54} Z" fill="url(#visor)"/>
      <path d="M${centerX - helmetRx * 0.73} ${helmetY + helmetRy * 0.08} Q${centerX} ${helmetY - helmetRy * 0.15} ${centerX + helmetRx * 0.73} ${helmetY + helmetRy * 0.08}" fill="none" stroke="${skyGlow}" stroke-opacity=".8" stroke-width="${dark ? 10 : 7}"/>
      <path d="M${centerX - width * 0.13} 735 L${centerX - width * 0.08} 1080 M${centerX + width * 0.13} 735 L${centerX + width * 0.08} 1080" stroke="${horizon}" stroke-opacity=".39" stroke-width="${orientation === 'desktop' ? 8 : 5}"/>
    </g>
    <rect width="${width}" height="${height}" fill="url(#grain)" opacity=".48"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
