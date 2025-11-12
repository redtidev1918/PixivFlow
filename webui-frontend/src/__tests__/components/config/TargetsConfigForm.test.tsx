/// <reference types="@testing-library/jest-dom" />
import React, { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';
import { TargetsConfigForm } from '../../../pages/Config/components/TargetsConfigForm';
import type { TargetConfig } from '../../../pages/Config/components/targets/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('../../../pages/Config/components/TargetModal', () => ({
  TargetModal: ({ visible, onSave, onCancel }: any) =>
    visible ? (
      <div data-testid="target-modal">
        <button
          type="button"
          onClick={() =>
            onSave({
              type: 'illustration',
              mode: 'search',
              tag: 'landscape',
              limit: 20,
            })
          }
        >
          mock-save
        </button>
        <button type="button" onClick={onCancel}>
          mock-cancel
        </button>
      </div>
    ) : null,
}));

interface WrapperProps {
  initialTargets?: TargetConfig[];
  onTargetChange?: () => void;
}

const TargetsConfigFormWrapper: React.FC<WrapperProps> = ({
  initialTargets,
  onTargetChange,
}) => {
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue({ targets: initialTargets || [] });
  }, [form, initialTargets]);

  return (
    <Form form={form}>
      <TargetsConfigForm
        form={form}
        onTargetChange={onTargetChange}
      />
    </Form>
  );
};

describe('TargetsConfigForm', () => {
  it('renders targets info and add button', () => {
    render(<TargetsConfigFormWrapper />);

    expect(screen.getByText('config.targetsTitle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /config\.addTarget$/ })).toBeInTheDocument();
  });

  it('adds a new target and notifies change', async () => {
    const handleTargetChange = jest.fn();
    const user = userEvent.setup();

    render(<TargetsConfigFormWrapper onTargetChange={handleTargetChange} />);

    await user.click(screen.getByRole('button', { name: /config\.addTarget$/ }));
    expect(await screen.findByTestId('target-modal')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'mock-save' }));

    await waitFor(() => {
      expect(handleTargetChange).toHaveBeenCalled();
    });

    expect(screen.getByText('landscape')).toBeInTheDocument();
    expect(screen.getByText('config.typeIllustration')).toBeInTheDocument();
    expect(screen.getByText('config.modeSearch')).toBeInTheDocument();
  });

  it('deletes an existing target and notifies change', async () => {
    const handleTargetChange = jest.fn();
    const user = userEvent.setup();
    const initialTargets: TargetConfig[] = [
      {
        type: 'illustration',
        mode: 'search',
        tag: 'sunrise',
        limit: 10,
      },
    ];

    render(
      <TargetsConfigFormWrapper
        initialTargets={initialTargets}
        onTargetChange={handleTargetChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('sunrise')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /common\.delete$/ }));
    const confirmButton = await screen.findByRole('button', { name: /common\.ok$/ });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(handleTargetChange).toHaveBeenCalled();
      expect(screen.queryByText('sunrise')).not.toBeInTheDocument();
    });
  });
});

