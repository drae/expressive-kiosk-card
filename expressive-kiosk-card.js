/*
 * expressive-kiosk-card
 * Copyright (c) 2026 Paul Owen
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * A small-screen kiosk (built for an Echo Show 5 at 788x394 CSS px): a Glance home screen and
 * tile screens behind it, one card per view on a panel dashboard.
 *
 *   type: custom:expressive-kiosk-card
 *   view: glance                 # glance | lights | sockets | heating | alerts
 *   paths:                       # where the Glance totals and the back button go
 *     glance: /kitchen-show/glance
 *     lights: /kitchen-show/lights
 *     sockets: /kitchen-show/sockets
 *     heating: /kitchen-show/heating
 *     alerts: /kitchen-show/alerts
 *   climate: climate.thermostat
 *   climate_name: Hallway thermostat
 *   boost: { minutes: 60, temperature: 21 }   # hive.boost_heating_on when it exists, else the boost preset
 *   light_label: light           # lights and sockets are the labelled entities, grouped by area
 *   socket_label: socket
 *   areas: [living_room, study]  # optional order; other areas follow by name
 *   area_groups:                 # optional group entity per area, switched instead of each member
 *     living_room: light.lounge
 *   locked: [switch.socket_11]   # shown, never switched (the rack)
 *   lights_count: sensor.count_lights_on      # optional; counted from the labels when left out
 *   sockets_count: sensor.count_sockets_on
 *   alerts:                      # each is active when its entity is `on`, or not `ok` when given
 *     - { entity: binary_sensor.all_doors, name: Door open }
 *     - { entity: sensor.garden_thermal_comfort_frost_risk, name: Frost risk, ok: no_risk }
 *   weather:
 *     condition: sensor.home_weather_condition  # Google `type` + `is_daytime` pick the frog scene
 *     now: sensor.weather_now                   # attribute now_temp
 *     hourly: sensor.weather_hourly             # attribute forecast: [{dt, t}]
 *     frog_path: /local/froggy/
 *   frog: { fade: 0, size: 546, lift: 0, shadow: 1.2 }
 *   calendars:
 *     - { entity: calendar.home, strip: "" }
 *     - { entity: calendar.bins, strip: " collection", colors: { recycling: "rgb(46,131,191)", food: "rgb(105,178,63)" } }
 *   media:
 *     player: media_player.echo_show_kitchen
 *     now_playing: switch.echo_show_now_playing # Kiosk Satellite's now-playing screen; the tile turns it on
 *
 * Lights and sockets switch with one call per area group where there is one, otherwise per entity.
 * Locked entities are never switched, including by All off.
 */

const VERSION = "0.1.1";
const HOURS_SHOWN = 4;
const EVENTS_SHOWN = 3;
const CAL_DAYS = 7;
const CAL_REFRESH = 15 * 60000;
// Cool to warm, as expressive-schedule-card: frost blue, teal, green (18°), amber (19.5°), red above 21°.
const STOPS = [[10, [84, 116, 158]], [17, [62, 128, 150]], [18, [104, 150, 96]], [19, [196, 150, 40]], [19.5, [201, 126, 11]],
  [21, [226, 84, 22]], [25, [255, 69, 0]]];
// Google Weather Frog scenes per code, as the #weather card picks them; |nomg = no middle layer.
const SCENES = {"01":["sunny-beach-reading","sunny-beach-sandcastle","sunny-beach-sunscreen","sunny-citypark-picnic","sunny-creek-swimming","sunny-field-biking","sunny-field-hiking","sunny-field-kite","sunny-hills-painting","sunny-hills-reading","sunny-hills-sunbathing","sunny-home-laundry|nomg","sunny-orchard-pickingfruit","sunny-rooftop-pinacolada"],"02":["mostly-sunny-beach-reading","mostly-sunny-beach-sandcastle","mostly-sunny-beach-sunscreen","mostly-sunny-citypark-picnic","mostly-sunny-creek-swimming","mostly-sunny-field-biking","mostly-sunny-field-hiking","mostly-sunny-field-kite","mostly-sunny-hills-painting","mostly-sunny-hills-reading","mostly-sunny-hills-sunbathing","mostly-sunny-home-laundry|nomg","mostly-sunny-orchard-pickingfruit","mostly-sunny-rooftop-pinacolada"],"03":["partly-cloudy-day-beach-shells","partly-cloudy-day-citypark-ukelele","partly-cloudy-day-creek-feet","partly-cloudy-day-field-biking","partly-cloudy-day-field-hiking","partly-cloudy-day-hills-painting","partly-cloudy-day-hills-reading","partly-cloudy-day-home-flowers|nomg","partly-cloudy-day-orchard-butterflies","partly-cloudy-day-orchard-treeswing"],"04":["mostly-cloudy-day-beach-shells","mostly-cloudy-day-citypark-ukelele","mostly-cloudy-day-creek-feet","mostly-cloudy-day-field-biking","mostly-cloudy-day-field-hiking","mostly-cloudy-day-hills-painting","mostly-cloudy-day-hills-reading","mostly-cloudy-day-home-flowers|nomg","mostly-cloudy-day-orchard-butterflies","mostly-cloudy-day-orchard-treeswing"],"05":["clear-creek-stars","clear-field-lanterns","clear-hills-camping","clear-hills-telescope","clear-home-lounging|nomg","clear-orchard-fireflies"],"06":["mostly-clear-creek-stars","mostly-clear-field-lanterns","mostly-clear-hills-camping","mostly-clear-hills-telescope","mostly-clear-home-lounging|nomg","mostly-clear-orchard-fireflies"],"07":["partly-cloudy-night-creek-fireflies","partly-cloudy-night-field-fireflies","partly-cloudy-night-hills-smores","partly-cloudy-night-home-inside|nomg","partly-cloudy-night-orchard-eating","partly-cloudy-night-rooftop-dinner"],"08":["mostly-cloudy-night-creek-fireflies","mostly-cloudy-night-field-fireflies","mostly-cloudy-night-hills-smores","mostly-cloudy-night-home-inside|nomg","mostly-cloudy-night-orchard-eating","mostly-cloudy-night-rooftop-dinner"],"09":["cloudy-hills-coffee","cloudy-home-flowers|nomg","cloudy-orchard-watching"],"10":["drizzle-creek-leaf","drizzle-field-leaf","drizzle-hills-umbrella","drizzle-home-laundry|nomg","drizzle-orchard-reading"],"11":["rain-creek-leaf","rain-field-leaf","rain-hills-umbrella","rain-home-laundry|nomg","rain-orchard-reading"],"12":["heavy-rain-busstop-umbrella","heavy-rain-creek-leaf"],"13":["flurries-citypark-snowman","flurries-creek-iceskating"],"15":["snow-showers-snow-citypark-snowman","snow-showers-snow-creek-skating","snow-showers-snow-home-shoveling|nomg"],"16":["blowing-snow-field-snowman"],"17":["heavy-snow-blizzard-creek-cocoa","heavy-snow-blizzard-home-inside|nomg","heavy-snow-blizzard-home-shoveling|nomg"],"19":["mixed-rain-hail-rain-sleet-busstop-waiting","mixed-rain-hail-rain-sleet-cafe-entering"],"20":["rain-snow-wintry-mix-citypark-snowman"],"22":["iso-thunderstorms-home-inside|nomg"],"24":["strong-thunderstorms-home-inside|nomg"],"25":["breezy-windy-creek-pinwheel","breezy-windy-home-laundry|nomg"],"26":["haze-fog-dust-smoke-field-lantern"]};
const SKY = {"01":["#45B5E5","#76CEE9"],"02":["#52A6CF","#59B1DC"],"03":["#5192B9","#65ACD7"],"04":["#5687AF","#69A2CF"],"05":["#5352AA","#6E5BC0"],"06":["#5150A9","#6E5BBF"],"07":["#596AA7","#7881C3"],"08":["#586AA6","#7780C2"],"09":["#6C8FA0","#769ECA"],"10":["#4FABC5","#5896B6"],"11":["#44B0CD","#3D88AC"],"12":["#41AFD0","#3B87AE"],"13":["#72919E","#899CA6"],"15":["#83848B","#9E9E9F"],"16":["#767081","#807A93"],"17":["#7B7585","#8C8599"],"19":["#5E9096","#67939F"],"20":["#708183","#7E9296"],"22":["#9D4D7B","#A95A87"],"24":["#9D4D7C","#AA5A87"],"25":["#72657F","#786B92"],"26":["#8B8583","#97918E"]};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pad = (n) => String(n).padStart(2, "0");

const SVG = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const IC = {
  bulb: SVG('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>'),
  socket: SVG('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9v3M15 9v3M12 15v2"/>'),
  flame: SVG('<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-8z"/>'),
  bell: SVG('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>'),
  back: SVG('<path d="M15 5l-7 7 7 7"/>'),
  off: SVG('<path d="M12 3v8"/><path d="M7 6a7 7 0 1 0 10 0"/>'),
  minus: SVG('<path d="M5 12h14"/>'),
  plus: SVG('<path d="M5 12h14M12 5v14"/>'),
  mode: SVG('<path d="M4 12a8 8 0 0 1 14-5M20 12a8 8 0 0 1-14 5"/><path d="M18 3v4h-4M6 21v-4h4"/>'),
  chev: SVG('<path d="M7 10l5 5 5-5"/>'),
  check: SVG('<path d="M5 12l5 5 9-10"/>'),
  alert: SVG('<path d="M12 4 2 20h20z"/><path d="M12 10v4M12 17v.5"/>'),
};

const MODE_TEXT = {
  auto: ["Auto", "Follow the schedule"],
  heat: ["Heat", "Hold the target"],
  boost: ["Boost", "Heat for a while"],
  off: ["Off", "Frost protection only"],
  cool: ["Cool", "Hold the target"],
  heat_cool: ["Heat/cool", "Keep within the range"],
};

const CSS_TEXT = `
  :host { display: block; height: 100vh; --amber: rgb(201, 126, 11); --amber-disc: rgb(181, 114, 10); --alert: rgb(255, 60, 10);
          --tile: var(--gray000, #3a3b3d); --well: var(--gray100, #353637); --line: var(--gray200, #404142);
          --sub: var(--gray500, #939496); --soft: var(--gray600, #c8c9cb); --ground: var(--popupBG, #28282a);
          --tab-green: rgb(90, 125, 77); }
  ha-card { height: 100%; position: relative; overflow: hidden; border: 0; border-radius: 0; background: var(--ground);
            color: #fff; font-family: var(--primary-font-family, Montserrat, sans-serif); user-select: none; -webkit-user-select: none; }
  button { font: inherit; color: inherit; -webkit-tap-highlight-color: transparent; }
  button:focus-visible { outline: 2px solid var(--soft); outline-offset: 2px; }
  svg { width: 24px; height: 24px; flex: none; }
  .n { font-variant-numeric: tabular-nums; }

  .btn64 { height: 64px; border-radius: 32px; border: 0; padding: 0 32px; background: var(--tile); font-size: 18px; font-weight: 600;
           display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; flex: none; }
  .btn64.amber { background: var(--amber); }
  .btn64.round { width: 64px; padding: 0; }
  .btn64[disabled] { opacity: .45; cursor: default; }
  .btn64 svg { width: 28px; height: 28px; }

  /* Glance */
  .gl { position: absolute; inset: 0; padding: 24px 16px 16px 24px; display: grid; grid-template-columns: 1fr 288px;
        grid-template-rows: 1fr 80px; gap: 16px 24px; }
  .frog { position: absolute; z-index: 0; left: 0; top: 0; bottom: 0; width: 540px; pointer-events: none; }
  .frog::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,.5) 0%, rgba(0,0,0,.3) 45%, transparent 75%); }
  .gl > :not(.frog) { position: relative; z-index: 1; }
  .left { display: flex; flex-direction: column; min-height: 0;
          text-shadow: 0 0 2px rgba(0,0,0,calc(.7 * var(--sh))), 0 0 6px rgba(0,0,0,calc(.6 * var(--sh))), 0 2px 12px rgba(0,0,0,calc(.55 * var(--sh))), 0 4px 32px rgba(0,0,0,calc(.5 * var(--sh))); }
  .tm { font-size: 96px; font-weight: 500; line-height: .9; letter-spacing: -0.02em; }
  .dt { font-size: 18px; color: rgba(255,255,255,.92); margin-top: 8px; }
  .hours { display: flex; gap: 24px; margin-block: auto; }
  .hours div { display: flex; flex-direction: column; gap: 4px; }
  .hours .h { font-size: 16px; color: rgba(255,255,255,.92); }
  .hours .t { font-size: 20px; font-weight: 500; }
  .next-h { font-size: 16px; color: var(--sub); margin-bottom: 4px; }
  .ev { display: flex; gap: 16px; align-items: center; height: 72px; }
  .ev + .ev { border-top: 1px solid var(--line); }
  .day { width: 56px; height: 56px; border-radius: 16px; background: var(--well); display: flex; flex-direction: column;
         align-items: center; justify-content: center; flex: none; }
  .day b { font-size: 20px; font-weight: 600; line-height: 1; }
  .day span { font-size: 12px; color: var(--sub); text-transform: uppercase; letter-spacing: .06em; }
  .ev .what { font-size: 18px; font-weight: 500; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .ev .dots { display: flex; gap: 8px; margin-top: 4px; }
  .dot { width: 12px; height: 12px; border-radius: 100%; }
  .none { font-size: 16px; color: var(--sub); padding-top: 16px; }
  .totals { grid-column: 1 / 3; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .tot { border-radius: 24px; background: var(--well); border: 0; display: flex; align-items: center; gap: 16px; padding: 0 16px 0 8px;
         cursor: pointer; text-align: left; min-width: 0; }
  .tot .disc { width: 56px; height: 56px; border-radius: 100%; background: rgba(250,251,252,.05); display: grid; place-items: center; flex: none; }
  .tot .disc svg { width: 28px; height: 28px; }
  .tot .v { font-size: 32px; font-weight: 600; line-height: 1.1; white-space: nowrap; }
  .tot .l { font-size: 16px; color: rgba(255,255,255,.7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tot.on { background: var(--amber); }
  .tot.on .disc { background: var(--amber-disc); }
  .tot.alert { background: var(--alert); }
  .tot.alert .disc { background: rgba(0,0,0,.2); }
  .tot[disabled] { cursor: default; }
  .tot.calm .v { color: var(--soft); }
  .np { margin-block: auto; display: flex; align-items: center; gap: 16px; height: 96px; width: 100%; max-width: 440px; padding: 8px 24px 8px 8px;
        border-radius: 24px; border: 0; background: rgba(40,40,42,.72); text-align: left; cursor: pointer; text-shadow: none; }
  .np .thumb { width: 80px; height: 80px; border-radius: 16px; flex: none; background: var(--tile) center / cover no-repeat; }
  .np .npt { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .np .npk { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--amber); font-weight: 600;
             text-transform: uppercase; letter-spacing: .06em; }
  .np .npn { font-size: 22px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .np .npa { font-size: 16px; color: var(--soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .eq { display: inline-flex; align-items: flex-end; gap: 2px; width: 16px; height: 16px; flex: none; }
  .eq i { width: 4px; border-radius: 2px; background: currentColor; height: 40%; animation: eqb 1.4s ease-in-out infinite; }
  .eq i:nth-child(2) { height: 100%; animation-delay: -.5s; } .eq i:nth-child(3) { height: 65%; animation-delay: -.9s; }
  @keyframes eqb { 0%, 100% { height: 35%; } 50% { height: 100%; } }
  @media (prefers-reduced-motion: reduce) { .eq i { animation: none; } .tstat { transition: none; } }

  /* Tile screens */
  .ts { position: absolute; inset: 0; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
  .ts-h { height: 64px; display: flex; align-items: center; gap: 16px; flex: none; }
  .ts-h .t { font-size: 24px; font-weight: 600; }
  .ts-h .s { font-size: 16px; color: var(--sub); }
  .ts-h .grow { flex: 1; }
  .tl { background: var(--tile); border-radius: 24px; border: 0; text-align: left; padding: 12px 16px 12px 12px; display: flex;
        align-items: center; gap: 12px; cursor: pointer; min-width: 0; height: 72px; }
  .tl.on { background: var(--amber); }
  .tl.alert { background: var(--alert); cursor: default; height: auto; min-height: 96px; }
  .tl .disc { width: 48px; height: 48px; border-radius: 100%; background: rgba(250,251,252,.05); display: grid; place-items: center; flex: none; }
  .tl.on .disc { background: var(--amber-disc); }
  .tl.alert .disc { background: rgba(0,0,0,.2); }
  .tl .disc svg { width: 28px; height: 28px; }
  .tl .txt { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .tl .nm { font-size: 16px; font-weight: 600; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl .st { font-size: 16px; color: rgba(255,255,255,.7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl.lock { cursor: default; }
  .tl.lock .disc { position: relative; }
  .tl.lock .disc::after { content: ""; position: absolute; right: -2px; bottom: -2px; width: 16px; height: 16px; border-radius: 100%;
                          background: #fff; box-shadow: 0 0 0 3px var(--amber); }
  .glist { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--sub) transparent; padding-right: 8px;
           display: flex; flex-direction: column; gap: 8px; }
  /* Group heading as the dashboard's section_heading: name, line, count and a 32px Off disc on the right edge */
  .grp { display: flex; align-items: center; gap: 8px; height: 32px; flex: none; }
  .gitems + .grp { margin-top: 16px; }
  .grp .gn { font-size: 16px; font-weight: 600; }
  .grp .gl-line { flex: 1; height: 2px; border-radius: 1px; background: var(--line); margin: 0 8px; }
  .grp .gc { font-size: 12.5px; color: var(--sub); }
  .goff { width: 32px; height: 32px; border-radius: 100%; border: 0; padding: 0; background: var(--tile); color: var(--sub);
          display: grid; place-items: center; cursor: pointer; }
  .goff svg { width: 18px; height: 18px; }
  .goff.on { background: var(--amber); color: #fff; }
  .goff[disabled] { cursor: default; }
  .gitems { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; flex: none; }
  .empty { font-size: 18px; color: var(--sub); margin: auto; }

  /* Heating */
  .thermo-row { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; gap: 24px; }
  .tdisc { width: 80px; height: 80px; border-radius: 100%; border: 0; background: var(--tile); display: grid; place-items: center;
           cursor: pointer; padding: 0; flex: none; }
  .tdisc svg { width: 32px; height: 32px; }
  .tdisc[disabled] { opacity: .4; cursor: default; }
  .tstat { width: 360px; align-self: stretch; border-radius: 24px; flex: none; display: flex; flex-direction: column; align-items: center;
           justify-content: center; gap: 4px; transition: background-color .3s; }
  .tstat .tl1 { font-size: 16px; color: rgba(255,255,255,.8); }
  .tstat .tt { font-size: 80px; font-weight: 500; line-height: 1; letter-spacing: -0.02em; }
  .tstat .tsep { width: 96px; height: 2px; border-radius: 1px; background: rgba(255,255,255,.35); margin: 12px 0 8px; }
  .tstat .tnow { font-size: 18px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
  .tstat .tnow svg { width: 20px; height: 20px; }
  .menu { position: absolute; top: 88px; right: 16px; width: 288px; background: var(--tile); border-radius: 24px; padding: 8px;
          display: flex; flex-direction: column; gap: 4px; box-shadow: 0 12px 32px rgba(0,0,0,.5); z-index: 3; }
  .mopt { height: 64px; border-radius: 16px; border: 0; background: none; text-align: left; display: flex; align-items: center;
          justify-content: space-between; padding: 0 16px; cursor: pointer; }
  .mopt > span { display: flex; flex-direction: column; gap: 2px; }
  .mopt b { font-size: 18px; font-weight: 600; }
  .mopt span span { font-size: 14px; color: var(--sub); }
  .mopt.sel { background: var(--well); }
  .agrid { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; align-content: start; overflow-y: auto; }
`;

class ExpressiveKioskCard extends HTMLElement {
  static getStubConfig() {
    return { view: "glance" };
  }

  setConfig(config) {
    const view = config.view ?? "glance";
    if (!["glance", "lights", "sockets", "heating", "alerts"].includes(view)) throw new Error(`unknown view: ${view}`);
    this._config = {
      light_label: "light", socket_label: "socket", locked: [], alerts: [], calendars: [], areas: [], area_groups: {},
      paths: {}, weather: {}, media: {}, ...config, view,
      boost: { minutes: 60, temperature: 21, ...config.boost },
      frog: { fade: 0, size: 546, lift: 0, shadow: 1.2, ...config.frog },
    };
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" }).innerHTML = `<style>${CSS_TEXT}</style><ha-card></ha-card>`;
      this._card = this.shadowRoot.querySelector("ha-card");
      this._card.addEventListener("click", (e) => this._click(e));
    }
    this._menu = false;
    this._sig = null;
    this._events = null;
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first && this._config.view === "glance") this._loadEvents();
    const sig = this._signature();
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { columns: 12, rows: "auto" };
  }

  connectedCallback() {
    if (this._config?.view !== "glance") return;
    this._clock = setInterval(() => this._tick(), 15000);
    this._cal = setInterval(() => this._loadEvents(), CAL_REFRESH);
    if (this._hass && this._events) this._loadEvents();
  }

  disconnectedCallback() {
    clearInterval(this._clock);
    clearInterval(this._cal);
  }

  // ---- state ----

  _st(id) {
    return id ? this._hass?.states[id] : undefined;
  }

  // Only the entities this view shows; the card re-renders when one of them changes
  _watched() {
    const c = this._config;
    const ids = [c.climate];
    if (c.view === "glance") {
      ids.push(c.lights_count, c.sockets_count, c.weather.condition, c.weather.now, c.weather.hourly, c.media.player, c.media.now_playing,
        ...c.alerts.map((a) => a.entity));
      if (!c.lights_count) ids.push(...this._items("light").map((i) => i.id));
      if (!c.sockets_count) ids.push(...this._items("socket").map((i) => i.id));
    }
    if (c.view === "lights") ids.push(...this._items("light").map((i) => i.id));
    if (c.view === "sockets") ids.push(...this._items("socket").flatMap((i) => [i.id, i.power]));
    if (c.view === "alerts") ids.push(...c.alerts.flatMap((a) => [a.entity, ...(this._st(a.entity)?.attributes.entity_id ?? [])]));
    return ids.filter(Boolean);
  }

  _signature() {
    if (!this._hass) return "";
    return this._watched().map((id) => { const s = this._st(id); return s ? `${s.state}|${s.last_updated}` : "-"; }).join(",");
  }

  _area(id) {
    const e = this._hass.entities?.[id];
    if (!e) return null;
    return e.area_id ?? this._hass.devices?.[e.device_id]?.area_id ?? null;
  }

  _areaName(aid) {
    return this._hass.areas?.[aid]?.name ?? aid ?? "Other";
  }

  // Labelled lights or sockets with their area, display name and (sockets) power sensor
  _items(kind) {
    const h = this._hass;
    if (!h?.entities) return [];
    const label = kind === "light" ? this._config.light_label : this._config.socket_label;
    const domain = kind === "light" ? "light" : "switch";
    const out = [];
    for (const [id, e] of Object.entries(h.entities)) {
      if (!id.startsWith(`${domain}.`) || !e.labels?.includes(label) || e.hidden || !h.states[id]) continue;
      const area = this._area(id);
      out.push({ id, area, name: this._shortName(h.states[id].attributes.friendly_name ?? id, this._areaName(area)),
        power: kind === "socket" ? this._powerSensor(id) : null, locked: this._config.locked.includes(id) });
    }
    return out;
  }

  // "Lounge main sofa" → "Main sofa"; also drops the last word of a two-word area ("Bedroom ceiling light" in Rear bedroom)
  _shortName(name, area) {
    const words = area.toLowerCase().split(/\s+/);
    for (const p of [area.toLowerCase(), words.at(-1)]) {
      if (name.toLowerCase().startsWith(`${p} `) && name.length > p.length + 1) {
        const rest = name.slice(p.length + 1);
        return rest[0].toUpperCase() + rest.slice(1);
      }
    }
    return name;
  }

  _powerSensor(id) {
    const guess = `sensor.${id.split(".")[1]}_power`;
    if (this._hass.states[guess]) return guess;
    const dev = this._hass.entities[id]?.device_id;
    return Object.values(this._hass.entities).find((e) => e.device_id === dev && e.entity_id.startsWith("sensor.") &&
      this._hass.states[e.entity_id]?.attributes.device_class === "power")?.entity_id ?? null;
  }

  _groups(kind) {
    const items = this._items(kind);
    const order = this._config.areas;
    const byArea = new Map();
    for (const it of items) byArea.set(it.area, [...(byArea.get(it.area) ?? []), it]);
    const rank = (a) => (order.includes(a) ? order.indexOf(a) : order.length);
    return [...byArea.entries()]
      .map(([area, its]) => ({ area, name: this._areaName(area), items: its.sort((x, y) => x.name.localeCompare(y.name)) }))
      .sort((x, y) => rank(x.area) - rank(y.area) || x.name.localeCompare(y.name));
  }

  _isOn(id) {
    return this._st(id)?.state === "on";
  }

  _count(kind) {
    const sensor = kind === "light" ? this._config.lights_count : this._config.sockets_count;
    const s = this._st(sensor);
    if (s && !Number.isNaN(Number(s.state))) return Number(s.state);
    return this._items(kind).filter((i) => this._isOn(i.id)).length;
  }

  _watts(power) {
    const v = Number(this._st(power)?.state);
    return Number.isFinite(v) ? `${Math.round(v).toLocaleString("en-GB")} W` : null;
  }

  _activeAlerts() {
    return this._config.alerts.flatMap((a) => {
      const s = this._st(a.entity);
      if (!s || s.state === "unavailable" || s.state === "unknown") return [];
      const on = a.ok !== undefined ? s.state !== String(a.ok) : s.state === "on";
      if (!on) return [];
      const members = (s.attributes.entity_id ?? []).filter((m) => this._isOn(m)).map((m) => this._st(m).attributes.friendly_name ?? m);
      return [{ name: a.name ?? s.attributes.friendly_name ?? a.entity, detail: members.length ? members.join(", ") : (a.ok !== undefined ? s.state.replace(/_/g, " ") : "") }];
    });
  }

  // ---- actions ----

  _call(domain, service, data) {
    this._hass.callService(domain, service, data);
  }

  _navigate(path) {
    if (!path) return;
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  // Turn off what's on in these items: one call per area group that covers its area, the rest one by one
  _turnOff(kind, items) {
    const domain = kind === "light" ? "light" : "switch";
    const on = items.filter((i) => !i.locked && this._isOn(i.id));
    const groups = new Set();
    const singles = [];
    for (const it of on) {
      const g = kind === "light" ? this._config.area_groups[it.area] : null;
      if (g && this._st(g)) groups.add(g);
      else singles.push(it.id);
    }
    const ids = [...groups, ...singles];
    if (ids.length) this._call(domain, "turn_off", { entity_id: ids });
  }

  _climateMode() {
    const s = this._st(this._config.climate);
    if (!s) return null;
    return s.attributes.preset_mode === "boost" ? "boost" : s.state;
  }

  _modes() {
    const s = this._st(this._config.climate);
    const modes = [...(s?.attributes.hvac_modes ?? [])];
    if (this._hass.services?.hive?.boost_heating_on || s?.attributes.preset_modes?.includes("boost")) modes.splice(Math.max(modes.indexOf("off"), 0), 0, "boost");
    return modes;
  }

  _setMode(mode) {
    const id = this._config.climate;
    const hive = this._hass.services?.hive;
    const boosting = this._climateMode() === "boost";
    if (mode === "boost") {
      const b = this._config.boost;
      if (hive?.boost_heating_on) this._call("hive", "boost_heating_on", { entity_id: id, time_period: `${pad(Math.floor(b.minutes / 60))}:${pad(b.minutes % 60)}:00`, temperature: b.temperature });
      else this._call("climate", "set_preset_mode", { entity_id: id, preset_mode: "boost" });
      return;
    }
    if (boosting) {
      if (hive?.boost_heating_off) this._call("hive", "boost_heating_off", { entity_id: id });
      else this._call("climate", "set_preset_mode", { entity_id: id, preset_mode: "none" });
    }
    this._call("climate", "set_hvac_mode", { entity_id: id, hvac_mode: mode });
  }

  _click(e) {
    const el = e.target.closest("[data-go],[data-item],[data-act],[data-t],[data-mode]");
    if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return;
    const d = el.dataset;
    const wasMenu = this._menu;
    if (d.act !== "menu") this._menu = false;
    if (d.go) this._navigate(this._config.paths[d.go]);
    else if (d.item) this._call(d.item.split(".")[0], "toggle", { entity_id: d.item });
    else if (d.mode) this._setMode(d.mode);
    else if (d.t) {
      const s = this._st(this._config.climate);
      const a = s.attributes;
      const t = clamp(Number(a.temperature ?? 18) + Number(d.t), a.min_temp ?? 7, a.max_temp ?? 30);
      this._call("climate", "set_temperature", { entity_id: this._config.climate, temperature: t });
    } else if (d.act === "menu") this._menu = !this._menu;
    else if (d.act === "groupoff") this._turnOff(d.kind, this._items(d.kind).filter((i) => String(i.area) === d.area));
    else if (d.act === "kindoff") this._turnOff(d.kind, this._items(d.kind));
    else if (d.act === "np") this._call("switch", "turn_on", { entity_id: this._config.media.now_playing });
    if (wasMenu !== this._menu || d.mode) this._render();
  }

  // ---- calendar ----

  async _loadEvents() {
    if (!this._hass?.callApi || !this._config.calendars.length) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + CAL_DAYS * 86400000);
    const q = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
    const lists = await Promise.all(this._config.calendars.map((c) =>
      this._hass.callApi("GET", `calendars/${c.entity}?${q}`).then((evs) => evs.map((ev) => ({ ev, c }))).catch(() => [])));
    const today = new Date().toDateString();
    const byKey = new Map();
    for (const { ev, c } of lists.flat()) {
      const when = new Date(ev.start.date ? `${ev.start.date}T00:00:00` : ev.start.dateTime);
      const endAt = new Date(ev.end?.date ? `${ev.end.date}T00:00:00` : ev.end?.dateTime ?? when);
      if (endAt < new Date() && when.toDateString() !== today) continue;
      const summary = c.strip ? ev.summary.replace(new RegExp(c.strip, "ig"), "") : ev.summary;
      const color = Object.entries(c.colors ?? {}).find(([k]) => summary.toLowerCase().includes(k.toLowerCase()))?.[1];
      const key = `${when.toDateString()}|${c.entity}`;
      const row = byKey.get(key) ?? { when, parts: [], dots: [] };
      row.parts.push(summary.trim());
      if (color) row.dots.push(color);
      byKey.set(key, row);
    }
    this._events = [...byKey.values()].sort((a, b) => a.when - b.when).slice(0, EVENTS_SHOWN);
    this._render();
  }

  _tick() {
    const tm = this.shadowRoot.querySelector(".tm");
    const now = this._clockText();
    if (tm && tm.textContent !== now.time) this._render();
  }

  _clockText() {
    const d = new Date();
    return {
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      date: d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
    };
  }

  // ---- render ----

  _render() {
    if (!this._card || !this._hass) return;
    const v = this._config.view;
    const html = v === "glance" ? this._glance() : v === "lights" ? this._list("light", "Lights")
      : v === "sockets" ? this._list("socket", "Sockets") : v === "heating" ? this._heating() : this._alertsView();
    this._card.innerHTML = html;
  }

  _frog() {
    const s = this._st(this._config.weather.condition);
    if (!s) return "";
    const t = String(s.attributes.type || "").toUpperCase();
    const day = s.attributes.is_daytime !== false;
    let n;
    if (t.includes("THUNDER")) n = t.includes("HEAVY") ? "24" : "22";
    else if (t.includes("HAIL")) n = "19";
    else if (t === "RAIN_AND_SNOW") n = "20";
    else if (t === "BLOWING_SNOW") n = "16";
    else if (t.includes("SNOW")) n = /HEAVY|STORM/.test(t) ? "17" : /LIGHT|CHANCE/.test(t) ? "13" : "15";
    else if (t.includes("RAIN") || t.includes("SHOWER")) n = t.includes("HEAVY") ? "12" : /LIGHT|CHANCE|SCATTERED/.test(t) ? "10" : "11";
    else if (t.includes("WIND")) n = "25";
    else if (t.includes("FOG") || t.includes("HAZE")) n = "26";
    else n = { CLEAR: day ? "01" : "05", MOSTLY_CLEAR: day ? "02" : "06", PARTLY_CLOUDY: day ? "03" : "07",
      MOSTLY_CLOUDY: day ? "04" : "08", CLOUDY: "09" }[t] || (day ? "03" : "07");
    const list = SCENES[n];
    const seed = (new Date().toDateString() + n).split("").reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const [name, flag] = list[seed % list.length].split("|");
    const base = `${this._config.weather.frog_path ?? "/local/froggy/"}${n}-${name}`;
    const f = this._config.frog;
    const layers = (flag === "nomg" ? ["fg", "bg"] : ["fg", "mg", "bg"])
      .map((l) => `url(${base}_${l}.png) center bottom ${f.lift}px / ${f.size}px ${f.size}px no-repeat`);
    const bg = [...layers, `linear-gradient(to bottom, ${SKY[n][0]}, ${SKY[n][1]})`].join(", ");
    const mask = `linear-gradient(to right, #000 ${f.fade}%, transparent 100%)`;
    return `<div class="frog" style="background:${bg};-webkit-mask-image:${mask};mask-image:${mask}"></div>`;
  }

  _hours() {
    const w = this._config.weather;
    const nowT = Number(this._st(w.now)?.attributes.now_temp);
    const fc = this._st(w.hourly)?.attributes.forecast ?? [];
    const now = Date.now();
    const next = fc.filter((h) => new Date(h.dt).getTime() > now).slice(0, HOURS_SHOWN);
    const col = (h, t) => `<div><span class="h n">${h}</span><span class="t n">${Number.isFinite(t) ? Math.round(t) + "°" : "–"}</span></div>`;
    return `<div class="hours">${col("Now", nowT)}${next.map((h) => { const d = new Date(h.dt); return col(`${pad(d.getHours())}:00`, Number(h.t)); }).join("")}</div>`;
  }

  _nowPlaying() {
    const m = this._config.media;
    const p = this._st(m.player);
    if (!p || p.state !== "playing" || (m.now_playing && this._isOn(m.now_playing))) return null;
    const a = p.attributes;
    const title = a.media_title || a.media_album_name || "Playing";
    const by = [a.media_artist, a.media_album_name !== title ? a.media_album_name : null].filter(Boolean).join(" · ");
    const pic = a.entity_picture ? `style="background-image:url('${esc(this._hass.hassUrl ? this._hass.hassUrl(a.entity_picture) : a.entity_picture)}')"` : "";
    return `<button type="button" class="np" data-act="np" ${m.now_playing ? "" : "disabled"}><span class="thumb" ${pic}></span>
      <span class="npt"><span class="npk"><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>Now playing</span>
      <span class="npn">${esc(title)}</span><span class="npa">${esc(by)}</span></span></button>`;
  }

  _glance() {
    const c = this._config;
    const clock = this._clockText();
    const lo = this._count("light");
    const so = this._count("socket");
    const al = this._activeAlerts().length;
    const cl = this._st(c.climate);
    const mode = this._climateMode();
    const heatState = mode === "off" ? "Off" : cl?.attributes.hvac_action === "heating" ? "Heating" : "Idle";
    const cur = Number(cl?.attributes.current_temperature);
    const tot = (cls, icon, v, l, go) => `<button type="button" class="tot ${cls}" ${go ? `data-go="${go}"` : "disabled"}>
      <span class="disc">${IC[icon]}</span><span style="min-width:0"><div class="v n">${v}</div><div class="l">${l}</div></span></button>`;
    const events = this._events === null ? "" : this._events.length ? this._events.map((e) => `<div class="ev">
        <div class="day"><b class="n">${e.when.getDate()}</b><span>${e.when.toLocaleDateString("en-GB", { weekday: "short" })}</span></div>
        <div><div class="what">${esc(e.parts.join(" and "))}</div>${e.dots.length ? `<div class="dots">${e.dots.map((col) => `<span class="dot" style="background:${esc(col)}"></span>`).join("")}</div>` : ""}</div></div>`).join("")
      : `<div class="none">Nothing this week</div>`;
    return `<div class="gl">${this._frog()}
      <div class="left" style="--sh:${c.frog.shadow}">
        <div class="tm n">${clock.time}</div>
        <div class="dt">${clock.date}</div>
        ${this._nowPlaying() ?? this._hours()}
      </div>
      <div><div class="next-h">Coming up</div>${events}</div>
      <div class="totals">
        ${tot(lo ? "on" : "", "bulb", lo, "Lights", "lights")}
        ${tot(so ? "on" : "", "socket", so, "Sockets", "sockets")}
        ${tot("", "flame", Number.isFinite(cur) ? `${cur.toFixed(1)}°` : "–", heatState, "heating")}
        ${tot(al ? "alert" : "calm", "bell", al, "Alerts", al ? "alerts" : "")}
      </div></div>`;
  }

  _header(title, sub, right = "") {
    return `<div class="ts-h"><button type="button" class="btn64 round" data-go="glance" aria-label="Back">${IC.back}</button>
      <div><div class="t">${esc(title)}</div>${sub ? `<div class="s n">${esc(sub)}</div>` : ""}</div><span class="grow"></span>${right}</div>`;
  }

  _tile(it, kind) {
    const on = this._isOn(it.id);
    const w = it.power ? this._watts(it.power) : null;
    const st = it.locked ? `Always on${w ? ` · ${w}` : ""}` : on ? (kind === "socket" && w ? w : "On") : "Off";
    return `<button type="button" class="tl${on ? " on" : ""}${it.locked ? " lock" : ""}" data-item="${it.id}" ${it.locked ? 'aria-disabled="true"' : ""}>
      <span class="disc">${IC[kind === "light" ? "bulb" : "socket"]}</span><span class="txt"><span class="nm">${esc(it.name)}</span><span class="st n">${esc(st)}</span></span></button>`;
  }

  _list(kind, title) {
    const groups = this._groups(kind);
    const all = groups.flatMap((g) => g.items);
    const on = all.filter((i) => this._isOn(i.id));
    const offable = (its) => its.some((i) => !i.locked && this._isOn(i.id));
    let sub = `${on.length} of ${all.length} on`;
    if (kind === "socket") {
      const w = on.reduce((a, i) => a + (Number(this._st(i.power)?.state) || 0), 0);
      sub += ` · ${Math.round(w).toLocaleString("en-GB")} W now`;
    }
    const body = groups.map((g) => {
      const k = g.items.filter((i) => this._isOn(i.id)).length;
      const can = offable(g.items);
      return `<div class="grp"><span class="gn">${esc(g.name)}</span><span class="gl-line"></span><span class="gc n">${k ? `${k} of ${g.items.length} on` : "All off"}</span>
        <button type="button" class="goff${can ? " on" : ""}" data-act="groupoff" data-kind="${kind}" data-area="${esc(g.area)}" ${can ? "" : "disabled"} aria-label="Turn off ${esc(g.name)}">${IC.off}</button></div>
        <div class="gitems">${g.items.map((i) => this._tile(i, kind)).join("")}</div>`;
    }).join("");
    const can = offable(all);
    return `<div class="ts">${this._header(title, sub, `<button type="button" class="btn64${can ? " amber" : ""}" data-act="kindoff" data-kind="${kind}" ${can ? "" : "disabled"}>${IC.off}All off</button>`)}
      <div class="glist">${body || `<div class="empty">Nothing labelled “${esc(kind === "light" ? this._config.light_label : this._config.socket_label)}”</div>`}</div></div>`;
  }

  _col(t) {
    if (t <= STOPS[0][0]) return `rgb(${STOPS[0][1]})`;
    for (let i = 1; i < STOPS.length; i++) {
      if (t > STOPS[i][0]) continue;
      const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], f = (t - a) / (b - a);
      return `rgb(${ca.map((v, k) => Math.round(v + (cb[k] - v) * f))})`;
    }
    return `rgb(${STOPS.at(-1)[1]})`;
  }

  _heating() {
    const c = this._config;
    const s = this._st(c.climate);
    if (!s) return `<div class="ts">${this._header("Heating", "")}<div class="empty">${esc(c.climate ?? "No climate entity")} not found</div></div>`;
    const a = s.attributes;
    const mode = this._climateMode();
    const off = mode === "off";
    const heating = a.hvac_action === "heating";
    const target = Number(a.temperature);
    const cur = Number(a.current_temperature);
    const [label] = MODE_TEXT[mode] ?? [mode];
    const menu = this._menu ? `<div class="menu" role="menu">${this._modes().map((m) => {
      const [n, d] = MODE_TEXT[m] ?? [m, ""];
      const desc = m === "boost" ? `Heat for ${c.boost.minutes >= 60 && c.boost.minutes % 60 === 0 ? `${c.boost.minutes / 60} h` : `${c.boost.minutes} min`}` : d;
      return `<button type="button" class="mopt${m === mode ? " sel" : ""}" role="menuitemradio" aria-checked="${m === mode}" data-mode="${m}"><span><b>${n}</b><span>${desc}</span></span>${m === mode ? IC.check : ""}</button>`;
    }).join("")}</div>` : "";
    return `<div class="ts">${this._header("Heating", c.climate_name ?? a.friendly_name,
      `<button type="button" class="btn64${off ? "" : " amber"}" data-act="menu" aria-haspopup="menu" aria-expanded="${this._menu}">${IC.mode}${esc(label)}${IC.chev}</button>`)}
      <div class="thermo-row">
        <button type="button" class="tdisc" data-t="-0.5" aria-label="Lower target" ${off ? "disabled" : ""}>${IC.minus}</button>
        <div class="tstat" style="background:${off || !Number.isFinite(target) ? "var(--tile)" : this._col(target)}">
          <span class="tl1">${off ? "Heating off" : mode === "boost" ? "Boost" : "Target"}</span>
          <span class="tt n">${off ? "Off" : Number.isFinite(target) ? `${target.toFixed(1)}°` : "–"}</span>
          <span class="tsep"></span>
          <span class="tnow n">${heating ? IC.flame : ""}${Number.isFinite(cur) ? `${cur.toFixed(1)}°` : "–"} · ${heating ? "Heating" : "Idle"}</span>
        </div>
        <button type="button" class="tdisc" data-t="0.5" aria-label="Raise target" ${off ? "disabled" : ""}>${IC.plus}</button>
      </div>${menu}</div>`;
  }

  _alertsView() {
    const al = this._activeAlerts();
    return `<div class="ts">${this._header("Alerts", al.length ? `${al.length} need attention` : "All clear")}
      ${al.length ? `<div class="agrid">${al.map((a) => `<div class="tl alert"><span class="disc">${IC.alert}</span><span class="txt">
        <span class="nm" style="font-size:20px;white-space:normal">${esc(a.name)}</span>${a.detail ? `<span class="st" style="white-space:normal">${esc(a.detail)}</span>` : ""}</span></div>`).join("")}</div>`
        : `<div class="empty">No alerts</div>`}</div>`;
  }
}

if (!customElements.get("expressive-kiosk-card")) {
  console.info(`%c EXPRESSIVE-KIOSK-CARD %c ${VERSION} `, "background:#c97e0b;color:#fff;font-weight:600", "background:#28282a;color:#fff");
  customElements.define("expressive-kiosk-card", ExpressiveKioskCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "expressive-kiosk-card",
    name: "Expressive kiosk",
    description: "Small-screen kiosk: a Glance home with Froggy, calendar and totals, plus lights, sockets, heating and alerts screens",
    preview: false,
  });
}
