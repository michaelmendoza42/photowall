import { GroupedWallView, type GroupedWallViewProps } from './GroupedWallView.js';
import { SingleStreamWallView } from './SingleStreamWallView.js';
import type { GroupedWallFoundation } from './groupedWall.js';

export interface PhotoWallSurfaceProps
  extends Omit<GroupedWallViewProps, 'groupedFoundation'> {
  groupedFoundation?: GroupedWallFoundation | null;
}

export function PhotoWallSurface(props: PhotoWallSurfaceProps): JSX.Element {
  const { groupedFoundation = null, ...sharedProps } = props;

  if (groupedFoundation?.mode === 'grouped') {
    return (
      <GroupedWallView
        key="wall-grouped-view"
        {...sharedProps}
        groupedFoundation={groupedFoundation}
      />
    );
  }

  return <SingleStreamWallView key="wall-single-stream-view" {...sharedProps} />;
}
