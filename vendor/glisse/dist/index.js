"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
// src/internal/styles.ts
const id = "glisse-styles";
/**
* Adds the stylesheet to the document once. It goes first in <head>, so the
* app's own CSS comes after it and wins ties, as it would if imported after.
*/
function insertStyles(css) {
	if (typeof document === "undefined" || document.getElementById(id)) return;
	const style = document.createElement("style");
	style.id = id;
	style.textContent = css;
	document.head.prepend(style);
}
// src/styles.css?inline
var styles_default = ":where(:root,[data-theme=light]){--lg-foreground:#000000e0;--lg-muted:#3c3c4399;--lg-glass:#fff9;--lg-glass-active:#ececf0d9;--lg-edge:#00000014;--lg-drop:#0000000f;--lg-selection:#0000001a;--lg-lens:#00000008;--lg-lens-drop:#0000001c;--lg-segment-track:#7676801f;--lg-segment-thumb:#fff;--lg-segment-label:#000;--lg-segment-lens:#00000008;--lg-surface:#fafafcdb;--lg-surface-edge:#00000014;--lg-shadow:#1919231f;--lg-highlight:#3c3c4317;--lg-separator:#3c3c4326;--lg-destructive:#ff383c;--lg-track:#3b3b424d;--lg-rail:#0000001a;--lg-on:#34c759;--lg-fill:#08f;--lg-ring:#0006;--lg-lens-shine:-1.5;--lg-rim-shine:.3;--lg-ease:cubic-bezier(.25, .1, .25, 1)}:where([data-theme=dark]){--lg-foreground:#fff;--lg-muted:#ebebf599;--lg-glass:#2828289e;--lg-glass-active:#4646469e;--lg-edge:#ffffff14;--lg-drop:transparent;--lg-selection:#ffffff25;--lg-lens:#ffffff0e;--lg-lens-drop:transparent;--lg-segment-track:transparent;--lg-segment-thumb:#ebebf54d;--lg-segment-label:#fff;--lg-segment-lens:transparent;--lg-surface:#1c1c1fdb;--lg-surface-edge:#ffffff21;--lg-shadow:#00000061;--lg-highlight:#ebebf521;--lg-separator:#ebebf529;--lg-destructive:#ff4245;--lg-track:#ebebf54d;--lg-rail:#ffffff1a;--lg-on:#30d158;--lg-fill:#0091ff;--lg-ring:#ffffff80;--lg-lens-shine:1;--lg-rim-shine:.13}@media (prefers-color-scheme:dark){:where(:root:not([data-theme=light])){--lg-foreground:#fff;--lg-muted:#ebebf599;--lg-glass:#2828289e;--lg-glass-active:#4646469e;--lg-edge:#ffffff14;--lg-drop:transparent;--lg-selection:#ffffff25;--lg-lens:#ffffff0e;--lg-lens-drop:transparent;--lg-segment-track:transparent;--lg-segment-thumb:#ebebf54d;--lg-segment-label:#fff;--lg-segment-lens:transparent;--lg-surface:#1c1c1fdb;--lg-surface-edge:#ffffff21;--lg-shadow:#00000061;--lg-highlight:#ebebf521;--lg-separator:#ebebf529;--lg-destructive:#ff4245;--lg-track:#ebebf54d;--lg-rail:#ffffff1a;--lg-on:#30d158;--lg-fill:#0091ff;--lg-ring:#ffffff80;--lg-lens-shine:1;--lg-rim-shine:.13}}.lg-glass{background-color:var(--lg-glass);background-image:var(--lg-rim,none);-webkit-backdrop-filter:blur(var(--lg-blur,3px)) var(--lg-filter,saturate(1.5));backdrop-filter:blur(var(--lg-blur,3px)) var(--lg-filter,saturate(1.5));box-shadow:inset 0 0 0 .5px var(--lg-edge), 0 1px 3px var(--lg-drop);background-size:100% 100%;position:relative}.lg-glass[data-rim]{box-shadow:0 1px 3px var(--lg-drop)}.lg-glass:after{content:\"\";border-radius:inherit;pointer-events:none;background:radial-gradient(circle 240px at var(--lg-x,50%) var(--lg-y,50%), #ffffff09, #ffffff06 50%, transparent);opacity:0;transition:opacity .22s ease-in-out;position:absolute;inset:0}.lg-glass[data-pressed]:after{opacity:1;transition-duration:0s}.lg-button{height:40px;color:var(--lg-foreground);font:inherit;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;border:0;border-radius:20px;justify-content:center;align-items:center;gap:8px;padding:0 16px;font-size:14px;transition:background-color .2s;display:inline-flex}.lg-button[data-icon]{padding-left:12px}.lg-button[data-icon=only]{width:40px;padding:0}.lg-button>svg{flex:none;width:20px;height:20px}.lg-button:is(:active,[data-pressed]){background-color:var(--lg-glass-active);transition-duration:0s}@media (hover:hover) and (pointer:fine){.lg-button:hover{background-color:var(--lg-glass-active)}}.lg-button:disabled{background-color:var(--lg-glass);opacity:.35;cursor:default}.lg-button[data-destructive]:not([data-tint]){--lg-tint:var(--lg-destructive)}.lg-button:is([data-tint],[data-destructive]){color:var(--lg-tint)}.lg-button[data-variant=filled]{--lg-button-fill:var(--lg-tint,var(--lg-fill));color:#fff}.lg-button[data-variant=filled],.lg-button[data-variant=filled]:disabled{background-color:var(--lg-button-fill)}.lg-button[data-variant=filled]:is(:active,[data-pressed]){background-color:color-mix(in srgb, var(--lg-button-fill) 85%, #000)}@media (hover:hover) and (pointer:fine){.lg-button[data-variant=filled]:hover{background-color:color-mix(in srgb, var(--lg-button-fill) 88%, #fff)}.lg-button[data-variant=filled]:hover:is(:active,[data-pressed]){background-color:color-mix(in srgb, var(--lg-button-fill) 85%, #000)}}.lg-button:focus-visible,.lg-tab:focus-visible,.lg-switch:focus-visible,.lg-menu-item:focus-visible{outline:2px solid var(--lg-ring);outline-offset:2px}.lg-tab-bar{--lg-tab-width:84px;--lg-tab-height:32px;--lg-tab-inset:4px;--lg-thumb-inset:0px;--lg-lens-grow-x:27px;--lg-lens-grow-y:20px;padding:var(--lg-tab-inset);border-radius:calc(var(--lg-tab-height) / 2 + var(--lg-tab-inset));touch-action:pan-y;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;display:inline-flex;position:relative}.lg-tab-bar-glass{border-radius:inherit;pointer-events:none;position:absolute;inset:0}.lg-tab-bar-glass:before{content:\"\";border-radius:inherit;background:radial-gradient(circle 260px at var(--lg-x,20%) 50%, #ffffff17, #ffffff0b 60%, transparent);opacity:0;transition:opacity .16s;position:absolute;inset:0}:is(.lg-tab-bar,.lg-segmented)[data-lifted] .lg-tab-bar-glass:before{opacity:1;transition-duration:.12s}.lg-tab-labels{--lg-room-x:calc(var(--lg-lens-grow-x) / 2 + 4px);--lg-room-y:calc(var(--lg-lens-grow-y) / 2 + 4px);z-index:1;margin:calc(var(--lg-room-y) * -1) calc(var(--lg-room-x) * -1);padding:var(--lg-room-y) var(--lg-room-x);pointer-events:none;display:flex;position:relative}.lg-tab-lensed{top:var(--lg-tab-inset);left:var(--lg-tab-inset);color:var(--lg-tab-selected,var(--lg-foreground));visibility:hidden;position:absolute}:is(.lg-tab-bar,.lg-segmented)[data-lensing] .lg-tab-tint{visibility:hidden}.lg-tab,.lg-tab-copy{width:var(--lg-tab-width);height:var(--lg-tab-height);font:inherit;flex:none;justify-content:center;align-items:center;font-size:14px;display:flex}.lg-tab{z-index:1;border-radius:calc(var(--lg-tab-height) / 2);color:var(--lg-muted);cursor:pointer;pointer-events:auto;-webkit-touch-callout:none;background:0 0;border:0;padding:0;text-decoration:none;transition:color .2s;position:relative}.lg-tab:focus-visible{outline-offset:-2px}.lg-tab-face{display:contents}.lg-tab-bar:not([data-away]) .lg-tab[data-selected]>.lg-tab-face{color:#0000}.lg-tab-text{text-box:trim-both cap alphabetic;display:block}.lg-tab-bar[data-icons]{--lg-tab-width:72px;--lg-tab-height:52px;--lg-lens-grow-x:24px;--lg-lens-grow-y:16px;--lg-tab-selected:var(--lg-fill)}.lg-tab-bar[data-icons] :is(.lg-tab,.lg-tab-copy){flex-direction:column;gap:1px;font-size:10px;font-weight:500}.lg-tab-bar[data-icons] .lg-tab{color:var(--lg-foreground)}.lg-tab-icon{display:flex}.lg-tab-icon>svg{width:26px;height:26px}@media (hover:hover) and (pointer:fine){.lg-tab:hover{color:var(--lg-foreground)}}.lg-tab-lens,.lg-tab-tint,.lg-segmented-thumb{top:calc(var(--lg-tab-inset) + var(--lg-thumb-inset));left:calc(var(--lg-tab-inset) + var(--lg-thumb-inset));width:calc(var(--lg-tab-width) - 2 * var(--lg-thumb-inset));height:calc(var(--lg-tab-height) - 2 * var(--lg-thumb-inset));border-radius:calc(var(--lg-tab-height) / 2 - var(--lg-thumb-inset));pointer-events:none;transform:translateX(calc(var(--lg-tab-width) * var(--lg-index,0)));will-change:transform;transition:opacity .14s;position:absolute}.lg-tab-tint{z-index:1;color:var(--lg-tab-selected,var(--lg-foreground));overflow:hidden}.lg-tab-row{height:var(--lg-tab-height);margin:calc(var(--lg-thumb-inset) * -1) 0 0 calc(var(--lg-thumb-inset) * -1);transform:translateX(calc(var(--lg-tab-width) * var(--lg-index,0) * -1));transform-origin:0 0;will-change:transform;display:flex}.lg-tab-lens.lg-glass{z-index:2;-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:0 calc(7px / var(--lg-lift-y,1)) calc(11px / var(--lg-lift-y,1)) color-mix(in srgb, var(--lg-lens-drop) calc(var(--lg-lift,0) * 100%), transparent);background-color:#0000;background-image:none;transition:opacity .14s,background-color .14s}.lg-tab-bar[data-lifted] .lg-tab-lens.lg-glass{background-color:var(--lg-lens);transition-duration:.1s}.lg-tab-lens:before{content:\"\";border-radius:inherit;background:var(--lg-selection);transition:opacity .14s;position:absolute;inset:0}.lg-tab-lens[data-pressed]:after{opacity:.2}.lg-tab-bar[data-lifted] .lg-tab-lens:before{opacity:0;transition-duration:.1s}:is(.lg-tab-bar,.lg-segmented)[data-refracting] .lg-tab-lens.lg-glass{background-image:var(--lg-rim,none)}:is(.lg-tab-bar,.lg-segmented)[data-refracting][data-light] .lg-tab-lens.lg-glass{background-image:var(--lg-rim-bright,var(--lg-rim,none))}.lg-segmented[data-refracting][data-light] .lg-tab-lens.lg-glass,.lg-tab-bar[data-under][data-light] .lg-tab-lens.lg-glass{z-index:0;-webkit-backdrop-filter:var(--lg-filter,none);backdrop-filter:var(--lg-filter,none)}.lg-tab-bar[data-light] .lg-tab-lens:before{opacity:var(--lg-rest,1);transition:none}.lg-tab-bar[data-light] .lg-tab-lens.lg-glass{background-color:color-mix(in srgb, var(--lg-lens) calc(var(--lg-under,0) * 100%), transparent);transition:opacity .14s}:is(:is(.lg-tab-bar,.lg-segmented)[data-hidden] :is(.lg-tab-lens,.lg-tab-tint,.lg-segmented-thumb),:is(.lg-tab-bar,.lg-segmented):not([data-ready]):not(:has([data-selected])) :is(.lg-tab-lens,.lg-tab-tint,.lg-segmented-thumb)){opacity:0}.lg-segmented{--lg-tab-width:84px;--lg-tab-height:32px;--lg-tab-inset:0px;--lg-thumb-inset:2px;--lg-lens-grow-x:24px;--lg-lens-grow-y:16px;--lg-tab-selected:var(--lg-segment-label);border-radius:calc(var(--lg-tab-height) / 2);touch-action:pan-y;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;display:inline-flex;position:relative}.lg-segmented>.lg-tab-bar-glass{background-image:var(--lg-rim,none), linear-gradient(var(--lg-segment-track) 0 0)}.lg-segmented :is(.lg-tab,.lg-tab-copy){font-size:13px}.lg-segmented .lg-tab,.lg-segmented .lg-tab:hover{color:var(--lg-segment-label)}.lg-segmented :is(.lg-tab,.lg-tab-copy)[data-selected]{font-weight:500}.lg-segmented .lg-tab-tint{display:none}.lg-segmented-thumb{background:var(--lg-segment-thumb)}.lg-segmented[data-lifted] .lg-segmented-thumb{opacity:0;transition-duration:.1s}.lg-segmented .lg-tab-lens:before{content:none}.lg-segmented[data-lifted] .lg-tab-lens.lg-glass{background-color:var(--lg-segment-lens);transition-duration:.1s}.lg-input{box-sizing:border-box;width:100%;max-width:360px;height:40px;color:var(--lg-foreground);border-radius:20px;align-items:center;gap:10px;padding:0 14px;transition:background-color .2s;display:flex}.lg-input:focus-within{background-color:var(--lg-glass-active)}.lg-input input{min-width:0;height:100%;color:inherit;font:inherit;background:0 0;border:0;outline:0;flex:1;padding:0;font-size:14px}.lg-input input::placeholder{color:var(--lg-muted)}.lg-input input::-webkit-search-cancel-button{display:none}.lg-input-icon{width:16px;height:16px;color:var(--lg-muted);flex:none;place-items:center;display:grid}.lg-input-icon>svg{width:100%;height:100%}.lg-input-clear{width:32px;height:32px;color:var(--lg-muted);cursor:pointer;background:0 0;border:0;border-radius:50%;flex:none;place-items:center;margin-right:-8px;padding:0;display:grid}.lg-input-clear svg{width:14px;height:14px}.lg-input:has(input:disabled){opacity:.35}.lg-switch-thumb,.lg-slider-thumb{--lg-settled:calc(1 - var(--lg-lift,0));--lg-thumb-blur:calc(2px * var(--lg-settled) + var(--lg-thumb-frost,.5px) * var(--lg-lift,0));pointer-events:none;-webkit-backdrop-filter:blur(var(--lg-thumb-blur)) brightness(calc(1 + .15 * var(--lg-settled))) saturate(1.5);backdrop-filter:blur(var(--lg-thumb-blur)) brightness(calc(1 + .15 * var(--lg-settled))) saturate(1.5);border-radius:999px;position:absolute;box-shadow:0 6px 24px #0003,inset 0 0 0 1.5px #ffffff80,inset 0 2px 1px #ffffff73,inset 2px 7px 24px #00000017,inset -2px -7px 24px #ffffff29}.lg-thumb-face{border-radius:inherit;background:#fff;position:absolute;inset:0}.lg-switch{--lg-scale:.375;width:calc(160px * var(--lg-scale));height:calc(67px * var(--lg-scale));cursor:pointer;touch-action:pan-y;-webkit-tap-highlight-color:transparent;background:0 0;border:0;border-radius:999px;flex:none;padding:0;position:relative}.lg-switch:before{content:\"\";inset:min(0px, calc((67px * var(--lg-scale) - 44px) / 2)) -8px;position:absolute}.lg-switch-bed{pointer-events:none;position:absolute;inset:-6px -12px}.lg-switch-track,.lg-switch-fill{border-radius:999px;position:absolute}.lg-switch-track{background:var(--lg-track);inset:6px 12px}.lg-switch-fill{background:var(--lg-on);opacity:0;inset:0}.lg-switch-inset{visibility:hidden}.lg-switch-inset .lg-switch-track{width:calc((100% - 24px) * (.85 + .1 * var(--lg-lift,0)));height:calc((100% - 12px) * .75 * (.525 + .45 * var(--lg-lift,0)));margin:auto;inset:0}.lg-switch-thumb{top:50%;left:calc(-21.95px * var(--lg-scale));width:calc(146px * var(--lg-scale));height:calc(92px * var(--lg-scale));transform:translateY(-50%)scale(.65)}.lg-switch[aria-checked=true] .lg-switch-fill{opacity:1}.lg-switch[aria-checked=true] .lg-switch-thumb{transform:translate(calc(57.9px * var(--lg-scale)), -50%) scale(.65)}.lg-switch:disabled{opacity:.35;cursor:default}.lg-slider{width:100%;height:40px;position:relative}.lg-slider-bed{pointer-events:none;position:absolute;inset:-4px -16px}.lg-slider-track{background:var(--lg-rail);border-radius:3px;height:6px;position:absolute;inset:21px 16px auto}.lg-slider-fill{width:calc((100% - 36px) * var(--lg-progress) + 18px);border-radius:inherit;background:var(--lg-fill);height:100%;display:block}.lg-slider-magnified{visibility:hidden}.lg-slider-magnified .lg-slider-track{height:calc(var(--lg-slider-line,8px) * (.6 + .4 * var(--lg-lift,0)));border-radius:999px;margin:auto 0;inset:0 16px}.lg-slider-magnified .lg-slider-fill{--lg-travel:calc((100% - 36px) * var(--lg-progress));width:calc(var(--lg-travel) + min(18px, var(--lg-travel) * 4) + max(0px, 18px - (100% - 36px - var(--lg-travel)) * 4))}.lg-slider-thumb{top:0;left:calc((100% - 36px) * var(--lg-progress) - 12px);width:60px;height:40px;scale:.6}.lg-slider input{z-index:1;cursor:pointer;appearance:none;touch-action:pan-y;-webkit-tap-highlight-color:transparent;background:0 0;outline:none;width:100%;height:40px;margin:0;display:block;position:relative}.lg-slider input::-webkit-slider-runnable-track{background:0 0;height:6px}.lg-slider input::-webkit-slider-thumb{width:36px;height:40px;box-shadow:none;opacity:0;touch-action:none;appearance:none;background:0 0;border:0;margin-top:-17px}.lg-slider input::-moz-range-track{background:0 0;height:6px}.lg-slider input::-moz-range-thumb{width:36px;height:40px;box-shadow:none;opacity:0;background:0 0;border:0}.lg-slider:has(input:focus-visible) .lg-slider-thumb{outline:2px solid var(--lg-ring);outline-offset:3px}.lg-slider:has(input:disabled){opacity:.35}.lg-slider input:disabled{cursor:default}.lg-menu{display:inline-flex;position:relative}.lg-menu-card{z-index:10;box-sizing:border-box;width:200px;color:var(--lg-foreground);transform-origin:calc(100% - 20px) 20px;touch-action:none;-webkit-user-select:none;user-select:none;border-radius:20px;font-size:14px;position:absolute;top:0;right:0}.lg-menu-card[data-align=start]{transform-origin:20px 20px;left:0;right:auto}.lg-menu-card[data-phase=leaving]{pointer-events:none}.lg-menu-surface{border-radius:inherit;background:var(--lg-surface);-webkit-backdrop-filter:blur(22px)saturate(1.9);backdrop-filter:blur(22px)saturate(1.9);width:100%;height:100%;box-shadow:inset 0 0 0 .5px var(--lg-surface-edge), 0 12px 40px var(--lg-shadow);pointer-events:none;position:absolute;top:0;right:0}.lg-menu-card[data-align=start] .lg-menu-surface{left:0;right:auto}.lg-menu-glyph{pointer-events:none;place-items:center;width:40px;height:40px;display:grid;position:absolute;top:0;right:0}.lg-menu-card[data-align=start] .lg-menu-glyph{left:0;right:auto}.lg-menu-glyph>svg{width:20px;height:20px}.lg-menu-content{flex-direction:column;padding:6px;display:flex;position:relative}.lg-menu-card:after{content:\"\";border-radius:inherit;pointer-events:none;opacity:0;background:linear-gradient(135deg,#ffffff1c,#ffffff06);transition:opacity .12s ease-out;position:absolute;inset:0}.lg-menu-card[data-pressed]:after{opacity:1}.lg-menu-plate{background:var(--lg-highlight);opacity:0;pointer-events:none;border-radius:14px;transition:transform .1s cubic-bezier(.2,.8,.2,1),opacity 80ms ease-out;position:absolute;top:0;left:0}.lg-menu-item{z-index:1;min-height:32px;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:14px;align-items:center;gap:10px;padding:6px 12px;display:flex;position:relative}.lg-menu-item>svg{flex:none;width:16px;height:16px}.lg-menu-item:focus-visible{outline-offset:-2px;background:var(--lg-highlight)}@media (hover:hover) and (pointer:fine){.lg-menu-item:hover:not(:disabled){background:var(--lg-highlight)}}.lg-menu-card[data-scrubbing] .lg-menu-item{background:0 0;outline:none}.lg-menu-item[data-destructive]{color:var(--lg-destructive)}.lg-menu-item:disabled{opacity:.38;cursor:default}.lg-menu-separator{border-top:.5px solid var(--lg-separator);flex:none;margin:7px 11px}@media (prefers-reduced-motion:reduce){.lg-menu-plate{transition:opacity 80ms ease-out}.lg-menu-card{animation:.1s ease-out lg-menu-fade}}@keyframes lg-menu-fade{0%{opacity:0}}";
// src/internal/cx.ts
function cx(...names) {
	return names.filter(Boolean).join(" ");
}
// src/internal/spring.ts
const moving = /* @__PURE__ */ new Set();
let frame = 0;
let last = 0;
function advance(s, dt) {
	const x = s.value - s.target;
	const v = s.velocity;
	const half = s.damping / 2;
	const discriminant = half * half - s.stiffness;
	if (Math.abs(discriminant) < 1e-4) {
		const decay = Math.exp(-half * dt);
		const b = v + half * x;
		s.value = s.target + decay * (x + b * dt);
		s.velocity = decay * (v - half * b * dt);
	} else if (discriminant > 0) {
		const root = Math.sqrt(discriminant);
		const r1 = -half + root;
		const r2 = -half - root;
		const a = (v - r2 * x) / (r1 - r2);
		const b = x - a;
		s.value = s.target + a * Math.exp(r1 * dt) + b * Math.exp(r2 * dt);
		s.velocity = a * r1 * Math.exp(r1 * dt) + b * r2 * Math.exp(r2 * dt);
	} else {
		const omega = Math.sqrt(-discriminant);
		const decay = Math.exp(-half * dt);
		const cos = Math.cos(omega * dt);
		const sin = Math.sin(omega * dt);
		s.value = s.target + decay * (x * cos + (v + half * x) / omega * sin);
		s.velocity = decay * (v * cos - (half * v + s.stiffness * x) / omega * sin);
	}
}
function tick(time) {
	frame = 0;
	const dt = Math.min(.1, Math.max(0, (time - last) / 1e3));
	last = time;
	for (const s of moving) {
		advance(s, dt);
		if (Math.abs(s.value - s.target) < 1e-4 && Math.abs(s.velocity) < .001) {
			s.value = s.target;
			s.velocity = 0;
			moving.delete(s);
		}
		s.paint(s.value);
	}
	if (moving.size) frame = requestAnimationFrame(tick);
}
function prefersReducedMotion() {
	return matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function createSpring(value, stiffness, damping, paint) {
	const s = {
		value,
		target: value,
		velocity: 0,
		stiffness,
		damping,
		paint
	};
	return {
		paint: () => paint(s.value),
		set(target, instant = false) {
			s.target = target;
			if (instant || document.hidden || prefersReducedMotion()) {
				s.value = target;
				s.velocity = 0;
				moving.delete(s);
				paint(target);
				return;
			}
			moving.add(s);
			if (!frame) {
				last = Number(document.timeline?.currentTime ?? performance.now());
				frame = requestAnimationFrame(tick);
			}
		},
		tune(nextStiffness, nextDamping) {
			s.stiffness = nextStiffness;
			s.damping = nextDamping;
		},
		stop: () => {
			moving.delete(s);
		}
	};
}
// src/internal/press.ts
const POINTER = {
	grow: 6,
	press: [417.6, 29.2],
	release: [230, 23.7]
};
const TOUCH = {
	grow: 15,
	press: [515, 27.3],
	release: [250, 11.8]
};
function usePress(ref) {
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const value = [
			1,
			1,
			0,
			0
		];
		const paint = () => {
			el.style.scale = `${value[0]} ${value[1]}`;
			el.style.translate = `${value[2]}px ${value[3]}px`;
		};
		const springs = value.map((initial, i) => createSpring(initial, ...POINTER.release, (next) => {
			value[i] = next;
			paint();
		}));
		let pointer = null;
		const target = (next, [stiffness, damping]) => {
			springs.forEach((spring, i) => {
				spring.tune(stiffness, damping);
				spring.set(next[i] ?? 0);
			});
		};
		const track = (event) => {
			if (!pointer) return;
			const { box, feel } = pointer;
			el.style.setProperty("--lg-x", `${(event.clientX - box.left) / box.width * 100}%`);
			el.style.setProperty("--lg-y", `${(event.clientY - box.top) / box.height * 100}%`);
			const { width, height } = box;
			const base = 1 + feel.grow / Math.max(width, height);
			const aspect = width / height;
			const dx = (event.clientX - pointer.x) / aspect;
			const dy = event.clientY - pointer.y;
			const length = Math.hypot(dx, dy);
			if (!length) return target([
				base,
				base,
				0,
				0
			], feel.press);
			const nx = dx / length;
			const ny = dy / length;
			const rubber = 1 - 1 / (1 + length / height / (5 * aspect));
			const stretch = 1 + 6 / height * rubber * Math.abs(Math.abs(nx) - Math.abs(ny));
			const horizontal = Math.abs(nx) > Math.abs(ny);
			target([
				base * (horizontal ? stretch : 1 / stretch),
				base * (horizontal ? 1 / stretch : stretch),
				nx * 8 * rubber,
				ny * 8 * rubber
			], feel.press);
		};
		const move = (event) => {
			if (event.pointerId === pointer?.id) track(event);
		};
		const end = (event) => {
			if (event && event.pointerId !== pointer?.id) return;
			const feel = pointer?.feel ?? POINTER;
			pointer = null;
			delete el.dataset.pressed;
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", end);
			window.removeEventListener("pointercancel", end);
			target([
				1,
				1,
				0,
				0
			], feel.release);
		};
		const down = (event) => {
			if (!event.isPrimary || event.button !== 0 || pointer || el.matches(":disabled")) return;
			pointer = {
				id: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				box: el.getBoundingClientRect(),
				feel: event.pointerType === "mouse" ? POINTER : TOUCH
			};
			el.dataset.pressed = "";
			window.addEventListener("pointermove", move);
			window.addEventListener("pointerup", end);
			window.addEventListener("pointercancel", end);
			track(event);
		};
		const reset = () => end();
		el.addEventListener("pointerdown", down);
		window.addEventListener("blur", reset);
		return () => {
			end();
			springs.forEach((spring) => spring.stop());
			el.removeEventListener("pointerdown", down);
			window.removeEventListener("blur", reset);
			el.style.removeProperty("scale");
			el.style.removeProperty("translate");
		};
	}, [ref]);
}
// src/internal/svg.ts
const SVG = "http://www.w3.org/2000/svg";
let defs;
function svg(name, attributes) {
	const element = document.createElementNS(SVG, name);
	for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
	return element;
}
/** The page's one hidden `<defs>`, where every filter lives. */
function container() {
	if (defs?.isConnected) return defs;
	const root = svg("svg", {
		width: 0,
		height: 0,
		"aria-hidden": "true"
	});
	root.style.cssText = "position:absolute;pointer-events:none";
	defs = svg("defs", {});
	root.append(defs);
	document.body.append(root);
	return defs;
}
// src/internal/lens.ts
const DARK = {
	angle: 45,
	glow: .4,
	spread: .5,
	glowPower: 1.5,
	edge: .5,
	edgeWidth: 2,
	edgePower: 1.5
};
const LIGHT = {
	angle: 30,
	glow: .4,
	spread: .5,
	glowPower: 2,
	edge: .5,
	edgeWidth: 1.5,
	edgePower: 1
};
const clamp$3 = (value, min, max) => Math.min(max, Math.max(min, value));
const erf = (x) => Math.tanh(1.7724538509 * x);
function distance(x, y, halfWidth, halfHeight, radius) {
	const qx = Math.abs(x) - halfWidth + radius;
	const qy = Math.abs(y) - halfHeight + radius;
	return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}
function arc(sag, half) {
	const radius = (half * half + sag * sag) / (2 * sag);
	let sum = 0;
	for (let i = 0; i <= 200; i++) {
		const x = i / 200 * half;
		const slope = x / Math.sqrt(radius * radius - x * x);
		sum += i === 0 || i === 200 ? slope / 2 : slope;
	}
	const mean = sum / 200;
	return {
		radius,
		scale: mean > 0 ? .5 / mean : 1
	};
}
const slope = (x, { radius, scale }) => {
	const inside = Math.min(x, .999 * radius);
	return inside / Math.sqrt(radius * radius - inside * inside) * scale;
};
/**
* Draws a lens's map, after Aave's: within a band about `depth` wide around
* the rim, each point shows content from further in, by the slope of a
* shallow dome there, and the rest is left as it is. The light is a glow
* along the light's axis and a thin lit edge. Its alpha fades out where the
* bend does, so the middle shows the content exactly: a displacement map
* can't hold "none" exactly in a byte, and WebKit, which stretches the map
* across a long box, would otherwise shift the middle by a pixel.
*/
function lensMap(shape, options, light, density) {
	const { width, height } = shape;
	const halfWidth = width / 2;
	const halfHeight = height / 2;
	const radius = clamp$3(shape.radius, 0, Math.min(halfWidth, halfHeight));
	const columns = Math.max(1, Math.round(width * density));
	const rows = Math.max(1, Math.round(height * density));
	const pullAcross = new Uint8ClampedArray(columns * rows * 4);
	const pullDown = new Uint8ClampedArray(columns * rows * 4);
	const caught = new Uint8ClampedArray(columns * rows * 4);
	const shapeMask = new Uint8ClampedArray(columns * rows * 4);
	const grey = (data, i, value, alpha = 255) => {
		data[i] = data[i + 1] = data[i + 2] = value;
		data[i + 3] = alpha;
	};
	const share = options.relative ? Math.min(width, height) : 1;
	const depth = options.depth * share;
	const dome = options.dome * share;
	const { splay } = options;
	const innerWidth = Math.max(0, halfWidth - depth);
	const innerHeight = Math.max(0, halfHeight - depth);
	const innerRadius = clamp$3(radius, 0, Math.min(innerWidth, innerHeight));
	const ramp = depth > 0 ? 1 / (depth * Math.SQRT2) : 1e6;
	const sag = Math.max(.01, Math.min(dome, Math.min(halfWidth, halfHeight) - 1));
	const across = dome > 0 ? arc(sag, halfWidth) : null;
	const down = dome > 0 ? arc(sag, halfHeight) : null;
	const reach = .5 * Math.min(halfWidth, halfHeight);
	const cos = Math.cos(light.angle * Math.PI / 180);
	const sin = Math.sin(light.angle * Math.PI / 180);
	const glowStart = (1 - light.spread) * Math.SQRT2;
	const glowRange = light.spread * Math.SQRT2;
	for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
		const i = (row * columns + column) * 4;
		const x = (column + .5) / columns * width - halfWidth;
		const y = (row + .5) / rows * height - halfHeight;
		const edge = distance(x, y, halfWidth, halfHeight, radius);
		const inside = Math.round(255 * clamp$3(-edge, 0, 1));
		grey(shapeMask, i, 0, inside);
		if (edge >= 0) {
			grey(pullAcross, i, 128);
			grey(pullDown, i, 128);
			grey(caught, i, 128, 0);
			continue;
		}
		const ax = Math.abs(x);
		const ay = Math.abs(y);
		let dx = across ? Math.sign(x) * slope(ax, across) : clamp$3(x / halfWidth, -1, 1);
		let dy = down ? Math.sign(y) * slope(ay, down) : clamp$3(y / halfHeight, -1, 1);
		if (splay < 1 && reach > 0) {
			const keepX = Math.max(0, 1 - (halfHeight - ay) / reach) * (1 - splay);
			const keepY = Math.max(0, 1 - (halfWidth - ax) / reach) * (1 - splay);
			if (keepX > .001 || keepY > .001) {
				const before = Math.hypot(dx, dy);
				dx *= 1 - keepX;
				dy *= 1 - keepY;
				const after = Math.hypot(dx, dy);
				if (after > .001) {
					dx *= before / after;
					dy *= before / after;
				}
			}
		}
		const falloff = .5 * (1 + erf(distance(x, y, innerWidth, innerHeight, innerRadius) * ramp));
		grey(shapeMask, i, Math.round(255 * falloff), inside);
		grey(pullAcross, i, Math.round((.5 - .5 * dx * falloff) * 255));
		grey(pullDown, i, Math.round((.5 - .5 * dy * falloff) * 255));
		const facing = Math.abs(clamp$3(x / halfWidth, -1, 1) * cos + clamp$3(y / halfHeight, -1, 1) * sin);
		const glow = glowRange > .001 ? light.glow * clamp$3((facing - glowStart) / glowRange, 0, 1) ** light.glowPower * falloff : 0;
		const rim = light.edge * Math.max(0, 1 + edge / light.edgeWidth) * facing ** light.edgePower;
		const amount = Math.min(1, glow + rim);
		const bends = Math.min(1, falloff * 20, -edge);
		grey(caught, i, Math.round(127 * amount + 128), Math.round(255 * bends));
	}
	return {
		columns,
		rows,
		across: pullAcross,
		down: pullDown,
		light: caught,
		shape: shapeMask
	};
}
const encoded = /* @__PURE__ */ new Map();
function encode(key, draw) {
	const cached = encoded.get(key);
	if (cached) return cached;
	const map = draw();
	const canvas = document.createElement("canvas");
	canvas.width = map.columns;
	canvas.height = map.rows;
	const context = canvas.getContext("2d");
	if (!context) return null;
	const image = context.createImageData(map.columns, map.rows);
	const png = (data) => {
		image.data.set(data);
		context.putImageData(image, 0, 0);
		return canvas.toDataURL();
	};
	const result = {
		across: png(map.across),
		down: png(map.down),
		light: png(map.light),
		shape: png(map.shape)
	};
	encoded.set(key, result);
	return result;
}
/** WebKit needs filters in bounding-box units. */
const boxUnits = () => /AppleWebKit\//.test(navigator.userAgent) && !/Chrom(?:e|ium)\//.test(navigator.userAgent);
const CHANNELS = [
	"1 0 0 0 0  0 0 0 0 0  0 0 0 0 0",
	"0 0 0 0 0  0 1 0 0 0  0 0 0 0 0",
	"0 0 0 0 0  0 0 0 0 0  0 0 1 0 0"
];
const matrix = (input, values, result) => svg("feColorMatrix", {
	in: input,
	type: "matrix",
	values,
	result
});
const sum = (a, b, k2, k3, result) => svg("feComposite", {
	in: a,
	in2: b,
	operator: "arithmetic",
	k2,
	k3,
	result
});
function spread(k) {
	return [
		...CHANNELS.map((channel, i) => matrix(`ray-${k}-${i}`, `${channel}  0 0 0 0.3333 0`, `light-${k}-${i}`)),
		sum(`light-${k}-0`, `light-${k}-1`, 1, 1, `light-${k}-01`),
		sum(`light-${k}-01`, `light-${k}-2`, 1, 1, `spread-${k}`),
		matrix(`spread-${k}`, "3 0 0 0 0  0 3 0 0 0  0 0 3 0 0  0 0 0 1 0", `bent-${k}`)
	];
}
function inked(k, page) {
	const white = page === "light" ? 1 : 0;
	const steps = [];
	const own = (i) => [
		0,
		1,
		2
	].map((r) => r === i ? `${[
		0,
		1,
		2
	].map((c) => c === i ? white ? -1 : 1 : 0).join(" ")} 0 ${white}` : "0 0 0 0 0").join("  ") + "  0 0 0 1 0";
	CHANNELS.forEach((_, i) => {
		const ray = `ray-${k}-${i}`;
		steps.push(matrix(ray, "0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 0 1", `cover-${k}-${i}`), matrix(ray, "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", `covers-${k}-${i}`), matrix(ray, own(i), `inks-${k}-${i}`));
	});
	steps.push(svg("feBlend", {
		in: `cover-${k}-0`,
		in2: `cover-${k}-1`,
		mode: "lighten",
		result: `most-${k}-01`
	}), svg("feBlend", {
		in: `most-${k}-01`,
		in2: `cover-${k}-2`,
		mode: "lighten",
		result: `most-${k}`
	}), matrix(`most-${k}`, `0 0 0 0 ${white}  0 0 0 0 ${white}  0 0 0 0 ${white}  1 0 0 0 0`, `inked-${k}`));
	let at = `inked-${k}`;
	CHANNELS.forEach((_, i) => {
		const [gain, loss] = white ? [`covers-${k}-${i}`, `inks-${k}-${i}`] : [`inks-${k}-${i}`, `covers-${k}-${i}`];
		steps.push(sum(at, gain, i === 0 ? .5 : 1, .5, `inked-${k}-${i}a`), sum(`inked-${k}-${i}a`, loss, 1, -.5, `inked-${k}-${i}b`));
		at = `inked-${k}-${i}b`;
	});
	const double = svg("feComponentTransfer", {
		in: at,
		result: `bent-${k}`
	});
	double.append(svg("feFuncA", {
		type: "linear",
		slope: 2,
		intercept: 0
	}));
	steps.push(double);
	return steps;
}
function graph(lenses, box, standIn) {
	const unit = box ? "objectBoundingBox" : "userSpaceOnUse";
	const filter = svg("filter", {
		filterUnits: unit,
		primitiveUnits: unit,
		"color-interpolation-filters": "sRGB"
	});
	if (box) for (const [key, value] of Object.entries({
		x: 0,
		y: 0,
		width: 1,
		height: 1
	})) filter.setAttribute(key, String(value));
	const single = lenses.length === 1;
	const parts = lenses.map(({ maps, shine, blur, ink }, k) => {
		const merged = (name) => single ? name : `${name}-${k}`;
		const image = (href, result) => svg("feImage", {
			href,
			preserveAspectRatio: "none",
			result
		});
		const boxed = [
			image(maps.across, `across-${k}`),
			image(maps.down, `down-${k}`),
			image(maps.light, merged("raw")),
			svg("feFlood", {
				"flood-color": "rgb(128, 128, 128)",
				result: `neutral-${k}`
			})
		];
		if (standIn) boxed.push(image(maps.shape, merged("shape")));
		filter.append(...boxed);
		for (const pull of ["across", "down"]) {
			const half = svg("feComponentTransfer", {
				in: `${pull}-grey-${k}`,
				result: `${pull}-pull-${k}`
			});
			half.append(svg("feFuncA", {
				type: "linear",
				slope: 0,
				intercept: .5
			}));
			filter.append(svg("feComposite", {
				in: `${pull}-${k}`,
				in2: `neutral-${k}`,
				operator: "over",
				result: `${pull}-grey-${k}`
			}), half);
		}
		const rays = CHANNELS.map((_, i) => {
			const across = svg("feDisplacementMap", {
				in: "SourceGraphic",
				in2: `across-pull-${k}`,
				xChannelSelector: "R",
				yChannelSelector: "A",
				result: `across-${k}-${i}`
			});
			const down = svg("feDisplacementMap", {
				in: `across-${k}-${i}`,
				in2: `down-pull-${k}`,
				xChannelSelector: "A",
				yChannelSelector: "R",
				result: `ray-${k}-${i}`
			});
			boxed.push(across);
			filter.append(across, down);
			return [across, down];
		});
		filter.append(...ink ? inked(k, ink) : spread(k));
		let soften;
		if (blur) {
			soften = svg("feGaussianBlur", {
				in: `bent-${k}`,
				result: `soft-${k}`
			});
			const weight = image(maps.shape, `weight-${k}`);
			boxed.push(weight);
			filter.append(weight, svg("feColorMatrix", {
				in: `weight-${k}`,
				type: "matrix",
				values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0",
				result: `bends-${k}`
			}), soften, svg("feComposite", {
				in: `soft-${k}`,
				in2: `bends-${k}`,
				operator: "in",
				result: `soft-in-${k}`
			}), svg("feComposite", {
				in: `bent-${k}`,
				in2: `bends-${k}`,
				operator: "out",
				result: `sharp-${k}`
			}), svg("feComposite", {
				in: `soft-in-${k}`,
				in2: `sharp-${k}`,
				operator: "arithmetic",
				k2: 1,
				k3: 1,
				result: `softened-${k}`
			}));
		}
		const bent = blur ? `softened-${k}` : `bent-${k}`;
		let lit = bent;
		if (shine > 0) {
			const white = `0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1 0 ${-128 / 255}`;
			filter.append(svg("feColorMatrix", {
				in: merged("raw"),
				type: "matrix",
				values: white,
				result: `glint-${k}`
			}), svg("feComposite", {
				in: `glint-${k}`,
				in2: bent,
				operator: "arithmetic",
				k2: shine,
				k3: 1,
				result: `lit-${k}`
			}));
			lit = `lit-${k}`;
		} else if (shine < 0) {
			const row = `0 0 ${shine} 0 ${1 - 128 * shine / 255}`;
			filter.append(svg("feColorMatrix", {
				in: merged("raw"),
				type: "matrix",
				values: `${row}  ${row}  ${row}  0 0 0 0 1`,
				result: `shade-${k}`
			}), svg("feComposite", {
				in: `shade-${k}`,
				in2: bent,
				operator: "arithmetic",
				k1: 1,
				result: `lit-${k}`
			}));
			lit = `lit-${k}`;
		}
		filter.append(svg("feComposite", {
			in: lit,
			in2: merged("raw"),
			operator: "in",
			result: merged("inside")
		}));
		return {
			boxed,
			rays,
			soften
		};
	});
	if (!single) for (const name of [
		"raw",
		"inside",
		...standIn ? ["shape"] : []
	]) {
		const merge = svg("feMerge", { result: name });
		lenses.forEach((_, k) => merge.append(svg("feMergeNode", { in: `${name}-${k}` })));
		filter.append(merge);
	}
	filter.append(svg("feComposite", {
		in: "SourceGraphic",
		in2: "raw",
		operator: "out",
		result: "outside"
	}), svg("feComposite", {
		in: "inside",
		in2: "outside",
		operator: "arithmetic",
		k2: 1,
		k3: 1,
		result: "seen"
	}));
	if (standIn) filter.append(svg("feComposite", {
		in: "seen",
		in2: "shape",
		operator: "in"
	}));
	return {
		filter,
		parts
	};
}
function place(graph, placed, across, down, box) {
	if (!box) for (const [key, value] of Object.entries({
		x: 0,
		y: 0,
		width: across,
		height: down
	})) graph.filter.setAttribute(key, String(value));
	placed.forEach((lens, k) => {
		const part = graph.parts[k];
		const spectrum = [
			1 + .2 * lens.dispersion,
			1 + .1 * lens.dispersion,
			1
		];
		part.rays.forEach(([pullAcross, pullDown], i) => {
			pullAcross.setAttribute("scale", String((box ? lens.reach / across : lens.reach) * spectrum[i]));
			pullDown.setAttribute("scale", String((box ? lens.reach / down : lens.reach) * spectrum[i]));
		});
		const blur = Math.max(lens.blur, .01);
		part.soften?.setAttribute("stdDeviation", box ? `${blur / across} ${blur / down}` : String(blur));
		const rect = box ? {
			x: lens.x / across,
			y: lens.y / down,
			width: lens.width / across,
			height: lens.height / down
		} : {
			x: lens.x,
			y: lens.y,
			width: lens.width,
			height: lens.height
		};
		for (const element of part.boxed) for (const [key, value] of Object.entries(rect)) element.setAttribute(key, String(value));
	});
}
/** The glass's size and corner radius, in px, or null while it has no size. */
function shapeOf(glass, style = getComputedStyle(glass)) {
	const width = glass.offsetWidth;
	const height = glass.offsetHeight;
	if (!width || !height) return null;
	const corner = style.borderTopLeftRadius;
	return {
		width,
		height,
		radius: Math.min(width / 2, height / 2, corner.endsWith("%") ? Math.min(width, height) * parseFloat(corner) / 100 : parseFloat(corner) || 0)
	};
}
function fit(glass, options) {
	const style = getComputedStyle(glass);
	const shape = shapeOf(glass, style);
	if (!shape) return null;
	const { width, height, radius } = shape;
	const page = parseFloat(style.getPropertyValue("--lg-lens-shine")) || 0;
	const shine = options.paintsLight ? 0 : options.shine === void 0 ? page : Math.sign(page) * options.shine;
	const tuned = options.strengthProperty ? parseFloat(style.getPropertyValue(options.strengthProperty)) : NaN;
	const own = page > 0 ? options.darkStrength ?? options.strength : options.strength;
	const strength = Number.isFinite(tuned) ? tuned : own;
	const split = options.dispersionProperty ? parseFloat(style.getPropertyValue(options.dispersionProperty)) : NaN;
	const dispersion = Number.isFinite(split) ? Math.max(0, split) : options.dispersion;
	const density = Math.min(devicePixelRatio || 1, 0.75);
	const theme = page < 0 && !options.paintsLight ? LIGHT : DARK;
	const light = options.edgeWidth === void 0 ? theme : {
		...theme,
		edgeWidth: options.edgeWidth
	};
	const key = [
		width,
		height,
		radius,
		density,
		JSON.stringify(light),
		JSON.stringify(options)
	].join("|");
	const maps = encode(key, () => lensMap(shape, options, light, density));
	const blur = options.blur ?? 0;
	const ink = options.ink ? page < 0 ? "light" : "dark" : void 0;
	return maps ? {
		maps,
		key: `${key}|${shine}|${ink}`,
		shine,
		ink,
		blur,
		strength,
		dispersion,
		width,
		height
	} : null;
}
const surfaces = /* @__PURE__ */ new Map();
let made = 0;
function render(surface) {
	const { content } = surface;
	const across = content.offsetWidth;
	const down = content.offsetHeight;
	const from = content.getBoundingClientRect();
	const shown = [];
	if (across && down) {
		const unit = from.width / across || 1;
		for (const member of surface.members) {
			const at = member.glass.getBoundingClientRect();
			if (!member.fit || !at.width || !at.height) continue;
			const width = at.width / unit;
			const height = at.height / unit;
			const reach = member.fit.strength * Math.min(width, height) * member.amount;
			const { dispersion } = member.fit;
			const blur = member.fit.blur * member.amount;
			member.placed = {
				x: (at.left - from.left) / unit,
				y: (at.top - from.top) / unit,
				width,
				height,
				reach,
				dispersion,
				blur
			};
			shown.push(member);
		}
	}
	if (!shown.length) {
		surface.placed = "";
		content.style.removeProperty("filter");
		if (surface.standIn) content.style.removeProperty("visibility");
		surface.standIn = false;
		return;
	}
	const box = boxUnits();
	const standIn = shown.some((member) => member.replaces);
	surface.standIn = standIn;
	const structure = shown.map((member) => member.fit.key).join("\n") + (standIn ? "\nstand-in" : "");
	if (structure !== surface.built || !surface.graph) {
		surface.graph?.filter.remove();
		surface.graph = graph(shown.map((member) => member.fit), box, standIn);
		container().append(surface.graph.filter);
		surface.built = structure;
		surface.placed = "";
	}
	const placed = shown.map((member) => member.placed);
	const next = [
		across,
		down,
		...placed.flatMap(({ x, y, width, height, reach, dispersion, blur }) => [
			x,
			y,
			width,
			height,
			reach,
			dispersion,
			blur
		])
	].map((value) => value.toFixed(2)).join(" ");
	if (next === surface.placed) return;
	surface.placed = next;
	place(surface.graph, placed, across, down, box);
	surface.graph.filter.id = `${surface.name}-${++surface.version}`;
	content.style.filter = `url("#${surface.graph.filter.id}")`;
	for (const member of shown) {
		if (!member.replaces) continue;
		content.style.visibility = "visible";
		const { x, y, width, height } = member.placed;
		const behind = member.replaces.getBoundingClientRect();
		const unit = from.width / across || 1;
		mask(member.replaces, {
			image: `url("${member.fit.maps.shape}"), linear-gradient(#000, #000)`,
			position: `${x + (from.left - behind.left) / unit}px ${y + (from.top - behind.top) / unit}px, 0 0`,
			size: `${width}px ${height}px, 100% 100%`
		});
	}
}
const MASKING = [
	"image",
	"position",
	"size",
	"repeat",
	"composite"
];
function mask(element, layers) {
	for (const part of MASKING) {
		element.style.removeProperty(`-webkit-mask-${part}`);
		element.style.removeProperty(`mask-${part}`);
	}
	if (!layers) return;
	const values = {
		...layers,
		repeat: "no-repeat",
		composite: "exclude"
	};
	for (const part of MASKING) {
		element.style.setProperty(`-webkit-mask-${part}`, part === "composite" ? "xor" : values[part]);
		element.style.setProperty(`mask-${part}`, values[part]);
	}
}
/**
* Makes `glass` a lens over `content`, which must have room for the whole
* lens. Given `replaces`, the content is a stand-in for it under the glass:
* the content is shown only within the lens (keep it hidden otherwise), and
* `replaces` is hidden there. Unless the glass paints its own light, the
* glass's `--lg-lens-shine` sets the light on its rim: above 0 it brightens,
* below 0 it darkens, as on a light page. Both it and the strength property
* are read each time the lens becomes active or is refitted.
*/
function createLens(glass, content, options, replaces) {
	let surface = surfaces.get(content);
	if (!surface) {
		surface = {
			content,
			lenses: 0,
			members: [],
			name: `glisse-lens-${made++}`,
			standIn: false,
			built: "",
			placed: "",
			version: 0
		};
		surfaces.set(content, surface);
	}
	const shared = surface;
	shared.lenses++;
	const member = {
		glass,
		options,
		replaces,
		amount: 1
	};
	let active = false;
	const prepare = () => {
		member.fit = fit(glass, options) ?? void 0;
	};
	const lens = {
		setActive(next) {
			if (next === active) return;
			active = next;
			if (active) {
				shared.members.push(member);
				prepare();
			} else {
				shared.members.splice(shared.members.indexOf(member), 1);
				if (replaces) mask(replaces);
			}
			render(shared);
		},
		update(amount) {
			if (amount !== void 0) member.amount = clamp$3(amount, 0, 1);
			if (active) render(shared);
		},
		refit() {
			if (!active) return;
			prepare();
			render(shared);
		},
		destroy() {
			lens.setActive(false);
			if (--shared.lenses > 0) return;
			shared.graph?.filter.remove();
			surfaces.delete(content);
		}
	};
	return lens;
}
/**
* Bends the glass's backdrop with the same lens, unlit, as the glass bends
* content of its own: a filter of its own, set as `--lg-filter` for its
* `backdrop-filter`, rescaled as its bend grows. Its maps are those of the
* glass's other lenses with the same options, so cost nothing more.
*/
function createBackdropLens(glass, options) {
	const name = `glisse-bend-${made++}`;
	let fitted = null;
	let built = null;
	let key = "";
	let amount = 0;
	let version = 0;
	const draw = () => {
		if (!fitted || !built) return;
		const { width, height, strength, dispersion, blur } = fitted;
		const reach = strength * Math.min(width, height) * amount;
		place(built, [{
			x: 0,
			y: 0,
			width,
			height,
			reach,
			dispersion,
			blur: blur * amount
		}], width, height, false);
		built.filter.id = `${name}-${++version}`;
		glass.style.setProperty("--lg-filter", `url("#${built.filter.id}")`);
	};
	return {
		update(next) {
			next = Math.round(clamp$3(next, 0, 1) * 20) / 20;
			if (next === amount) return;
			amount = next;
			draw();
		},
		refit() {
			fitted = fit(glass, options);
			if (!fitted) return;
			if (fitted.key !== key) {
				built?.filter.remove();
				built = graph([{
					maps: fitted.maps,
					shine: 0,
					blur: fitted.blur
				}], false, false);
				container().append(built.filter);
				key = fitted.key;
			}
			draw();
		},
		destroy() {
			built?.filter.remove();
			built = null;
			glass.style.removeProperty("--lg-filter");
		}
	};
}
const backdrops = /* @__PURE__ */ new Map();
/**
* Fits glass that bends its own backdrop, as only Chromium can: a lens's
* filter drawn for the glass's box, set as `--lg-filter` for its
* `backdrop-filter`.
*/
function fitBackdropLens(glass, options) {
	const fitted = fit(glass, options);
	if (!fitted) return;
	const { maps, key, shine, strength, dispersion, width, height } = fitted;
	const reach = strength * Math.min(width, height);
	const id = `${key}|${reach}|${dispersion}`;
	let name = backdrops.get(id);
	if (!name) {
		const built = graph([{
			maps,
			shine
		}], false, false);
		place(built, [{
			x: 0,
			y: 0,
			width,
			height,
			reach,
			dispersion,
			blur: 0
		}], width, height, false);
		name = `glisse-backdrop-${backdrops.size}`;
		built.filter.id = name;
		container().append(built.filter);
		backdrops.set(id, name);
	}
	glass.style.setProperty("--lg-filter", `url("#${name}") saturate(1.5)`);
}
// src/internal/refraction.ts
const GLASS = {
	strength: .45,
	strengthProperty: "--lg-glass-bend",
	dispersion: .4,
	dispersionProperty: "--lg-glass-dispersion",
	depth: .25,
	dome: .5,
	splay: 1,
	relative: true,
	paintsLight: true
};
const clamp$2 = (value, min, max) => Math.min(max, Math.max(min, value));
const RIM_WIDTH = 1.22;
const EDGE_WIDTH = .5;
/** The rim's light, white, over its edge line, at `density` pixels to the px. */
function rimMap({ width, height, radius }, shine, density, edge = [
	0,
	0,
	0,
	0
]) {
	const columns = Math.max(1, Math.round(width * density));
	const rows = Math.max(1, Math.round(height * density));
	const data = new Uint8ClampedArray(columns * rows * 4);
	const halfWidth = width / 2;
	const halfHeight = height / 2;
	const corner = clamp$2(radius, 0, Math.min(halfWidth, halfHeight));
	const half = .5 / density;
	for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
		const x = (column + .5) / columns * width - halfWidth;
		const y = (row + .5) / rows * height - halfHeight;
		const depth = -distance(x, y, halfWidth, halfHeight, corner);
		if (depth < -half || depth > 2 * RIM_WIDTH) continue;
		const qx = Math.abs(x) - halfWidth + corner;
		const qy = Math.abs(y) - halfHeight + corner;
		let nx = 0;
		let ny = 0;
		if (qx > 0 && qy > 0) {
			const length = Math.hypot(qx, qy);
			nx = Math.sign(x) * qx / length;
			ny = Math.sign(y) * qy / length;
		} else if (qx > qy) nx = Math.sign(x);
		else ny = Math.sign(y);
		const facing = Math.abs(nx + ny);
		const along = Math.max(0, depth) / (RIM_WIDTH * Math.sqrt(Math.max(1, facing)));
		const cover = clamp$2((depth + half) * density, 0, 1);
		const lined = clamp$2((Math.min(EDGE_WIDTH, depth + half) - Math.max(0, depth - half)) * density, 0, 1);
		const light = along < 1 ? shine * Math.min(1, facing) ** 1.5 * (1 - along ** 1.5) * cover : 0;
		const line = edge[3] * lined * (1 - light);
		const alpha = light + line;
		if (alpha <= 0) continue;
		const i = (row * columns + column) * 4;
		for (let channel = 0; channel < 3; channel++) data[i + channel] = Math.round((255 * light + edge[channel] * line) / alpha);
		data[i + 3] = Math.round(255 * alpha);
	}
	return {
		columns,
		rows,
		data
	};
}
function parseColour(context, colour) {
	context.fillStyle = "#0000";
	context.fillStyle = colour;
	const value = String(context.fillStyle);
	if (value.startsWith("#")) {
		const [r, g, b] = [
			1,
			3,
			5
		].map((at) => parseInt(value.slice(at, at + 2), 16));
		return [
			r,
			g,
			b,
			1
		];
	}
	const [r = 0, g = 0, b = 0, a = 1] = (value.match(/[\d.]+/g) ?? []).map(Number);
	return [
		r,
		g,
		b,
		a
	];
}
const rims = /* @__PURE__ */ new Map();
let palette;
function paintRim(element) {
	const style = getComputedStyle(element);
	const shape = shapeOf(element, style);
	palette ??= document.createElement("canvas").getContext("2d");
	if (!shape || !palette) return;
	const tuned = parseFloat(style.getPropertyValue("--lg-rim-shine"));
	const shine = Number.isFinite(tuned) ? clamp$2(tuned, 0, 1) : .13;
	const edge = parseColour(palette, style.getPropertyValue("--lg-edge").trim() || "transparent");
	const density = Math.min(devicePixelRatio || 1, 0.75);
	const key = [
		shape.width,
		shape.height,
		shape.radius,
		shine,
		edge,
		density
	].join("|");
	let url = rims.get(key);
	if (!url) {
		const { columns, rows, data } = rimMap(shape, shine, density, edge);
		const canvas = document.createElement("canvas");
		canvas.width = columns;
		canvas.height = rows;
		const context = canvas.getContext("2d");
		if (!context) return;
		const image = context.createImageData(columns, rows);
		image.data.set(data);
		context.putImageData(image, 0, 0);
		url = `url("${canvas.toDataURL()}")`;
		rims.set(key, url);
	}
	element.style.setProperty("--lg-rim", url);
	element.setAttribute("data-rim", "");
}
const repaints = /* @__PURE__ */ new Set();
let unwatch;
function onThemeChange(repaint) {
	repaints.add(repaint);
	if (!unwatch) {
		const run = () => repaints.forEach((each) => each());
		const observer = new MutationObserver(run);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme"],
			subtree: true
		});
		const scheme = matchMedia("(prefers-color-scheme: dark)");
		scheme.addEventListener?.("change", run);
		unwatch = () => {
			observer.disconnect();
			scheme.removeEventListener?.("change", run);
		};
	}
	return () => {
		repaints.delete(repaint);
		if (repaints.size) return;
		unwatch?.();
		unwatch = void 0;
	};
}
function whenIdle(callback) {
	if ("requestIdleCallback" in window) {
		const handle = requestIdleCallback(callback, { timeout: 500 });
		return () => cancelIdleCallback(handle);
	}
	const handle = setTimeout(callback, 50);
	return () => clearTimeout(handle);
}
function refitting(element, fit, properties) {
	let cancel;
	let fitted = false;
	const observer = new ResizeObserver(() => {
		cancel?.();
		cancel = whenIdle(() => {
			fitted = true;
			fit();
		});
	});
	observer.observe(element);
	return {
		refit: () => {
			if (fitted) fit();
		},
		stop: () => {
			cancel?.();
			observer.disconnect();
			for (const name of properties) element.style.removeProperty(name);
		}
	};
}
/** Only Chromium applies SVG filters to the live backdrop. */
const refractsBackdrop = () => /Chrom(?:e|ium)\//.test(navigator.userAgent);
const MARK = "data-glisse-backdrop";
function visibleBox(element) {
	let { left, top, right, bottom } = element.getBoundingClientRect();
	for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
		const style = getComputedStyle(node);
		if (!/hidden|clip|auto|scroll/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) continue;
		const clip = node.getBoundingClientRect();
		left = Math.max(left, clip.left);
		top = Math.max(top, clip.top);
		right = Math.min(right, clip.right);
		bottom = Math.min(bottom, clip.bottom);
	}
	return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}
/** The marked content behind the glass: the closest one whose visible part it overlaps. */
function findBackdrop(element) {
	const box = element.getBoundingClientRect();
	const behind = (candidate) => {
		if (candidate.contains(element) || element.contains(candidate)) return false;
		const other = visibleBox(candidate);
		return other.left < box.right && other.right > box.left && other.top < box.bottom && other.bottom > box.top;
	};
	for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
		const found = [...node.querySelectorAll(`[${MARK}]`)].find(behind);
		if (found) return found;
	}
	return null;
}
const followed = /* @__PURE__ */ new Map();
let following = 0;
function follow() {
	for (const lenses of followed.values()) lenses.values().next().value?.update();
	following = followed.size ? requestAnimationFrame(follow) : 0;
}
function bend(element, source) {
	const lens = createLens(element, source, GLASS);
	let started = false;
	const fitting = refitting(element, () => {
		paintRim(element);
		if (started) return lens.refit();
		started = true;
		lens.setActive(true);
		let lenses = followed.get(source);
		if (!lenses) followed.set(source, lenses = /* @__PURE__ */ new Set());
		lenses.add(lens);
		following ||= requestAnimationFrame(follow);
	}, ["--lg-rim"]);
	return {
		refit: fitting.refit,
		stop: () => {
			fitting.stop();
			const lenses = followed.get(source);
			lenses?.delete(lens);
			if (lenses && !lenses.size) followed.delete(source);
			lens.destroy();
		}
	};
}
/**
* Bends what's behind the element. Content marked `data-glisse-backdrop`
* behind it is filtered, in every browser, with the glass's lens placed
* where the glass stands. Over anything else, Chromium filters the live
* backdrop with the same lens, and other browsers keep the frost and the lit
* rim. `selection` is the tab bar's lifted lens, whose own bend is below;
* with `bendsBackdrop` false it only takes its rims, and bends its backdrop
* itself.
*
* The glass reads its settings (--lg-glass-bend, --lg-glass-dispersion,
* --lg-rim-shine) when it fits, and again each time it renders, so settings
* set from React, on it or above it, take effect at once.
*/
function useRefraction(ref, selection = false, bendsBackdrop = true) {
	const refit = useRef(null);
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		if (selection) return refitting(element, () => fitSelection(element, bendsBackdrop && refractsBackdrop()), bendsBackdrop ? SELECTION_PROPERTIES : SELECTION_PROPERTIES.filter((name) => name !== "--lg-filter")).stop;
		const source = findBackdrop(element);
		const fitting = source ? bend(element, source) : refitting(element, () => {
			paintRim(element);
			if (refractsBackdrop()) fitBackdropLens(element, GLASS);
		}, ["--lg-filter", "--lg-rim"]);
		refit.current = fitting.refit;
		const stopWatching = onThemeChange(() => paintRim(element));
		return () => {
			refit.current = null;
			stopWatching();
			fitting.stop();
			element.removeAttribute("data-rim");
		};
	}, [
		ref,
		selection,
		bendsBackdrop
	]);
	useEffect(() => refit.current?.());
}
function useGlisseRefraction(ref) {
	useRefraction(ref);
}
const SELECTION_PROPERTIES = [
	"--lg-filter",
	"--lg-rim",
	"--lg-rim-bright"
];
const selections = /* @__PURE__ */ new Map();
function profile(bezel, thickness) {
	const samples = /* @__PURE__ */ new Float32Array(128);
	let maximum = 0;
	for (let i = 0; i < samples.length; i++) {
		const t = Math.max(.001, i / (samples.length - 1));
		const surface = (1 - (1 - t) ** 4) ** .25;
		const incident = Math.atan((1 - t) ** 3 / surface ** 3);
		const refracted = Math.asin(Math.sin(incident) / 1.5);
		samples[i] = Math.tan(incident - refracted) * (thickness + surface * bezel);
		maximum = Math.max(maximum, samples[i]);
	}
	return {
		samples,
		maximum
	};
}
function selectionMaps(width, height, radius) {
	const density = Math.min(devicePixelRatio || 1, 2);
	const bezel = clamp$2(Math.min(width, height) * .12, 4, 10);
	const { samples, maximum } = profile(bezel, clamp$2(Math.min(width, height) * .2, 8, 24));
	const canvas = document.createElement("canvas");
	canvas.width = Math.ceil(width * density);
	canvas.height = Math.ceil(height * density);
	const context = canvas.getContext("2d");
	const field = context.createImageData(canvas.width, canvas.height);
	const shine = context.createImageData(canvas.width, canvas.height);
	const bright = context.createImageData(canvas.width, canvas.height);
	for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
		const px = (x + .5) * width / canvas.width - width / 2;
		const py = (y + .5) * height / canvas.height - height / 2;
		const qx = Math.abs(px) - (width / 2 - radius);
		const qy = Math.abs(py) - (height / 2 - radius);
		const ox = Math.max(qx, 0);
		const oy = Math.max(qy, 0);
		const length = Math.hypot(ox, oy);
		const distance = radius - (length + Math.min(Math.max(qx, qy), 0));
		const nx = length > 0 ? ox / length * Math.sign(px) : qx > qy ? Math.sign(px) : 0;
		const ny = length > 0 ? oy / length * Math.sign(py) : qx > qy ? 0 : Math.sign(py);
		let shift = 0;
		if (distance >= 0 && distance < bezel) {
			const sample = distance / bezel * (samples.length - 1);
			const lower = Math.floor(sample);
			const a = samples[lower];
			shift = a + (samples[Math.min(lower + 1, samples.length - 1)] - a) * (sample - lower);
		}
		const i = (y * canvas.width + x) * 4;
		field.data[i] = Math.round(127.5 + nx * shift / maximum * 127.5);
		field.data[i + 1] = Math.round(127.5 + ny * shift / maximum * 127.5);
		field.data[i + 2] = 128;
		field.data[i + 3] = 255;
		const light = -(nx + ny) * Math.SQRT1_2;
		const glint = Math.max(light, 0) ** 3;
		const reflected = Math.max(-light, 0) ** 3;
		shine.data[i] = shine.data[i + 1] = shine.data[i + 2] = 255;
		let alpha = 0;
		if (distance >= 0) {
			const bands = [
				.18,
				.42,
				.66
			].map((centre) => Math.exp(-(((distance - centre) / .22) ** 2)));
			const peak = Math.max(...bands);
			alpha = peak * (.06 + .8 * glint + .35 * reflected) * .85;
			for (let channel = 0; channel < 3; channel++) shine.data[i + channel] = Math.round(255 * (.65 + .35 * (peak ? bands[channel] / peak : 0)));
			const wide = [
				.4,
				.5,
				.6
			].map((centre) => Math.exp(-(((distance - centre) / .4) ** 2)));
			const top = Math.max(...wide);
			for (let channel = 0; channel < 3; channel++) bright.data[i + channel] = Math.round(255 * (.85 + .15 * (top ? wide[channel] / top : 0)));
			bright.data[i + 3] = Math.round(clamp$2(top * (.55 + .3 * glint + .15 * reflected), 0, 1) * 255);
		}
		shine.data[i + 3] = Math.round(clamp$2(alpha, 0, 1) * 255);
	}
	context.putImageData(field, 0, 0);
	const displacement = canvas.toDataURL();
	context.putImageData(shine, 0, 0);
	const highlight = canvas.toDataURL();
	context.putImageData(bright, 0, 0);
	return {
		displacement,
		highlight,
		brightHighlight: canvas.toDataURL(),
		scale: maximum * 2
	};
}
function selectionLens(width, height, radius) {
	const key = [
		width,
		height,
		radius
	].join("-");
	const cached = selections.get(key);
	if (cached) return cached;
	const { displacement, highlight, brightHighlight, scale } = selectionMaps(width, height, radius);
	const id = `glisse-selection-${selections.size}`;
	const box = {
		x: 0,
		y: 0,
		width,
		height
	};
	const filter = svg("filter", {
		id,
		...box,
		filterUnits: "userSpaceOnUse",
		primitiveUnits: "userSpaceOnUse",
		"color-interpolation-filters": "sRGB"
	});
	filter.append(svg("feImage", {
		href: displacement,
		...box,
		preserveAspectRatio: "none",
		result: "field"
	}));
	for (const [name, factor, values] of [
		[
			"r",
			1.035,
			"1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"
		],
		[
			"g",
			1,
			"0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0"
		],
		[
			"b",
			.965,
			"0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0"
		]
	]) filter.append(svg("feDisplacementMap", {
		in: "SourceGraphic",
		in2: "field",
		scale: scale * factor,
		xChannelSelector: "R",
		yChannelSelector: "G",
		result: `${name}-ray`
	}), svg("feColorMatrix", {
		in: `${name}-ray`,
		type: "matrix",
		values,
		result: name
	}));
	filter.append(svg("feComposite", {
		in: "r",
		in2: "g",
		operator: "arithmetic",
		k2: 1,
		k3: 1,
		result: "rg"
	}), svg("feComposite", {
		in: "rg",
		in2: "b",
		operator: "arithmetic",
		k2: 1,
		k3: 1
	}));
	container().append(filter);
	const result = {
		filter: `url("#${id}")`,
		rim: `url("${highlight}")`,
		brightRim: `url("${brightHighlight}")`
	};
	selections.set(key, result);
	return result;
}
function fitSelection(element, filtered) {
	const width = element.offsetWidth;
	const height = element.offsetHeight;
	if (!width || !height) return;
	const corner = getComputedStyle(element).borderTopLeftRadius;
	const { filter, rim, brightRim } = selectionLens(width, height, Math.min(width / 2, height / 2, corner.endsWith("%") ? Math.min(width, height) * parseFloat(corner) / 100 : parseFloat(corner)));
	if (filtered) element.style.setProperty("--lg-filter", filter);
	element.style.setProperty("--lg-rim", rim);
	element.style.setProperty("--lg-rim-bright", brightRim);
}
// src/button.tsx
const Button = /* @__PURE__ */ forwardRef(function Button({ icon, variant = "glass", destructive, tint, children, className, style, type = "button", ...props }, forwardedRef) {
	const ref = useRef(null);
	useImperativeHandle(forwardedRef, () => ref.current);
	usePress(ref);
	useRefraction(ref);
	return /* @__PURE__ */ jsxs("button", {
		ref,
		type,
		className: cx("lg-glass lg-button", className),
		"data-icon": icon == null ? void 0 : children == null ? "only" : "",
		"data-variant": variant === "glass" ? void 0 : variant,
		"data-destructive": destructive ? "" : void 0,
		"data-tint": tint ? "" : void 0,
		style: tint ? {
			...style,
			"--lg-tint": tint
		} : style,
		...props,
		children: [icon, children]
	});
});
// src/glass.tsx
const Glass = /* @__PURE__ */ forwardRef(function Glass({ className, ...props }, forwardedRef) {
	const ref = useRef(null);
	useImperativeHandle(forwardedRef, () => ref.current);
	useRefraction(ref);
	return /* @__PURE__ */ jsx("div", {
		ref,
		className: cx("lg-glass", className),
		...props
	});
});
// src/internal/controllable.ts
function useControllable(value, defaultValue, onChange) {
	const [uncontrolled, setUncontrolled] = useState(defaultValue);
	const controlled = value !== void 0;
	const handler = useRef(onChange);
	useEffect(() => {
		handler.current = onChange;
	});
	const set = useCallback((next) => {
		if (!controlled) setUncontrolled(next);
		handler.current?.(next);
	}, [controlled]);
	return [controlled ? value : uncontrolled, set];
}
// src/input.tsx
const Input = /* @__PURE__ */ forwardRef(function Input({ value: valueProp, defaultValue = "", onValueChange, icon, className, style, ...props }, forwardedRef) {
	const rootRef = useRef(null);
	const inputRef = useRef(null);
	const [value, setValue] = useControllable(valueProp, defaultValue, onValueChange);
	useImperativeHandle(forwardedRef, () => inputRef.current);
	useRefraction(rootRef);
	return /* @__PURE__ */ jsxs("div", {
		ref: rootRef,
		className: cx("lg-glass lg-input", className),
		style,
		onPointerDown: (event) => {
			if (event.target !== inputRef.current) inputRef.current?.focus();
		},
		children: [
			icon == null ? null : /* @__PURE__ */ jsx("span", {
				className: "lg-input-icon",
				children: icon
			}),
			/* @__PURE__ */ jsx("input", {
				ref: inputRef,
				value,
				onChange: (event) => setValue(event.currentTarget.value),
				...props
			}),
			props.type === "search" && value && !props.disabled ? /* @__PURE__ */ jsx("button", {
				type: "button",
				className: "lg-input-clear",
				"aria-label": "Clear",
				onPointerDown: (event) => event.preventDefault(),
				onClick: () => {
					setValue("");
					inputRef.current?.focus();
				},
				children: /* @__PURE__ */ jsx("svg", {
					viewBox: "0 0 16 16",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.5,
					strokeLinecap: "round",
					"aria-hidden": true,
					children: /* @__PURE__ */ jsx("path", { d: "m4.5 4.5 7 7m0-7-7 7" })
				})
			}) : null
		]
	});
});
// src/menu.tsx
const clamp$1 = (value) => Math.min(1, Math.max(0, value));
const resistance = (value) => Math.sign(value) * 7 * (1 - Math.exp(-Math.abs(value) * .12 / 7));
const ellipsis = /* @__PURE__ */ jsxs("svg", {
	viewBox: "0 0 16 16",
	fill: "currentColor",
	"aria-hidden": true,
	children: [
		/* @__PURE__ */ jsx("circle", {
			cx: "3",
			cy: "8",
			r: "1.4"
		}),
		/* @__PURE__ */ jsx("circle", {
			cx: "8",
			cy: "8",
			r: "1.4"
		}),
		/* @__PURE__ */ jsx("circle", {
			cx: "13",
			cy: "8",
			r: "1.4"
		})
	]
});
function Menu({ items, "aria-label": label, icon = ellipsis, align = "end", className, style }) {
	const [phase, setPhase] = useState("closed");
	const triggerRef = useRef(null);
	const cardRef = useRef(null);
	const surfaceRef = useRef(null);
	const glyphRef = useRef(null);
	const contentRef = useRef(null);
	const plateRef = useRef(null);
	const morphRef = useRef(null);
	const latest = useRef(items);
	const mounted = phase !== "closed";
	useEffect(() => {
		latest.current = items;
	});
	useEffect(() => {
		if (phase === "open") morphRef.current?.set(1);
		if (phase === "leaving") morphRef.current?.set(0);
	}, [phase]);
	useEffect(() => {
		if (!mounted) return;
		const trigger = triggerRef.current;
		const card = cardRef.current;
		const surface = surfaceRef.current;
		const glyph = glyphRef.current;
		const content = contentRef.current;
		const plate = plateRef.current;
		const from = {
			width: trigger.offsetWidth,
			height: trigger.offsetHeight
		};
		const to = {
			width: card.offsetWidth,
			height: card.offsetHeight
		};
		const radius = parseFloat(getComputedStyle(surface).borderTopLeftRadius);
		const trailing = card.dataset.align !== "start";
		const origin = {
			x: trailing ? to.width - from.width / 2 : from.width / 2,
			y: from.height / 2
		};
		content.style.transformOrigin = `${origin.x}px ${origin.y}px`;
		glyph.style.width = `${from.width}px`;
		glyph.style.height = `${from.height}px`;
		let leaving = false;
		const shape = createSpring(0, 600, 46, (value) => {
			const t = clamp$1(value);
			const settled = t === 1;
			const width = from.width + (to.width - from.width) * t;
			const height = from.height + (to.height - from.height) * t;
			const scale = .5 + .5 * t;
			const local = (edge, centre) => centre + (edge - centre) / scale;
			const left = local(trailing ? to.width - width : 0, origin.x);
			const right = local(trailing ? to.width : width, origin.x);
			const bottom = local(height, origin.y);
			const top = local(0, origin.y);
			surface.style.width = settled ? "" : `${width}px`;
			surface.style.height = settled ? "" : `${height}px`;
			surface.style.opacity = String(clamp$1(t / .2));
			trigger.style.opacity = t === 0 ? "" : String(1 - clamp$1(t / .2));
			const drift = .3 * t;
			const dx = ((trailing ? to.width - width / 2 : width / 2) - origin.x) * drift;
			const dy = (height / 2 - origin.y) * drift;
			glyph.style.opacity = String(1 - clamp$1(t / .45));
			glyph.style.transform = `translate(${dx}px, ${dy}px) scale(${1 + .6 * t})`;
			glyph.style.filter = `blur(${8 * t}px)`;
			content.style.opacity = String(leaving ? clamp$1((t - .55) / .45) : clamp$1((t - .15) / .6));
			content.style.transform = settled ? "" : `scale(${scale})`;
			content.style.filter = settled ? "" : `blur(${6 * (1 - t)}px)`;
			content.style.clipPath = settled ? "" : `inset(${top}px ${to.width - right}px ${to.height - bottom}px ${left}px round ${radius / scale}px)`;
			if (leaving && value === 0) setPhase("closed");
		});
		const morph = {
			...shape,
			set(target, instant) {
				leaving = target === 0;
				if (leaving) shape.tune(900, 57);
				else shape.tune(600, 46);
				shape.set(target, instant);
			}
		};
		morphRef.current = morph;
		shape.paint();
		morph.set(1);
		const rows = () => [...card.querySelectorAll(".lg-menu-item:not(:disabled)")];
		rows()[0]?.focus({ preventScroll: true });
		const offset = {
			scale: 1,
			x: 0,
			y: 0
		};
		const paint = () => {
			card.style.scale = String(offset.scale);
			card.style.translate = `${offset.x}px ${offset.y}px`;
		};
		const scale = createSpring(1, 650, 36, (value) => {
			offset.scale = value;
			paint();
		});
		const x = createSpring(0, 600, 30, (value) => {
			offset.x = value;
			paint();
		});
		const y = createSpring(0, 600, 30, (value) => {
			offset.y = value;
			paint();
		});
		let gesture = null;
		let current = null;
		let suppressClickUntil = 0;
		const close = (restoreFocus = true) => {
			setPhase("leaving");
			if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
		};
		const highlight = (row) => {
			if (current === row) return;
			const first = !current;
			current = row;
			if (!row) {
				delete card.dataset.scrubbing;
				plate.style.opacity = "0";
				return;
			}
			card.dataset.scrubbing = "";
			plate.style.width = `${row.offsetWidth}px`;
			plate.style.height = `${row.offsetHeight}px`;
			if (first) plate.style.transition = "none";
			plate.style.transform = `translate(${row.offsetLeft}px, ${row.offsetTop}px)`;
			plate.style.opacity = "1";
			if (first) {
				plate.offsetWidth;
				plate.style.transition = "";
			}
		};
		const rowAt = (clientX, clientY) => {
			const row = document.elementFromPoint(clientX, clientY)?.closest(".lg-menu-item");
			return row && !row.disabled && card.contains(row) ? row : null;
		};
		const down = (event) => {
			if (!event.isPrimary || event.button !== 0) return;
			gesture = {
				id: event.pointerId,
				x: event.clientX,
				y: event.clientY
			};
			card.setPointerCapture(event.pointerId);
			card.dataset.pressed = "";
			scale.set(1 + 5 / Math.max(card.offsetWidth, card.offsetHeight, 200));
			highlight(rowAt(event.clientX, event.clientY));
		};
		const move = (event) => {
			if (!gesture) {
				const row = event.pointerType === "mouse" ? rowAt(event.clientX, event.clientY) : null;
				if (row) highlight(row);
				return;
			}
			if (event.pointerId !== gesture.id) return;
			highlight(rowAt(event.clientX, event.clientY));
			x.set(resistance(event.clientX - gesture.x), true);
			y.set(resistance(event.clientY - gesture.y), true);
		};
		const end = (event) => {
			if (event.pointerId !== gesture?.id) return;
			const chosen = event.type === "pointerup" ? rowAt(event.clientX, event.clientY) : null;
			highlight(null);
			gesture = null;
			delete card.dataset.pressed;
			scale.set(1);
			x.set(0);
			y.set(0);
			suppressClickUntil = performance.now() + 500;
			chosen?.click();
		};
		const leave = (event) => {
			if (!gesture && event.pointerType === "mouse") highlight(null);
		};
		const click = (event) => {
			const row = event.target.closest(".lg-menu-item");
			if (!row || event.detail !== 0 && performance.now() < suppressClickUntil) return;
			const item = latest.current[Number(row.dataset.index)];
			if (!item || item === "separator") return;
			close();
			item.onSelect?.();
		};
		const key = (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				close();
			} else if (event.key === "Tab") close(false);
			else if ([
				"ArrowDown",
				"ArrowUp",
				"Home",
				"End"
			].includes(event.key)) {
				event.preventDefault();
				if (!gesture) highlight(null);
				const list = rows();
				const index = list.indexOf(document.activeElement);
				list[event.key === "Home" ? 0 : event.key === "End" ? list.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
			}
		};
		const outside = (event) => {
			const target = event.target;
			if (!card.contains(target) && !triggerRef.current?.contains(target)) close(false);
		};
		card.addEventListener("pointerdown", down);
		card.addEventListener("pointermove", move);
		card.addEventListener("pointerleave", leave);
		card.addEventListener("pointerup", end);
		card.addEventListener("pointercancel", end);
		card.addEventListener("lostpointercapture", end);
		card.addEventListener("click", click);
		card.addEventListener("keydown", key);
		document.addEventListener("pointerdown", outside, true);
		return () => {
			[
				shape,
				scale,
				x,
				y
			].forEach((spring) => spring.stop());
			morphRef.current = null;
			trigger.style.opacity = "";
			card.removeEventListener("pointerdown", down);
			card.removeEventListener("pointermove", move);
			card.removeEventListener("pointerleave", leave);
			card.removeEventListener("pointerup", end);
			card.removeEventListener("pointercancel", end);
			card.removeEventListener("lostpointercapture", end);
			card.removeEventListener("click", click);
			card.removeEventListener("keydown", key);
			document.removeEventListener("pointerdown", outside, true);
		};
	}, [mounted]);
	const open = phase === "open";
	return /* @__PURE__ */ jsxs("div", {
		className: cx("lg-menu", className),
		style,
		children: [/* @__PURE__ */ jsx(Button, {
			ref: triggerRef,
			icon,
			"aria-label": label,
			"aria-haspopup": "menu",
			"aria-expanded": open,
			onClick: () => setPhase(open ? "leaving" : "open")
		}), mounted ? /* @__PURE__ */ jsxs("div", {
			ref: cardRef,
			role: "menu",
			"aria-label": label,
			className: "lg-menu-card",
			"data-phase": phase,
			"data-align": align,
			children: [
				/* @__PURE__ */ jsx("span", {
					ref: surfaceRef,
					className: "lg-menu-surface",
					"aria-hidden": true
				}),
				/* @__PURE__ */ jsx("span", {
					ref: glyphRef,
					className: "lg-menu-glyph",
					"aria-hidden": true,
					children: icon
				}),
				/* @__PURE__ */ jsxs("div", {
					ref: contentRef,
					role: "none",
					className: "lg-menu-content",
					children: [/* @__PURE__ */ jsx("span", {
						ref: plateRef,
						className: "lg-menu-plate",
						"aria-hidden": true
					}), items.map((item, index) => item === "separator" ? /* @__PURE__ */ jsx("div", {
						role: "separator",
						className: "lg-menu-separator"
					}, index) : /* @__PURE__ */ jsxs("button", {
						type: "button",
						role: "menuitem",
						className: "lg-menu-item",
						"data-index": index,
						"data-destructive": item.destructive ? "" : void 0,
						disabled: item.disabled,
						children: [item.icon, item.label]
					}, index))]
				})
			]
		}) : null]
	});
}
// src/search-field.tsx
const magnifier = /* @__PURE__ */ jsxs("svg", {
	viewBox: "0 0 16 16",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.5,
	strokeLinecap: "round",
	"aria-hidden": true,
	children: [/* @__PURE__ */ jsx("circle", {
		cx: "7",
		cy: "7",
		r: "4.75"
	}), /* @__PURE__ */ jsx("path", { d: "m10.5 10.5 3.25 3.25" })]
});
/** An `Input` for searching: a magnifier icon, a "Search" placeholder and a clear button. */
const SearchField = /* @__PURE__ */ forwardRef(function SearchField({ icon = magnifier, placeholder = "Search", ...props }, ref) {
	return /* @__PURE__ */ jsx(Input, {
		ref,
		type: "search",
		icon,
		placeholder,
		...props
	});
});
const held = (at, moved) => moved || performance.now() - at >= 150;
// src/internal/segments.tsx
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const keys = [
	"ArrowLeft",
	"ArrowRight",
	"Home",
	"End"
];
const REST = [
	1024,
	58.9,
	676,
	47.8
];
const UNDER = .5;
const DRAG = [
	2500,
	94,
	576,
	44.2
];
const LENS$2 = {
	strength: .2,
	strengthProperty: "--lg-tab-bend",
	dispersion: 2,
	dispersionProperty: "--lg-tab-dispersion",
	depth: 4,
	dome: 0,
	splay: 1,
	ink: true,
	blur: 2
};
const SEGMENT_LENS = {
	strength: .3,
	strengthProperty: "--lg-segment-bend",
	dispersion: .1,
	depth: 2.5,
	dome: 0,
	splay: 1
};
function attach({ bar, glass, thumb, labels, lensed, lens, tint, row }, options, bendsBackdrop, select) {
	const tabs = [...bar.querySelectorAll(".lg-tab")];
	let slot = 0;
	let width = 0;
	let height = 0;
	let inset = 0;
	let padding = 0;
	let growX = 16;
	let growY = 12;
	let active = -1;
	let shown = false;
	let settleFrame = 0;
	let gesture = null;
	const state = {
		x: 0,
		lift: 0
	};
	const refraction = createLens(lens, lensed, options, labels);
	const backdrop = bendsBackdrop && refractsBackdrop() ? createBackdropLens(lens, options) : null;
	let lensing = false;
	const mark = () => bar.toggleAttribute("data-away", active < 0 || Math.abs(state.x - active * slot) > .5);
	const measure = () => {
		const style = getComputedStyle(bar);
		padding = parseFloat(style.paddingLeft) || 0;
		slot = (bar.clientWidth - padding - (parseFloat(style.paddingRight) || 0)) / tabs.length;
		inset = parseFloat(style.getPropertyValue("--lg-thumb-inset")) || 0;
		width = slot - 2 * inset;
		height = lens.offsetHeight;
		growX = parseFloat(style.getPropertyValue("--lg-lens-grow-x")) || 0;
		growY = parseFloat(style.getPropertyValue("--lg-lens-grow-y")) || 0;
	};
	const paint = () => {
		const { x, lift } = state;
		const sx = 1 + growX / width * lift;
		const sy = 1 + growY / height * lift;
		const transform = `translateX(${x}px) scale(${sx}, ${sy})`;
		lens.style.transform = tint.style.transform = transform;
		if (thumb) thumb.style.transform = transform;
		lens.style.setProperty("--lg-lift", String(clamp(lift, 0, 1)));
		lens.style.setProperty("--lg-lift-y", String(sy));
		row.style.transform = `scale(${1 / sx}, ${1 / sy}) translate(${-x + (sx - 1) * (inset + width / 2)}px, ${(sy - 1) * (inset + height / 2)}px)`;
		if (!gesture && lift < .01) delete bar.dataset.refracting;
		mark();
		if (lift > .01 !== lensing) {
			lensing = lift > .01;
			bar.toggleAttribute("data-lensing", lensing);
			refraction.setActive(lensing);
		}
		const amount = clamp(lift, 0, 1);
		const under = clamp((lift - UNDER) / .5, 0, 1);
		lens.style.setProperty("--lg-rest", String(clamp(1 - lift / UNDER, 0, 1)));
		lens.style.setProperty("--lg-under", String(under));
		bar.toggleAttribute("data-under", lift > UNDER);
		refraction.update(amount);
		backdrop?.update(under);
	};
	const x = createSpring(0, REST[0], REST[1], (value) => {
		state.x = value;
		paint();
	});
	const lift = createSpring(0, REST[2], REST[3], (value) => {
		state.lift = value;
		paint();
	});
	const move = (target, lifted, instant = false) => {
		const [slideStiffness, slideDamping, liftStiffness, liftDamping] = gesture ? DRAG : REST;
		x.tune(slideStiffness, slideDamping);
		lift.tune(liftStiffness, liftDamping);
		x.set(target, instant);
		lift.set(lifted ? 1 : 0, instant);
	};
	const settle = (instant = false) => {
		mark();
		if (gesture) return;
		const show = active >= 0;
		if (show) delete bar.dataset.hidden;
		else bar.dataset.hidden = "";
		if (show) move(active * slot, false, instant || !shown);
		shown = show;
	};
	const position = (event) => clamp(gesture.anchor + event.clientX - gesture.x, 0, slot * (tabs.length - 1));
	const light = (event, box) => {
		glass.style.setProperty("--lg-x", `${clamp((event.clientX - box.left) / box.width * 100, 0, 100)}%`);
		lens.style.setProperty("--lg-x", `${clamp((event.clientX - box.left - padding - inset - state.x) / width * 100, 0, 100)}%`);
	};
	const release = () => {
		const old = gesture;
		gesture = null;
		delete bar.dataset.lifted;
		delete lens.dataset.pressed;
		if (old && bar.hasPointerCapture(old.id)) bar.releasePointerCapture(old.id);
		return old;
	};
	let suppressClick = false;
	const onPointerDown = (event) => {
		const tab = event.target.closest(".lg-tab");
		if (!event.isPrimary || event.button !== 0 || gesture || !tab) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		cancelAnimationFrame(settleFrame);
		settleFrame = 0;
		measure();
		bar.toggleAttribute("data-light", parseFloat(getComputedStyle(lens).getPropertyValue("--lg-lens-shine")) < 0);
		backdrop?.refit();
		const box = bar.getBoundingClientRect();
		gesture = {
			id: event.pointerId,
			x: event.clientX,
			anchor: tabs.indexOf(tab) * slot,
			moved: false,
			box,
			at: performance.now()
		};
		suppressClick = false;
		bar.dataset.lifted = "";
		bar.dataset.refracting = "";
		delete bar.dataset.hidden;
		lens.dataset.pressed = "";
		light(event, box);
		move(gesture.anchor, true, !shown);
		shown = true;
	};
	const onPointerMove = (event) => {
		if (event.pointerId !== gesture?.id) return;
		if (!gesture.moved && Math.abs(event.clientX - gesture.x) > 6) {
			gesture.moved = true;
			bar.setPointerCapture(event.pointerId);
		}
		if (gesture.moved) move(position(event), true);
		light(event, gesture.box);
	};
	const onPointerEnd = (event) => {
		if (event.pointerId !== gesture?.id) return;
		if (event.type === "lostpointercapture" && event.target !== bar) return;
		const index = Math.round(position(event) / slot);
		const { moved, box } = release();
		const near = event.clientY >= box.top - 24 && event.clientY <= box.bottom + 24;
		if (event.type === "pointerup" && (moved || near)) {
			suppressClick = true;
			settleFrame = requestAnimationFrame(() => {
				settleFrame = 0;
				settle();
			});
			tabs[index]?.click();
		} else {
			suppressClick = moved;
			settle();
		}
	};
	const onTouchMove = (event) => {
		if (gesture && event.cancelable && held(gesture.at, gesture.moved)) event.preventDefault();
	};
	const onClick = (event) => {
		if (event.isTrusted && suppressClick && event.detail !== 0) {
			suppressClick = false;
			event.preventDefault();
			return;
		}
		const tab = event.target.closest(".lg-tab");
		if (!tab || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		const index = tabs.indexOf(tab);
		if (tab instanceof HTMLAnchorElement) {
			active = index;
			settle();
		}
		select(index);
	};
	const onKeyDown = (event) => {
		const tab = event.target.closest(".lg-tab");
		if (!tab || tab instanceof HTMLAnchorElement || !keys.includes(event.key)) return;
		event.preventDefault();
		const current = tabs.indexOf(tab);
		const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
		select(index);
		tabs[index]?.focus();
	};
	const reset = () => {
		cancelAnimationFrame(settleFrame);
		settleFrame = 0;
		release();
		settle(true);
	};
	const onVisibilityChange = () => {
		if (document.hidden) reset();
	};
	const observer = new ResizeObserver(() => {
		measure();
		if (!gesture) settle(true);
	});
	measure();
	bar.dataset.ready = "";
	bar.addEventListener("pointerdown", onPointerDown);
	window.addEventListener("pointermove", onPointerMove);
	window.addEventListener("pointerup", onPointerEnd);
	window.addEventListener("pointercancel", onPointerEnd);
	bar.addEventListener("lostpointercapture", onPointerEnd);
	bar.addEventListener("touchmove", onTouchMove, { passive: false });
	bar.addEventListener("click", onClick, true);
	bar.addEventListener("keydown", onKeyDown);
	document.addEventListener("visibilitychange", onVisibilityChange);
	window.addEventListener("blur", reset);
	observer.observe(bar);
	return {
		setActive(index) {
			cancelAnimationFrame(settleFrame);
			settleFrame = 0;
			active = index;
			settle();
		},
		destroy() {
			cancelAnimationFrame(settleFrame);
			x.stop();
			lift.stop();
			refraction.destroy();
			backdrop?.destroy();
			observer.disconnect();
			for (const key of [
				"ready",
				"hidden",
				"lifted",
				"refracting",
				"lensing",
				"away",
				"light",
				"under"
			]) delete bar.dataset[key];
			bar.removeEventListener("pointerdown", onPointerDown);
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerEnd);
			window.removeEventListener("pointercancel", onPointerEnd);
			bar.removeEventListener("lostpointercapture", onPointerEnd);
			bar.removeEventListener("touchmove", onTouchMove);
			bar.removeEventListener("click", onClick, true);
			bar.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("blur", reset);
		}
	};
}
function content(item) {
	if (item.icon === void 0) return /* @__PURE__ */ jsx("span", {
		className: "lg-tab-text",
		children: item.label
	});
	return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("span", {
		className: "lg-tab-icon",
		"aria-hidden": true,
		children: item.icon
	}), /* @__PURE__ */ jsx("span", {
		className: "lg-tab-label",
		children: item.label
	})] });
}
/**
* A row of choices with one selected, under a selection that lifts into a
* lens while held: a tab bar's, over glass, or a segmented control's, a thumb
* on a track. Only TabBar and SegmentedControl use it.
*/
function Segments({ kind, items, value: valueProp, defaultValue = null, onValueChange, link: Link = "a", className, style, ...props }) {
	const segmented = kind === "segmented";
	const barRef = useRef(null);
	const glassRef = useRef(null);
	const thumbRef = useRef(null);
	const labelsRef = useRef(null);
	const lensedRef = useRef(null);
	const lensRef = useRef(null);
	const tintRef = useRef(null);
	const rowRef = useRef(null);
	const controller = useRef(null);
	const [value, setValue] = useControllable(valueProp, defaultValue, onValueChange);
	const selected = items.findIndex((item) => item.value === value);
	const latest = useRef({
		items,
		selected,
		setValue
	});
	const signature = items.map((item) => item.value).join("\n");
	const navigation = !segmented && items.every((item) => item.href !== void 0);
	const icons = !segmented && items.some((item) => item.icon !== void 0);
	useRefraction(glassRef);
	useRefraction(lensRef, true, segmented);
	useEffect(() => {
		latest.current = {
			items,
			selected,
			setValue
		};
	});
	useEffect(() => {
		const instance = attach({
			bar: barRef.current,
			glass: glassRef.current,
			thumb: thumbRef.current,
			labels: labelsRef.current,
			lensed: lensedRef.current,
			lens: lensRef.current,
			tint: tintRef.current,
			row: rowRef.current
		}, segmented ? SEGMENT_LENS : LENS$2, !segmented, (index) => {
			const item = latest.current.items[index];
			if (item) latest.current.setValue(item.value);
		});
		instance.setActive(latest.current.selected);
		controller.current = instance;
		return () => {
			instance.destroy();
			controller.current = null;
		};
	}, [signature, segmented]);
	useLayoutEffect(() => {
		controller.current?.setActive(selected);
	}, [selected]);
	return /* @__PURE__ */ jsxs("div", {
		ref: barRef,
		role: segmented ? "radiogroup" : navigation ? "navigation" : "tablist",
		"data-icons": icons ? "" : void 0,
		className: cx(segmented ? "lg-segmented" : "lg-tab-bar", className),
		style: {
			...style,
			"--lg-index": Math.max(selected, 0),
			"--lg-tabs": items.length
		},
		...props,
		children: [
			/* @__PURE__ */ jsx("span", {
				ref: glassRef,
				className: "lg-glass lg-tab-bar-glass",
				"aria-hidden": true
			}),
			segmented && /* @__PURE__ */ jsx("span", {
				ref: thumbRef,
				className: "lg-segmented-thumb",
				"aria-hidden": true
			}),
			/* @__PURE__ */ jsx("span", {
				ref: labelsRef,
				className: "lg-tab-labels",
				role: "none",
				children: items.map((item, index) => item.href !== void 0 ? /* @__PURE__ */ jsx(Link, {
					href: item.href,
					className: "lg-tab",
					"data-selected": index === selected ? "" : void 0,
					"aria-current": index === selected ? "page" : void 0,
					draggable: false,
					children: /* @__PURE__ */ jsx("span", {
						className: "lg-tab-face",
						children: content(item)
					})
				}, item.value) : /* @__PURE__ */ jsx("button", {
					type: "button",
					role: segmented ? "radio" : "tab",
					className: "lg-tab",
					"data-selected": index === selected ? "" : void 0,
					"aria-selected": segmented ? void 0 : index === selected,
					"aria-checked": segmented ? index === selected : void 0,
					tabIndex: index === selected || selected < 0 && index === 0 ? 0 : -1,
					children: /* @__PURE__ */ jsx("span", {
						className: "lg-tab-face",
						children: content(item)
					})
				}, item.value))
			}),
			/* @__PURE__ */ jsx("span", {
				ref: lensedRef,
				className: "lg-tab-labels lg-tab-lensed",
				"aria-hidden": true,
				children: items.map((item, index) => /* @__PURE__ */ jsx("span", {
					className: "lg-tab-copy",
					"data-selected": index === selected ? "" : void 0,
					children: content(item)
				}, item.value))
			}),
			/* @__PURE__ */ jsx("span", {
				ref: tintRef,
				className: "lg-tab-tint",
				"aria-hidden": true,
				children: /* @__PURE__ */ jsx("span", {
					ref: rowRef,
					className: "lg-tab-row",
					children: items.map((item) => /* @__PURE__ */ jsx("span", {
						className: "lg-tab-copy",
						children: content(item)
					}, item.value))
				})
			}),
			/* @__PURE__ */ jsx("span", {
				ref: lensRef,
				className: "lg-glass lg-tab-lens",
				"aria-hidden": true
			})
		]
	});
}
// src/segmented-control.tsx
/**
* A choice between a few options, as iOS 26's segmented control: a thumb on a
* track that, held or dragged, lifts into a lens over the labels.
*/
function SegmentedControl(props) {
	return /* @__PURE__ */ jsx(Segments, {
		kind: "segmented",
		...props
	});
}
// src/slider.tsx
const LENS$1 = {
	strength: .75,
	strengthProperty: "--lg-slider-bend",
	dispersion: .65,
	depth: 2,
	dome: 5,
	splay: .5
};
const Slider = /* @__PURE__ */ forwardRef(function Slider({ value: valueProp, defaultValue, onValueChange, min = 0, max = 100, step = 1, className, style, ...props }, forwardedRef) {
	const rootRef = useRef(null);
	const inputRef = useRef(null);
	const bedRef = useRef(null);
	const magnifiedRef = useRef(null);
	const thumbRef = useRef(null);
	const lensRef = useRef(null);
	const faceRef = useRef(null);
	const [value, setValue] = useControllable(valueProp, defaultValue ?? min, onValueChange);
	const progress = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
	useImperativeHandle(forwardedRef, () => inputRef.current);
	useEffect(() => {
		const input = inputRef.current;
		const thumb = thumbRef.current;
		const face = faceRef.current;
		const root = rootRef.current;
		const lens = createLens(thumb, magnifiedRef.current, LENS$1, bedRef.current);
		lensRef.current = lens;
		const lift = createSpring(0, 2e3, 80, (amount) => {
			const lifted = Math.min(1, Math.max(0, amount));
			thumb.style.scale = String(.6 + .4 * amount);
			root.style.setProperty("--lg-lift", String(lifted));
			face.style.opacity = String(1 - .85 * lifted);
			lens.setActive(amount > .01);
			lens.update();
		});
		const hold = () => {
			if (!input.disabled) lift.set(1);
		};
		const release = () => lift.set(0);
		const ends = [
			"pointerup",
			"pointercancel",
			"lostpointercapture",
			"blur"
		];
		input.addEventListener("pointerdown", hold);
		ends.forEach((type) => input.addEventListener(type, release));
		window.addEventListener("pointerup", release);
		return () => {
			lift.stop();
			lens.destroy();
			lensRef.current = null;
			input.removeEventListener("pointerdown", hold);
			ends.forEach((type) => input.removeEventListener(type, release));
			window.removeEventListener("pointerup", release);
		};
	}, []);
	useLayoutEffect(() => {
		lensRef.current?.update();
	}, [progress]);
	return /* @__PURE__ */ jsxs("div", {
		ref: rootRef,
		className: cx("lg-slider", className),
		style: {
			...style,
			"--lg-progress": progress
		},
		children: [
			/* @__PURE__ */ jsx("span", {
				ref: bedRef,
				className: "lg-slider-bed",
				"aria-hidden": true,
				children: /* @__PURE__ */ jsx("span", {
					className: "lg-slider-track",
					children: /* @__PURE__ */ jsx("span", { className: "lg-slider-fill" })
				})
			}),
			/* @__PURE__ */ jsx("span", {
				ref: magnifiedRef,
				className: "lg-slider-bed lg-slider-magnified",
				"aria-hidden": true,
				children: /* @__PURE__ */ jsx("span", {
					className: "lg-slider-track",
					children: /* @__PURE__ */ jsx("span", { className: "lg-slider-fill" })
				})
			}),
			/* @__PURE__ */ jsx("span", {
				ref: thumbRef,
				className: "lg-slider-thumb",
				"aria-hidden": true,
				children: /* @__PURE__ */ jsx("span", {
					ref: faceRef,
					className: "lg-thumb-face"
				})
			}),
			/* @__PURE__ */ jsx("input", {
				ref: inputRef,
				type: "range",
				min,
				max,
				step,
				value,
				onChange: (event) => setValue(event.currentTarget.valueAsNumber),
				...props
			})
		]
	});
});
// src/switch.tsx
const TRAVEL = 21.7125;
const unit = (value) => Math.min(1, Math.max(0, value));
const LENS = {
	strength: .45,
	strengthProperty: "--lg-switch-bend",
	dispersion: 1,
	depth: 2,
	dome: 6,
	splay: .4
};
const Switch = /* @__PURE__ */ forwardRef(function Switch({ checked: checkedProp, defaultChecked = false, onCheckedChange, className, ...props }, forwardedRef) {
	const ref = useRef(null);
	const bedRef = useRef(null);
	const insetRef = useRef(null);
	const fillRef = useRef(null);
	const insetFillRef = useRef(null);
	const thumbRef = useRef(null);
	const faceRef = useRef(null);
	const [checked, setChecked] = useControllable(checkedProp, defaultChecked, onCheckedChange);
	const travel = TRAVEL;
	const latest = useRef({
		checked,
		setChecked,
		travel
	});
	const springs = useRef(null);
	useImperativeHandle(forwardedRef, () => ref.current);
	useEffect(() => {
		latest.current = {
			checked,
			setChecked,
			travel
		};
		springs.current?.position.set(checked ? 1 : 0);
		springs.current?.color.set(checked ? 1 : 0);
	}, [
		checked,
		setChecked,
		travel
	]);
	useEffect(() => {
		springs.current?.position.paint();
	}, [travel]);
	useEffect(() => {
		const el = ref.current;
		const fills = [fillRef.current, insetFillRef.current];
		const thumb = thumbRef.current;
		const face = faceRef.current;
		const lens = createLens(thumb, insetRef.current, LENS, bedRef.current);
		let x = 0;
		let scale = .65;
		const paint = () => {
			thumb.style.transform = `translate(${x}px, -50%) scale(${scale})`;
			lens.update();
		};
		const initial = latest.current.checked ? 1 : 0;
		const position = createSpring(initial, 1e3, 80, (value) => {
			x = value * latest.current.travel;
			paint();
		});
		const color = createSpring(initial, 1e3, 80, (value) => {
			for (const fill of fills) fill.style.opacity = String(unit(value));
		});
		const lift = createSpring(0, 2e3, 80, (value) => {
			scale = .65 + .25 * value;
			face.style.opacity = String(1 - .85 * unit(value));
			el.style.setProperty("--lg-lift", String(unit(value)));
			lens.setActive(value > .01);
			paint();
		});
		springs.current = {
			position,
			color
		};
		position.paint();
		color.paint();
		lift.paint();
		let gesture = null;
		let ignoreClick = false;
		const sync = () => {
			position.set(latest.current.checked ? 1 : 0);
			color.set(latest.current.checked ? 1 : 0);
		};
		const settle = (next) => {
			const old = gesture;
			gesture = null;
			lift.set(0);
			if (old && el.hasPointerCapture(old.id)) el.releasePointerCapture(old.id);
			if (next === void 0 || next === latest.current.checked) return sync();
			latest.current.setChecked(next);
			requestAnimationFrame(sync);
		};
		const down = (event) => {
			if (!event.isPrimary || event.button !== 0 || el.disabled) return;
			event.preventDefault();
			ignoreClick = false;
			gesture = {
				id: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				from: latest.current.checked ? 1 : 0,
				moved: false,
				at: performance.now(),
				box: el.getBoundingClientRect()
			};
			el.setPointerCapture(event.pointerId);
			lift.set(1);
		};
		const move = (event) => {
			if (event.pointerId !== gesture?.id) return;
			const dx = event.clientX - gesture.x;
			const dy = Math.abs(event.clientY - gesture.y);
			if (!held(gesture.at, gesture.moved) && dy > 10 && dy > Math.abs(dx) + 4) {
				ignoreClick = true;
				return settle();
			}
			if (!gesture.moved && Math.abs(dx) < 4) return;
			gesture.moved = true;
			const value = gesture.from + dx / latest.current.travel;
			const overshoot = value < 0 ? value : value > 1 ? value - 1 : 0;
			position.set(unit(value) + overshoot / 22);
			color.set(value > .5 ? 1 : 0);
		};
		const up = (event) => {
			if (event.pointerId !== gesture?.id) return;
			ignoreClick = true;
			const { from, x, moved, box } = gesture;
			const value = from + (event.clientX - x) / latest.current.travel;
			const near = event.clientY >= box.top - 24 && event.clientY <= box.bottom + 24;
			settle(moved ? value > .5 : near ? !latest.current.checked : void 0);
		};
		const keep = (event) => {
			if (gesture && event.cancelable && held(gesture.at, gesture.moved)) event.preventDefault();
		};
		const cancel = () => {
			if (!gesture) return;
			ignoreClick = true;
			settle();
		};
		const click = () => {
			if (ignoreClick) ignoreClick = false;
			else if (!el.disabled) latest.current.setChecked(!latest.current.checked);
		};
		el.addEventListener("pointerdown", down);
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerup", up);
		el.addEventListener("pointercancel", cancel);
		el.addEventListener("lostpointercapture", cancel);
		el.addEventListener("touchmove", keep, { passive: false });
		el.addEventListener("click", click);
		return () => {
			springs.current = null;
			[
				position,
				color,
				lift
			].forEach((spring) => spring.stop());
			lens.destroy();
			el.removeEventListener("pointerdown", down);
			el.removeEventListener("pointermove", move);
			el.removeEventListener("pointerup", up);
			el.removeEventListener("pointercancel", cancel);
			el.removeEventListener("lostpointercapture", cancel);
			el.removeEventListener("touchmove", keep);
			el.removeEventListener("click", click);
		};
	}, []);
	return /* @__PURE__ */ jsxs("button", {
		ref,
		type: "button",
		role: "switch",
		"aria-checked": checked,
		className: cx("lg-switch", className),
		...props,
		children: [
			/* @__PURE__ */ jsx("span", {
				ref: bedRef,
				className: "lg-switch-bed",
				"aria-hidden": true,
				children: /* @__PURE__ */ jsx("span", {
					className: "lg-switch-track",
					children: /* @__PURE__ */ jsx("span", {
						ref: fillRef,
						className: "lg-switch-fill"
					})
				})
			}),
			/* @__PURE__ */ jsx("span", {
				ref: insetRef,
				className: "lg-switch-bed lg-switch-inset",
				"aria-hidden": true,
				children: /* @__PURE__ */ jsx("span", {
					className: "lg-switch-track",
					children: /* @__PURE__ */ jsx("span", {
						ref: insetFillRef,
						className: "lg-switch-fill"
					})
				})
			}),
			/* @__PURE__ */ jsx("span", {
				ref: thumbRef,
				className: "lg-switch-thumb",
				"aria-hidden": true,
				children: /* @__PURE__ */ jsx("span", {
					ref: faceRef,
					className: "lg-thumb-face"
				})
			})
		]
	});
});
// src/tab-bar.tsx
/**
* A row of tabs on glass, as iOS 26's tab bar: the selection springs between
* them, follows a drag, and lifts into a lens while held. Tabs with an `href`
* are links, and the bar is then navigation.
*/
function TabBar(props) {
	return /* @__PURE__ */ jsx(Segments, {
		kind: "tab-bar",
		...props
	});
}
// src/index.ts
insertStyles(styles_default);
export { Button, Glass, Input, Menu, SearchField, SegmentedControl, Slider, Switch, TabBar, useGlisseRefraction };
