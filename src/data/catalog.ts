/**
 * Option catalogue: labels for the UI and price rules.
 * All prices are in roubles. Every rule is evaluated for the selected value and for the project default;
 * the difference is what the option adds to (or removes from) the project base price.
 */
import type { Config } from '../core/config';
import type { Metrics } from './metrics';
import type { Project } from './projects';

export interface Choice<V extends string | number = string> {
  value: V;
  label: string;
  note?: string;
  /** Swatch: CSS colour or a texture preview path. */
  swatch?: string;
  texture?: string;
}

type Ctx = { p: Project; m: Metrics; c: Config };
type Rule = (v: never, ctx: Ctx) => number;

export interface OptionDef {
  key: keyof Config;
  label: string;
  hint?: string;
  kind: 'choice' | 'toggle' | 'range';
  choices?: Choice<string | number>[];
  range?: { min: number; max: number; step: number; unit: string };
  /** Price of a value (absolute); the shown delta is price(value) − price(default). */
  price?: Rule;
  /** Toggle description shown next to the switch. */
  toggleText?: string;
  /** Hide the option for a configuration. */
  visible?: (c: Config, p: Project) => boolean;
}

export interface Section {
  id: string;
  title: string;
  options: OptionDef[];
}

const TEX = 'assets/tex/gen/';

export const WARM_MATERIALS: Choice[] = [
  { value: 'pine', label: 'Сосна, сорт AB', note: 'Имитация бруса 20×146, масло-воск', texture: TEX + 'wood_pine_color.webp' },
  { value: 'larch', label: 'Сибирская лиственница', note: 'Сорт Прима, тонированное масло', texture: TEX + 'wood_larch_color.webp' },
  { value: 'thermo', label: 'Термососна', note: 'Термомодифицированная, не требует пропитки', texture: TEX + 'wood_thermo_color.webp' },
];

export const ACCENT_COLORS: Choice[] = [
  { value: 'graphite', label: 'Графит', note: 'RAL 7024', swatch: '#3b3e42' },
  { value: 'anthracite', label: 'Антрацит', note: 'RAL 7016', swatch: '#383e42' },
  { value: 'black', label: 'Глубокий чёрный', note: 'RAL 9005', swatch: '#141517' },
  { value: 'umber', label: 'Тёмная умбра', note: 'RAL 8019', swatch: '#3d3635' },
];

export const ACCENT_HEX: Record<string, number> = {
  graphite: 0x3b3e42,
  anthracite: 0x353b40,
  black: 0x121314,
  umber: 0x3b3433,
};

export const FRAME_HEX: Record<string, number> = {
  black: 0x111214,
  anthracite: 0x2f3438,
  bronze: 0x4a3c30,
};

const perM2 = (table: Record<string, number>, area: (m: Metrics) => number) =>
  ((v: string, { m }: Ctx) => (table[v] ?? 0) * area(m)) as Rule;

export const SECTIONS: Section[] = [
  {
    id: 'facade',
    title: 'Фасад',
    options: [
      {
        key: 'warmMaterial',
        label: 'Тёплая отделка',
        hint: 'Деревянные фасады и стены под навесом',
        kind: 'choice',
        choices: WARM_MATERIALS,
        price: perM2({ pine: 0, larch: 1900, thermo: 2700 }, (m) => m.warmArea),
      },
      {
        key: 'warmOrientation',
        label: 'Раскладка доски',
        kind: 'choice',
        choices: [
          { value: 'h', label: 'Горизонтальная' },
          { value: 'v', label: 'Вертикальная' },
        ],
      },
      {
        key: 'accentMaterial',
        label: 'Акцентная отделка',
        hint: 'Торцы модулей и тёмные плоскости',
        kind: 'choice',
        choices: [
          { value: 'profile', label: 'Профлист матовый', note: 'Сталь 0,5 мм, покрытие Pural Matt' },
          { value: 'planken', label: 'Планкен окрашенный', note: 'Скошенный планкен, лессирующая краска' },
        ],
        price: perM2({ profile: 0, planken: 1500 }, (m) => m.accentArea),
      },
      { key: 'accentColor', label: 'Цвет акцента', kind: 'choice', choices: ACCENT_COLORS },
    ],
  },
  {
    id: 'glazing',
    title: 'Окна и двери',
    options: [
      {
        key: 'frameColor',
        label: 'Цвет профиля',
        kind: 'choice',
        choices: [
          { value: 'black', label: 'Чёрный', note: 'RAL 9005 матовый', swatch: '#111214' },
          { value: 'anthracite', label: 'Антрацит', note: 'RAL 7016', swatch: '#2f3438' },
          { value: 'bronze', label: 'Бронза', note: 'Анодированный алюминий', swatch: '#4a3c30' },
        ],
        price: ((v: string, { m }: Ctx) => (v === 'bronze' ? 3500 * m.openingsCount : 0)) as Rule,
      },
      {
        key: 'glass',
        label: 'Стеклопакет',
        kind: 'choice',
        choices: [
          { value: 'clear', label: 'Двухкамерный', note: 'Прозрачный, 40 мм' },
          { value: 'energy', label: 'Энергосберегающий', note: 'i-стекло + аргон' },
          { value: 'tinted', label: 'Тонированный', note: 'Графитовый, приватность в парной' },
        ],
        price: perM2({ clear: 0, energy: 3200, tinted: 4600 }, (m) => m.glazingArea),
      },
    ],
  },
  {
    id: 'outdoor',
    title: 'Терраса и участок',
    options: [
      {
        key: 'deck',
        label: 'Терраса',
        kind: 'toggle',
        toggleText: 'Настил на уровне пола со ступенями',
        price: ((v: boolean, { m }: Ctx) => (v ? m.deckArea * 14500 : 0)) as Rule,
      },
      {
        key: 'deckExtended',
        label: 'Расширенная терраса',
        kind: 'toggle',
        toggleText: 'Настил вдоль всего фасада, +8,4 м²',
        price: ((v: boolean, { m }: Ctx) => (v ? m.extensionArea * 14500 + 18000 : 0)) as Rule,
      },
      {
        key: 'deckMaterial',
        label: 'Настил',
        kind: 'choice',
        choices: [
          { value: 'pine', label: 'Сосна', note: 'Палубная доска 28×140', texture: TEX + 'wood_pine_color.webp' },
          { value: 'larch', label: 'Лиственница', note: 'Сорт Прима, 28×140', texture: TEX + 'wood_larch_color.webp' },
          { value: 'wpc_graphite', label: 'ДПК графит', note: 'Полнотелая, браш', texture: TEX + 'wpc_graphite_color.webp' },
          { value: 'wpc_teak', label: 'ДПК тик', note: 'Полнотелая, браш', texture: TEX + 'wpc_teak_color.webp' },
        ],
        price: ((v: string, { m, c, p }: Ctx) => {
          const t: Record<string, number> = { pine: 0, larch: 3900, wpc_graphite: 5600, wpc_teak: 5600 };
          const area = (p.id === 'nord' && !c.deck ? 0 : m.deckArea) + (c.deckExtended ? m.extensionArea : 0);
          return (t[v] ?? 0) * area;
        }) as Rule,
        visible: (c, p) => c.deck || p.id !== 'nord',
      },
      {
        key: 'canopy',
        label: 'Навес над террасой',
        kind: 'toggle',
        toggleText: 'Кровля на стойках в цвет акцента',
        price: ((v: boolean, { m }: Ctx) => (v ? m.canopyArea * 9800 : 0)) as Rule,
        visible: (c) => c.deck,
      },
      {
        key: 'plinth',
        label: 'Цоколь',
        kind: 'choice',
        choices: [
          { value: 'open', label: 'Открытые сваи', note: 'Винтовые сваи, окраска в цвет каркаса' },
          { value: 'firewood', label: 'Дровник-цоколь', note: 'Поленница по периметру' },
          { value: 'profile', label: 'Зашивка профлистом', note: 'В цвет акцентной отделки' },
        ],
        price: ((v: string, { m }: Ctx) => ({ open: 0, firewood: 6500, profile: 2900 })[v as 'open'] * m.perimeter) as Rule,
      },
      {
        key: 'furniture',
        label: 'Мебель для террасы',
        kind: 'toggle',
        toggleText: 'Лаунж-кресла и столик',
        price: ((v: boolean) => (v ? 54000 : 0)) as Rule,
      },
    ],
  },
  {
    id: 'steam',
    title: 'Парная',
    options: [
      {
        key: 'stove',
        label: 'Печь',
        kind: 'choice',
        choices: [
          { value: 'wood_glass', label: 'Дровяная, панорамное стекло', note: 'Выносная топка, закрытая каменка' },
          { value: 'wood', label: 'Дровяная классическая', note: 'Выносная топка, открытая каменка' },
          { value: 'electric', label: 'Электрокаменка', note: '9 кВт, пульт управления, без дымохода' },
        ],
        price: ((v: string) => ({ wood_glass: 0, wood: -28000, electric: -18000 })[v as 'wood']) as Rule,
      },
      {
        key: 'benches',
        label: 'Полки',
        kind: 'choice',
        choices: [
          { value: 'aspen', label: 'Осина', note: 'Не нагревается, светлая', texture: TEX + 'bench_aspen_color.webp' },
          { value: 'linden', label: 'Липа', note: 'Мягкий медовый аромат', texture: TEX + 'bench_linden_color.webp' },
          { value: 'abachi', label: 'Абаши', note: 'Африканский абаш, премиум', texture: TEX + 'bench_abachi_color.webp' },
          { value: 'cedar', label: 'Канадский кедр', note: 'Красный кедр, эфирные масла', texture: TEX + 'bench_cedar_color.webp' },
        ],
        price: ((v: string, { m }: Ctx) => ({ aspen: 0, linden: 2600, abachi: 6200, cedar: 8600 })[v as 'aspen'] * m.steamArea) as Rule,
      },
      {
        key: 'benchLight',
        label: 'Подсветка полков',
        kind: 'toggle',
        toggleText: 'Термостойкая LED-лента 2700 K',
        price: ((v: boolean) => (v ? 14000 : 0)) as Rule,
      },
      {
        key: 'saltWall',
        label: 'Стена из гималайской соли',
        kind: 'toggle',
        toggleText: 'За печью, с подсветкой',
        price: ((v: boolean) => (v ? 36000 : 0)) as Rule,
      },
    ],
  },
  {
    id: 'package',
    title: 'Комплектация и доставка',
    options: [
      {
        key: 'package',
        label: 'Комплектация',
        kind: 'choice',
        choices: [
          { value: 'shell', label: 'Тёплый контур', note: 'Фасад, окна, двери, утепление, без внутренней отделки' },
          { value: 'turnkey', label: 'Под ключ', note: 'Отделка, полки, печь, электрика, слив' },
          { value: 'premium', label: 'Под ключ Премиум', note: 'Тёплый пол, сантехника, встроенная мебель' },
        ],
        price: ((v: string, { p }: Ctx) => ({ shell: -0.22, turnkey: 0, premium: 0.09 })[v as 'shell'] * p.basePrice) as Rule,
      },
      {
        key: 'insulation',
        label: 'Утепление',
        kind: 'choice',
        choices: [
          { value: 150, label: '150 мм', note: 'Круглогодичное использование' },
          { value: 200, label: '200 мм', note: 'Для постоянного проживания и −40 °C' },
        ],
        price: ((v: number, { m }: Ctx) => (v === 200 ? 1600 * m.internalArea : 0)) as Rule,
      },
      {
        key: 'distance',
        label: 'Расстояние до участка',
        hint: 'От производства в Новосибирске',
        kind: 'range',
        range: { min: 0, max: 400, step: 10, unit: 'км' },
      },
    ],
  },
];

export const ALL_OPTIONS: OptionDef[] = SECTIONS.flatMap((s) => s.options);

export const DELIVERY = {
  freeKm: 50,
  perKmPerModule: 160,
};

export function optionVisible(o: OptionDef, c: Config, p: Project) {
  if (p.hiddenOptions?.includes(o.key)) return false;
  return o.visible ? o.visible(c, p) : true;
}
