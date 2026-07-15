const rows = [
  ['mohe-beiji', '中国・漠河・北极村', 'CN', 53.484, 122.359, 'Asia/Shanghai', 7, 'mohe_photo_v1'],
  ['genhe', '中国・呼伦贝尔・根河', 'CN', 50.781, 121.520, 'Asia/Shanghai', 7, 'genhe_photo_v1'],
  ['hemu', '中国・阿勒泰・禾木', 'CN', 48.576, 87.437, 'Asia/Shanghai', 8, 'hemu_photo_v1'],
  ['tromso', '挪威・特罗姆瑟', 'NO', 69.649, 18.955, 'Europe/Oslo', 2, 'tromso_photo_v1'],
  ['abisko', '瑞典・阿比斯库', 'SE', 68.350, 18.831, 'Europe/Stockholm', 2, 'abisko_photo_v1'],
  ['rovaniemi', '芬兰・罗瓦涅米', 'FI', 66.504, 25.729, 'Europe/Helsinki', 3, 'rovaniemi_photo_v1'],
  ['thingvellir', '冰岛・辛格维利尔', 'IS', 64.256, -21.130, 'Atlantic/Reykjavik', 3, 'thingvellir_photo_v1'],
  ['fairbanks', '美国・费尔班克斯', 'US', 64.838, -147.716, 'America/Anchorage', 2, 'fairbanks_photo_v1'],
  ['yellowknife', '加拿大・耶洛奈夫', 'CA', 62.454, -114.372, 'America/Yellowknife', 2, 'yellowknife_photo_v1'],
  ['whitehorse', '加拿大・白马市', 'CA', 60.721, -135.057, 'America/Whitehorse', 3, 'whitehorse_photo_v1'],
  ['lake-tekapo', '新西兰・特卡波湖', 'NZ', -44.005, 170.477, 'Pacific/Auckland', 5, 'lake_tekapo_photo_v1'],
  ['cradle-mountain', '澳大利亚・摇篮山', 'AU', -41.684, 145.951, 'Australia/Hobart', 5, 'cradle_mountain_photo_v1']
];

export const LOCATIONS = Object.freeze(rows.map((row, index) => Object.freeze({
  id: row[0],
  displayName: row[1],
  countryCode: row[2],
  latitude: row[3],
  longitude: row[4],
  timeZone: row[5],
  referenceKp: row[6],
  sceneAssetId: row[7],
  hemisphere: row[3] < 0 ? 'south' : 'north',
  sortOrder: index
})));

export const LOCATION_IDS = Object.freeze(LOCATIONS.map((location) => location.id));
