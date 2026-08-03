import { Component, Prop, h } from '@stencil/core';

@Component({
  tag: 'scale-badge',
  styleUrl: 'scale-badge.css',
  shadow: true,
})
export class ScaleBadge {
  @Prop() label: string = '';
  // BUG: color prop is accepted but never applied to the host element
  @Prop() color: string = 'default';

  render() {
    return (
      <span class="badge">
        {this.label}
      </span>
    );
  }
}
