import { Alert } from 'antd';
import { useTranslation } from 'react-i18next';

export function TargetsInfoAlert() {
  const { t } = useTranslation();

  return (
    <Alert
      message={t('config.targetsTitle')}
      description={t('config.targetsDescription')}
      type="info"
      showIcon
    />
  );
}

