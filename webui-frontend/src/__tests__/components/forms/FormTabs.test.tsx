/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormTabs } from '../../../components/forms/FormTabs';

describe('FormTabs', () => {
  const items = [
    {
      key: 'tab1',
      label: 'Tab 1',
      children: <div>Tab 1 Content</div>,
    },
    {
      key: 'tab2',
      label: 'Tab 2',
      children: <div>Tab 2 Content</div>,
    },
    {
      key: 'tab3',
      label: 'Tab 3',
      children: <div>Tab 3 Content</div>,
      disabled: true,
    },
  ];

  it('renders tabs correctly', () => {
    render(<FormTabs items={items} />);
    expect(screen.getByText('Tab 1')).toBeInTheDocument();
    expect(screen.getByText('Tab 2')).toBeInTheDocument();
    expect(screen.getByText('Tab 3')).toBeInTheDocument();
  });

  it('renders active tab content', () => {
    render(<FormTabs items={items} activeKey="tab1" />);
    expect(screen.getByText('Tab 1 Content')).toBeInTheDocument();
  });

  it('calls onChange when tab is clicked', () => {
    const onChange = jest.fn();
    render(<FormTabs items={items} activeKey="tab1" onChange={onChange} />);
    
    const tab2 = screen.getByText('Tab 2');
    fireEvent.click(tab2);
    
    expect(onChange).toHaveBeenCalledWith('tab2');
  });

  it('renders tab with icon', () => {
    const itemsWithIcon = [
      {
        key: 'tab1',
        label: 'Tab 1',
        icon: <span>Icon</span>,
        children: <div>Content</div>,
      },
    ];
    render(<FormTabs items={itemsWithIcon} />);
    expect(screen.getByText('Icon')).toBeInTheDocument();
  });

  it('disables tab when disabled is true', () => {
    const { container } = render(<FormTabs items={items} />);
    const tab3 = container.querySelector('.ant-tabs-tab-disabled');
    expect(tab3).toBeInTheDocument();
  });

  it('renders with custom tabPosition', () => {
    const { container } = render(<FormTabs items={items} tabPosition="left" />);
    expect(container.querySelector('.ant-tabs-left')).toBeInTheDocument();
  });

  it('renders with custom type', () => {
    const { container } = render(<FormTabs items={items} type="card" />);
    expect(container.querySelector('.ant-tabs-card')).toBeInTheDocument();
  });
});

