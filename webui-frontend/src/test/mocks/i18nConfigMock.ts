const i18nMock = {
  language: 'en-US',
  changeLanguage: async () => undefined,
  t: (key: string) => key,
};

export default i18nMock;

