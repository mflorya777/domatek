/**
 * Company profile used in the UI, request form and saved specifications.
 * Contact details and the request endpoint are intentionally left empty until confirmed by the client.
 */
export const COMPANY = {
  brand: 'ДОМАТЕК',
  brandLatin: 'DOMATEK',
  tagline: 'Модульные бани под ключ',
  site: 'domatek54.ru',
  siteUrl: 'https://domatek54.ru',
  city: 'Новосибирск',
  address: 'Новосибирск, ул. Выборная, 199/3 к1',
  /** Phone in display format, e.g. '+7 (383) 000-00-00'. Empty — the phone block is hidden. */
  phone: '',
  email: '',
  /** POST endpoint for the request form (JSON body). Empty — the form only builds a summary to copy. */
  requestEndpoint: '',
  promises: ['Собственное производство', 'Установка на участке за 1 день', 'Гарантия 5 лет'],
  privacyPolicyUrl: '',
};

/**
 * Prices in the pilot are demonstration values, not the client's price list.
 * Set to true after the numbers in projects.ts / catalog.ts are checked against domatek54.ru.
 */
export const PRICES_VERIFIED = false;
