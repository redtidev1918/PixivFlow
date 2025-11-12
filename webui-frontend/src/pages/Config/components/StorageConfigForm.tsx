import React from 'react';
import { Form, Input, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { FormSection } from '../../../components/forms/FormSection';

const { Option, OptGroup } = Select;

export const StorageConfigForm: React.FC = () => {
  const { t } = useTranslation();

  return (
    <FormSection title={t('config.tabStorage')}>
      <Form.Item label={t('config.storageDatabasePath')} name={['storage', 'databasePath']}>
        <Input />
      </Form.Item>

      <Form.Item label={t('config.storageDownloadDirectory')} name={['storage', 'downloadDirectory']}>
        <Input />
      </Form.Item>

      <Form.Item label={t('config.storageIllustrationDirectory')} name={['storage', 'illustrationDirectory']}>
        <Input />
      </Form.Item>

      <Form.Item label={t('config.storageNovelDirectory')} name={['storage', 'novelDirectory']}>
        <Input />
      </Form.Item>

      <Form.Item 
        label={t('config.storageIllustrationOrganization')} 
        name={['storage', 'illustrationOrganization']}
        tooltip={t('config.storageIllustrationOrganizationTooltip')}
      >
        <Select>
          <OptGroup label={t('config.organizationGroupSimple')}>
            <Option value="flat">{t('config.organizationFlat')}</Option>
            <Option value="byAuthor">{t('config.organizationByAuthor')}</Option>
            <Option value="byTag">{t('config.organizationByTag')}</Option>
          </OptGroup>
          <OptGroup label={t('config.organizationGroupDate')}>
            <Option value="byDate">{t('config.organizationByDate')}</Option>
            <Option value="byDay">{t('config.organizationByDay')}</Option>
            <Option value="byDownloadDate">{t('config.organizationByDownloadDate')}</Option>
            <Option value="byDownloadDay">{t('config.organizationByDownloadDay')}</Option>
          </OptGroup>
          <OptGroup label={t('config.organizationGroupCombined')}>
            <Option value="byAuthorAndTag">{t('config.organizationByAuthorAndTag')}</Option>
            <Option value="byDateAndAuthor">{t('config.organizationByDateAndAuthor')}</Option>
            <Option value="byDayAndAuthor">{t('config.organizationByDayAndAuthor')}</Option>
            <Option value="byDownloadDateAndAuthor">{t('config.organizationByDownloadDateAndAuthor')}</Option>
            <Option value="byDownloadDayAndAuthor">{t('config.organizationByDownloadDayAndAuthor')}</Option>
          </OptGroup>
        </Select>
      </Form.Item>

      <Form.Item 
        label={t('config.storageNovelOrganization')} 
        name={['storage', 'novelOrganization']}
        tooltip={t('config.storageNovelOrganizationTooltip')}
      >
        <Select>
          <OptGroup label={t('config.organizationGroupSimple')}>
            <Option value="flat">{t('config.organizationFlat')}</Option>
            <Option value="byAuthor">{t('config.organizationByAuthor')}</Option>
            <Option value="byTag">{t('config.organizationByTag')}</Option>
          </OptGroup>
          <OptGroup label={t('config.organizationGroupDate')}>
            <Option value="byDate">{t('config.organizationByDate')}</Option>
            <Option value="byDay">{t('config.organizationByDay')}</Option>
            <Option value="byDownloadDate">{t('config.organizationByDownloadDate')}</Option>
            <Option value="byDownloadDay">{t('config.organizationByDownloadDay')}</Option>
          </OptGroup>
          <OptGroup label={t('config.organizationGroupCombined')}>
            <Option value="byAuthorAndTag">{t('config.organizationByAuthorAndTag')}</Option>
            <Option value="byDateAndAuthor">{t('config.organizationByDateAndAuthor')}</Option>
            <Option value="byDayAndAuthor">{t('config.organizationByDayAndAuthor')}</Option>
            <Option value="byDownloadDateAndAuthor">{t('config.organizationByDownloadDateAndAuthor')}</Option>
            <Option value="byDownloadDayAndAuthor">{t('config.organizationByDownloadDayAndAuthor')}</Option>
          </OptGroup>
        </Select>
      </Form.Item>
    </FormSection>
  );
};

