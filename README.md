# Expressive Kiosk Card

A small-screen kiosk for Home Assistant in the style of [expressive-slider-card](https://github.com/drae/expressive-slider-card), [expressive-climate-card](https://github.com/drae/expressive-climate-card) and [expressive-schedule-card](https://github.com/drae/expressive-schedule-card). It was built for an Echo Show 5 running Kiosk Satellite, whose WebView is 788 × 394 CSS px. The card is meant to be read from across a room and spoken to more than touched.

A side rail on every screen goes to Home, Lights, Heating, Weather, Camera and Energy. Lights shows a count of lights on; Heating turns amber while the boiler is heating.

- **Home:** the clock, and under it a line that takes turns with a slow crossfade: the date; the next seven hours of weather (icon with the rain chance under it, temperature and hour); and the next thing on your calendars, with "Bin out tonight" the day before a collection. Tap it to move on. Below, the sun's true path through the day stays in view: drawn to one scale all year and centred on solar noon, with sunrise and sunset times, faint lines at the three twilight depths, and the sun hidden while it is below the horizon. Behind the clock the sky takes the colour of a clear sky for the sun's height, climbing from the horizon through twilight to daylight blue and mirrored below the horizon. At dusk the real bright stars come out at their real positions, brightest first, and the moon shows where it really is with its phase. While music plays, a now-playing tile takes the sun path's place. When an alert is active, a red pill in the corner names it and opens Alerts.
- **Lights** and **Sockets:** one screen with two tabs. Everything labelled, grouped by area. Lights are [expressive-slider-card](https://github.com/drae/expressive-slider-card) sliders, two across, and each room with a group light and two or more lights starts with an All lights slider that switches the room. Until the slider card has loaded, lights are plain tiles. Sockets are tiles; tap to toggle. **All off** is in the header and never touches locked entities.
- **Heating:** − and + either side of a thermostat tile coloured by the target, using the same scale as the schedule card. The mode button opens the climate's modes, plus boost.
- **Weather:** 24 hours, eight to a page (swipe or tap the dots), with icon, temperature curve, rain chance and amount, and wind and gust; or 5 days as rows with a high-to-low bar, rain and wind.
- **Camera:** a snapshot every few seconds, never a stream unless you tap Live, and the stream stops when you leave the screen. Chips show the latest picture of each object (for example Frigate's person, car and cat images) and when it was taken.
- **Energy:** electricity, gas and total for today, yesterday and the last 7 days, in £ or kWh. Underneath, yesterday's electricity by hour, coloured by tariff band, with the share used in the peak band.
- **Alerts:** each active alert, with the doors or devices behind it.

Text follows one scale on every screen: 14, 16, 20, 24, 32, 72 and 144 px, regular and semibold.

It is a single plain JavaScript file with no dependencies.

## Install

Add `https://github.com/drae/expressive-kiosk-card` to HACS as a custom repository of type **Dashboard** and download it. HACS registers the resource. Install expressive-slider-card too for the light sliders.

## Example

```yaml
type: custom:expressive-kiosk-card
view: home
paths:
  home: /kitchen-show/home
  lights: /kitchen-show/lights
  sockets: /kitchen-show/sockets
  heating: /kitchen-show/heating
  weather: /kitchen-show/weather
  camera: /kitchen-show/camera
  energy: /kitchen-show/energy
  alerts: /kitchen-show/alerts
home:
  cycle: 20
climate: climate.thermostat
climate_name: Hallway thermostat
lights_count: sensor.count_lights_on
sockets_count: sensor.count_sockets_on
areas:
  - living_room
  - study
area_groups:
  living_room: light.lounge
locked:
  - switch.socket_11
alerts:
  - entity: binary_sensor.all_doors
    name: Door open
  - entity: sensor.garden_thermal_comfort_frost_risk
    name: Frost risk
    ok: no_risk
sun:
  rising: sensor.home_sun_rising
  setting: sensor.home_sun_setting
weather:
  hourly: sensor.weather_hourly
  five_day: sensor.weather_five_day
calendars:
  - entity: calendar.home
  - entity: calendar.bins
    strip: " collection"
    night_before: Bin out tonight
    colors:
      recycling: rgb(46, 131, 191)
      food: rgb(105, 178, 63)
camera:
  entity: camera.front
  name: Front
  refresh: 5
  seen:
    - entity: image.front_person
      name: Person
    - entity: image.front_car
      name: Car
energy:
  power: sensor.electricity_power
  electricity:
    cost_today: sensor.electricity_cost_today
    energy_today: sensor.electricity_import_today
    energy: sensor.electricity_import
  gas:
    cost_today: sensor.gas_cost_today
    energy_today: sensor.gas_import_today
    energy: sensor.gas_import
  tariff:
    rate: 20.85
    bands:
      - name: Cheap
        from: "02:00"
        to: "05:00"
        rate: 15.36
      - name: Peak
        from: "16:00"
        to: "19:00"
        rate: 40.49
media:
  player: media_player.echo_show_kitchen
  now_playing: switch.echo_show_kitchen_now_playing
```

Give every view the same options and change only `view`.

## Options

| Option | Default | |
|---|---|---|
| `view` | `home` | `home`, `lights`, `sockets`, `heating`, `weather`, `camera`, `energy` or `alerts` |
| `paths` | | Where the rail, the Lights/Sockets tabs and the alert pill go |
| `home.cycle` | `20` | Seconds each turn of the line under the clock shows |
| `light_label` / `socket_label` | `light` / `socket` | Lights are labelled `light.*` entities and sockets are labelled `switch.*` entities. The area comes from the entity, or from its device |
| `areas` | | Area ids to put first; the others follow by name |
| `area_groups` | | A group light per area. It is the area's All lights slider (in areas with two or more lights), and All off switches it in one call instead of each member |
| `locked` | | Entities that are shown but never switched, including by All off |
| `lights_count` / `sockets_count` | | Count sensors for the rail badge and headers; counted from the labels when left out |
| `alerts` | | `entity`, `name` and optional `ok`. An alert is active when the entity is `on`, or when `ok` is given and the state isn't `ok`. A group lists its members that are on |
| `climate` / `climate_name` | | The thermostat and the name under the Heating title |
| `boost` | `minutes: 60`, `temperature: 21` | Boost uses `hive.boost_heating_on` when it exists, otherwise the climate's `boost` preset |
| `sun.rising` / `sun.setting` | | Sensors with `yesterday`, `today` and `tomorrow` attributes. They draw the sun path and pick day or night weather icons |
| `sun.latitude` | Home Assistant's | Latitude for the sun's height |
| `sun.longitude` | Home Assistant's | Longitude for the stars and moon |
| `weather.hourly` | | A `forecast` attribute of `{dt, c, p, mm, ws, wg, wb, t}` hours |
| `weather.five_day` | | A `days` attribute of `{datetime, icon, temp, templow, precipitation, wind_speed, wind_bearing}` |
| `weather.icon_path` | `/local/custom/weather/icons/` | Hourly icons are `icon_<condition>.svg`, with `_night` added after dark |
| `calendars` | | `entity`, optional `strip` (text removed from summaries), `colors` (summary text → dot colour) and `night_before` (shown the day before). Events on the same day from one calendar share a row |
| `camera.entity` / `camera.name` / `camera.refresh` | `refresh: 5` | The camera and the seconds between snapshots |
| `camera.seen` | | `entity` and `name` of image entities with the latest picture of each object |
| `energy.power` | | Power now, in kW or W |
| `energy.electricity` / `energy.gas` | | `cost_today` (£, including standing charge), `energy_today` (kWh) and `energy` (cumulative kWh). Yesterday and the last 7 days come from the long-term statistics of `cost_today` and `energy` |
| `energy.tariff` | | `rate` in pence outside the bands, and `bands` of `name`, `from`, `to`, `rate` and optional `color`. A band cheaper than `rate` is green, a dearer one orange |
| `media.player` / `media.now_playing` | | The player, and the switch that opens Kiosk Satellite's now-playing screen |

## Dashboard

Use panel views, one card each, and hide the HA header (for example with [kiosk-mode](https://github.com/NemesisRE/kiosk-mode)). Keep the dashboard free of anything else. The point of this card is a light page on a device with 1 GB of RAM.

## Tests

`npm test` runs the jsdom tests in `tests/`.

## Licence

BSD 3-Clause.
