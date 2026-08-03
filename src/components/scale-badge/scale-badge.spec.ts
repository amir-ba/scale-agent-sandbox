import { newSpecPage } from '@stencil/core/testing';
import { ScaleBadge } from './scale-badge';

describe('scale-badge', () => {
  it('renders the label', async () => {
    const page = await newSpecPage({
      components: [ScaleBadge],
      html: `<scale-badge label="hello"></scale-badge>`,
    });
    expect(page.root?.shadowRoot?.querySelector('.badge')?.textContent?.trim()).toBe('hello');
  });

  // This test currently FAILS because the color prop is not reflected as a host attribute
  it('applies the color prop as a host attribute', async () => {
    const page = await newSpecPage({
      components: [ScaleBadge],
      html: `<scale-badge label="danger" color="danger"></scale-badge>`,
    });
    expect(page.root?.getAttribute('color')).toBe('danger');
  });
});
