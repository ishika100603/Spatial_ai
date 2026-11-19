// Real-world reference data for Shibuya Scramble Crossing (Tokyo).
// The plan is STYLISED: footprints, heights and signal timings are approximations
// used to give the simulation real-world scale (x, y, z + time). Verify before quoting.
//
// Sources to cite in the deck:
//  - GO TOKYO (official Tokyo tourism site): Shibuya Crossing page (location, context, "1,000+ people per crossing")
//  - Japan National Tourism Organization: estimates of 1,000–2,500 crossers per light at peak
//  - Tokyu Corp. Shibuya redevelopment documents (station / pedestrian network)

export const SHIBUYA = {
  name: 'Shibuya Scramble Crossing, Tokyo',
  centre: { lat: 35.6595, lon: 139.7005 }, // approx. centre of the scramble
  worldSize: 100, // metres, x = east, z = south
  roadBand: [36, 64], // roads are 28 m wide bands through the centre

  // y (height) dimension – approximate building heights in metres
  buildings: [
    { name: 'Shibuya 109 / Dogenzaka', rect: [0, 0, 28, 28], h: 45, color: '#9aa3ad' },
    { name: 'QFRONT / Center Gai', rect: [72, 0, 100, 28], h: 40, color: '#8d96a3' },
    { name: 'Shibuya Scramble Square', rect: [72, 72, 100, 100], h: 230, color: '#7f8b99' },
    { name: 'JR Shibuya Station', rect: [0, 80, 28, 100], h: 25, color: '#a39a8d' },
  ],

  // Landmarks: frame of reference for "relative location" and tourist goals
  landmarks: [
    { name: 'Hachiko statue', x: 20, z: 70 },
    { name: 'Station entrance', x: 14, z: 78 },
    { name: '109 corner', x: 31, z: 24 },
    { name: 'QFRONT screen', x: 70, z: 31 },
    { name: 'Scramble Square', x: 68, z: 76 },
    { name: 'Scramble centre', x: 50, z: 50 },
  ],

  // Where people enter / leave the model (map edges + station)
  exits: [
    { name: 'North-west sidewalk', x: 32, z: 1 },
    { name: 'North-east sidewalk', x: 68, z: 1 },
    { name: 'East-north sidewalk', x: 99, z: 32 },
    { name: 'East-south sidewalk', x: 99, z: 68 },
    { name: 'South-east sidewalk', x: 68, z: 99 },
    { name: 'South-west sidewalk', x: 32, z: 99 },
    { name: 'West-north sidewalk', x: 1, z: 32 },
    { name: 'Hachiko Square west', x: 1, z: 70 },
    { name: 'Station entrance', x: 14, z: 78 },
  ],

  // t (time) dimension
  signal: { green: 40, red: 50, note: 'approx. all-way pedestrian phase within a ~1.5–2 min cycle' },
  crossersPerPeakCycle: [1000, 2500], // JNTO estimate; the sim is scaled down ~1:10
  // Relative crowd level by hour (0–23). Illustrative commuter-peak profile;
  // replace with measured counts if you obtain them.
  hourlyProfile: [0.15, 0.1, 0.05, 0.05, 0.05, 0.1, 0.25, 0.6, 0.9, 0.7, 0.5, 0.55,
    0.65, 0.6, 0.6, 0.65, 0.7, 0.85, 1.0, 0.95, 0.85, 0.7, 0.5, 0.3],
};
