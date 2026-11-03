const { JSDOM } = require("jsdom");
const fs = require("fs");
const dom = new JSDOM(`<!doctype html><body></body>`, { url: "http://localhost/kitchen-show/home", runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;
w.eval(`customElements.define("ha-card", class extends HTMLElement {});`);
w.eval(fs.readFileSync(process.argv[2] ?? `${__dirname}/../expressive-kiosk-card.js`, "utf8"));

const ok = (c, m) => { if (!c) { console.log("FAIL", m); process.exitCode = 1; } else console.log("ok  ", m); };
const later = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const Card = w.customElements.get("expressive-kiosk-card");

const st = (state, attributes = {}) => ({ state, attributes, last_updated: "t0" });
const at = (h, m = 0, days = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d; };
const iso = (d) => d.toISOString();
let states, calls, ws;
const reset = () => {
  calls = [];
  ws = [];
  states = {
    "light.lounge_main_sofa": st("on", { friendly_name: "Lounge main sofa", supported_color_modes: ["color_temp"], brightness: 128 }),
    "light.lounge_alcove_lamp": st("off", { friendly_name: "Lounge alcove lamp", supported_color_modes: ["color_temp"] }),
    "light.bedroom_floor_lamp": st("off", { friendly_name: "Bedroom floor lamp" }),
    "light.shed_light": st("on", { friendly_name: "Shed light", supported_color_modes: ["onoff"] }),
    "light.lounge": st("on", { friendly_name: "Lounge group" }),
    "switch.socket_9": st("on", { friendly_name: "Socket 9" }),
    "sensor.socket_9_power": st("1840.2", { device_class: "power" }),
    "switch.socket_11": st("on", { friendly_name: "Socket 11" }),
    "sensor.socket_11_power": st("75.2", { device_class: "power" }),
    "sensor.count_lights_on": st("2"),
    "climate.thermostat": st("auto", { hvac_modes: ["auto", "heat", "off"], preset_modes: ["boost", "none"], preset_mode: "none",
      temperature: 18.5, current_temperature: 19.5, hvac_action: "heating", min_temp: 7, max_temp: 30, friendly_name: "Thermostat" }),
    "binary_sensor.all_doors": st("on", { entity_id: ["binary_sensor.back_door"] }),
    "binary_sensor.back_door": st("on", { friendly_name: "Back door" }),
    "sensor.frost": st("no_risk"),
    "sensor.sun_rising": st("x", { yesterday: iso(at(7, 0, -1)), today: iso(at(7, 0)), tomorrow: iso(at(7, 0, 1)) }),
    "sensor.sun_setting": st("x", { yesterday: iso(at(16, 30, -1)), today: iso(at(16, 30)), tomorrow: iso(at(16, 30, 1)) }),
    "sensor.weather_hourly": st("x", { forecast: Array.from({ length: 24 }, (_, i) => ({ dt: new Date(Date.now() + (i * 3600 - 1800) * 1000).toISOString(),
      c: i % 3 ? "cloudy" : "rainy", p: i % 3 ? 0 : 40, mm: i % 3 ? 0 : 0.4, ws: 8, wg: 15, wb: 200, t: 10 + (i % 5) })) }),
    "sensor.weather_five_day": st("x", { days: [-1, 0, 1, 2, 3, 4].map((i) => ({ datetime: iso(at(7, 0, i)), icon: "/local/custom/weather/icons/icon_cloudy.svg",
      temp: 11 + i * 0.5, templow: 6 + i * 0.5, precipitation: i ? 0.2 : 0, wind_speed: 10 + i, wind_bearing: "NE" })) }),
    "camera.front": st("recording", { friendly_name: "Front", entity_picture: "/api/camera_proxy/camera.front?token=abc", access_token: "abc" }),
    "image.front_person": st(iso(at(9, 5)), { entity_picture: "/api/image_proxy/image.front_person?token=p" }),
    "sensor.power": st("0.352", { unit_of_measurement: "kW" }),
    "sensor.elec_cost_today": st("0.45"),
    "sensor.elec_today": st("0.08"),
    "sensor.gas_cost_today": st("0.17"),
    "sensor.gas_today": st("0"),
    "media_player.show": st("idle"),
    "switch.now_playing": st("off"),
  };
};
reset();
const ent = (id, area, labels = []) => ({ entity_id: id, area_id: area, device_id: null, labels });
// HA also returns the bucket starting at end_time (today so far); the card must ignore it
const dayRows = (vals) => [...vals.map((v, i) => ({ start: at(0, 0, i - vals.length).getTime(), change: v })), { start: at(0, 0).getTime(), change: 99 }];
const hass = () => ({
  states,
  entities: {
    "light.lounge_main_sofa": ent("light.lounge_main_sofa", "living_room", ["light"]),
    "light.lounge_alcove_lamp": ent("light.lounge_alcove_lamp", "living_room", ["light"]),
    "light.bedroom_floor_lamp": ent("light.bedroom_floor_lamp", "bedroom", ["light"]),
    "light.shed_light": ent("light.shed_light", "garden", ["light"]),
    "light.lounge": ent("light.lounge", null),
    "switch.socket_9": ent("switch.socket_9", "kitchen", ["socket"]),
    "switch.socket_11": ent("switch.socket_11", "hallway", ["socket"]),
  },
  devices: {},
  areas: { living_room: { name: "Lounge" }, bedroom: { name: "Rear bedroom" }, garden: { name: "Garden" }, kitchen: { name: "Kitchen" }, hallway: { name: "Hallway" } },
  services: { hive: { boost_heating_on: {}, boost_heating_off: {} } },
  hassUrl: (p) => `http://ha${p}`,
  callService: (d, s, data) => { calls.push([d, s, data]); return Promise.resolve(); },
  callWS: (msg) => {
    ws.push(msg);
    if (msg.period === "hour") return Promise.resolve({ "sensor.elec": Array.from({ length: 24 }, (_, h) => ({ start: at(h, 0, -1).getTime(), change: h >= 16 && h < 19 ? 1 : 0.25 })).concat({ start: at(0, 0).getTime(), change: 50 }) });
    return Promise.resolve({ "sensor.elec_cost_today": dayRows([9, 9, 9, 9, 9, 9, 9]), "sensor.elec_cost": dayRows([1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 1.78]),
      "sensor.elec_sc": dayRows([0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.43]), "sensor.elec": dayRows([7, 7, 7, 7, 7, 7, -3700]),
      "sensor.gas_cost_today": dayRows([1, 1, 1, 1, 1, 1, 1.16]), "sensor.gas": dayRows([10, 10, 10, 10, 10, 10, 14.8]) });
  },
  callApi: (m, path) => Promise.resolve(path.startsWith("calendars/calendar.bins") ? [
    { summary: "Mixed recycling collection", start: { date: at(0, 0, 1).toLocaleDateString("en-CA") }, end: { date: at(0, 0, 2).toLocaleDateString("en-CA") } },
    { summary: "Food waste collection", start: { date: at(0, 0, 1).toLocaleDateString("en-CA") }, end: { date: at(0, 0, 2).toLocaleDateString("en-CA") } },
  ] : []),
});

const base = {
  paths: { home: "/k/home", lights: "/k/lights", sockets: "/k/sockets", heating: "/k/heating", weather: "/k/weather", camera: "/k/camera", energy: "/k/energy", alerts: "/k/alerts" },
  home: { cycle: 1 },
  climate: "climate.thermostat", climate_name: "Hallway thermostat", lights_count: "sensor.count_lights_on",
  area_groups: { living_room: "light.lounge" }, areas: ["living_room", "bedroom"], locked: ["switch.socket_11"],
  alerts: [{ entity: "binary_sensor.all_doors", name: "Door open" }, { entity: "sensor.frost", name: "Frost risk", ok: "no_risk" }],
  sun: { rising: "sensor.sun_rising", setting: "sensor.sun_setting" },
  weather: { hourly: "sensor.weather_hourly", five_day: "sensor.weather_five_day" },
  calendars: [{ entity: "calendar.home" }, { entity: "calendar.bins", strip: " collection", night_before: "Bin out tonight", colors: { recycling: "rgb(1,2,3)", food: "rgb(4,5,6)" } }],
  camera: { entity: "camera.front", name: "Front", refresh: 5, seen: [{ entity: "image.front_person", name: "Person" }] },
  energy: { power: "sensor.power",
    electricity: { cost_today: "sensor.elec_cost_today", cost: ["sensor.elec_cost", "sensor.elec_sc"], energy_today: "sensor.elec_today", energy: "sensor.elec" },
    gas: { cost_today: "sensor.gas_cost_today", energy_today: "sensor.gas_today", energy: "sensor.gas" },
    tariff: { rate: 20.85, bands: [{ name: "Cheap", from: "02:00", to: "05:00", rate: 15.36 }, { name: "Peak", from: "16:00", to: "19:00", rate: 40.49 }] } },
  media: { player: "media_player.show", now_playing: "switch.now_playing" },
};
const make = (view, extra = {}) => {
  const c = new Card();
  c.setConfig({ ...base, view, ...extra });
  w.document.body.appendChild(c);
  c.hass = hass();
  return c;
};
const $ = (c, sel) => c.shadowRoot.querySelector(sel);
const $$ = (c, sel) => [...c.shadowRoot.querySelectorAll(sel)];
const click = (el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const text = (el) => el?.textContent.replace(/\s+/g, " ").trim();

(async () => {
  // Rail
  let c = make("home");
  await later(10);
  const rail = $$(c, ".rail .rb").map((b) => b.dataset.go);
  ok(JSON.stringify(rail) === JSON.stringify(["home", "lights", "heating", "weather", "camera", "energy"]), "rail: six screens");
  ok($(c, '.rb[data-go="home"]').classList.contains("sel"), "rail marks the current screen");
  ok(text($(c, '.rb[data-go="lights"] .bd')) === "2", "lights badge from the count sensor");
  ok($(c, '.rb[data-go="heating"]').classList.contains("heat"), "heating rail icon is amber while heating");
  let nav = null;
  w.addEventListener("location-changed", () => { nav = w.location.pathname; }, { once: true });
  click($(c, '.rb[data-go="weather"]'));
  ok(nav === "/k/weather", "rail navigates");

  // Home
  ok(/^\d\d:\d\d$/.test(text($(c, ".tm"))), "clock");
  ok($(c, ".rail.sky") && !$(c, ".rail.idle") && $(c, ".main.home"), "Home rail sits on the sky, bright at first");
  ok(/\d/.test(text($(c, ".dt"))) && !$(c, ".dt .cyc"), "date stays under the clock");
  ok($$(c, ".cycwrap .cyc").length === 3 && $$(c, ".cyc")[0].classList.contains("on") && $(c, ".cyc .sunpath"), "three turns below, the sun path first");
  ok($(c, ".cycwrap .sunpath") && text($(c, ".sunpath")).includes("07:00") && text($(c, ".sunpath")).includes("16:30"), "sun path with sunrise and sunset times");
  {
    const xs = $$(c, ".sunpath text").map((e) => Number(e.getAttribute("x")));
    ok(Math.abs((xs[0] + xs[1]) / 2 - 322) < 1, "sun path centred on solar noon");
  }
  ok($$(c, ".hcol > div").length === 7 && text($(c, ".hcol span")) === "Now", "next seven hours, Now first");
  ok($(c, ".hcol img").getAttribute("src").startsWith("http://ha/local/custom/weather/icons/icon_"), "hourly icons from the icon path");
  const nxt = text($(c, ".nxc"));
  ok(nxt.includes("Mixed recycling and Food waste") && nxt.includes("Bin out tonight"), "next up: bins tomorrow, out tonight");
  ok($$(c, ".nxc .dot").length === 2 && /^\d+$/.test(text($(c, ".nxc .nd b"))), "a dot per coloured collection");
  click($(c, ".cycwrap"));
  ok($$(c, ".cyc")[1].classList.contains("on") && $$(c, ".cdots i")[1].classList.contains("on"), "tap moves to the next panel");
  c.hass = { ...hass(), states: { ...states, "sensor.count_lights_on": { ...st("3"), last_updated: "t1" } } };
  ok($$(c, ".cyc")[1].classList.contains("on"), "a state update keeps the current panel");
  await later(2100);
  ok($$(c, ".cyc")[2].classList.contains("on"), "panels cycle on their own");
  ok(text($(c, ".apill")) === "Door open", "alert pill names the active alert");
  w.addEventListener("location-changed", () => { nav = w.location.pathname; }, { once: true });
  click($(c, ".apill"));
  ok(nav === "/k/alerts", "alert pill opens Alerts");
  states["media_player.show"] = st("playing", { media_title: "Everywhere", media_artist: "Fleetwood Mac", media_album_name: "Magic Radio" });
  c.hass = hass();
  ok($(c, ".np") && !$(c, ".cycwrap") && text($(c, ".np .npa")) === "Fleetwood Mac · Magic Radio", "now playing replaces the sun path while playing");
  click($(c, ".np"));
  ok(JSON.stringify(calls.at(-1)) === JSON.stringify(["switch", "turn_on", { entity_id: "switch.now_playing" }]), "tile opens Kiosk Satellite now playing");
  c.remove();

  // Lights, plain tiles until the slider card loads
  reset();
  c = make("lights");
  ok(JSON.stringify($$(c, ".grp .gn").map((g) => g.textContent)) === JSON.stringify(["Lounge", "Rear bedroom", "Garden"]), "groups follow the area order");
  ok(text($$(c, ".grp")[0].querySelector(".gc")) === "1 of 2 on" && !$(c, ".goff"), "group count, no per-room Off");
  ok($$(c, ".tabs .tab").map((t) => t.textContent).join("|") === "Lights|Sockets" && $(c, ".tab.sel").textContent === "Lights", "Lights / Sockets tabs");
  ok($(c, '.rb[data-go="lights"]').classList.contains("sel"), "rail Lights selected");
  ok($$(c, ".tl .nm").map((n) => n.textContent).includes("Main sofa"), "tiles while the slider card is missing; room prefix dropped");
  calls = [];
  click($(c, '[data-act="kindoff"]'));
  ok(JSON.stringify(calls[0]) === JSON.stringify(["light", "turn_off", { entity_id: ["light.lounge", "light.shed_light"] }]), "All off: groups plus singles");

  // ... then slider cards once it is defined
  const made = [];
  w.customElements.define("expressive-slider-card", class extends w.HTMLElement {
    setConfig(cfg) { this.cfg = cfg; made.push(cfg); }
    set hass(h) { this.h = h; }
  });
  await later(10);
  ok(!$(c, ".tl") && $$(c, "expressive-slider-card").length === 5, "sliders once the card is defined: one All lights + four lights");
  const all = made.find((m) => m.name === "All lights");
  ok(all.entity === "light.lounge" && all.group.area === "living_room" && all.tap_action.action === "toggle", "All lights slider: area group, toggles the room");
  ok(made.filter((m) => m.name === "All lights").length === 1, "no All lights row for a one-light room");
  ok(made.find((m) => m.entity === "light.lounge_main_sofa").name === "Main sofa", "light slider uses the short name");
  ok(made[0].styles.name.size === 16 && made[0].styles.name.weight === 600, "slider text on the type scale");
  const sofa = $$(c, "expressive-slider-card").find((s) => s.cfg.entity === "light.lounge_main_sofa");
  c.hass = { ...hass(), states: { ...states, "light.lounge_alcove_lamp": { ...st("on"), last_updated: "t2" } } };
  ok($$(c, "expressive-slider-card").includes(sofa) && made.length === 5, "re-render keeps the same slider elements");
  ok(sofa.h.states["light.lounge_alcove_lamp"].state === "on", "sliders get every hass update");
  c.remove();

  // Sockets
  reset();
  c = make("sockets");
  ok(text($(c, ".ts-h .s")).includes("2 of 2 on") && text($(c, ".ts-h .s")).includes("1,915 W"), "sockets header with live watts");
  ok($(c, ".tab.sel").textContent === "Sockets" && $(c, '.rb[data-go="lights"]').classList.contains("sel"), "Sockets tab; rail stays on Lights");
  ok(!$(c, ".goff") && $$(c, ".grp").length === 2, "no per-room Off");
  ok($(c, '[data-item="switch.socket_11"]').getAttribute("aria-disabled") === "true", "rack socket locked");
  calls = [];
  click($(c, '[data-act="kindoff"]'));
  ok(JSON.stringify(calls[0]) === JSON.stringify(["switch", "turn_off", { entity_id: ["switch.socket_9"] }]), "All off skips the locked socket");
  c.remove();

  // Heating
  c = make("heating");
  ok(text($(c, ".tstat .tt")) === "18.5°" && text($(c, ".tstat .tnow")).includes("19.5° · Heating"), "thermostat shows target, now and state");
  calls = [];
  click($(c, '[data-t="0.5"]'));
  ok(JSON.stringify(calls[0]) === JSON.stringify(["climate", "set_temperature", { entity_id: "climate.thermostat", temperature: 19 }]), "+ raises the target");
  click($(c, '[data-act="menu"]'));
  ok(JSON.stringify($$(c, ".mopt b").map((b) => b.textContent)) === JSON.stringify(["Auto", "Heat", "Boost", "Off"]), "mode menu with boost before off");
  calls = [];
  click($(c, '[data-mode="boost"]'));
  ok(calls[0][1] === "boost_heating_on" && calls[0][2].time_period === "01:00:00" && !$(c, ".menu"), "boost uses hive for an hour; menu closes");
  c.remove();

  // Weather
  c = make("weather");
  ok($(c, ".tab.sel").textContent === "24 hours" && $$(c, ".chart image").length === 8, "24 hours: 8 hours a page");
  ok($$(c, ".pdots button").length === 3, "three pages of hours");
  ok($$(c, ".chart text")[0].textContent === "Now", "first column is Now");
  click($$(c, ".pdots button")[2]);
  ok($$(c, ".pdots button")[2].classList.contains("sel") && $$(c, ".chart text")[0].textContent !== "Now", "dots change page");
  click($$(c, ".tab")[1]);
  const rows = $$(c, ".drow");
  ok(rows.length === 5 && text(rows[0].querySelector(".dn")) === "Today" && rows[0].classList.contains("today"), "5 days: rows, today first, yesterday dropped");
  ok(text(rows[1].querySelector(".rn")) === "0.2 mm" && text(rows[1].querySelector(".wd")) === "11", "rain mm and wind speed");
  ok(text($(c, ".wfoot")).includes("Wind mph") && !text($(c, ".wfoot")).includes("gust"), "five-day legend has no gust");
  c.remove();

  // Camera
  c = make("camera");
  ok($(c, ".snap img").getAttribute("src").startsWith("http://ha/api/camera_proxy/camera.front?token=abc&_="), "snapshot from the camera proxy");
  ok(text($(c, ".chip")).includes("Person") && text($(c, ".chip")).includes("09:05"), "last seen chip with time");
  const img = $(c, ".snap img");
  c.hass = { ...hass(), states: { ...states, "climate.thermostat": { ...states["climate.thermostat"], last_updated: "t3" } } };
  ok($(c, ".snap img") === img, "an unrelated update keeps the picture element");
  click($(c, ".chip"));
  ok($(c, ".snap img").getAttribute("src") === "http://ha/api/image_proxy/image.front_person?token=p", "chip shows that picture");
  click($(c, '[data-act="live"]'));
  ok($(c, ".snap img").getAttribute("src") === "http://ha/api/camera_proxy_stream/camera.front?token=abc", "Live streams on tap");
  c.remove();
  ok(!c.shadowRoot.querySelector(".snap img").getAttribute("src"), "leaving the screen ends the stream");

  // Energy
  c = make("energy");
  await later(10);
  ok(text($(c, ".ts-h .s")).startsWith("Using 352 W"), "power in watts from kW");
  ok(ws[0].start_time === at(0, 0, -7).toISOString() && ws[0].types[0] === "change", "statistics from local midnight 7 days ago");
  const cells = $$(c, ".etab .c").map((x) => x.textContent);
  ok(JSON.stringify(cells.slice(0, 3)) === JSON.stringify(["45p", "£2.21", "£14.21"]), "electricity £: today, then past days from the added-up cost statistics");
  ok(JSON.stringify(cells.slice(6, 9)) === JSON.stringify(["62p", "£3.37", "£21.37"]), "total row");
  click($(c, '[data-unit="kwh"]'));
  const kw = $$(c, ".etab .c").map((x) => x.textContent);
  ok(kw.length === 6 && kw[1] === "0" && kw[2] === "42", "kWh: no total; a negative day (rebase) counts as 0");
  ok(text($(c, ".everd")).includes("36% in the 16:00–19:00 peak"), "peak share from yesterday by hour");
  ok($$(c, ".echart rect").length === 26, "24 hourly bars plus two band washes");
  c.remove();

  // Alerts
  reset();
  c = make("alerts");
  ok($$(c, ".tl.alert").length === 1 && text($(c, ".tl.alert")).includes("Back door"), "alerts list the open door by name");
  c.remove();

  w.close(); // stops the cards' timers so node can exit
})().catch((e) => { console.log("FAIL", e); process.exitCode = 1; w.close(); });
