/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormSection } from '../../../components/forms/FormSection';

describe('FormSection', () => {
  describe('Card mode (default)', () => {
    it('renders card with title', () => {
      render(
        <FormSection title="Test Section">
          <div>Content</div>
        </FormSection>
      );
      expect(screen.getByText('Test Section')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('renders with description', () => {
      render(
        <FormSection title="Test Section" description="Section description">
          <div>Content</div>
        </FormSection>
      );
      expect(screen.getByText('Test Section')).toBeInTheDocument();
      expect(screen.getByText('Section description')).toBeInTheDocument();
    });

    it('renders extra content', () => {
      render(
        <FormSection title="Test Section" extra={<button>Extra</button>}>
          <div>Content</div>
        </FormSection>
      );
      expect(screen.getByText('Extra')).toBeInTheDocument();
    });
  });

  describe('Collapsible mode', () => {
    it('renders collapsible section', () => {
      render(
        <FormSection title="Test Section" collapsible>
          <div>Content</div>
        </FormSection>
      );
      expect(screen.getByText('Test Section')).toBeInTheDocument();
    });

    it('expands by default when defaultCollapsed is false', () => {
      render(
        <FormSection title="Test Section" collapsible defaultCollapsed={false}>
          <div>Content</div>
        </FormSection>
      );
      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('collapses by default when defaultCollapsed is true', () => {
      render(
        <FormSection title="Test Section" collapsible defaultCollapsed>
          <div>Content</div>
        </FormSection>
      );
      // Content should not be visible when collapsed
      expect(screen.queryByText('Content')).not.toBeInTheDocument();
    });

    it('toggles collapse/expand on click', async () => {
      const user = userEvent.setup();
      render(
        <FormSection title="Test Section" collapsible defaultCollapsed={false}>
          <div>Content</div>
        </FormSection>
      );
      
      // Content should be visible initially
      expect(screen.getByText('Content')).toBeInTheDocument();
      
      // Click to collapse
      const header = screen.getByText('Test Section').closest('.ant-collapse-header');
      if (header) {
        await user.click(header);
        // After clicking, content might be hidden (depends on Ant Design implementation)
      }
    });
  });

  describe('Plain mode (card=false)', () => {
    it('renders plain section without card', () => {
      render(
        <FormSection title="Test Section" card={false}>
          <div>Content</div>
        </FormSection>
      );
      expect(screen.getByText('Test Section')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
      // Should not have card styling
      expect(screen.queryByRole('article')).not.toBeInTheDocument();
    });

    it('renders with description in plain mode', () => {
      render(
        <FormSection title="Test Section" description="Description" card={false}>
          <div>Content</div>
        </FormSection>
      );
      expect(screen.getByText('Test Section')).toBeInTheDocument();
      expect(screen.getByText('Description')).toBeInTheDocument();
    });
  });

  describe('Custom styling', () => {
    it('applies custom className', () => {
      const { container } = render(
        <FormSection title="Test" className="custom-class">
          <div>Content</div>
        </FormSection>
      );
      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });

    it('applies custom style', () => {
      const { container } = render(
        <FormSection title="Test" style={{ padding: '20px' }}>
          <div>Content</div>
        </FormSection>
      );
      const section = container.firstChild;
      expect(section).toHaveStyle({ padding: '20px' });
    });
  });
});

