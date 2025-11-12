import { Menu } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { formatDate } from '../../../utils/dateUtils';
import { DownloadHistoryItem } from '../../../services/api';

interface HistoryExportMenuProps {
  items: DownloadHistoryItem[];
}

export function HistoryExportMenu({ items }: HistoryExportMenuProps) {
  const { t } = useTranslation();

  const exportToCSV = () => {
    if (!items.length) return;
    
    const headers = [t('history.pixivId'), t('history.type'), t('history.workTitle'), t('history.tag'), t('history.author'), t('history.filePath'), t('history.downloadedAt')];
    const rows = items.map((item) => [
      item.pixivId,
      item.type === 'illustration' ? t('history.typeIllustration') : t('history.typeNovel'),
      item.title,
      item.tag,
      item.author ?? '',
      item.filePath,
      formatDate(item.downloadedAt),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${t('history.title')}_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.csv`;
    link.click();
  };

  const exportToJSON = () => {
    if (!items.length) return;
    
    const jsonContent = JSON.stringify(items, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${t('history.title')}_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.json`;
    link.click();
  };

  return (
    <Menu>
      <Menu.Item key="csv" icon={<DownloadOutlined />} onClick={exportToCSV}>
        {t('history.exportCSV')}
      </Menu.Item>
      <Menu.Item key="json" icon={<DownloadOutlined />} onClick={exportToJSON}>
        {t('history.exportJSON')}
      </Menu.Item>
    </Menu>
  );
}

