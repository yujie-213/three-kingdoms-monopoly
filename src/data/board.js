export const factions = [
  { id: 'shu', name: '蜀', defaultCharacterId: 'liu' },
  { id: 'wei', name: '魏', defaultCharacterId: 'cao' },
  { id: 'wu', name: '吴', defaultCharacterId: 'sun' },
];
// Future generals join this roster; faction, character identity and art are separate.
export const characters = [
  { id: 'liu', factionId: 'shu', name: '刘备', symbol: '刘', portraitKey: 'liu' },
  { id: 'cao', factionId: 'wei', name: '曹操', symbol: '曹', portraitKey: 'cao' },
  { id: 'sun', factionId: 'wu', name: '孙权', symbol: '孙', portraitKey: 'sun' },
];
export const regions = {
  central: { name: '中原', description: '汉魏腹地 · 王都与屯田' },
  jing: { name: '荆襄', description: '南北交汇 · 江汉与争夺' },
  east: { name: '江东', description: '吴地水乡 · 商埠与渡口' },
  west: { name: '巴蜀', description: '蜀道山川 · 盆地与关隘' },
};
const land = (name, tier, regionId, province, commandery, county, history) =>
  ({ name, type: 'land', tier, regionId, province, commandery, county, history });
const stop = (name, type, regionId, effect, history) => ({ name, type, regionId, ...(effect ? { effect } : {}), history });
// Themed late Han / Three Kingdoms itinerary, not one year's political border map.
// A commandery-tier land is its seat city, never the whole commandery.
const cells = [
  stop('行营', 'start', 'central', null, '共同出发的游戏行营，不对应历史城址。'),
  land('颍阴', 'village', 'central', '豫州', '颍川郡', '颍阴县', '颍川属县，今许昌一带。'),
  stop('颍川驿', 'special', 'central', 'inn', '中原路段的游戏补给驿站。'),
  land('长社', 'village', 'central', '豫州', '颍川郡', '长社县', '颍川属县，今河南长葛一带。'),
  land('许县', 'capital', 'central', '豫州', '颍川郡', '许县', '196年汉献帝迁许；221年改名许昌。采用曹操时期旧名，经济等级为名城。'),
  stop('中原军情', 'event', 'central', null, '中原路段的随机事件。'),
  land('洛阳', 'capital', 'central', '司隶', '河南尹', '洛阳县', '东汉旧都，后为曹魏都城。'),
  land('陈留', 'county', 'central', '兖州', '陈留郡', '陈留县', '汉末陈留郡治所在，代表郡治城址。'),
  land('谯县', 'village', 'central', '豫州', '沛国', '谯县', '曹操故里；黄初年间另置谯郡。采用汉末沛国辖县口径。'),
  land('平舆', 'county', 'central', '豫州', '汝南郡', '平舆县', '汉末汝南郡治所在；三国时郡治曾迁移。'),
  land('宛县', 'county', 'jing', '荆州', '南阳郡', '宛县', '南阳郡治，南北交通要地；荆襄是地理路段。'),
  land('新野', 'village', 'jing', '荆州', '南阳郡', '新野县', '南阳属县，刘备曾驻军于此。'),
  land('襄阳', 'county', 'jing', '荆州', '襄阳郡', '襄阳县', '曹操取得荆州后分南郡置襄阳郡；采用三国郡治口径。'),
  stop('隆中', 'theme', 'jing', 'advice', '隆中对的历史主题地点；获得空城计。'),
  land('江陵', 'county', 'jing', '荆州', '南郡', '江陵县', '南郡郡治，江汉重镇；汉末三国时归属多次变化。'),
  stop('荆襄风云', 'event', 'jing', null, '荆襄路段的随机事件。'),
  land('夷陵', 'village', 'jing', '荆州', '南郡', '夷陵县', '峡江东口，采用汉末旧名；吴时曾改西陵。'),
  land('临湘', 'county', 'jing', '荆州', '长沙郡', '临湘县', '长沙郡治，今长沙一带，与今日临湘市不是同一地点。'),
  land('泉陵', 'county', 'jing', '荆州', '零陵郡', '泉陵县', '零陵郡治所在，今湖南永州一带。'),
  stop('赤壁', 'theme', 'jing', 'redCliff', '赤壁之战主题地点；领取捷报补给。'),
  land('柴桑', 'village', 'east', '扬州', '豫章郡', '柴桑县', '汉末豫章属县，孙吴后划入武昌郡。采用汉末口径。'),
  land('南昌', 'county', 'east', '扬州', '豫章郡', '南昌县', '豫章郡治，江东交通与商贸节点。'),
  land('鄱阳', 'county', 'east', '扬州', '鄱阳郡', '鄱阳县', '孙权分豫章置鄱阳郡，以鄱阳县为郡治。'),
  stop('江东渡口', 'special', 'east', 'card', '水乡路段的游戏渡口，随机获得锦囊。'),
  land('建业', 'capital', 'east', '扬州', '丹阳郡', '建业县', '212年孙权改秣陵为建业，229年迁都于此。'),
  land('吴县', 'county', 'east', '扬州', '吴郡', '吴县', '吴郡郡治所在，今苏州一带。'),
  stop('江东军情', 'event', 'east', null, '江东路段的随机事件。'),
  land('曲阿', 'village', 'east', '扬州', '毗陵典农校尉辖区', '曲阿县', '汉末丹阳属县，吴时属毗陵典农校尉辖区；今江苏丹阳一带。'),
  land('山阴', 'county', 'east', '扬州', '会稽郡', '山阴县', '会稽郡治所在，今绍兴一带。'),
  stop('江东集市', 'special', 'east', 'marketTax', '水乡游戏集市，缴纳交易税费。'),
  land('永安', 'village', 'west', '益州', '巴东郡', '永安县', '原鱼复县，222年刘备改名永安，白帝城所在一带。'),
  land('江州', 'county', 'west', '益州', '巴郡', '江州县', '巴郡郡治，今重庆中心城区，并非后世江州。'),
  stop('蜀道驿', 'special', 'west', 'inn', '蜀道路段的游戏补给驿站。'),
  land('阆中', 'county', 'west', '益州', '巴西郡', '阆中县', '巴西郡治，蜀汉北部交通要地。'),
  land('成都', 'capital', 'west', '益州', '蜀郡', '成都县', '蜀郡郡治及蜀汉都城。'),
  land('郫县', 'village', 'west', '益州', '蜀郡', '郫县', '蜀郡属县，成都平原农业腹地。'),
  stop('蜀中风云', 'event', 'west', null, '巴蜀路段的随机事件。'),
  land('雒县', 'county', 'west', '益州', '广汉郡', '雒县', '广汉郡治，采用汉末三国名称。'),
  land('梓潼', 'county', 'west', '益州', '梓潼郡', '梓潼县', '梓潼郡治，蜀道重要节点。'),
  land('南郑', 'county', 'west', '益州', '汉中郡', '南郑县', '汉中郡治，219年刘备取得汉中后属蜀方。'),
];
export const boardDefinition = cells.map((tile, index) => ({ ...tile, id: `tile-${index}`, index }));
// Presentation is independent of route order, ready for an irregular ring.
export const boardLayout = { columns: 13, rows: 9 };
export const cellCoordinates = boardDefinition.map((_, i) => {
  if (i < 13) return [1, i + 1];
  if (i < 21) return [i - 11, 13];
  if (i < 33) return [9, 33 - i];
  return [41 - i, 1];
});
