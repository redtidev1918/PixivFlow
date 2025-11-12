import { Typography, Space, Select, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { message } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { QUERY_KEYS } from '../../../constants';

const { Title, Text } = Typography;
const { Option } = Select;

interface ConfigHeaderProps {
  currentConfigPath: string;
  configFiles: any[];
  onConfigFileSwitch: () => void;
  refetchConfigFiles: () => void;
}

/**
 * ConfigHeader component - Header with title and config file selector
 */
export function ConfigHeader({
  currentConfigPath,
  configFiles,
  onConfigFileSwitch,
  refetchConfigFiles,
}: ConfigHeaderProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const activeConfigFile = configFiles?.find((f: any) => f.isActive);

  const handleConfigFileChange = async (filename: string) => {
    const file = configFiles.find((f: any) => f.filename === filename);
    if (file && !file.isActive) {
      try {
        await api.switchConfigFile(file.path);
        message.success(t('config.configSwitched'));
        await queryClient.invalidateQueries({ queryKey: ['config'] });
        await queryClient.invalidateQueries({ queryKey: ['configFiles'] });
        refetchConfigFiles();
        onConfigFileSwitch();
      } catch (error: any) {
        message.error(t('config.configSwitchFailed'));
      }
    }
  };

  return (
    <div style={{ flex: '1 1 auto', minWidth: 200 }}>
      <Title level={2} style={{ margin: 0, whiteSpace: 'normal', wordBreak: 'normal' }}>
        {t('config.title')}
      </Title>
      <Space direction="vertical" size="small" style={{ marginTop: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('config.currentConfigFile')}: {currentConfigPath}
        </Text>
        {configFiles && configFiles.length > 0 && (
          <Select
            value={activeConfigFile?.filename || undefined}
            onChange={handleConfigFileChange}
            style={{ width: 300, fontSize: 12 }}
            placeholder={t('config.selectConfigFile')}
            size="small"
          >
            {configFiles.map((file: any) => (
              <Option key={file.filename} value={file.filename}>
                {file.isActive && <Tag color="green" style={{ marginRight: 8 }}>{t('config.activeConfig')}</Tag>}
                {file.filename}
              </Option>
            ))}
          </Select>
        )}
      </Space>
    </div>
  );
}

