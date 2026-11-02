/*
 * expressive-kiosk-card
 * Copyright (c) 2026 Paul Owen
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * A small-screen kiosk (built for an Echo Show 5 at 788x394 CSS px): a side rail on every screen and one
 * card per view on a panel dashboard. Every view takes the same config apart from `view`.
 *
 *   type: custom:expressive-kiosk-card
 *   view: home                   # home | lights | sockets | heating | weather | camera | energy | alerts
 *   paths:                       # where the rail, the Lights/Sockets tabs and the alert pill go
 *     home: /kitchen-show/home
 *     lights: /kitchen-show/lights
 *     sockets: /kitchen-show/sockets
 *     heating: /kitchen-show/heating
 *     weather: /kitchen-show/weather
 *     camera: /kitchen-show/camera
 *     energy: /kitchen-show/energy
 *     alerts: /kitchen-show/alerts
 *   home:
 *     cycle: 20                  # seconds each Home panel shows: sun path, next hours, next up
 *   climate: climate.thermostat
 *   climate_name: Hallway thermostat
 *   boost:                       # hive.boost_heating_on when it exists, else the boost preset
 *     minutes: 60
 *     temperature: 21
 *   light_label: light           # lights and sockets are the labelled entities, grouped by area
 *   socket_label: socket
 *   areas:                       # optional order; other areas follow by name
 *     - living_room
 *     - study
 *   area_groups:                 # group light per area: its All lights slider (two or more lights), and what All off switches
 *     living_room: light.lounge
 *   locked:                      # shown, never switched (the rack)
 *     - switch.socket_11
 *   lights_count: sensor.count_lights_on      # optional; counted from the labels when left out
 *   sockets_count: sensor.count_sockets_on
 *   alerts:                      # each is active when its entity is `on`, or not `ok` when given
 *     - entity: binary_sensor.all_doors
 *       name: Door open
 *     - entity: sensor.garden_thermal_comfort_frost_risk
 *       name: Frost risk
 *       ok: no_risk
 *   sun:
 *     rising: sensor.home_sun_rising         # attributes yesterday / today / tomorrow
 *     setting: sensor.home_sun_setting
 *     latitude: 51.5                        # optional, defaults to Home Assistant's own
 *   weather:
 *     hourly: sensor.weather_hourly          # attribute forecast: [{dt, c, p, mm, ws, wg, wb, t}]
 *     five_day: sensor.weather_five_day      # attribute days: [{datetime, icon, temp, templow, precipitation, wind_speed, wind_bearing}]
 *     icon_path: /local/custom/weather/icons/
 *   calendars:
 *     - entity: calendar.home
 *     - entity: calendar.bins
 *       strip: " collection"
 *       night_before: Bin out tonight        # shown on Next up the day before
 *       colors:
 *         recycling: "rgb(46, 131, 191)"
 *   camera:
 *     entity: camera.front
 *     name: Front
 *     refresh: 5                             # seconds between snapshots; Live streams only on tap
 *     seen:                                  # Frigate's latest picture per object
 *       - entity: image.front_person
 *         name: Person
 *   energy:
 *     power: sensor.electricity_power        # kW or W
 *     electricity:
 *       cost_today: sensor.electricity_cost_today     # £ including the standing charge; its statistics give past days
 *       energy_today: sensor.electricity_import_today
 *       energy: sensor.electricity_import             # cumulative kWh statistics: past days and yesterday by hour
 *     gas:
 *       cost_today: sensor.gas_cost_today
 *       energy_today: sensor.gas_import_today
 *       energy: sensor.gas_import
 *     tariff:
 *       rate: 20.85                          # pence per kWh outside the bands
 *       bands:
 *         - name: Cheap
 *           from: "02:00"
 *           to: "05:00"
 *           rate: 15.36
 *         - name: Peak
 *           from: "16:00"
 *           to: "19:00"
 *           rate: 40.49
 *   media:
 *     player: media_player.echo_show_kitchen
 *     now_playing: switch.echo_show_now_playing # Kiosk Satellite's now-playing screen; the tile turns it on
 *
 * Lights use expressive-slider-card when it is installed, plain tiles until it loads.
 */

const VERSION = "0.3.0";
const EVENTS_SHOWN = 1;
const CAL_DAYS = 7;
const CAL_REFRESH = 15 * 60000;
const STATS_REFRESH = 30 * 60000;
const HOURS_PER_PAGE = 8;
const STRIP_HOURS = 7;
const RAIL = [["home", "home"], ["lights", "bulb"], ["heating", "flame"], ["weather", "cloud"], ["camera", "cam"], ["energy", "bolt"]];
const VIEWS = ["home", "lights", "sockets", "heating", "weather", "camera", "energy", "alerts"];
// Cool to warm, as expressive-schedule-card: frost blue, teal, green (18°), amber (19.5°), red above 21°.
const STOPS = [[10, [84, 116, 158]], [17, [62, 128, 150]], [18, [104, 150, 96]], [19, [196, 150, 40]], [19.5, [201, 126, 11]],
  [21, [226, 84, 22]], [25, [255, 69, 0]]];
const COMPASS = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
const CHEAP = "rgb(105, 178, 63)";
const STANDARD = "rgb(120, 122, 128)";
const DEAR = "rgb(226, 84, 22)";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pad = (n) => String(n).padStart(2, "0");
const fx = (n) => +n.toFixed(1);
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const minutes = (s) => { const [h, m] = String(s).split(":").map(Number); return h * 60 + (m || 0); };
const midnight = (d = new Date(), days = 0) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + days); return x; };
// Clear-sky colours by sun elevation (southern England): horizon, middle and top of the glow, its height (share of the sky), opacity
const SKY = [
  [-18, [28, 35, 64], [28, 35, 64], [28, 35, 64], 0.12, 0],
  [-15, [40, 50, 92], [32, 40, 74], [28, 35, 64], 0.22, 0.35],
  [-12, [56, 72, 124], [40, 52, 94], [30, 38, 70], 0.36, 0.5],
  [-9, [96, 92, 142], [58, 74, 124], [36, 46, 82], 0.52, 0.6],
  [-6, [176, 112, 132], [88, 98, 148], [46, 60, 102], 0.68, 0.68],
  [-3, [228, 132, 94], [172, 116, 140], [70, 86, 136], 0.84, 0.72],
  [0, [245, 160, 80], [212, 142, 120], [100, 120, 165], 1, 0.72],
  [3, [248, 190, 110], [204, 172, 150], [120, 145, 185], 1, 0.5],
  [6, [245, 210, 150], [184, 182, 170], [130, 155, 190], 1, 0.4],
  [10, [236, 206, 160], [150, 172, 198], [80, 120, 182], 1, 0.42],
  [20, [170, 198, 222], [100, 150, 210], [56, 108, 190], 1, 0.48],
  [40, [150, 190, 226], [88, 144, 214], [46, 100, 192], 1, 0.5],
];
const sky = (e) => {
  const last = SKY[SKY.length - 1];
  if (e <= SKY[0][0]) return { c: SKY[0].slice(1, 4), h: SKY[0][4], a: 0 };
  if (e >= last[0]) return { c: last.slice(1, 4), h: 1, a: last[5] };
  const i = SKY.findIndex((r) => r[0] > e), p = SKY[i - 1], q = SKY[i], t = (e - p[0]) / (q[0] - p[0]);
  const mix = (u, v) => u.map((n, j) => Math.round(n + (v[j] - n) * t));
  return { c: [1, 2, 3].map((j) => mix(p[j], q[j])), h: p[4] + (q[4] - p[4]) * t, a: p[5] + (q[5] - p[5]) * t };
};
// warm bloom over the sun: full through twilight and golden hour, faint by midday
const warmth = (e) => e < 6 ? 1 : e > 20 ? 0.25 : 1 - 0.75 * (e - 6) / 14;
const RAD = Math.PI / 180;
// Sun elevation in degrees, minutes from local midnight; solar noon taken from the sunrise and sunset sensors
const solar = (rise, set, lat) => {
  const n = Math.round((midnight(rise) - new Date(rise.getFullYear(), 0, 0)) / 864e5);
  const dec = 23.44 * Math.sin(2 * Math.PI * (284 + n) / 365) * RAD, phi = lat * RAD;
  const mins = (d) => (d - midnight(rise)) / 6e4, noon = (mins(rise) + mins(set)) / 2;
  const elev = (m) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos((m - noon) / 4 * RAD)) / RAD;
  return { noon, elev, rise: mins(rise), set: mins(set), peak: 90 - Math.abs(lat) + 23.44 + 0.833 };
};
const SUN_W = 644, SUN_H = 150, SUN_HZ = 104, SUN_BOTTOM = 28; // horizon sits SUN_BOTTOM + SUN_H - SUN_HZ above the bottom
const money = (v) => (!Number.isFinite(v) ? "–" : v < 1 ? `${Math.round(v * 100)}p` : `£${v.toFixed(2)}`);
const kwh = (v) => (!Number.isFinite(v) ? "–" : v === 0 ? "0" : v >= 10 ? v.toFixed(0) : v.toFixed(1));

const SVG = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const IC = {
  home: SVG('<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>'),
  bulb: SVG('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>'),
  socket: SVG('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9v3M15 9v3M12 15v2"/>'),
  flame: SVG('<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-8z"/>'),
  cloud: SVG('<path d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>'),
  cam: SVG('<rect x="3" y="7" width="13" height="10" rx="3"/><path d="m16 11 5-3v8l-5-3"/>'),
  bolt: SVG('<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>'),
  alert: SVG('<path d="M12 4 2 20h20z"/><path d="M12 10v4M12 17v.5"/>'),
  off: SVG('<path d="M12 3v8"/><path d="M7 6a7 7 0 1 0 10 0"/>'),
  minus: SVG('<path d="M5 12h14"/>'),
  plus: SVG('<path d="M5 12h14M12 5v14"/>'),
  mode: SVG('<path d="M4 12a8 8 0 0 1 14-5M20 12a8 8 0 0 1-14 5"/><path d="M18 3v4h-4M6 21v-4h4"/>'),
  chev: SVG('<path d="M7 10l5 5 5-5"/>'),
  check: SVG('<path d="M5 12l5 5 9-10"/>'),
};

const MODE_TEXT = {
  auto: ["Auto", "Follow the schedule"],
  heat: ["Heat", "Hold the target"],
  boost: ["Boost", "Heat for a while"],
  off: ["Off", "Frost protection only"],
  cool: ["Cool", "Hold the target"],
  heat_cool: ["Heat/cool", "Keep within the range"],
};

// Slider cards on the Lights screen, on the Show's type scale
const SLIDER_STYLES = { name: { size: 16, weight: 600 }, value: { size: 16, weight: 400, color: "var(--gray600, #c8c9cb)" }, bubble: { size: 16 },
  card: { background: "transparent" }, track: { tile: "var(--gray000, #3a3b3d)" } };
const ALL_STYLES = { ...SLIDER_STYLES, card: { background: "transparent", "border-bottom": "2px solid color-mix(in srgb, var(--primary-text-color) 10%, transparent) !important",
  "padding-bottom": "16px !important", "margin-bottom": "8px", "border-radius": "0 !important" } };

const CSS_TEXT = `
  :host { display: block; height: 100vh; --amber: rgb(201, 126, 11); --amber-disc: rgb(181, 114, 10); --alert: rgb(255, 60, 10);
          --tile: var(--gray000, #3a3b3d); --well: var(--gray100, #353637); --line: var(--gray200, #404142);
          --sub: var(--gray500, #939496); --soft: var(--gray600, #c8c9cb); --ground: var(--popupBG, #28282a);
          --tab-green: rgb(90, 125, 77); --rain: #4ea8ee; --temp: #f0a04b; --wind: #7fb0c6;
          /* type scale: weights 400 and 600, 500 only for the clock and the thermostat numeral */
          --fs-axis: 14px; --fs-text: 16px; --fs-value: 20px; --fs-title: 24px; --fs-big: 32px; --fs-display: 72px; --fs-clock: 144px; }
  ha-card { height: 100%; position: relative; overflow: hidden; border: 0; border-radius: 0; background: var(--ground); display: flex;
            color: #fff; font-family: var(--primary-font-family, Montserrat, sans-serif); user-select: none; -webkit-user-select: none; }
  button { font: inherit; color: inherit; -webkit-tap-highlight-color: transparent; }
  button:focus-visible { outline: 2px solid var(--soft); outline-offset: 2px; }
  svg { width: 24px; height: 24px; flex: none; }
  .n { font-variant-numeric: tabular-nums; }
  .grow { flex: 1; }

  .rail { width: 80px; flex: none; background: var(--well); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
  .rb { position: relative; width: 56px; height: 56px; border-radius: 18px; border: 0; background: none; display: grid; place-items: center;
        cursor: pointer; color: var(--sub); padding: 0; }
  .rb.sel { background: var(--tile); color: #fff; }
  .rb.heat { color: var(--amber); }
  .rb svg { width: 28px; height: 28px; }
  .rb .bd { position: absolute; top: 2px; right: 2px; min-width: 20px; height: 20px; border-radius: 10px; background: var(--amber); color: #fff;
            font-size: var(--fs-axis); font-weight: 600; display: grid; place-items: center; padding: 0 5px; }
  .main { position: relative; flex: 1; min-width: 0; }

  .btn64 { height: 64px; border-radius: 32px; border: 0; padding: 0 24px; background: var(--tile); font-size: var(--fs-text); font-weight: 600;
           display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; flex: none; }
  .btn64.amber { background: var(--amber); }
  .btn64[disabled] { opacity: .45; cursor: default; }
  .btn64 svg { width: 26px; height: 26px; }
  .ts { position: absolute; inset: 0; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .ts-h { height: 64px; display: flex; align-items: center; gap: 16px; flex: none; }
  .ts-h .t { font-size: var(--fs-title); font-weight: 600; line-height: 1.2; }
  .ts-h .s { font-size: var(--fs-text); color: var(--sub); }
  .tabs { display: flex; gap: 4px; background: var(--well); border-radius: 32px; padding: 4px; }
  .tab { height: 56px; border-radius: 28px; border: 0; background: none; padding: 0 20px; font-size: var(--fs-text); font-weight: 600; color: var(--sub); cursor: pointer; }
  .tab.sel { background: var(--tab-green); color: #fff; }
  .empty { font-size: var(--fs-text); color: var(--sub); margin: auto; }

  /* Home */
  .hm { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; padding-top: 40px; }
  .tm, .dt { position: relative; }
  .glow { position: absolute; left: 0; right: 0; pointer-events: none; }
  .tm { font-size: var(--fs-clock); font-weight: 500; line-height: .9; letter-spacing: -0.02em; }
  .dt { font-size: var(--fs-title); color: var(--soft); margin-top: 16px; }
  .cycwrap { position: absolute; left: 0; right: 0; bottom: 0; height: 190px; border: 0; padding: 0; background: none; cursor: pointer; }
  .cyc { position: absolute; inset: 0; opacity: 0; transition: opacity .8s ease; }
  .cyc.on { opacity: 1; }
  .cdots { position: absolute; left: 0; right: 0; bottom: 12px; display: flex; justify-content: center; gap: 8px; pointer-events: none; }
  .cdots i { width: 8px; height: 8px; border-radius: 100%; background: var(--line); transition: background-color .8s; }
  .cdots i.on { background: var(--sub); }
  .sunpath { position: absolute; left: 32px; right: 32px; bottom: 28px; height: 150px; width: calc(100% - 64px); }
  .sunpath text, .chart text, .echart text { font-family: inherit; }
  .hstrip { position: absolute; left: 32px; right: 32px; bottom: 36px; display: grid; grid-template-columns: repeat(${STRIP_HOURS}, 1fr); }
  .hstrip div { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .hstrip span { font-size: var(--fs-text); color: var(--sub); }
  .hstrip img { width: 40px; height: 40px; }
  .hstrip b { font-size: var(--fs-value); font-weight: 600; }
  .hstrip em { font-style: normal; font-size: var(--fs-axis); color: var(--rain); height: 17px; }
  .nxt { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); display: flex; align-items: center; gap: 16px; max-width: calc(100% - 64px);
         background: var(--well); border-radius: 24px; padding: 12px 24px 12px 12px; text-align: left; }
  .nxt .nd { width: 64px; height: 64px; border-radius: 16px; background: var(--tile); display: flex; flex-direction: column; align-items: center; justify-content: center; flex: none; }
  .nxt .nd b { font-size: var(--fs-title); font-weight: 600; line-height: 1; }
  .nxt .nd span { font-size: var(--fs-axis); color: var(--sub); text-transform: uppercase; letter-spacing: .06em; }
  .nxt .nt { font-size: var(--fs-value); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nxt .ns { font-size: var(--fs-text); color: var(--sub); display: flex; align-items: center; gap: 6px; }
  .dot { width: 12px; height: 12px; border-radius: 100%; display: inline-block; flex: none; }
  .apill { position: absolute; top: 16px; right: 16px; height: 48px; border-radius: 24px; border: 0; background: var(--alert); padding: 0 18px 0 12px;
           display: inline-flex; align-items: center; gap: 8px; font-size: var(--fs-text); font-weight: 600; cursor: pointer; z-index: 2; }
  .np { position: absolute; left: 50%; bottom: 32px; transform: translateX(-50%); display: flex; align-items: center; gap: 16px; height: 96px;
        width: min(440px, calc(100% - 64px)); padding: 8px 24px 8px 8px; border-radius: 24px; border: 0; background: var(--well); text-align: left; cursor: pointer; }
  .np .thumb { width: 80px; height: 80px; border-radius: 16px; flex: none; background: var(--tile) center / cover no-repeat; }
  .np .npt { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .np .npk { display: inline-flex; align-items: center; gap: 8px; font-size: var(--fs-axis); color: var(--amber); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
  .np .npn { font-size: var(--fs-value); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .np .npa { font-size: var(--fs-text); color: var(--soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .eq { display: inline-flex; align-items: flex-end; gap: 2px; width: 16px; height: 16px; flex: none; }
  .eq i { width: 4px; border-radius: 2px; background: currentColor; height: 40%; animation: eqb 1.4s ease-in-out infinite; }
  .eq i:nth-child(2) { height: 100%; animation-delay: -.5s; } .eq i:nth-child(3) { height: 65%; animation-delay: -.9s; }
  @keyframes eqb { 0%, 100% { height: 35%; } 50% { height: 100%; } }
  @media (prefers-reduced-motion: reduce) { .eq i { animation: none; } .cyc, .cdots i, .tstat { transition: none; } }

  /* Lights and sockets */
  .glist { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--sub) transparent; padding-right: 8px;
           display: flex; flex-direction: column; gap: 8px; }
  .grp { display: flex; align-items: center; gap: 8px; height: 32px; flex: none; }
  .gitems + .grp { margin-top: 16px; }
  .grp .gn { font-size: var(--fs-text); font-weight: 600; }
  .grp .gl-line { flex: 1; height: 2px; border-radius: 1px; background: var(--line); margin: 0 8px; }
  .grp .gc { font-size: var(--fs-text); color: var(--sub); }
  .gitems { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; flex: none; }
  .gitems.sliders { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 16px; }
  .gitems .wide { grid-column: 1 / -1; }
  .tl { background: var(--tile); border-radius: 24px; border: 0; text-align: left; padding: 12px 16px 12px 12px; display: flex;
        align-items: center; gap: 12px; cursor: pointer; min-width: 0; height: 72px; }
  .tl.on { background: var(--amber); }
  .tl.alert { background: var(--alert); cursor: default; height: auto; min-height: 96px; }
  .tl .disc { position: relative; width: 48px; height: 48px; border-radius: 100%; background: rgba(250,251,252,.05); display: grid; place-items: center; flex: none; }
  .tl.on .disc { background: var(--amber-disc); }
  .tl.alert .disc { background: rgba(0,0,0,.2); }
  .tl .disc svg { width: 28px; height: 28px; }
  .tl .txt { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .tl .nm { font-size: var(--fs-text); font-weight: 600; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl .st { font-size: var(--fs-text); color: rgba(255,255,255,.7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl.lock { cursor: default; }
  .tl.lock .disc::after { content: ""; position: absolute; right: -2px; bottom: -2px; width: 16px; height: 16px; border-radius: 100%;
                          background: #fff; box-shadow: 0 0 0 3px var(--amber); }

  /* Heating */
  .thermo-row { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; gap: 24px; }
  .tdisc { width: 80px; height: 80px; border-radius: 100%; border: 0; background: var(--tile); display: grid; place-items: center;
           cursor: pointer; padding: 0; flex: none; }
  .tdisc svg { width: 32px; height: 32px; }
  .tdisc[disabled] { opacity: .4; cursor: default; }
  .tstat { width: 360px; align-self: stretch; border-radius: 24px; flex: none; display: flex; flex-direction: column; align-items: center;
           justify-content: center; gap: 4px; transition: background-color .3s; }
  .tstat .tl1 { font-size: var(--fs-text); color: rgba(255,255,255,.8); }
  .tstat .tt { font-size: var(--fs-display); font-weight: 500; line-height: 1; letter-spacing: -0.02em; }
  .tstat .tsep { width: 96px; height: 2px; border-radius: 1px; background: rgba(255,255,255,.35); margin: 12px 0 8px; }
  .tstat .tnow { font-size: var(--fs-value); font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
  .tstat .tnow svg { width: 20px; height: 20px; }
  .menu { position: absolute; top: 88px; right: 16px; width: 288px; background: var(--tile); border-radius: 24px; padding: 8px;
          display: flex; flex-direction: column; gap: 4px; box-shadow: 0 12px 32px rgba(0,0,0,.5); z-index: 3; }
  .mopt { height: 64px; border-radius: 16px; border: 0; background: none; text-align: left; display: flex; align-items: center;
          justify-content: space-between; padding: 0 16px; cursor: pointer; }
  .mopt > span { display: flex; flex-direction: column; gap: 2px; }
  .mopt b { font-size: var(--fs-text); font-weight: 600; }
  .mopt span span { font-size: var(--fs-text); color: var(--sub); }
  .mopt.sel { background: var(--well); }

  /* Weather */
  .wx { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; touch-action: pan-y; }
  .wx .chart { display: block; width: 100%; height: auto; flex: 1; min-height: 0; }
  .wfoot { display: flex; align-items: center; justify-content: space-between; height: 16px; font-size: var(--fs-axis); color: var(--sub); flex: none; }
  .pdots { display: flex; gap: 8px; }
  .pdots button { width: 12px; height: 12px; border-radius: 100%; border: 0; padding: 0; background: var(--line); cursor: pointer; }
  .pdots button.sel { background: var(--soft); }
  .drows { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
  .drow { flex: 1; background: var(--well); border-radius: 18px; display: grid; grid-template-columns: 72px 40px 1fr 72px 84px; align-items: center; gap: 10px; padding: 0 14px; }
  .drow.today { background: var(--tile); }
  .drow .dn { font-size: var(--fs-text); font-weight: 600; }
  .drow img { width: 40px; height: 40px; }
  .range { position: relative; height: 8px; border-radius: 4px; background: var(--line); margin-top: 18px; }
  .range i { position: absolute; top: 0; bottom: 0; border-radius: 4px; background: linear-gradient(to right, var(--wind), var(--temp)); }
  .range b, .range em { position: absolute; top: -24px; font-size: var(--fs-text); font-style: normal; }
  .range b { font-weight: 600; }
  .range em { color: var(--sub); }
  .drow .rn { font-size: var(--fs-text); color: var(--rain); text-align: right; }
  .drow .wd { font-size: var(--fs-text); color: var(--wind); display: inline-flex; gap: 6px; align-items: center; justify-content: flex-end; }
  .drow .wd svg { width: 16px; height: 16px; }

  /* Camera */
  .snap { position: absolute; inset: 0; background: #111; }
  .snap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ctop { position: absolute; left: 16px; right: 16px; top: 16px; display: flex; gap: 12px; align-items: center; }
  .ctop .t { font-size: var(--fs-title); font-weight: 600; text-shadow: 0 1px 8px rgba(0,0,0,.7); }
  .pill { height: 48px; border-radius: 24px; border: 0; background: rgba(40,40,42,.82); padding: 0 18px; font-size: var(--fs-text); font-weight: 600;
          display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
  .pill .rec { width: 10px; height: 10px; border-radius: 100%; background: var(--sub); }
  .pill.on .rec { background: var(--alert); }
  .chips { position: absolute; left: 16px; right: 16px; bottom: 16px; display: flex; gap: 8px; }
  .chip { height: 56px; border-radius: 28px; background: rgba(40,40,42,.85); border: 0; display: inline-flex; align-items: center; gap: 10px;
          padding: 0 16px 0 6px; font-size: var(--fs-text); cursor: pointer; white-space: nowrap; }
  .chip.sel { background: var(--tile); }
  .chip .th { width: 44px; height: 44px; border-radius: 100%; background: var(--tile) center / cover no-repeat; flex: none; }
  .chip b { font-weight: 600; }

  /* Energy */
  .etab { display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr; flex: none; align-items: center; }
  .etab > div { padding: 6px 0; min-width: 0; border-bottom: 2px solid var(--line); }
  .etab > div.last { border-bottom: 0; }
  .etab .hd { font-size: var(--fs-text); color: var(--sub); padding-top: 0; }
  .etab .rl { font-size: var(--fs-text); font-weight: 600; }
  .etab .c { font-size: var(--fs-value); font-weight: 600; line-height: 24px; }
  .everd { font-size: var(--fs-text); color: var(--sub); flex: none; }
  .echart { display: block; width: 100%; height: 88px; flex: none; }

  .agrid { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; align-content: start; overflow-y: auto; }
`;

class ExpressiveKioskCard extends HTMLElement {
  static getStubConfig() {
    return { view: "home" };
  }

  setConfig(config) {
    const view = config.view ?? "home";
    if (!VIEWS.includes(view)) throw new Error(`unknown view: ${view}`);
    this._config = {
      light_label: "light", socket_label: "socket", locked: [], alerts: [], calendars: [], areas: [], area_groups: {},
      paths: {}, sun: {}, media: {}, camera: {}, energy: {}, ...config, view,
      home: { cycle: 20, ...config.home },
      weather: { icon_path: "/local/custom/weather/icons/", ...config.weather },
      boost: { minutes: 60, temperature: 21, ...config.boost },
    };
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" }).innerHTML = `<style>${CSS_TEXT}</style><ha-card></ha-card>`;
      this._card = this.shadowRoot.querySelector("ha-card");
      this._card.addEventListener("click", (e) => this._click(e));
      this._card.addEventListener("pointerdown", (e) => { this._swipe = e.target.closest(".wx") ? e.clientX : null; });
      this._card.addEventListener("pointerup", (e) => this._swiped(e));
    }
    this._menu = false;
    this._sig = null;
    this._events = null;
    this._stats = null;
    this._cyc = 0;
    this._page = 0;
    this._wtab = "hours";
    this._unit = "gbp";
    this._live = false;
    this._seen = null;
    this._sliders = new Map();
    if (view === "lights" && !customElements.get("expressive-slider-card")) {
      customElements.whenDefined("expressive-slider-card").then(() => { this._sig = null; this._render(); });
    }
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._load();
    for (const el of this._sliders.values()) el.hass = hass;
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
    const v = this._config?.view;
    this._timers = [setInterval(() => this._tick(), 1000)];
    if (v === "home") this._timers.push(setInterval(() => this._loadEvents(), CAL_REFRESH));
    if (v === "energy") this._timers.push(setInterval(() => this._loadStats(), STATS_REFRESH));
    if (v === "camera") this._timers.push(setInterval(() => this._refreshSnap(), Math.max(1, Number(this._config.camera.refresh) || 5) * 1000));
    this._cycAt = Date.now();
    if (this._hass) this._load();
  }

  disconnectedCallback() {
    (this._timers ?? []).forEach(clearInterval);
    this._timers = [];
    this._live = false;
    const img = this.shadowRoot?.querySelector(".snap img");
    if (img) img.removeAttribute("src"); // ends a live MJPEG stream
  }

  _load() {
    if (this._config.view === "home") this._loadEvents();
    if (this._config.view === "energy") this._loadStats();
  }

  // ---- state ----

  _st(id) {
    return id ? this._hass?.states[id] : undefined;
  }

  // Only the entities this view shows; the card re-renders when one of them changes
  _watched() {
    const c = this._config;
    const ids = [c.lights_count, c.climate];
    if (!c.lights_count) ids.push(...this._items("light").map((i) => i.id));
    const v = c.view;
    if (v === "home") ids.push(c.sun.rising, c.sun.setting, c.weather.hourly, c.media.player, c.media.now_playing, ...c.alerts.map((a) => a.entity));
    if (v === "lights") ids.push(...this._items("light").map((i) => i.id));
    if (v === "sockets") ids.push(...this._items("socket").flatMap((i) => [i.id, i.power]));
    if (v === "weather") ids.push(c.weather.hourly, c.weather.five_day, c.sun.rising, c.sun.setting);
    if (v === "camera") ids.push(...(c.camera.seen ?? []).map((s) => s.entity));
    if (v === "energy") ids.push(c.energy.power, ...["electricity", "gas"].flatMap((k) => [c.energy[k]?.cost_today, c.energy[k]?.energy_today]));
    if (v === "alerts") ids.push(...c.alerts.flatMap((a) => [a.entity, ...(this._st(a.entity)?.attributes.entity_id ?? [])]));
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
      .map(([area, its]) => ({ area, name: this._areaName(area), items: its.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true })) }))
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

  _num(id) {
    const s = this._st(id);
    const v = Number(s?.state);
    return s && Number.isFinite(v) ? v : NaN;
  }

  _watts(power) {
    const v = this._num(power);
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

  _url(path) {
    return path && this._hass?.hassUrl ? this._hass.hassUrl(path) : path;
  }

  // Sun times from sensors with yesterday / today / tomorrow attributes
  _sunDays() {
    const r = this._st(this._config.sun.rising)?.attributes, s = this._st(this._config.sun.setting)?.attributes;
    if (!r || !s) return [];
    return ["yesterday", "today", "tomorrow"].filter((k) => r[k] && s[k]).map((k) => [new Date(r[k]), new Date(s[k])]);
  }

  _isDay(d, days) {
    if (!days.length) return d.getHours() >= 7 && d.getHours() < 19;
    return days.some(([a, b]) => d >= a && d < b);
  }

  _icon(cond, day) {
    const c = String(cond || "cloudy").replace("-night", "");
    return `${this._config.weather.icon_path}icon_${c}${day ? "" : "_night"}.svg`;
  }

  _hourly() {
    const now = Date.now();
    return (this._st(this._config.weather.hourly)?.attributes.forecast ?? [])
      .map((h) => ({ ...h, d: new Date(h.dt) })).filter((h) => h.d.getTime() + 3600000 > now);
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
    let redraw = false;
    if (d.act !== "menu") this._menu = false;
    if (d.go) this._navigate(this._config.paths[d.go]);
    else if (d.item) this._call(d.item.split(".")[0], "toggle", { entity_id: d.item });
    else if (d.mode) { this._setMode(d.mode); redraw = true; }
    else if (d.t) {
      const s = this._st(this._config.climate);
      const a = s.attributes;
      const t = clamp(Number(a.temperature ?? 18) + Number(d.t), a.min_temp ?? 7, a.max_temp ?? 30);
      this._call("climate", "set_temperature", { entity_id: this._config.climate, temperature: t });
    } else if (d.act === "menu") this._menu = !this._menu;
    else if (d.act === "kindoff") this._turnOff(d.kind, this._items(d.kind));
    else if (d.act === "np") this._call("switch", "turn_on", { entity_id: this._config.media.now_playing });
    else if (d.act === "cycle") this._advance();
    else if (d.act === "wtab") { this._wtab = d.tab; this._page = 0; redraw = true; }
    else if (d.act === "page") { this._page = Number(d.page); redraw = true; }
    else if (d.act === "unit") { this._unit = d.unit; redraw = true; }
    else if (d.act === "live") { this._live = !this._live; this._seen = null; redraw = true; }
    else if (d.act === "seen") { this._seen = this._seen === d.entity ? null : d.entity; this._live = false; redraw = true; }
    if (redraw || wasMenu !== this._menu) this._render();
  }

  _swiped(e) {
    if (this._swipe == null) return;
    const dx = e.clientX - this._swipe;
    this._swipe = null;
    if (this._config.view !== "weather" || this._wtab !== "hours" || Math.abs(dx) < 40) return;
    const pages = Math.max(1, Math.ceil(this._hourly().length / HOURS_PER_PAGE));
    this._page = clamp(this._page + (dx < 0 ? 1 : -1), 0, pages - 1);
    this._render();
  }

  // ---- timers ----

  _tick() {
    if (!this._config || !this._hass) return;
    const tm =this.shadowRoot?.querySelector(".tm");
    if (tm && tm.textContent !== hhmm(new Date())) this._render(); // a new minute also moves the sun marker
    const secs = Number(this._config.home.cycle) || 20;
    if (this._config.view === "home" && Date.now() - (this._cycAt ?? 0) >= secs * 1000) this._advance();
  }

  // Next Home panel: swap classes in place so the crossfade runs
  _advance() {
    const panels = this.shadowRoot.querySelectorAll(".cyc");
    this._cycAt = Date.now();
    if (!panels.length) return;
    this._cyc = (this._cyc + 1) % panels.length;
    panels.forEach((p, i) => p.classList.toggle("on", i === this._cyc));
    this.shadowRoot.querySelectorAll(".cdots i").forEach((p, i) => p.classList.toggle("on", i === this._cyc));
  }

  _refreshSnap() {
    if (this._live || this._seen) return;
    const img = this.shadowRoot.querySelector(".snap img");
    const pic = this._st(this._config.camera.entity)?.attributes.entity_picture; // the token rotates, so read it each time
    if (img && pic) img.src = `${this._url(pic)}${pic.includes("?") ? "&" : "?"}_=${Date.now()}`;
  }

  // ---- calendar ----

  async _loadEvents() {
    if (!this._hass?.callApi || !this._config.calendars.length) return;
    const start = midnight();
    const end = midnight(start, CAL_DAYS);
    const q = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
    const lists = await Promise.all(this._config.calendars.map((c) =>
      this._hass.callApi("GET", `calendars/${c.entity}?${q}`).then((evs) => evs.map((ev) => ({ ev, c }))).catch(() => [])));
    const byKey = new Map();
    for (const { ev, c } of lists.flat()) {
      const when = new Date(ev.start.date ? `${ev.start.date}T00:00:00` : ev.start.dateTime);
      const endAt = new Date(ev.end?.date ? `${ev.end.date}T00:00:00` : ev.end?.dateTime ?? when);
      if (endAt <= new Date()) continue;
      const summary = c.strip ? ev.summary.replace(new RegExp(c.strip, "ig"), "") : ev.summary;
      const color = Object.entries(c.colors ?? {}).find(([k]) => summary.toLowerCase().includes(k.toLowerCase()))?.[1];
      const key = `${when.toDateString()}|${c.entity}`;
      const row = byKey.get(key) ?? { when, allDay: !!ev.start.date, parts: [], dots: [], night: c.night_before };
      row.parts.push(summary.trim());
      if (color) row.dots.push(color);
      byKey.set(key, row);
    }
    this._events = [...byKey.values()].sort((a, b) => a.when - b.when).slice(0, EVENTS_SHOWN);
    this._render();
  }

  // ---- energy statistics: yesterday and the last 7 days by day, yesterday by hour ----

  async _loadStats() {
    const e = this._config.energy;
    if (!this._hass?.callWS) return;
    const ids = ["electricity", "gas"].flatMap((k) => [e[k]?.cost_today, e[k]?.energy]).filter(Boolean);
    if (!ids.length) return;
    const today = midnight();
    const ask = (start, period, statistic_ids) => this._hass.callWS({ type: "recorder/statistics_during_period", start_time: start.toISOString(),
      end_time: today.toISOString(), statistic_ids, period, types: ["change"] }).catch(() => ({}));
    const [days, hours] = await Promise.all([ask(midnight(today, -7), "day", ids), e.electricity?.energy ? ask(midnight(today, -1), "hour", [e.electricity.energy]) : {}]);
    // HA also returns the bucket that starts at end_time (today so far): keep only finished ones.
    // A negative change is a statistics rebase, not real use.
    const done = (rows) => (rows ?? []).filter((r) => new Date(r.start).getTime() < today.getTime());
    const changes = (id) => done(days[id]).map((r) => Math.max(0, Number(r.change) || 0));
    const sumOf = (id, n) => { const c = changes(id); return c.length ? c.slice(-n).reduce((a, b) => a + b, 0) : NaN; };
    const part = (k) => ({ cost: [sumOf(e[k]?.cost_today, 1), sumOf(e[k]?.cost_today, 7)], energy: [sumOf(e[k]?.energy, 1), sumOf(e[k]?.energy, 7)] });
    const hourly = done(hours[e.electricity?.energy]).map((r) => ({ h: new Date(r.start).getHours(), v: Math.max(0, Number(r.change) || 0) }));
    this._stats = { electricity: part("electricity"), gas: part("gas"), hourly };
    this._render();
  }

  _rate(at = new Date()) {
    const t = this._config.energy.tariff ?? {};
    const m = at.getHours() * 60 + at.getMinutes();
    const band = (t.bands ?? []).find((b) => { const a = minutes(b.from), z = minutes(b.to); return a <= z ? m >= a && m < z : m >= a || m < z; });
    return { rate: band?.rate ?? t.rate, band };
  }

  _bandColor(band) {
    const std = this._config.energy.tariff?.rate;
    if (!band) return STANDARD;
    return band.color ?? (Number(band.rate) < Number(std) ? CHEAP : DEAR);
  }

  // ---- render ----

  _render() {
    if (!this._card || !this._hass) return;
    const v = this._config.view;
    const list = this.shadowRoot.querySelector(".glist");
    const top = list?.scrollTop ?? 0;
    const pic = v === "camera" ? this.shadowRoot.querySelector(".snap img") : null;
    const picMode = `${this._live}|${this._seen}`;
    const body = { home: () => this._home(), lights: () => this._lights(), sockets: () => this._sockets(), heating: () => this._heating(),
      weather: () => this._weather(), camera: () => this._camera(), energy: () => this._energy(), alerts: () => this._alertsView() }[v]();
    this._card.innerHTML = `${this._rail()}<div class="main">${body}</div>`;
    if (v === "lights") this._mountSliders();
    if (pic && this._picMode === picMode) this.shadowRoot.querySelector(".snap img")?.replaceWith(pic);
    this._picMode = picMode;
    const list2 = this.shadowRoot.querySelector(".glist");
    if (list2) list2.scrollTop = top;
  }

  _rail() {
    const v = this._config.view;
    const lo = this._count("light");
    const heating = this._st(this._config.climate)?.attributes.hvac_action === "heating";
    return `<nav class="rail">${RAIL.map(([go, icon]) => {
      const sel = v === go || (go === "lights" && v === "sockets");
      return `<button type="button" class="rb${sel ? " sel" : ""}${go === "heating" && heating ? " heat" : ""}" data-go="${go}" aria-label="${go}">${IC[icon]}${go === "lights" && lo ? `<span class="bd n">${lo}</span>` : ""}</button>`;
    }).join("")}</nav>`;
  }

  _header(title, sub, right = "") {
    return `<div class="ts-h"><div><div class="t">${esc(title)}</div>${sub ? `<div class="s n">${esc(sub)}</div>` : ""}</div><span class="grow"></span>${right}</div>`;
  }

  // ---- Home ----

  _home() {
    const now = new Date();
    const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const al = this._activeAlerts();
    const pill = al.length ? `<button type="button" class="apill" data-go="alerts">${IC.alert}${esc(al.length === 1 ? al[0].name : `${al.length} alerts`)}</button>` : "";
    const np = this._nowPlaying();
    const panels = [this._sunPanel(), this._stripPanel(), this._nextPanel()].filter(Boolean);
    if (this._cyc >= panels.length) this._cyc = 0;
    const lower = np ?? (panels.length ? `<button type="button" class="cycwrap" data-act="cycle" aria-label="Next panel">${panels.map((p, i) => `<div class="cyc${i === this._cyc ? " on" : ""}">${p}</div>`).join("")}</button>
      ${panels.length > 1 ? `<div class="cdots">${panels.map((_, i) => `<i class="${i === this._cyc ? "on" : ""}"></i>`).join("")}</div>` : ""}` : "");
    return `<div class="hm">${this._skyGlow()}<div class="tm n">${hhmm(now)}</div><div class="dt">${esc(date)}</div>${lower}</div>${pill}`;
  }

  _sun() {
    const today = this._sunDays().find(([r]) => r.toDateString() === new Date().toDateString());
    if (!today) return null;
    const lat = Number(this._config.sun.latitude ?? this._hass?.config?.latitude ?? 51.5);
    const s = solar(today[0], today[1], lat), now = new Date();
    s.now = (now - midnight(now)) / 6e4;
    // one scale all year: midsummer noon fills the sky, twilight to -18° below
    s.k = Math.min((SUN_HZ - 14) / s.peak, (SUN_H - 6 - SUN_HZ) / 18);
    // x axis centred on solar noon
    s.x = (m) => { const w = m < s.noon - 720 ? m + 1440 : m > s.noon + 720 ? m - 1440 : m; return 8 + (w - s.noon + 720) / 1440 * (SUN_W - 16); };
    s.y = (m) => SUN_HZ - (s.elev(m) + 0.833) * s.k;
    s.times = today;
    return s;
  }

  // The sun's true path to one scale: day arc in amber, the sun hidden below the horizon, the night path fading towards -18°
  _sunPanel() {
    const s = this._sun();
    if (!s) return null;
    const W = SUN_W, H = SUN_H, hz = SUN_HZ, a0 = s.noon - 720, a1 = s.noon + 720;
    const path = (a, b) => { let d = ""; for (let m = a; ; m += 5) { const mm = Math.min(m, b); d += `${d ? "L" : "M"}${fx(8 + (mm - s.noon + 720) / 1440 * (W - 16))} ${fx(s.y(mm))}`; if (mm >= b) break; } return d; };
    const sides = `mask="url(#ekc-sides)"`;
    const depths = [6, 12, 18].map((d, i) => `<rect x="0" y="${fx(hz + d * s.k - 0.5)}" width="${W}" height="1" fill="rgba(255, 255, 255, ${[0.1, 0.07, 0.045][i]})"/>`).join("");
    const time = (m, d) => `<text x="${fx(s.x(m))}" y="${hz + 20}" text-anchor="middle" style="font-size:var(--fs-axis);fill:var(--sub)">${hhmm(d)}</text>`;
    return `<svg class="sunpath" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <defs>
        <linearGradient id="ekc-fadeg" gradientUnits="userSpaceOnUse" x1="0" y1="${hz}" x2="0" y2="${fx(hz + 18 * s.k)}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <mask id="ekc-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect x="0" y="${hz + 1}" width="${W}" height="${H}" fill="url(#ekc-fadeg)"/></mask>
        <linearGradient id="ekc-sidesg" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".2" stop-color="#fff"/><stop offset=".8" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <mask id="ekc-sides" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect x="0" y="0" width="${W}" height="${H}" fill="url(#ekc-sidesg)"/></mask>
        <clipPath id="ekc-sky"><rect x="0" y="0" width="${W}" height="${hz - 1}"/></clipPath>
      </defs>
      <g ${sides}>${depths}</g>
      <path d="${path(s.rise, s.set)}L${fx(s.x(s.set))} ${hz}L${fx(s.x(s.rise))} ${hz}Z" fill="rgba(240, 160, 75, .14)"/>
      <path d="${path(a0, a1)}" fill="none" stroke="var(--sub)" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round" mask="url(#ekc-fade)"/>
      <path d="${path(s.rise, s.set)}" fill="none" stroke="var(--temp)" stroke-width="3" stroke-linecap="round"/>
      <g clip-path="url(#ekc-sky)"><circle cx="${fx(s.x(s.now))}" cy="${fx(s.y(s.now))}" r="9" fill="var(--temp)"/></g>
      <rect x="0" y="${hz - 1}" width="${W}" height="2" fill="rgba(255, 255, 255, .22)" ${sides}/>
      ${time(s.rise, s.times[0])}${time(s.set, s.times[1])}</svg>`;
  }

  // Sky colour for the sun's height, climbing from the horizon at dawn and mirrored below it
  _skyGlow() {
    const s = this._sun();
    if (!s) return "";
    const e = s.elev(s.now), g = sky(e);
    if (g.a <= 0.01) return "";
    const below = SUN_BOTTOM + SUN_H - SUN_HZ;
    const rgb = (c, al) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${fx(al * 100) / 100})`;
    const [hc, mc, tc] = g.c, wm = warmth(e) * 0.9;
    const sx = `calc(32px + ${fx(s.x(s.now) / SUN_W * 1000) / 1000} * (100% - 64px))`;
    const up = clamp(e / 4, 0, 1), lift = fx((e + 0.833) * s.k);
    const halo = up ? `radial-gradient(circle 160px at ${sx} calc(100% - ${lift}px), rgba(255, 238, 205, ${fx(0.55 * up * 100) / 100}), rgba(255, 238, 205, 0)), ` : "";
    const bg = `${halo}radial-gradient(ellipse 280px ${fx(g.h * 90)}% at ${sx} 100%, ${rgb(hc, wm)}, ${rgb(hc, 0)}),
      linear-gradient(to top, ${rgb(hc, 0.55)} 0%, ${rgb(mc, 0.45)} 35%, ${rgb(tc, 0.38)} 70%, ${rgb(tc, 0.2 * clamp((g.h - 0.84) / 0.16, 0, 1))} 100%)`;
    const rbg = `radial-gradient(ellipse 280px ${fx(below * 1.1)}px at ${sx} 0%, ${rgb(hc, wm * 0.8)}, ${rgb(hc, 0)}),
      linear-gradient(to bottom, ${rgb(hc, 0.5)} 0%, ${rgb(mc, 0.25)} 45%, ${rgb(mc, 0)} 100%)`;
    return `<div class="glow" style="bottom:${below}px;height:calc(${fx(g.h * 1000) / 1000} * (100% - ${below}px));opacity:${fx(g.a * 100) / 100};background:${bg}"></div>
      <div class="glow" style="bottom:0;height:${below}px;opacity:${fx(g.a * 60) / 100};background:${rbg}"></div>`;
  }

  _stripPanel() {
    const hrs = this._hourly().slice(0, STRIP_HOURS);
    if (!hrs.length) return null;
    const days = this._sunDays();
    return `<div class="hstrip">${hrs.map((h, i) => `<div><span class="n">${i ? pad(h.d.getHours()) : "Now"}</span><img src="${esc(this._url(this._icon(h.c, this._isDay(h.d, days))))}" alt="">
      <b class="n">${Math.round(Number(h.t))}°</b><em class="n">${Number(h.p) ? `${h.p}%` : ""}</em></div>`).join("")}</div>`;
  }

  _nextPanel() {
    const e = this._events?.[0];
    if (!e) return null;
    const today = midnight(), tomorrow = midnight(today, 1);
    const day = midnight(e.when);
    let when = day.getTime() === today.getTime() ? "Today" : day.getTime() === tomorrow.getTime() ? "Tomorrow" : e.when.toLocaleDateString("en-GB", { weekday: "long" });
    if (!e.allDay) when += ` · ${hhmm(e.when)}`;
    if (e.night && day.getTime() === tomorrow.getTime()) when = e.night;
    return `<div class="nxt"><div class="nd"><b class="n">${e.when.getDate()}</b><span>${e.when.toLocaleDateString("en-GB", { weekday: "short" })}</span></div>
      <div style="min-width:0"><div class="nt">${esc(e.parts.join(" and "))}</div><div class="ns">${esc(when)}${e.dots.map((c) => `<span class="dot" style="background:${esc(c)}"></span>`).join("")}</div></div></div>`;
  }

  _nowPlaying() {
    const m = this._config.media;
    const p = this._st(m.player);
    if (!p || p.state !== "playing" || (m.now_playing && this._isOn(m.now_playing))) return null;
    const a = p.attributes;
    const title = a.media_title || a.media_album_name || "Playing";
    const by = [a.media_artist, a.media_album_name !== title ? a.media_album_name : null].filter(Boolean).join(" · ");
    const pic = a.entity_picture ? `style="background-image:url('${esc(this._url(a.entity_picture))}')"` : "";
    return `<button type="button" class="np" data-act="np" ${m.now_playing ? "" : "disabled"}><span class="thumb" ${pic}></span>
      <span class="npt"><span class="npk"><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>Now playing</span>
      <span class="npn">${esc(title)}</span><span class="npa">${esc(by)}</span></span></button>`;
  }

  // ---- Lights and sockets ----

  _powerTabs(v) {
    return `<div class="tabs"><button type="button" class="tab${v === "lights" ? " sel" : ""}" data-go="lights">Lights</button><button type="button" class="tab${v === "sockets" ? " sel" : ""}" data-go="sockets">Sockets</button></div>`;
  }

  _offButton(kind, items) {
    const can = items.some((i) => !i.locked && this._isOn(i.id));
    return `<button type="button" class="btn64${can ? " amber" : ""}" data-act="kindoff" data-kind="${kind}" ${can ? "" : "disabled"}>${IC.off}All off</button>`;
  }

  _groupHead(g) {
    const k = g.items.filter((i) => this._isOn(i.id)).length;
    return `<div class="grp"><span class="gn">${esc(g.name)}</span><span class="gl-line"></span><span class="gc n">${k ? `${k} of ${g.items.length} on` : "All off"}</span></div>`;
  }

  _tile(it, kind) {
    const on = this._isOn(it.id);
    const w = it.power ? this._watts(it.power) : null;
    const st = it.locked ? `Always on${w ? ` · ${w}` : ""}` : on ? (kind === "socket" && w ? w : "On") : "Off";
    return `<button type="button" class="tl${on ? " on" : ""}${it.locked ? " lock" : ""}" data-item="${it.id}" ${it.locked ? 'aria-disabled="true"' : ""}>
      <span class="disc">${IC[kind === "light" ? "bulb" : "socket"]}</span><span class="txt"><span class="nm">${esc(it.name)}</span><span class="st n">${esc(st)}</span></span></button>`;
  }

  _lights() {
    const groups = this._groups("light");
    const all = groups.flatMap((g) => g.items);
    const on = all.filter((i) => this._isOn(i.id)).length;
    const sliders = !!customElements.get("expressive-slider-card");
    const body = groups.map((g) => {
      const grp = this._config.area_groups[g.area];
      const items = sliders
        ? `${grp && this._st(grp) && g.items.length > 1 ? `<div class="slot wide" data-slot="all|${esc(g.area)}"></div>` : ""}${g.items.map((i) => `<div class="slot" data-slot="${i.id}"></div>`).join("")}`
        : g.items.map((i) => this._tile(i, "light")).join("");
      return `${this._groupHead(g)}<div class="gitems${sliders ? " sliders" : ""}">${items}</div>`;
    }).join("");
    return `<div class="ts">${this._header("Lights", `${on} of ${all.length} on`, `${this._powerTabs("lights")}${this._offButton("light", all)}`)}
      <div class="glist">${body || `<div class="empty">Nothing labelled “${esc(this._config.light_label)}”</div>`}</div></div>`;
  }

  // Slider cards are made once and moved into their slots after each render, so a drag survives a state update
  _mountSliders() {
    if (!customElements.get("expressive-slider-card")) return;
    const names = new Map(this._items("light").map((i) => [i.id, i.name]));
    this.shadowRoot.querySelectorAll("[data-slot]").forEach((slot) => {
      const key = slot.dataset.slot;
      let el = this._sliders.get(key);
      if (!el) {
        el = document.createElement("expressive-slider-card");
        const area = key.startsWith("all|") ? key.slice(4) : null;
        el.setConfig(area
          ? { entity: this._config.area_groups[area], name: "All lights", icon: "mdi:lightbulb-group", group: { area },
              tap_action: { action: "toggle" }, hold_action: { action: "none" }, double_tap_action: { action: "none" }, styles: ALL_STYLES }
          : { entity: key, name: names.get(key) ?? key, tap_action: { action: "toggle" }, hold_action: { action: "none" }, styles: SLIDER_STYLES });
        this._sliders.set(key, el);
      }
      el.hass = this._hass;
      slot.appendChild(el);
    });
  }

  _sockets() {
    const groups = this._groups("socket");
    const all = groups.flatMap((g) => g.items);
    const on = all.filter((i) => this._isOn(i.id));
    const w = on.reduce((a, i) => a + (Number(this._st(i.power)?.state) || 0), 0);
    const body = groups.map((g) => `${this._groupHead(g)}<div class="gitems">${g.items.map((i) => this._tile(i, "socket")).join("")}</div>`).join("");
    return `<div class="ts">${this._header("Sockets", `${on.length} of ${all.length} on · ${Math.round(w).toLocaleString("en-GB")} W now`, `${this._powerTabs("sockets")}${this._offButton("socket", all)}`)}
      <div class="glist">${body || `<div class="empty">Nothing labelled “${esc(this._config.socket_label)}”</div>`}</div></div>`;
  }

  // ---- Heating ----

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

  // ---- Weather ----

  _arrow(x, y, deg, s = 0.7) {
    return `<path d="M0 -10 L7 9 L0 5 L-7 9 Z" fill="var(--wind)" transform="translate(${fx(x)} ${fx(y)}) rotate(${(Number(deg) + 180) % 360}) scale(${s})"/>`;
  }

  // Monotone cubic, so the temperature curve never overshoots the data
  _smooth(p) {
    const n = p.length, m = [], t = [];
    if (n < 2) return "";
    for (let i = 0; i < n - 1; i++) m[i] = (p[i + 1].y - p[i].y) / (p[i + 1].x - p[i].x);
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    let d = `M${fx(p[0].x)} ${fx(p[0].y)}`;
    for (let i = 0; i < n - 1; i++) {
      const dx = (p[i + 1].x - p[i].x) / 3;
      d += ` C${fx(p[i].x + dx)} ${fx(p[i].y + t[i] * dx)} ${fx(p[i + 1].x - dx)} ${fx(p[i + 1].y - t[i + 1] * dx)} ${fx(p[i + 1].x)} ${fx(p[i + 1].y)}`;
    }
    return d;
  }

  _hourPage() {
    const all = this._hourly();
    if (!all.length) return `<div class="empty">No hourly forecast</div>`;
    const W = 676, H = 236, PP = HOURS_PER_PAGE;
    const pages = Math.ceil(all.length / PP);
    this._page = clamp(this._page, 0, pages - 1);
    const lo = Math.min(...all.map((h) => Number(h.t))), hi = Math.max(...all.map((h) => Number(h.t)));
    const cols = all.slice(this._page * PP, this._page * PP + PP), cw = W / PP, cx = (i) => cw / 2 + i * cw;
    const ty = (v) => 132 - (v - lo) / ((hi - lo) || 1) * 40;
    const days = this._sunDays();
    const pts = cols.map((c, i) => ({ x: cx(i), y: ty(Number(c.t)) }));
    let s = this._page === 0 ? `<rect x="2" y="0" width="${fx(cw - 4)}" height="${H}" rx="20" fill="var(--well)"/>` : "";
    s += `<path d="${this._smooth(pts)}" fill="none" stroke="var(--temp)" stroke-width="3" stroke-linecap="round"/>`;
    cols.forEach((c, i) => {
      const g = this._page * PP + i, x = cx(i);
      const label = g === 0 ? "Now" : c.d.getHours() === 0 ? `${c.d.toLocaleDateString("en-GB", { weekday: "short" })} 00` : pad(c.d.getHours());
      s += `<text x="${fx(x)}" y="24" text-anchor="middle" style="font-size:var(--fs-text);fill:${g === 0 ? "#fff" : "var(--sub)"};font-weight:${g === 0 ? 600 : 400}">${label}</text>`;
      s += `<image href="${esc(this._url(this._icon(c.c, this._isDay(c.d, days))))}" x="${fx(x - 18)}" y="36" width="36" height="36"/>`;
      s += `<circle cx="${fx(x)}" cy="${fx(pts[i].y)}" r="4" fill="var(--temp)"/>`;
      s += `<text x="${fx(x)}" y="${fx(pts[i].y - 12)}" text-anchor="middle" style="font-size:var(--fs-value);fill:#fff;font-weight:600">${Math.round(Number(c.t))}°</text>`;
      s += `<text x="${fx(x)}" y="170" text-anchor="middle" style="font-size:var(--fs-text);fill:${Number(c.p) ? "var(--rain)" : "var(--sub)"}">${Number(c.p) || 0}%</text>`;
      if (Number(c.mm) >= 0.05) s += `<text x="${fx(x)}" y="190" text-anchor="middle" style="font-size:var(--fs-axis);fill:var(--rain)">${Number(c.mm).toFixed(1)}</text>`;
      s += this._arrow(x, 210, c.wb);
      s += `<text x="${fx(x)}" y="${H - 4}" text-anchor="middle" style="font-size:var(--fs-text);fill:var(--wind)">${Math.round(Number(c.ws))}/${Math.round(Number(c.wg))}</text>`;
    });
    const dots = pages > 1 ? `<span class="pdots">${Array.from({ length: pages }, (_, i) => `<button type="button" class="${i === this._page ? "sel" : ""}" data-act="page" data-page="${i}" aria-label="Page ${i + 1}"></button>`).join("")}</span>` : "";
    return `<div class="wx"><svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${s}</svg>
      <div class="wfoot"><span>Rain % · mm</span>${dots}<span>Wind / gust mph</span></div></div>`;
  }

  _days() {
    // the forecast keeps yesterday until the provider rolls over in the morning
    const days = (this._st(this._config.weather.five_day)?.attributes.days ?? []).filter((d) => midnight(new Date(d.datetime)) >= midnight());
    if (!days.length) return `<div class="empty">No five-day forecast</div>`;
    const lo = Math.min(...days.map((d) => Number(d.templow))), hi = Math.max(...days.map((d) => Number(d.temp)));
    const pc = (v) => (hi > lo ? (v - lo) / (hi - lo) * 100 : 50);
    const today = new Date().toDateString();
    const rows = days.map((d) => {
      const when = new Date(d.datetime);
      const isToday = when.toDateString() === today;
      const name = isToday ? "Today" : when.toLocaleDateString("en-GB", { weekday: "short" });
      const deg = typeof d.wind_bearing === "number" ? d.wind_bearing : COMPASS[d.wind_bearing] ?? 0;
      const tl = Number(d.templow), th = Number(d.temp);
      return `<div class="drow${isToday ? " today" : ""}"><div class="dn">${name}</div><img src="${esc(this._url(d.icon))}" alt="">
        <div class="range"><i style="left:${fx(pc(tl))}%;right:${fx(100 - pc(th))}%"></i><em class="n" style="left:calc(${fx(pc(tl))}% - 8px)">${Math.round(tl)}°</em><b class="n" style="left:calc(${fx(pc(th))}% - 16px)">${Math.round(th)}°</b></div>
        <div class="rn n">${Number(d.precipitation || 0).toFixed(1)} mm</div>
        <div class="wd n"><svg viewBox="-10 -10 20 20">${this._arrow(0, 0, deg, 0.75)}</svg>${Math.round(Number(d.wind_speed))}</div></div>`;
    }).join("");
    return `<div class="drows">${rows}</div><div class="wfoot"><span>High / low °C · rain mm</span><span>Wind mph</span></div>`;
  }

  _weather() {
    const t = this._wtab;
    const tabs = `<div class="tabs"><button type="button" class="tab${t === "hours" ? " sel" : ""}" data-act="wtab" data-tab="hours">24 hours</button><button type="button" class="tab${t === "days" ? " sel" : ""}" data-act="wtab" data-tab="days">5 days</button></div>`;
    return `<div class="ts">${this._header("Weather", "", tabs)}${t === "hours" ? this._hourPage() : this._days()}</div>`;
  }

  // ---- Camera: a snapshot every few seconds; live only on tap ----

  _camera() {
    const c = this._config.camera;
    const s = this._st(c.entity);
    if (!s) return `<div class="ts">${this._header("Camera", "")}<div class="empty">${esc(c.entity ?? "No camera")} not found</div></div>`;
    let src;
    if (this._seen) src = this._url(this._st(this._seen)?.attributes.entity_picture);
    else if (this._live && s.attributes.access_token) src = this._url(`/api/camera_proxy_stream/${c.entity}?token=${s.attributes.access_token}`);
    else src = this._url(`${s.attributes.entity_picture}&_=${Date.now()}`);
    const today = new Date().toDateString();
    const when = (iso) => { const d = new Date(iso); if (Number.isNaN(d.getTime())) return ""; return d.toDateString() === today ? hhmm(d) : `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${hhmm(d)}`; };
    const chips = (c.seen ?? []).map((o) => {
      const st = this._st(o.entity);
      if (!st) return "";
      const pic = st.attributes.entity_picture;
      return `<button type="button" class="chip${this._seen === o.entity ? " sel" : ""}" data-act="seen" data-entity="${esc(o.entity)}"><span class="th" ${pic ? `style="background-image:url('${esc(this._url(pic))}')"` : ""}></span><b>${esc(o.name ?? st.attributes.friendly_name ?? o.entity)}</b><span class="n">${esc(when(st.state))}</span></button>`;
    }).join("");
    return `<div class="snap"><img src="${esc(src ?? "")}" alt=""></div>
      <div class="ctop"><span class="t">${esc(c.name ?? s.attributes.friendly_name ?? "Camera")}</span><span class="grow"></span>
        <button type="button" class="pill${this._live ? " on" : ""}" data-act="live"><span class="rec"></span>${this._live ? "Live" : `Every ${Number(c.refresh) || 5} s`}</button></div>
      ${chips ? `<div class="chips">${chips}</div>` : ""}`;
  }

  // ---- Energy ----

  _energy() {
    const e = this._config.energy;
    const gbp = this._unit === "gbp";
    const p = this._num(e.power);
    const watts = Number.isFinite(p) ? (this._st(e.power)?.attributes.unit_of_measurement === "kW" ? p * 1000 : p) : NaN;
    const { rate } = this._rate();
    const sub = [Number.isFinite(watts) ? `Using ${Math.round(watts).toLocaleString("en-GB")} W` : "", Number.isFinite(Number(rate)) ? `${Number(rate)}p now` : ""].filter(Boolean).join(" · ");
    const tabs = `<div class="tabs"><button type="button" class="tab${gbp ? " sel" : ""}" data-act="unit" data-unit="gbp">£</button><button type="button" class="tab${gbp ? "" : " sel"}" data-act="unit" data-unit="kwh">kWh</button></div>`;
    const st = this._stats;
    const row = (k) => {
      if (!e[k]) return null;
      const today = gbp ? this._num(e[k].cost_today) : this._num(e[k].energy_today);
      const past = st ? (gbp ? st[k].cost : st[k].energy) : [NaN, NaN];
      return [today, ...past];
    };
    const rows = [["Electricity", row("electricity")], ["Gas", row("gas")]].filter(([, v]) => v);
    if (gbp && rows.length > 1) rows.push(["Total", rows[0][1].map((v, i) => v + rows[1][1][i])]);
    const fmt = gbp ? money : kwh;
    const cells = rows.map(([label, vals], r) => {
      const last = r === rows.length - 1 ? " last" : "";
      return `<div class="rl${last}">${label}</div>${vals.map((v) => `<div class="c n${last}">${fmt(v)}</div>`).join("")}`;
    }).join("");
    const hourly = st?.hourly ?? [];
    const total = hourly.reduce((a, h) => a + h.v, 0);
    const peak = (e.tariff?.bands ?? []).find((b) => Number(b.rate) > Number(e.tariff?.rate));
    let line = "";
    if (total > 0 && peak) {
      const share = hourly.filter((h) => this._rate(new Date(2000, 0, 1, h.h, 30)).band === peak).reduce((a, h) => a + h.v, 0) / total;
      line = `Yesterday by hour · ${Math.round(share * 100)}% in the ${peak.from}–${peak.to} ${String(peak.name ?? "peak").toLowerCase()}`;
    } else if (total > 0) line = "Yesterday by hour";
    return `<div class="ts">${this._header("Energy", sub, tabs)}
      <div class="etab"><div class="hd"></div><div class="hd">Today</div><div class="hd">Yesterday</div><div class="hd">Last 7 days</div>${cells}</div>
      <span class="grow"></span>
      ${line ? `<div class="everd">${esc(line)}</div>${this._energyChart(hourly)}` : ""}</div>`;
  }

  _energyChart(hourly) {
    const W = 676, H = 88, top = 22, base = H - 22, step = W / 24, bw = step - 3;
    const max = Math.max(0.5, ...hourly.map((h) => h.v));
    const y = (v) => base - v / max * (base - top);
    const t = this._config.energy.tariff ?? {};
    let s = "";
    for (const b of t.bands ?? []) {
      const a = minutes(b.from) / 60, z = minutes(b.to) / 60;
      if (z <= a) continue;
      s += `<rect x="${fx(a * step)}" y="${top - 6}" width="${fx((z - a) * step)}" height="${base - top + 6}" rx="8" fill="${this._bandColor(b)}" opacity=".12"/>`;
      s += `<text x="${fx((a + z) / 2 * step)}" y="${top - 10}" text-anchor="middle" style="font-size:var(--fs-axis);fill:var(--sub)">${esc(b.name ?? "")}</text>`;
    }
    for (const h of hourly) {
      const { band } = this._rate(new Date(2000, 0, 1, h.h, 30));
      s += `<rect x="${fx(h.h * step + 1.5)}" y="${fx(y(h.v))}" width="${fx(bw)}" height="${fx(Math.max(0, base - y(h.v)))}" rx="3" fill="${this._bandColor(band)}"/>`;
    }
    s += `<line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="var(--line)" stroke-width="2"/>`;
    s += [0, 6, 12, 18].map((h) => `<text x="${fx(h * step + 1.5)}" y="${H - 4}" style="font-size:var(--fs-axis);fill:var(--sub)">${pad(h)}:00</text>`).join("");
    s += `<text x="${W}" y="${H - 4}" text-anchor="end" style="font-size:var(--fs-axis);fill:var(--sub)">kWh</text>`;
    return `<svg class="echart" viewBox="0 0 ${W} ${H}" aria-hidden="true">${s}</svg>`;
  }

  // ---- Alerts ----

  _alertsView() {
    const al = this._activeAlerts();
    return `<div class="ts">${this._header("Alerts", al.length ? `${al.length} need attention` : "All clear")}
      ${al.length ? `<div class="agrid">${al.map((a) => `<div class="tl alert"><span class="disc">${IC.alert}</span><span class="txt">
        <span class="nm" style="font-size:var(--fs-value);white-space:normal">${esc(a.name)}</span>${a.detail ? `<span class="st" style="white-space:normal">${esc(a.detail)}</span>` : ""}</span></div>`).join("")}</div>`
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
    description: "Small-screen kiosk with a side rail: a clock Home with sun path, next hours and next up, plus lights, sockets, heating, weather, camera and energy screens",
    preview: false,
  });
}
