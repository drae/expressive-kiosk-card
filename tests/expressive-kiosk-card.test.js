const { JSDOM } = require("jsdom");
const fs = require("fs");
const dom = new JSDOM(`<!doctype html><body></body>`, { url: "http://localhost/kitchen-show/glance", runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;
w.eval(`customElements.define("ha-card", class extends HTMLElement {});`);
w.eval(fs.readFileSync(process.argv[2] ?? `${__dirname}/../expressive-kiosk-card.js`, "utf8"));

const ok = (c, m) => { if (!c) { console.log("FAIL", m); process.exitCode = 1; } else console.log("ok  ", m); };
const later = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const Card = w.customElements.get("expressive-kiosk-card");

const st = (state, attributes = {}) => ({ state, attributes, last_updated: "t0" });
let states, calls;
const reset = () => {
  calls = [];
  states = {
    "light.lounge_main_sofa": st("on", { friendly_name: "Lounge main sofa" }),
    "light.lounge_alcove_lamp": st("off", { friendly_name: "Lounge alcove lamp" }),
    "light.bedroom_floor_lamp": st("off", { friendly_name: "Bedroom floor lamp" }),
    "light.shed_light": st("on", { friendly_name: "Shed light" }),
    "light.lounge": st("on", { friendly_name: "Lounge group" }),
    "switch.socket_9": st("on", { friendly_name: "Socket 9" }),
    "sensor.socket_9_power": st("1840.2", { device_class: "power" }),
    "switch.socket_11": st("on", { friendly_name: "Socket 11" }),
    "sensor.socket_11_power": st("75.2", { device_class: "power" }),
    "sensor.count_lights_on": st("2"),
    "climate.thermostat": st("auto", { hvac_modes: ["auto", "heat", "off"], preset_modes: ["boost", "none"], preset_mode: "none",
      temperature: 18.5, current_temperature: 19.5, hvac_action: "idle", min_temp: 7, max_temp: 30, friendly_name: "Thermostat" }),
    "binary_sensor.all_doors": st("on", { entity_id: ["binary_sensor.back_door"] }),
    "binary_sensor.back_door": st("on", { friendly_name: "Back door" }),
    "sensor.frost": st("no_risk"),
    "sensor.cond": st("Cloudy", { type: "CLOUDY", is_daytime: true }),
    "sensor.weather_now": st("x", { now_temp: 15.5 }),
    "sensor.weather_hourly": st("x", { forecast: [0, 1, 2, 3, 4, 5].map((i) => ({ dt: new Date(Date.now() + (i * 3600 - 1800) * 1000).toISOString(), t: 14 - i })) }),
    "media_player.show": st("playing", { media_title: "Everywhere", media_artist: "Fleetwood Mac", media_album_name: "Magic Radio", entity_picture: "/api/x" }),
    "switch.now_playing": st("off"),
  };
};
reset();
const ent = (id, area, labels = []) => ({ entity_id: id, area_id: area, device_id: null, labels });
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
  callService: (d, s, data) => { calls.push([d, s, data]); return Promise.resolve(); },
  callApi: (m, path) => Promise.resolve(path.startsWith("calendars/calendar.bins") ? [
    { summary: "Mixed recycling collection", start: { date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) }, end: { date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) } },
    { summary: "Food waste collection", start: { date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) }, end: { date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) } },
  ] : []),
});

const base = {
  paths: { glance: "/k/glance", lights: "/k/lights", sockets: "/k/sockets", heating: "/k/heating", alerts: "/k/alerts" },
  climate: "climate.thermostat", climate_name: "Hallway thermostat", lights_count: "sensor.count_lights_on",
  area_groups: { living_room: "light.lounge" }, areas: ["living_room", "bedroom"], locked: ["switch.socket_11"],
  alerts: [{ entity: "binary_sensor.all_doors", name: "Door open" }, { entity: "sensor.frost", name: "Frost risk", ok: "no_risk" }],
  weather: { condition: "sensor.cond", now: "sensor.weather_now", hourly: "sensor.weather_hourly" },
  calendars: [{ entity: "calendar.home" }, { entity: "calendar.bins", strip: " collection", colors: { recycling: "rgb(1,2,3)", food: "rgb(4,5,6)" } }],
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

(async () => {
  // Glance
  let c = make("glance");
  await later(10);
  const totals = $$(c, ".tot").map((t) => t.textContent.replace(/\s+/g, " ").trim());
  ok(totals[0].includes("2") && totals[0].includes("Lights"), "lights total from the count sensor");
  ok(totals[1].includes("2") && totals[1].includes("Sockets"), "sockets total counted from labels");
  ok(totals[2].includes("19.5°") && totals[2].includes("Idle"), "heating total shows temperature and state");
  ok($$(c, ".tot")[3].classList.contains("alert") && totals[3].includes("1"), "one active alert (door), frost ok");
  ok($(c, ".frog")?.getAttribute("style").includes("/local/froggy/09-cloudy-"), "frog scene for CLOUDY");
  ok($(c, ".left").getAttribute("style").includes("--sh:1.2"), "text shadow defaults to 1.2");
  ok($(c, ".np") && !$(c, ".hours"), "now playing replaces the weather while playing");
  ok($(c, ".np .npn").textContent === "Everywhere" && $(c, ".np .npa").textContent === "Fleetwood Mac · Magic Radio", "track title and artist · source");
  click($(c, ".np"));
  ok(JSON.stringify(calls.at(-1)) === JSON.stringify(["switch", "turn_on", { entity_id: "switch.now_playing" }]), "tile opens Kiosk Satellite now playing");
  const ev = $$(c, ".ev");
  ok(ev.length === 1 && ev[0].textContent.includes("Mixed recycling and Food waste"), "bins on one day merge into one row");
  ok($$(c, ".ev .dot").length === 2, "a dot per coloured collection");
  states["switch.now_playing"] = st("on");
  c.hass = hass();
  ok($(c, ".hours") && $(c, ".hours").textContent.includes("Now") && $(c, ".hours").textContent.includes("16°"), "weather row back with Now first");
  let nav = null;
  w.addEventListener("location-changed", () => { nav = w.location.pathname; }, { once: true });
  click($(c, '[data-go="lights"]'));
  ok(nav === "/k/lights", "lights total navigates");

  // Lights
  reset();
  c = make("lights");
  const groups = $$(c, ".grp .gn").map((g) => g.textContent);
  ok(JSON.stringify(groups) === JSON.stringify(["Lounge", "Rear bedroom", "Garden"]), "groups follow the area order, then by name");
  const names = $$(c, ".tl .nm").map((n) => n.textContent);
  ok(names.includes("Main sofa") && names.includes("Floor lamp") && names.includes("Shed light"), "room prefixes dropped");
  ok($$(c, ".grp")[0].querySelector(".gc").textContent === "1 of 2 on", "group count");
  calls = [];
  click($$(c, ".goff")[0]);
  ok(JSON.stringify(calls[0]) === JSON.stringify(["light", "turn_off", { entity_id: ["light.lounge"] }]), "group Off uses the area group");
  ok($$(c, ".goff")[1].disabled, "Off disc disabled when the room is off");
  calls = [];
  click($(c, '[data-act="kindoff"]'));
  ok(JSON.stringify(calls[0]) === JSON.stringify(["light", "turn_off", { entity_id: ["light.lounge", "light.shed_light"] }]), "All off: groups plus singles");
  calls = [];
  click($(c, '[data-item="light.bedroom_floor_lamp"]'));
  ok(JSON.stringify(calls[0]) === JSON.stringify(["light", "toggle", { entity_id: "light.bedroom_floor_lamp" }]), "tile toggles");

  // Sockets
  c = make("sockets");
  ok($(c, ".ts-h .s").textContent.includes("2 of 2 on") && $(c, ".ts-h .s").textContent.includes("1,915 W"), "sockets header with live watts");
  ok($(c, '[data-item="switch.socket_9"] .st').textContent === "1,840 W", "socket wattage");
  ok($(c, '[data-item="switch.socket_11"]').getAttribute("aria-disabled") === "true", "rack socket locked");
  calls = [];
  click($(c, '[data-act="kindoff"]'));
  ok(JSON.stringify(calls[0]) === JSON.stringify(["switch", "turn_off", { entity_id: ["switch.socket_9"] }]), "All off skips the locked socket");
  calls = [];
  click($(c, '[data-item="switch.socket_11"]'));
  ok(calls.length === 0, "locked socket ignores taps");

  // Heating
  c = make("heating");
  ok($(c, ".tstat .tt").textContent === "18.5°" && $(c, ".tstat .tnow").textContent.includes("19.5° · Idle"), "thermostat shows target, now and state");
  ok($(c, ".tstat").getAttribute("style").includes("rgb("), "tile coloured by target");
  calls = [];
  click($(c, '[data-t="0.5"]'));
  ok(JSON.stringify(calls[0]) === JSON.stringify(["climate", "set_temperature", { entity_id: "climate.thermostat", temperature: 19 }]), "+ raises the target");
  click($(c, '[data-act="menu"]'));
  const opts = $$(c, ".mopt b").map((b) => b.textContent);
  ok(JSON.stringify(opts) === JSON.stringify(["Auto", "Heat", "Boost", "Off"]), "mode menu: hvac modes with boost before off");
  calls = [];
  click($(c, '[data-mode="boost"]'));
  ok(JSON.stringify(calls[0]) === JSON.stringify(["hive", "boost_heating_on", { entity_id: "climate.thermostat", time_period: "01:00:00", temperature: 21 }]), "boost uses hive for an hour");
  ok(!$(c, ".menu"), "menu closes after a pick");
  states["climate.thermostat"].attributes.preset_mode = "boost";
  c.hass = { ...hass(), states: { ...states, "climate.thermostat": { ...states["climate.thermostat"], last_updated: "t1" } } };
  click($(c, '[data-act="menu"]'));
  calls = [];
  click($(c, '[data-mode="off"]'));
  ok(calls[0][1] === "boost_heating_off" && calls[1][1] === "set_hvac_mode" && calls[1][2].hvac_mode === "off", "leaving boost ends it first");

  // Alerts
  reset();
  c = make("alerts");
  ok($$(c, ".tl.alert").length === 1 && $(c, ".tl.alert").textContent.includes("Back door"), "alerts list the open door by name");

  w.close(); // stops the cards' clocks so node can exit
})().catch((e) => { console.log("FAIL", e); process.exitCode = 1; w.close(); });
