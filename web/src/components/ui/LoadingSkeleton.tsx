/**
 * LoadingSkeleton
 *
 * Shimmer skeleton placeholder for loading states.
 * Prefer skeletons over spinners — they reduce perceived wait time by
 * showing the shape of the content that will appear.
 *
 * Uses the `.shimmer` keyframe defined in global.css.
 */

import { For } from 'solid-js';
import type { JSX } from 'solid-js';

interface LoadingSkeletonProps {
  /** Height in pixels. Default: 16. */
  height?: number;
  /** Width as CSS value (e.g. "100%", "200px", "60%"). Default: "100%". */
  width?: string;
  /** Border radius in pixels. Default: 4 (var(--radius-sm)). */
  radius?: number;
}

/**
 * Animated shimmer skeleton block.
 *
 * @example
 * <LoadingSkeleton height={40} />
 * <LoadingSkeleton height={24} width="60%" />
 * <LoadingSkeleton height={200} radius={8} />
 */
export default function LoadingSkeleton(props: LoadingSkeletonProps): JSX.Element {
  return (
    <div
      class="shimmer"
      role="status"
      aria-label="Loading…"
      style={{
        height: `${props.height ?? 16}px`,
        width: props.width ?? '100%',
        'border-radius': `${props.radius ?? 4}px`,
        'flex-shrink': '0',
      }}
    />
  );
}

interface SkeletonRowProps {
  /** Number of skeleton lines to render. Default: 3. */
  lines?: number;
  /** Heights of each line. If shorter than `lines`, last value repeats. */
  heights?: number[];
}

/**
 * Multiple stacked skeleton lines — useful for text content areas.
 *
 * @example
 * <SkeletonRows lines={4} heights={[20, 14, 14, 14]} />
 */
export function SkeletonRows(props: SkeletonRowProps): JSX.Element {
  const count = props.lines ?? 3;
  const heights = props.heights ?? [20, 14, 14];

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
      <For each={Array.from({ length: count }, (_, i) => i)}>
        {(i) => {
          const h = heights[Math.min(i, heights.length - 1)] ?? 14;
          // Make the last line shorter for a natural-looking paragraph skeleton.
          const w = i === count - 1 ? '70%' : '100%';
          return <LoadingSkeleton height={h} width={w} />;
        }}
      </For>
    </div>
  );
}
