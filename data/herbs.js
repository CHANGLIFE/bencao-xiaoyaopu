// 中药材基础数据。纯本地内置，离线可用，不依赖网络请求。
// 药材知识为常见科普口径，仅供游戏识药使用。
const HERBS = [
  {
    id: 'renshen',
    name: '人参',
    pinyin: 'rén shēn',
    taste: '甘、微苦，微温',
    tasteShort: '甘微苦 · 微温',
    effect: '大补元气',
    note: '补气第一要药。多用于气虚欲脱、脾虚食少、脉微欲绝。',
    image: '/assets/herbs/renshen.jpg'
  },
  {
    id: 'gouqi',
    name: '枸杞',
    pinyin: 'gǒu qǐ',
    taste: '甘，平',
    tasteShort: '甘 · 平',
    effect: '滋补肝肾',
    note: '兼能益精明目。常见于腰膝酸软、目昏不明的调养。',
    image: '/assets/herbs/gouqi.jpg'
  },
  {
    id: 'juhua',
    name: '菊花',
    pinyin: 'jú huā',
    taste: '甘、苦，微寒',
    tasteShort: '甘苦 · 微寒',
    effect: '疏散风热',
    note: '兼能平肝明目。风热感冒、目赤肿痛时常用。',
    image: '/assets/herbs/juhua.jpg'
  },
  {
    id: 'jinyinhua',
    name: '金银花',
    pinyin: 'jīn yín huā',
    taste: '甘，寒',
    tasteShort: '甘 · 寒',
    effect: '清热解毒',
    note: '善治温病初起、疮痈肿毒，花初开时色白后转黄。',
    image: '/assets/herbs/jinyinhua.jpg'
  },
  {
    id: 'huangqi',
    name: '黄芪',
    pinyin: 'huáng qí',
    taste: '甘，微温',
    tasteShort: '甘 · 微温',
    effect: '补气升阳',
    note: '兼能固表止汗、利水消肿。饮片断面可见菊花心。',
    image: '/assets/herbs/huangqi.jpg'
  },
  {
    id: 'danggui',
    name: '当归',
    pinyin: 'dāng guī',
    taste: '甘、辛，温',
    tasteShort: '甘辛 · 温',
    effect: '补血活血',
    note: '妇科常用药，兼能润肠通便。断面油润，香气明显。',
    image: '/assets/herbs/danggui.jpg'
  },
  {
    id: 'gancao',
    name: '甘草',
    pinyin: 'gān cǎo',
    taste: '甘，平',
    tasteShort: '甘 · 平',
    effect: '调和诸药',
    note: '兼能补脾益气、缓急止痛，方剂里常作使药。',
    image: '/assets/herbs/gancao.jpg'
  },
  {
    id: 'chenpi',
    name: '陈皮',
    pinyin: 'chén pí',
    taste: '辛、苦，温',
    tasteShort: '辛苦 · 温',
    effect: '理气健脾',
    note: '兼能燥湿化痰。橘皮陈放越久，辛烈之性越缓。',
    image: '/assets/herbs/chenpi.jpg'
  },
  {
    id: 'shanzha',
    name: '山楂',
    pinyin: 'shān zhā',
    taste: '酸、甘，微温',
    tasteShort: '酸甘 · 微温',
    effect: '消食化积',
    note: '尤善消肉食油腻，兼能行气散瘀。',
    image: '/assets/herbs/shanzha.jpg'
  },
  {
    id: 'fuling',
    name: '茯苓',
    pinyin: 'fú líng',
    taste: '甘、淡，平',
    tasteShort: '甘淡 · 平',
    effect: '利水渗湿',
    note: '兼能健脾宁心。药性平和，多切成白色小方块。',
    image: '/assets/herbs/fuling.jpg'
  },
  {
    id: 'dazao',
    name: '大枣',
    pinyin: 'dà zǎo',
    taste: '甘，温',
    tasteShort: '甘 · 温',
    effect: '补中益气',
    note: '兼能养血安神，常用来调和药性、缓和峻烈之品。',
    image: '/assets/herbs/dazao.jpg'
  },
  {
    id: 'lianzi',
    name: '莲子',
    pinyin: 'lián zǐ',
    taste: '甘、涩，平',
    tasteShort: '甘涩 · 平',
    effect: '补脾止泻',
    note: '兼能益肾养心。中间的绿色莲心味苦，另有清心之效。',
    image: '/assets/herbs/lianzi.jpg'
  }
]

module.exports = { HERBS: HERBS }
