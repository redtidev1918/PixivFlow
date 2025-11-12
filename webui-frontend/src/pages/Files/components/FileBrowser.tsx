import { Breadcrumb, Button } from 'antd';
import { HomeOutlined, LeftOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

export interface FileBrowserProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onGoBack: () => void;
}

/**
 * File browser component with breadcrumb navigation
 */
export function FileBrowser({
  currentPath,
  onNavigate,
  onGoBack,
}: FileBrowserProps) {
  const { t } = useTranslation();

  const breadcrumbItems = [
    {
      title: (
        <Button
          type="link"
          icon={<HomeOutlined />}
          onClick={() => onNavigate('')}
          style={{ padding: 0 }}
        >
          {t('files.root')}
        </Button>
      ),
    },
    ...(currentPath
      ? currentPath.split('/').map((segment, index, arr) => {
          const path = arr.slice(0, index + 1).join('/');
          return {
            title: (
              <Button
                type="link"
                onClick={() => onNavigate(path)}
                style={{ padding: 0 }}
              >
                {segment}
              </Button>
            ),
          };
        })
      : []),
  ];

  return (
    <>
      <Breadcrumb items={breadcrumbItems} />
      {currentPath && (
        <Button icon={<LeftOutlined />} onClick={onGoBack}>
          {t('files.goBack')}
        </Button>
      )}
    </>
  );
}

