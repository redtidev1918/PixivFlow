import { ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { useTranslation } from 'react-i18next';

interface I18nProviderProps {
  children: ReactNode;
}

export default function I18nProvider({ children }: I18nProviderProps) {
  const { i18n } = useTranslation();
  
  const antdLocale = i18n.language === 'en-US' ? enUS : zhCN;
  
  return (
    <ConfigProvider locale={antdLocale}>
      {children}
    </ConfigProvider>
  );
}

