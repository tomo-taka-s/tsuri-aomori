/* 青森県の港・釣り場
 * st : 使う気象庁観測点（tide.js の STATIONS）
 * acc: A=観測点そのもの / B=同じ海域の近い観測点 / C=別海域の観測点を流用（参考値）
 * hab: 釣り場の地形 port=港・堤防 / rock=磯・岬 / sand=砂浜・サーフ / estuary=河口  ※魚種別の適性に使う初期値。実情に合わせて直してください
 * exp: 沖の波の影響の受けやすさ(0〜1)。港内・湾内は沖の波より小さくなるため、波の減点に掛けます
 * 緯度経度は日の出・日の入りと天気取得用の概略値
 */
(function (root) {
  var SPOTS = [
    // 津軽海峡（下北西）
    { id: 'oma',   area: '津軽海峡・下北西', name: '大間港・大間崎',   lat: 41.527, lon: 140.914, st: 'OMA', acc: 'A', hab: ['port', 'rock'],           exp: 0.85 },
    { id: 'kazama',area: '津軽海峡・下北西', name: '風間浦（下風呂）', lat: 41.486, lon: 140.968, st: 'OMA', acc: 'B', hab: ['port', 'rock'],           exp: 0.8 },
    { id: 'sai',   area: '津軽海峡・下北西', name: '佐井港',           lat: 41.436, lon: 140.821, st: 'OMA', acc: 'B', hab: ['port', 'rock'],           exp: 0.8 },
    // 津軽海峡（津軽西）
    { id: 'tappi', area: '津軽海峡・津軽',   name: '竜飛崎・竜飛漁港', lat: 41.251, lon: 140.349, st: 'TAP', acc: 'A', hab: ['rock', 'port'],           exp: 1.0 },
    { id: 'mmaya', area: '津軽海峡・津軽',   name: '三厩',             lat: 41.200, lon: 140.380, st: 'TAP', acc: 'B', hab: ['port', 'rock'],           exp: 0.85 },
    { id: 'kodo',  area: '津軽海峡・津軽',   name: '小泊',             lat: 41.138, lon: 140.293, st: 'TAP', acc: 'B', hab: ['port', 'rock'],           exp: 0.85 },
    // 陸奥湾
    { id: 'kani',  area: '陸奥湾',           name: '蟹田',             lat: 41.041, lon: 140.648, st: 'AOM', acc: 'B', hab: ['port', 'sand'],           exp: 0.5 },
    { id: 'aomori',area: '陸奥湾',           name: '青森港',           lat: 40.824, lon: 140.741, st: 'AOM', acc: 'A', hab: ['port'],                   exp: 0.5 },
    { id: 'asamushi',area:'陸奥湾',          name: '浅虫',             lat: 40.898, lon: 140.860, st: 'ASA', acc: 'A', hab: ['port', 'rock'],           exp: 0.5 },
    { id: 'noheji',area: '陸奥湾',           name: '野辺地港',         lat: 40.873, lon: 141.122, st: 'ASA', acc: 'B', hab: ['port', 'sand'],           exp: 0.5 },
    { id: 'ominato',area:'陸奥湾',           name: '大湊・むつ',       lat: 41.250, lon: 141.146, st: 'OMI', acc: 'A', hab: ['port'],                   exp: 0.5 },
    { id: 'wakinosawa',area:'陸奥湾',        name: '脇野沢',           lat: 41.153, lon: 140.856, st: 'OMI', acc: 'B', hab: ['port', 'rock'],           exp: 0.55 },
    // 日本海側（観測点が県内にないため竜飛を流用）
    { id: 'jusan', area: '日本海側',         name: '十三湖・十三湊',   lat: 40.992, lon: 140.367, st: 'TAP', acc: 'C', hab: ['estuary', 'port'],        exp: 0.6 },
    { id: 'ajigasawa',area:'日本海側',       name: '鰺ヶ沢港',         lat: 40.783, lon: 140.200, st: 'TAP', acc: 'C', hab: ['port', 'rock', 'sand'],   exp: 0.85 },
    { id: 'fukaura',area:'日本海側',         name: '深浦港',           lat: 40.647, lon: 139.928, st: 'TAP', acc: 'C', hab: ['port', 'rock'],           exp: 0.85 },
    // 太平洋側（下北）
    { id: 'ohata', area: '太平洋側・下北',   name: '大畑港',           lat: 41.416, lon: 141.173, st: 'SHI', acc: 'B', hab: ['port', 'rock', 'estuary'],exp: 0.85 },
    { id: 'shiriya',area:'太平洋側・下北',   name: '尻屋崎',           lat: 41.438, lon: 141.462, st: 'SHI', acc: 'B', hab: ['rock'],                   exp: 1.0 },
    { id: 'shiranuka',area:'太平洋側・下北', name: '東通（白糠）',     lat: 41.200, lon: 141.400, st: 'SHI', acc: 'B', hab: ['port', 'rock', 'sand'],   exp: 0.9 },
    // 太平洋側（三八上北）
    { id: 'tomari',area: '太平洋側・三八上北',name: '六ヶ所（泊）',    lat: 40.990, lon: 141.400, st: 'OGW', acc: 'B', hab: ['port', 'sand'],           exp: 0.95 },
    { id: 'misawa',area: '太平洋側・三八上北',name: '三沢漁港',        lat: 40.690, lon: 141.420, st: 'OGW', acc: 'B', hab: ['port', 'sand'],           exp: 0.9 },
    { id: 'hachinohe',area:'太平洋側・三八上北',name:'八戸港・鮫',     lat: 40.540, lon: 141.530, st: 'HAC', acc: 'A', hab: ['port', 'rock', 'sand'],   exp: 0.8 },
    { id: 'tanesashi',area:'太平洋側・三八上北',name:'種差海岸',       lat: 40.500, lon: 141.600, st: 'HAC', acc: 'B', hab: ['rock', 'sand'],           exp: 1.0 },
    { id: 'hashikami',area:'太平洋側・三八上北',name:'階上',           lat: 40.430, lon: 141.680, st: 'HAC', acc: 'B', hab: ['rock', 'sand'],           exp: 1.0 }
  ];
  root.SPOTS = SPOTS;
})(typeof window !== 'undefined' ? window : this);
